#!/usr/bin/env bash
# 在真实 Linux 上验证 scripts/start-teamcollab.sh 的 shell 语义。
#
# 背景：本机 WSL 被安全策略禁用、Docker daemon 不可用，因此把仓库自带的
# GitHub Actions ubuntu-24.04 runner 当作真 Linux 环境。本脚本已被 ci.yml 的
# validate-startup-sh job 调用，也可在任何 Linux 上直接执行。
#
# 验证范围（刻意的边界）：
#   - bash -n / LF / 无 BOM（bash 对这两项零容忍）
#   - --what-if 全流程：/dev/tcp 端口探测、pgrep -f、/proc/*/cmdline、.port.env 分支、参数解析
#   - 真 detached 启动：nohup setsid + pidfile + wait_port + 登录校验 + 脚本退出后进程仍存活
#   - --stop：pidfile 清理 + pgrep 兜底杀死包装进程的子进程
# 不验证「真实 uvicorn / next 能否起来」：那由 ci.yml 的 e2e-browser job 覆盖
# （真 PG + 真迁移 + 真构建 + 真浏览器），这里用最小 HTTP 替身解耦，避免 10 分钟构建噪音。
#
# 端口一律用 18800/18801 高位端口：默认 8000/3000 可能正跑着开发机上的真实实例，
# start-teamcollab.sh 的 stop_one 会按命令行精确匹配并停掉它们，验证脚本不能误伤。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
START="$ROOT/scripts/start-teamcollab.sh"
WORK="$(mktemp -d)"
STUB="$WORK/fake-service"
BACKEND_PORT=18800
FRONTEND_PORT=18801
OTHER_PORT=18810          # 同仓库、不同端口的「不该被误杀」实例
OTHER_PID=''

COMMON_ENV=(env "PROJECT_DIR=$ROOT" "PYTHON_BIN=$STUB" "NODE_BIN=$STUB" "PG_READY_CMD=true")

cleanup() {
  "${COMMON_ENV[@]}" bash "$START" --stop \
    --backend-port "$BACKEND_PORT" --frontend-port "$FRONTEND_PORT" >/dev/null 2>&1 || true
  if [[ -n "$OTHER_PID" ]]; then kill "$OTHER_PID" 2>/dev/null || true; fi
  rm -rf "$WORK"
}
trap cleanup EXIT

say(){ printf '\n\033[36m== %s ==\033[0m\n' "$*"; }
fail(){ printf '\033[31mFAIL: %s\033[0m\n' "$*" >&2; exit 1; }
ok(){ printf '\033[32m  OK: %s\033[0m\n' "$*"; }

# ---------------------------------------------------------------- 1/4 静态
say "1/4 静态校验 (bash -n / LF / 无 BOM)"
bash -n "$START" || fail "bash -n 未通过"
if LC_ALL=C grep -q $'\r' "$START"; then fail "start-teamcollab.sh 含 CRLF，bash 会炸"; fi
if [[ "$(head -c 3 "$START" | od -An -tx1 | tr -d ' \n')" == "efbbbf" ]]; then
  fail "start-teamcollab.sh 含 UTF-8 BOM，shebang 会失效"
fi
ok "语法 + 换行 + 编码"

# 最小 HTTP 替身：接受 .sh 的调用形态，按 --port / -p 起监听服务。
# seed 调用（-m scripts.seed）立即成功返回；登录 POST 返回 {"code": 0, ...} 让 .sh 的校验通过。
cat > "$STUB" <<'PYEOF'
#!/usr/bin/env python3
import json
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

args = sys.argv[1:]
if "scripts.seed" in args:
    print("seed stub: ok")
    sys.exit(0)

port = None
for flag in ("--port", "-p"):
    if flag in args:
        i = args.index(flag)
        if i + 1 < len(args) and args[i + 1].isdigit():
            port = int(args[i + 1])
if port is None:
    print("stub: no port in args", file=sys.stderr)
    sys.exit(2)


