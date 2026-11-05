"""最小 RESP 协议 Redis 服务端（仅实现本项目用到的命令）。

用途：在没有 Docker/Redis 的环境里，真实验证「多实例三件套」——
  - 限流计数跨进程共享（INCR / EXPIRE）
  - SSE 广播跨进程（PUBLISH / PSUBSCRIBE）
这是真实 TCP + 真实多进程，不依赖 mock。

支持的命令：
  PING [msg]                → +PONG
  SET key value [EX n]      → +OK
  GET key                   → bulk string / $-1
  INCR key                  → :N
  EXPIRE key seconds        → :1/:0
  DEL key [key ...]         → :N
  FLUSHALL                  → +OK
  PUBLISH channel message   → :N（发给所有订阅者）
  SUBSCRIBE ch [ch ...]     → 订阅确认 + 转发消息
  PSUBSCRIBE pattern ...    → 模式订阅
  UNSUBSCRIBE [ch ...]      → 退订
  QUIT                      → +OK 后关闭
"""
from __future__ import annotations

import fnmatch
import socket
import socketserver
import threading
from typing import Any

# ---- 共享状态（多线程安全由 GIL + 锁保证）----
_values: dict[bytes, bytes] = {}
_expiry: dict[str, float] = {}
_lock = threading.Lock()
# channel -> set of (client_socket, pattern)
_subs: dict[str, set[tuple[socket.socket, str | None]]] = {}
_sub_lock = threading.Lock()


def _now() -> float:
    import time

    return time.time()


def _check_expiry() -> None:
    now = _now()
    for k in [k for k, t in _expiry.items() if t <= now]:
        _expiry.pop(k, None)
        _values.pop(k, None)


def _encode(value: Any) -> bytes:
    if value is None:
        return b"$-1\r\n"
    if isinstance(value, int):
        return f":{value}\r\n".encode()
    if isinstance(value, bytes):
        return b"$%d\r\n%s\r\n" % (len(value), value)
    return b"+%s\r\n" % str(value).encode()


