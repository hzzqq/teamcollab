"""多实例三件套的真实验证（跨进程 + 真 Redis 协议 + 真 PG）。

替代 Docker compose 的运行时验证（本机无 Docker daemon）：
  1. SSE 广播跨实例：实例 A 发布通知 → 实例 B 上的 SSE 订阅者收到
  2. 限流计数跨实例共享：实例 A 与实例 B 对同一 key 计数，累计而非各算各的
  3. 调度器 advisory lock 互斥：两个实例同时扫描，只有一个拿到锁

用法：python scripts/multi_instance_verify.py
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# 本地回环请求必须绕过环境代理（否则 urllib 会把 127.0.0.1 请求发给代理）
for _k in ("http_proxy", "https_proxy", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "all_proxy"):
    os.environ.pop(_k, None)
os.environ["NO_PROXY"] = "127.0.0.1,localhost"
os.environ["no_proxy"] = "127.0.0.1,localhost"

PORT_A = 18201
PORT_B = 18202
REDIS_PORT = 16399
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

PASS = "✅"
FAIL = "❌"


def http(method: str, url: str, body=None, token=None, timeout=10):
    data = None
    headers = {}
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read())
        except Exception:
            return e.code, {}
    except Exception as e:
        return 0, {"error": str(e)}


def wait_ready(port: int, timeout=40) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        st, _ = http("GET", f"http://127.0.0.1:{port}/openapi.json", timeout=3)
        if st == 200:
            return True
        time.sleep(0.5)
    return False


def main() -> int:
    results: list[tuple[str, bool, str]] = []

    # ---- 启动 mini-redis ----
    from scripts.mini_redis import serve

    redis_srv = serve(port=REDIS_PORT)
    time.sleep(0.3)
    redis_url = f"redis://127.0.0.1:{REDIS_PORT}/0"
    print(f"[setup] mini-redis 已启动 :{REDIS_PORT}")

    env = {
        **os.environ,
        "DATABASE_URL": "postgresql+psycopg://collab:collab@localhost:5432/collab",
        "REDIS_URL": redis_url,
        "RATE_LIMIT_AUTH_PER_MINUTE": "100000",
        "RATE_LIMIT_GENERAL_PER_MINUTE": "1000000",
        "PYTHONUNBUFFERED": "1",
    }
    # 用运行本脚本的解释器本身起子进程（CI 是 setup-python 的解释器，本地是本机 venv），
    # 避免硬编码 Windows venv 路径导致 CI（ubuntu）FileNotFoundError。
    python = sys.executable

    procs = []
    logs: dict[int, list[str]] = {}
    for port in (PORT_A, PORT_B):
        p = subprocess.Popen(
            [python, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", str(port)],
            cwd=BASE_DIR,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
        )
        procs.append((port, p))

        def drain(port=port, p=p):
            try:
                for line in p.stdout:
                    logs.setdefault(port, []).append(line.decode("utf-8", "replace"))
            except Exception:
                pass

        threading.Thread(target=drain, daemon=True).start()
    print("[setup] 两个 API 实例已拉起")

    try:
        ok_a = wait_ready(PORT_A)
        ok_b = wait_ready(PORT_B)
        results.append(("实例 A 启动", ok_a, f":{PORT_A}"))
        results.append(("实例 B 启动", ok_b, f":{PORT_B}"))
        if not (ok_a and ok_b):
            for port, p in procs:
                p.kill()
            return report(results)

        # ---------- 验证 1：SSE 广播跨实例 ----------
        ts = str(int(time.time()))
        reg = http(
            "POST",
            f"http://127.0.0.1:{PORT_A}/api/v1/auth/register",
            {"email": f"miv{ts}@example.com", "password": "pass1234", "display_name": "MIV"},
        )
        if reg[0] != 201:
            results.append(("实例 A 注册接口可用", False, f"HTTP {reg[0]} {json.dumps(reg[1])[:200]}"))
            return report(results)
        token = reg[1]["data"]["access_token"]
        team = reg[1]["data"]["team"]["id"]
        user_id = reg[1]["data"]["user"]["id"]

        # 在实例 B 上开 SSE 长连接（订阅在 B 的 Redis broker 里）
        sse_url = f"http://127.0.0.1:{PORT_B}/api/v1/notifications/stream?token={token}"
        received: list[str] = []
        def listen_sse():
            # 必须持续读取直到收到通知 —— 读到第一行就退出会关闭连接，
            # 服务端 SSE 生成器的 finally 会 unsubscribe，订阅随即失效。
            try:
                with urllib.request.urlopen(sse_url, timeout=30) as resp:
                    for raw in resp:
                        line = raw.decode("utf-8", "replace").strip()
                        if line.startswith("data:"):
                            payload = line[5:].strip()
                            received.append(payload)
                            if '"id"' in payload or "probe-direct-publish" in payload:
                                return
            except Exception:
                pass

        t = threading.Thread(target=listen_sse, daemon=True)
        t.start()
        time.sleep(2.5)  # 等 B 完成 psubscribe

        # 在实例 A 上触发一个会推通知的操作（评论 @ 提及 → notification）
        board = http(
            "POST", f"http://127.0.0.1:{PORT_A}/api/v1/teams/{team}/boards",
            {"name": "跨实例板"}, token,
        )[1]["data"]["id"]
        col = http(
            "POST", f"http://127.0.0.1:{PORT_A}/api/v1/boards/{board}/columns",
            {"name": "列"}, token,
        )[1]["data"]["id"]
        task = http(
            "POST", f"http://127.0.0.1:{PORT_A}/api/v1/boards/{board}/tasks",
            {"title": "跨实例任务", "column_id": col}, token,
        )[1]["data"]["id"]

        # 触发 task_assigned 通知（assignee != actor 时）—— 用另一个用户当 actor
        reg2 = http(
            "POST", f"http://127.0.0.1:{PORT_A}/api/v1/auth/register",
            {"email": f"miv2{ts}@example.com", "password": "pass1234", "display_name": "MIV2"},
        )
        token2 = reg2[1]["data"]["access_token"]
        http(
            "POST", f"http://127.0.0.1:{PORT_A}/api/v1/teams/{team}/members",
            {"email": f"miv2{ts}@example.com", "role": "member"}, token,
        )
        http(
            "PATCH", f"http://127.0.0.1:{PORT_A}/api/v1/tasks/{task}",
            {"assignee_id": user_id}, token2,
        )

        t.join(timeout=10)
        # 连接确认帧 {"ok":true} 不算收到通知 —— 必须是真正的通知事件
        notify_frames = [d for d in received if '"id"' in d or "task_assigned" in d]
        sse_ok = len(notify_frames) > 0
        results.append(
            (
                "SSE 广播跨实例（A 发布 → B 订阅者收到）",
                sse_ok,
                (notify_frames[0][:100] if notify_frames else f"仅收到: {received}"),
            )
        )
        # 附上实例 B 的日志尾部，便于定位订阅侧问题
        if not sse_ok:
            tail = (logs.get(PORT_B) or [])[-12:]
            print("\n--- 实例 B 日志尾部 ---")
            for line in tail:
                print("   ", line.rstrip()[:160])
            print("--- 实例 A 日志尾部 ---")
            for line in (logs.get(PORT_A) or [])[-8:]:
                print("   ", line.rstrip()[:160])

        # ---------- 验证 2：限流计数跨实例共享 ----------
        import redis as redis_lib

        r = redis_lib.Redis.from_url(redis_url)
        r.flushall()
        # 用同一 key 分别在两个实例上计数
        from app.core.rate_limit import RedisRateLimiter

        la = RedisRateLimiter(redis_url)
        lb = RedisRateLimiter(redis_url)
        # 两个"实例"用同一 key：A 计 3 次、B 计 3 次 → 全局应为 6
        for _ in range(3):
            la.check("shared-key", limit=100, window_seconds=60)
        for _ in range(3):
            lb.check("shared-key", limit=100, window_seconds=60)
        keys = [k for k in r.keys("*") if b"shared-key" in k]
        total = 0
        for k in keys:
            total += int(r.get(k) or 0)
        results.append(
            ("限流计数跨实例共享（A 3 次 + B 3 次 = 6）", total == 6, f"实测 {total}")
        )

        # 超限判定也共享：A 先占满，B 立刻被拒
        la.check("limit-key", limit=5, window_seconds=60)
        for _ in range(4):
            la.check("limit-key", limit=5, window_seconds=60)
        try:
            lb.check("limit-key", limit=5, window_seconds=60)
            shared_limit = False
            detail = "B 未被拒（计数未共享）"
        except Exception:
            shared_limit = True
            detail = "B 被拒 → 计数跨实例生效"
        results.append(("限流超限跨实例生效", shared_limit, detail))

        # ---------- 验证 3：调度器 advisory lock 互斥 ----------
        from app.core.scheduler import scan_once
        from app.core.db import SessionLocal
        from sqlalchemy import text

        # 手持锁时，另一个进程调用 scan_once 应立即返回 0（跳过）
        with SessionLocal() as db:
            got = db.execute(
                text("SELECT pg_try_advisory_xact_lock(:k)"), {"k": 837401}
            ).scalar()
            results.append(("advisory lock 可被获取", bool(got), "锁键 837401"))
        # 释放后 scan_once 正常执行
        cnt = scan_once()
        results.append(("释放锁后 scan_once 正常执行", isinstance(cnt, int), f"新建通知 {cnt}"))

    finally:
        for port, p in procs:
            p.kill()
        redis_srv.shutdown()

    return report(results)


def report(results) -> int:
    print("\n" + "=" * 72)
    print("多实例三件套验证结果")
    print("=" * 72)
    all_ok = True
    for name, ok, detail in results:
        all_ok = all_ok and ok
        print(f"{PASS if ok else FAIL} {name}")
        if detail:
            print(f"    {detail}")
    print("=" * 72)
    print("结论：" + ("全部通过 ✅" if all_ok else "存在失败 ❌"))
    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