class Handler(BaseHTTPRequestHandler):
    def _reply(self):
        body = json.dumps({"code": 0, "data": {"access_token": "stub"}}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self._reply()

    def do_POST(self):
        self._reply()

    def log_message(self, *a):
        pass


class Server(HTTPServer):
    allow_reuse_address = True
    daemon_threads = True


Server(("127.0.0.1", port), Handler).serve_forever()
PYEOF
chmod +x "$STUB"
ok "HTTP 替身已生成: $STUB"

# ---------------------------------------------------------------- 2/4 what-if
say "2/4 --what-if 全流程 (默认端口 + 高位端口两套参数)"
"${COMMON_ENV[@]}" bash "$START" --what-if >/dev/null
"${COMMON_ENV[@]}" bash "$START" --what-if \
  --backend-port "$BACKEND_PORT" --frontend-port "$FRONTEND_PORT" >/dev/null
ok "两套参数均走完全流程且退出码 0"

# ---------------------------------------------------------------- 3/4 真启动
say "3/4 真 detached 启动 (nohup setsid + pidfile + 存活 + 登录校验)"
"${COMMON_ENV[@]}" bash "$START" \
  --backend-port "$BACKEND_PORT" --frontend-port "$FRONTEND_PORT" > "$WORK/start.out" 2>&1 \
  || { cat "$WORK/start.out"; fail "启动流程非 0 退出"; }
cat "$WORK/start.out" | sed 's/^/    /'

[[ -s "$ROOT/logs/backend.pid" && -s "$ROOT/logs/frontend.pid" ]] || fail "pidfile 未写入"
[[ "$(cat "$ROOT/logs/backend.pid")" =~ ^[0-9]+$ ]] || fail "backend.pid 内容非数字"
[[ "$(cat "$ROOT/logs/frontend.pid")" =~ ^[0-9]+$ ]] || fail "frontend.pid 内容非数字"
ok "pidfile 写入且内容为 PID"

# 关键：start-teamcollab.sh 已返回，若 nohup setsid 未生效，进程会被 shell 退出时的 SIGHUP 带走。
for p in "$BACKEND_PORT" "$FRONTEND_PORT"; do
  curl -fsS --max-time 3 "http://127.0.0.1:$p/" >/dev/null 2>&1 \
    || fail "脚本退出后 :$p 不再可达 —— detached 语义失效"
done
ok "脚本退出后两个服务仍存活（脱离语义成立）"
grep -q '登录成功' "$WORK/start.out" || fail "登录校验未通过"
ok "端到端登录校验通过"

# 隔离基线：另起一个「同仓库特征、不同端口」的实例。旧版 pgrep -f 不区分端口，会把它一并杀掉。
nohup setsid "$STUB" -m uvicorn app.main:app --host 127.0.0.1 --port "$OTHER_PORT" \
  > "$WORK/other.log" 2>&1 < /dev/null &
OTHER_PID=$!
for i in $(seq 1 20); do
  curl -fsS --max-time 2 "http://127.0.0.1:$OTHER_PORT/" >/dev/null 2>&1 && break
  sleep 0.2
done
curl -fsS --max-time 2 "http://127.0.0.1:$OTHER_PORT/" >/dev/null 2>&1 \
  || fail ":$OTHER_PORT 独立实例未起来，隔离测试无效"
ok "已在 :$OTHER_PORT 另起独立实例 (PID=$OTHER_PID)"

# ---------------------------------------------------------------- 4/4 停止
say "4/4 --stop (进程终止 + pidfile 清理)"
"${COMMON_ENV[@]}" bash "$START" --stop \
  --backend-port "$BACKEND_PORT" --frontend-port "$FRONTEND_PORT" > "$WORK/stop.out" 2>&1 || true
cat "$WORK/stop.out" | sed 's/^/    /'
sleep 1
for p in "$BACKEND_PORT" "$FRONTEND_PORT"; do
  if curl -fsS --max-time 2 "http://127.0.0.1:$p/" >/dev/null 2>&1; then
    fail ":$p 停止后仍可访问"
  fi
done
[[ ! -e "$ROOT/logs/backend.pid" && ! -e "$ROOT/logs/frontend.pid" ]] || fail "pidfile 未清理"
ok "两个端口已释放，pidfile 已清理"

# 关键回归：--stop 18800 绝不能带走 18810 上的同仓库实例
curl -fsS --max-time 2 "http://127.0.0.1:$OTHER_PORT/" >/dev/null 2>&1 \
  || fail ":$OTHER_PORT 独立实例被误杀 —— 端口隔离失效"
ok ":$OTHER_PORT 独立实例仍存活（端口隔离成立）"
kill "$OTHER_PID" 2>/dev/null || true
OTHER_PID=''

# ---------------------------------------------------------------- 5/4 真相源
say "5/4 单一端口真相源 (.port.env 冲突阻断 + WEB_PORT 统一读取)"
conflict_dir="$WORK/proj"
mkdir -p "$conflict_dir"
printf '# 由 port-doctor 生成\nPORT=5105\nWEB_PORT=18811\n' > "$conflict_dir/.port.env"
set +e
env PROJECT_DIR="$conflict_dir" PYTHON_BIN="$STUB" NODE_BIN="$STUB" PG_READY_CMD=true \
  bash "$START" --what-if > "$WORK/conflict.out" 2>&1
rc=$?
set -e
[[ $rc -ne 0 ]] || fail ".port.env PORT=5105 未阻断启动（会静默断链）"
grep -q '配置冲突' "$WORK/conflict.out" || fail "缺少配置冲突说明与修复指引"
ok "PORT≠8000 时硬失败并给出三条修复指引 (rc=$rc)"

printf 'PORT=8000\nWEB_PORT=18811\n' > "$conflict_dir/.port.env"
env PROJECT_DIR="$conflict_dir" PYTHON_BIN="$STUB" NODE_BIN="$STUB" PG_READY_CMD=true \
  bash "$START" --what-if > "$WORK/webport.out" 2>&1
grep -q '前端: http://localhost:18811' "$WORK/webport.out" || {
  cat "$WORK/webport.out"; fail "WEB_PORT 未被统一读取为前端默认端口"; }
ok "WEB_PORT=18811 被统一读取为前端默认端口"

say "PASS: scripts/start-teamcollab.sh 在 $(uname -s)/$(uname -m) 上全链路验证通过"