class Handler(socketserver.BaseRequestHandler):
    """用原始 socket 精确解析 RESP（StreamRequestHandler 的缓冲 rfile 会预读，
    导致命令边界错乱 —— 这里自己按字节读）。"""

    def setup(self) -> None:
        self.request.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        self._buf = b""
        self.channels: set[str] = set()
        self._in_multi = False
        self._queued: list[bytes] = []

    def _reply(self, payload: bytes) -> None:
        """统一响应出口。

        真实 Redis 语义：MULTI 之后每条命令立即返回 +QUEUED，EXEC 时才返回
        结果数组。redis-py 的事务 pipeline 逐条读响应（先 MULTI 的 +OK，
        再各命令的 +QUEUED，最后 EXEC 的数组），因此这里：
        - MULTI 之后：记录实际结果，立即回 +QUEUED
        - EXEC 时：回一个数组，元素是攒下来的实际结果
        """
        if self._in_multi:
            self._queued.append(payload)
            self.request.sendall(b"+QUEUED\r\n")
        else:
            self.request.sendall(payload)

    def _recv_line(self) -> bytes | None:
        """读一行（含 CRLF），返回不含 CRLF 的内容；连接关闭返回 None。"""
        while b"\r\n" not in self._buf:
            chunk = self.request.recv(4096)
            if not chunk:
                return None
            self._buf += chunk
        line, self._buf = self._buf.split(b"\r\n", 1)
        return line

    def _recv_exact(self, n: int) -> bytes | None:
        while len(self._buf) < n:
            chunk = self.request.recv(4096)
            if not chunk:
                return None
            self._buf += chunk
        data, self._buf = self._buf[:n], self._buf[n:]
        return data

    def handle(self) -> None:
        while True:
            try:
                cmd = self._read_command()
            except (ConnectionError, OSError, ValueError):
                break
            if cmd is None:
                break
            if not cmd:
                continue
            name = cmd[0].upper()
            args = cmd[1:]
            try:
                if name == b"PING":
                    # PING 必须回 simple string（+PONG），bulk string 会被 redis-py 判为未知
                    self._reply(b"+%s\r\n" % (args[0] if args else b"PONG"))
                elif name == b"SET":
                    with _lock:
                        _check_expiry()
                        _values[args[0]] = args[1]
                        if len(args) >= 4 and args[2].upper() == b"EX":
                            _expiry[args[0]] = _now() + int(args[3])
                    self._reply(b"+OK\r\n")
                elif name == b"GET":
                    with _lock:
                        _check_expiry()
                        self._reply(_encode(_values.get(args[0])))
                elif name == b"INCR":
                    with _lock:
                        _check_expiry()
                        cur = _values.get(args[0])
                        n = int(cur or b"0") + 1
                        _values[args[0]] = str(n).encode()
                        self._reply(_encode(n))
                elif name == b"INCRBY":
                    with _lock:
                        _check_expiry()
                        cur = _values.get(args[0])
                        n = int(cur or b"0") + int(args[1])
                        _values[args[0]] = str(n).encode()
                        self._reply(_encode(n))
                elif name == b"DECRBY":
                    with _lock:
                        _check_expiry()
                        cur = _values.get(args[0])
                        n = int(cur or b"0") - int(args[1])
                        _values[args[0]] = str(n).encode()
                        self._reply(_encode(n))
                elif name == b"TTL":
                    with _lock:
                        _check_expiry()
                        if args[0] not in _values:
                            self._reply(_encode(-2))
                        elif args[0] in _expiry:
                            self._reply(
                                _encode(int(_expiry[args[0]] - _now()))
                            )
                        else:
                            self._reply(_encode(-1))
                elif name == b"EXPIRE":
                    with _lock:
                        _check_expiry()
                        if args[0] in _values:
                            _expiry[args[0]] = _now() + int(args[1])
                            self._reply(_encode(1))
                        else:
                            self._reply(_encode(0))
                elif name == b"DEL":
                    with _lock:
                        n = 0
                        for k in args:
                            if _values.pop(k, None) is not None:
                                n += 1
                            _expiry.pop(k, None)
                        self._reply(_encode(n))
                elif name == b"FLUSHALL":
                    with _lock:
                        _values.clear()
                        _expiry.clear()
                    self._reply(b"+OK\r\n")
                elif name == b"PUBLISH":
                    self._publish(args[0], args[1])
                    self._reply(_encode(self._published_count(args[0])))
                elif name in (b"SUBSCRIBE", b"PSUBSCRIBE"):
                    for ch in args:
                        chs = ch.decode()
                        pattern = chs if name == b"PSUBSCRIBE" else None
                        with _sub_lock:
                            _subs.setdefault(chs, set()).add((self.request, pattern))
                        self.channels.add(chs)
                        # 订阅确认帧：[subscribe, channel, count]
                        frame = (
                            b"*3\r\n"
                            + b"$" + str(len(name)).encode() + b"\r\n" + name + b"\r\n"
                            + b"$" + str(len(chs)).encode() + b"\r\n" + chs.encode() + b"\r\n"
                            + b":1\r\n"
                        )
                        self._reply(frame)
                elif name == b"UNSUBSCRIBE":
                    targets = [c.decode() for c in args] or list(self.channels)
                    for ch in targets:
                        with _sub_lock:
                            subs = _subs.get(ch)
                            if subs:
                                for s in list(subs):
                                    if s[0] == self.request:
                                        subs.discard(s)
                        self.channels.discard(ch)
                        frame = (
                            b"*3\r\n"
                            + b"$11\r\nunsubscribe\r\n"
                            + b"$" + str(len(ch)).encode() + b"\r\n" + ch.encode() + b"\r\n"
                            + b":0\r\n"
                        )
                        self._reply(frame)
                elif name == b"KEYS":
                    with _lock:
                        _check_expiry()
                        pattern = args[0].decode() if args else "*"
                        matched = [
                            k
                            for k in _values
                            if fnmatch.fnmatch(k.decode(), pattern)
                        ]
                    out = b"*%d\r\n" % len(matched) + b"".join(
                        b"$%d\r\n%s\r\n" % (len(k), k) for k in matched
                    )
                    self._reply(out)
                elif name == b"SCAN":
                    # 简化实现：一次性返回全部 key（无 cursor）
                    with _lock:
                        _check_expiry()
                        matched = [k for k in _values]
                    out = (
                        b"*2\r\n$1\r\n0\r\n*%d\r\n" % len(matched)
                        + b"".join(b"$%d\r\n%s\r\n" % (len(k), k) for k in matched)
                    )
                    self._reply(out)
                elif name == b"MULTI":
                    # 进入事务模式：先回 +OK，再把后续命令的结果攒起来
                    self._in_multi = True
                    self._queued = []
                    self.request.sendall(b"+OK\r\n")
                elif name == b"EXEC":
                    # 事务结果数组：每项是攒下来的完整响应帧
                    queued = self._queued
                    self._queued = []
                    self._in_multi = False
                    out = b"*%d\r\n" % len(queued) + b"".join(queued)
                    self.request.sendall(out if queued else b"*0\r\n")
                elif name == b"DISCARD":
                    self._in_multi = False
                    self._reply(b"+OK\r\n")
                elif name == b"QUIT":
                    self._reply(b"+OK\r\n")
                    break
                elif name == b"CLIENT":
                    # redis-py 5.x 用 CLIENT SETNAME/SETINFO 标识客户端
                    if args and args[0].upper() == b"ID":
                        self._reply(_encode(int(args[1])))
                    else:
                        self._reply(b"+OK\r\n")
                elif name == b"SELECT":
                    self._reply(b"+OK\r\n")
                elif name == b"HELLO":
                    # RESP2 简化响应（客户端只检查不报错）
                    self._reply(b"*1\r\n$6\r\nserver\r\n")
                elif name == b"INFO":
                    info = b"# Server\r\nredis_version:7.0.0-mini\r\n"
                    self._reply(_encode(info))
                elif name == b"COMMAND":
                    self._reply(b"*0\r\n")
                elif name == b"CONFIG":
                    self._reply(b"*0\r\n")
                elif name == b"SCRIPT":
                    self._reply(b"-ERR unknown command\r\n")
                else:
                    self._reply(b"-ERR unknown command\r\n")
            except (BrokenPipeError, ConnectionResetError):
                break
            except Exception:
                break
        # 清理订阅
        with _sub_lock:
            for ch in list(self.channels):
                subs = _subs.get(ch)
                if subs:
                    for s in list(subs):
                        if s[0] == self.request:
                            subs.discard(s)

    def _published_count(self, channel: bytes) -> int:
        ch = channel.decode()
        with _sub_lock:
            direct = len(_subs.get(ch, ()))
            pattern_hits = 0
            for chs, subs in _subs.items():
                for s in subs:
                    if s[1] and fnmatch.fnmatch(ch, s[1]):
                        pattern_hits += 1
            return direct + pattern_hits

    def _publish(self, channel: bytes, message: bytes) -> None:
        """把消息投给所有订阅者。

        - 精确订阅（SUBSCRIBE）→ `message` 帧：["message", channel, payload]
        - 模式订阅（PSUBSCRIBE）→ `pmessage` 帧：["pmessage", pattern, channel, payload]
          （真实 Redis 的 pmessage 多一个 pattern 元素，客户端按 4 元素解析）
        """
        ch = channel.decode()
        msg = message.decode(errors="replace")
        with _sub_lock:
            exact: set = set()
            pattern_hits: list[tuple[socket.socket, str]] = []
            for s in _subs.get(ch, ()):
                exact.add(s)
            for chs, subs in _subs.items():
                for s in subs:
                    if s[1] and fnmatch.fnmatch(ch, s[1]):
                        pattern_hits.append(s)

        def bulk(x: str) -> bytes:
            b = x.encode()
            return b"$%d\r\n%s\r\n" % (len(b), b)

        for sock, _ in exact:
            payload = b"*3\r\n" + bulk("message") + bulk(ch) + bulk(msg)
            try:
                sock.sendall(payload)
            except OSError:
                pass
        for sock, pattern in pattern_hits:
            payload = (
                b"*4\r\n" + bulk("pmessage") + bulk(pattern) + bulk(ch) + bulk(msg)
            )
            try:
                sock.sendall(payload)
            except OSError:
                pass

    def _read_command(self) -> list[bytes] | None:
        line = self._recv_line()
        if line is None:
            return None
        line = line.strip()
        if not line:
            return []
        if line[:1] != b"*":
            return line.split()
        n = int(line[1:])
        out: list[bytes] = []
        for _ in range(n):
            hdr = self._recv_line()
            if hdr is None:
                return None
            hdr = hdr.strip()
            if hdr[:1] != b"$":
                return None
            ln = int(hdr[1:])
            data = self._recv_exact(ln)
            if data is None:
                return None
            self._recv_exact(2)  # 消费 bulk body 后的 CRLF
            out.append(data)
        return out


class ThreadedServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def serve(host: str = "127.0.0.1", port: int = 6379) -> ThreadedServer:
    srv = ThreadedServer((host, port), Handler)
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    return srv


if __name__ == "__main__":
    import sys

    port = int(sys.argv[1]) if len(sys.argv) > 1 else 6379
    s = serve(port=port)
    print(f"mini-redis listening on 127.0.0.1:{port}")
    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        s.shutdown()
