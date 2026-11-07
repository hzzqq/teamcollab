#!/usr/bin/env bash
# TeamCollab 一键干净启动 / 停止 / 看日志 —— Linux / WSL 版
#
# 为什么是独立 .sh 而不是给 .ps1 加兼容层：
#   Windows 版依赖 kernel32.dll(P/Invoke)、Get-NetTCPConnection、Get-Service collabpg，
#   这些在 Linux 上都不存在，硬改只会得到一个两边都跑不好的脚本。
#
# 注意：本文件为 LF 换行 + UTF-8（bash 要求；CRLF 会直接炸）。
# 状态：已在 GitHub Actions ubuntu-24.04（真 Linux）全链路实测，
#       验证脚本见 scripts/ci/verify-startup-sh.sh（语法 + --what-if + detached 启停 + --stop）。
#       PG 启动方式、node/python 路径按发行版调整下方环境变量即可。
#
# 用法（仓库根目录下执行）：
#   ./scripts/start-teamcollab.sh                    # 干净启动（停旧+起新+seed+校验）
#   ./scripts/start-teamcollab.sh --log 100         # 看日志尾部 100 行
#   ./scripts/start-teamcollab.sh --stop            # 仅停止本项目实例
#   ./scripts/start-teamcollab.sh --what-if         # 只预报不真做
#   ./scripts/start-teamcollab.sh --skip-seed       # 账号已有时跳过 seed
#   ./scripts/start-teamcollab.sh --backend-port 8001 --frontend-port 3001
#   ./scripts/start-teamcollab.sh --auto-avoid      # 后端端口被占也避让（接受前后端可能断链）
#
# 可覆盖的环境变量：
#   PROJECT_DIR / PYTHON_BIN / NODE_BIN / PG_PORT / PG_READY_CMD / CURL_BIN
#
# 端口真相源（唯一）：仓库根 .port.env（port-doctor 生成、本机文件、已 gitignore）。
#   优先级：显式 --backend-port/--frontend-port > 同名环境变量 > .port.env > 默认(8000/3000)。
#   与 port_env.py / start_dev.py 同口径。前端 NEXT_PUBLIC_API_BASE 在 build 时烤死 8000，
#   故 .port.env 若给了非 8000 的 PORT 且未经显式覆盖，脚本直接报错退出（绝不静默断链）。
#   WEB_PORT 则被正常读取为前端默认端口（换前端端口不影响 API 连通）。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# 未显式指定时按脚本位置推断仓库根（scripts/ 的父目录）；跨机 clone 后无需改路径
PROJECT_DIR="${PROJECT_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
SERVER_DIR="$PROJECT_DIR/server"
WEB_DIR="$PROJECT_DIR/web"
LOG_DIR="$PROJECT_DIR/logs"
PYTHON_BIN="${PYTHON_BIN:-$SERVER_DIR/.venv/bin/python}"
NODE_BIN="${NODE_BIN:-node}"
CURL_BIN="${CURL_BIN:-curl}"
PG_PORT="${PG_PORT:-5432}"

# 端口在下方「单一端口真相源」段统一解析；这里先收下同名环境变量并清空，
# 避免与脚本内部变量混淆。优先级：显式参数 > 环境变量 > .port.env > 默认。
ENV_BACKEND_PORT="${BACKEND_PORT:-}"
ENV_FRONTEND_PORT="${FRONTEND_PORT:-}"
BACKEND_PORT=''; FRONTEND_PORT=''
BACKEND_EXPLICIT=0; FRONTEND_EXPLICIT=0
STOP=0; DRY=0; SKIP_SEED=0; AUTO_AVOID=0; SHOW_LOG=0; TAIL_N=40

while [[ $# -gt 0 ]]; do
  case "$1" in
    --stop) STOP=1; shift ;;
    --what-if) DRY=1; shift ;;
    --skip-seed) SKIP_SEED=1; shift ;;
    --auto-avoid) AUTO_AVOID=1; shift ;;
    --log) SHOW_LOG=1; if [[ "${2:-}" =~ ^[0-9]+$ ]]; then TAIL_N="$2"; shift; fi; shift ;;
    --backend-port) BACKEND_PORT="$2"; BACKEND_EXPLICIT=1; shift 2 ;;
    --frontend-port) FRONTEND_PORT="$2"; FRONTEND_EXPLICIT=1; shift 2 ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    *) echo "未知参数: $1" >&2; exit 2 ;;
  esac
done

mkdir -p "$LOG_DIR"
BACKEND_LOG="$LOG_DIR/backend.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"
BACKEND_PID="$LOG_DIR/backend.pid"
FRONTEND_PID="$LOG_DIR/frontend.pid"

step(){ printf '\033[36m== %s\033[0m\n' "$*"; }
ok(){ printf '\033[32m  %s\033[0m\n' "$*"; }
warn(){ printf '\033[33m  %s\033[0m\n' "$*"; }
err(){ printf '\033[31m  %s\033[0m\n' "$*"; }

if (( SHOW_LOG )); then
  step "日志尾部 (各 $TAIL_N 行)"
  for n in backend frontend; do
    f="$LOG_DIR/$n.log"
    printf '\033[36m--- %s  %s ---\033[0m\n' "$n" "$f"
    if [[ -f "$f" ]]; then tail -n "$TAIL_N" "$f"; else echo "  (无日志文件)"; fi
  done
  exit 0
fi

# 只停「目标端口」上的本项目实例：pidfile + 命令行端口精确匹配兜底。
# 端口边界很重要：--port 8000 不能命中 --port 80001；同仓库其它端口的实例绝不被误杀。
stop_one(){
  local pattern="$1" pidfile="$2" port="$3" p
  local port_re='(--port[ =]|-p[ =])'"${port}"'([^0-9]|$)'
  if [[ -f "$pidfile" ]]; then
    p="$(cat "$pidfile" 2>/dev/null || true)"
    if [[ -n "$p" ]] && kill -0 "$p" 2>/dev/null; then
      if (( DRY )); then warn "[what-if] 将结束 PID=$p (pidfile)"; else kill "$p" 2>/dev/null || true; ok "已结束旧实例 PID=$p (pidfile)"; fi
    fi
    (( DRY )) || rm -f "$pidfile"
  fi
  # 兜底：pgrep 按特征扫，再用 /proc 校验命令行里的端口，只杀本端口实例
  local ids
  ids="$(pgrep -f "$pattern" 2>/dev/null || true)"
  for p in $ids; do
    local cmd
    cmd="$(tr '\0' ' ' < "/proc/$p/cmdline" 2>/dev/null || true)"
    if [[ "$cmd" =~ $port_re ]]; then
      if (( DRY )); then warn "[what-if] 将结束 PID=$p (:$port 本项目旧实例)"; else kill "$p" 2>/dev/null || true; ok "已结束旧实例 PID=$p (:$port)"; fi
    else
      warn "PID=$p 非 :$port 实例，跳过不杀（避免误伤同仓库其它端口）"
    fi
  done
}

# 用 /dev/tcp 判断端口是否监听（不依赖 lsof / ss）
port_listening(){ (exec 3<>"/dev/tcp/127.0.0.1/$1") >/dev/null 2>&1 && return 0 || return 1; }
find_free_port(){
  local start="$1" p
  for (( p=start+1; p<start+200; p++ )); do
    if ! port_listening "$p"; then echo "$p"; return 0; fi
  done
  return 1
}
wait_port(){
  local port="$1" i
  for (( i=0; i<25; i++ )); do
    port_listening "$port" && return 0
    sleep 1
  done
  return 1
}

# ---------------- 单一端口真相源：.port.env ----------------
# 优先级：显式 --backend-port/--frontend-port > 同名环境变量 > .port.env > 默认(8000/3000)
# 与 port_env.py / start_dev.py 完全同口径；三入口对冲突做同一件事：拒绝静默启动断链服务。
PORT_ENV_FILE="$PROJECT_DIR/.port.env"
env_backend_port=''; env_frontend_port=''
if [[ -f "$PORT_ENV_FILE" ]]; then
  env_backend_port="$(sed -n 's/^[[:space:]]*PORT[[:space:]]*=[[:space:]]*\([0-9][0-9]*\).*/\1/p' "$PORT_ENV_FILE" | head -1 || true)"
  env_frontend_port="$(sed -n 's/^[[:space:]]*WEB_PORT[[:space:]]*=[[:space:]]*\([0-9][0-9]*\).*/\1/p' "$PORT_ENV_FILE" | head -1 || true)"
fi

backend_from_env_file=0
if (( BACKEND_EXPLICIT )); then
  :   # 显式参数优先级最高
elif [[ -n "$ENV_BACKEND_PORT" ]]; then
  BACKEND_PORT="$ENV_BACKEND_PORT"
elif [[ -n "$env_backend_port" ]]; then
  BACKEND_PORT="$env_backend_port"; backend_from_env_file=1
else
  BACKEND_PORT=8000
fi
if (( FRONTEND_EXPLICIT )); then
  :
elif [[ -n "$ENV_FRONTEND_PORT" ]]; then
  FRONTEND_PORT="$ENV_FRONTEND_PORT"
elif [[ -n "$env_frontend_port" ]]; then
  FRONTEND_PORT="$env_frontend_port"
else
  FRONTEND_PORT=3000
fi

if (( backend_from_env_file )) && [[ "$BACKEND_PORT" != "8000" ]]; then
  err "配置冲突：.port.env PORT=$BACKEND_PORT，但前端 NEXT_PUBLIC_API_BASE 在 build 时烤死为 http://localhost:8000"
  err "  按 :$BACKEND_PORT 起后端，前端会静默连不上。三选一："
  err "    ① 把 .port.env 的 PORT 改回 8000（推荐；port-doctor 不应给本项目后端分配其它端口）"
  err "    ② 显式 --backend-port $BACKEND_PORT 并同步重编前端（NEXT_PUBLIC_API_BASE=http://localhost:$BACKEND_PORT npm run build）"
  err "    ③ 配 nginx 同源代理，前端统一走同源 /api"
  if (( STOP )); then warn "  --stop 模式不受阻断，继续停止本项目实例"; else exit 1; fi
fi
if [[ "$BACKEND_PORT" != "8000" ]]; then
  warn "后端 :$BACKEND_PORT ≠ 8000（显式指定）：前端写死的 API_BASE 将连不上，需同步重编前端或同源代理"
fi

if (( STOP )); then MODE='停止'; else MODE='干净启动'; fi
step "TeamCollab 一键$MODE (后端:$BACKEND_PORT 前端:$FRONTEND_PORT)"

# 端口被非本项目占用时的避让决策（与 Windows 版同口径）
if port_listening "$BACKEND_PORT"; then
  warn "后端 :$BACKEND_PORT 已被占用（请先确认归属）"
  if (( AUTO_AVOID )); then
    alt="$(find_free_port "$BACKEND_PORT" || true)"
    if [[ -n "$alt" ]]; then
      warn "  --auto-avoid：后端改用 :$alt"
      err "  [!] 前端 NEXT_PUBLIC_API_BASE 烤死为 http://localhost:8000，后端换端口会断链；需重编前端或同源代理"
      BACKEND_PORT="$alt"
    fi
  else
    err "  后端默认不避让（会静默切断前后端）。三选一：① 停占用者 ② --backend-port + 重编前端 ③ --auto-avoid 接受断链"
  fi
fi
if port_listening "$FRONTEND_PORT"; then
  alt="$(find_free_port "$FRONTEND_PORT" || true)"
  if [[ -n "$alt" ]]; then
    warn "前端 :$FRONTEND_PORT 被占用 → 自动避让到 :$alt（API 连接不受影响）"
    FRONTEND_PORT="$alt"
  fi
fi

stop_one "app.main:app" "$BACKEND_PID"  "$BACKEND_PORT"
stop_one "next start"  "$FRONTEND_PID" "$FRONTEND_PORT"
if (( STOP )); then ok "已停止本项目实例"; exit 0; fi

# PostgreSQL 就绪检查（发行版差异：可覆盖 PG_READY_CMD）
if [[ -n "${PG_READY_CMD:-}" ]]; then
  eval "$PG_READY_CMD" || { err 'PG 未就绪'; exit 1; }
elif command -v pg_isready >/dev/null 2>&1; then
  pg_isready -h 127.0.0.1 -p "$PG_PORT" >/dev/null 2>&1 || { err "PG 未就绪(: $PG_PORT)，请先启动 PostgreSQL"; exit 1; }
else
  port_listening "$PG_PORT" || { err "PG 未就绪(: $PG_PORT 无监听)"; exit 1; }
fi
ok "PostgreSQL : $PG_PORT 就绪"

[[ -x "$PYTHON_BIN" ]] || { err "未找到 python: $PYTHON_BIN（用 PYTHON_BIN 覆盖）"; exit 1; }
command -v "$NODE_BIN" >/dev/null 2>&1 || { err "未找到 node: $NODE_BIN（用 NODE_BIN 覆盖）"; exit 1; }

# 注意：这里刻意不用 $(...) 命令替换包后台进程 —— 后台子进程会继承 stdout 管道，
# 导致命令替换一直等管道关闭而卡死。直接 `... &` + `$!` 才是正确写法。
step "启动后端 (uvicorn :$BACKEND_PORT)"
if (( DRY )); then
  warn "[what-if] 启动 (cwd=$SERVER_DIR): $PYTHON_BIN -m uvicorn app.main:app --host 127.0.0.1 --port $BACKEND_PORT"
else
  cd "$SERVER_DIR"
  nohup setsid "$PYTHON_BIN" -m uvicorn app.main:app --host 127.0.0.1 --port "$BACKEND_PORT" > "$BACKEND_LOG" 2>&1 < /dev/null &
  bid=$!
  echo "$bid" > "$BACKEND_PID"
  ok "后端 PID=$bid (cwd=$SERVER_DIR)"
  if wait_port "$BACKEND_PORT"; then ok "后端 :$BACKEND_PORT 就绪"; else err "后端未在预期内就绪，看 $BACKEND_LOG 或 --log"; fi
fi

if (( ! SKIP_SEED )); then
  step '灌入演示数据 (scripts.seed, 幂等)'
  if (( DRY )); then warn "[what-if] 运行: (cd $SERVER_DIR && $PYTHON_BIN -m scripts.seed)"; else
    (cd "$SERVER_DIR" && "$PYTHON_BIN" -m scripts.seed) 2>&1 | sed 's/^/    /' || warn 'seed 未成功（账号可能已存在）'
  fi
fi

step "启动前端 (next start :$FRONTEND_PORT)"
if (( DRY )); then
  warn "[what-if] 启动 (cwd=$WEB_DIR): $NODE_BIN node_modules/next/dist/bin/next start -p $FRONTEND_PORT"
else
  cd "$WEB_DIR"
  nohup setsid "$NODE_BIN" node_modules/next/dist/bin/next start -p "$FRONTEND_PORT" > "$FRONTEND_LOG" 2>&1 < /dev/null &
  fid=$!
  echo "$fid" > "$FRONTEND_PID"
  ok "前端 PID=$fid (cwd=$WEB_DIR)"
  if wait_port "$FRONTEND_PORT"; then ok "前端 :$FRONTEND_PORT 就绪"; else err "前端未在预期内就绪，看 $FRONTEND_LOG 或 --log"; fi
fi

step '端到端校验 (登录 pm@example.com)'
if (( ! DRY )); then
  resp="$("$CURL_BIN" -fsS --max-time 5 -X POST -d 'username=pm@example.com&password=pass1234' \
        "http://127.0.0.1:$BACKEND_PORT/api/v1/auth/login" 2>/dev/null || true)"
  if [[ "$resp" == *'"code":0'* || "$resp" == *'"code": 0'* ]]; then
    ok "登录成功: $resp"
  else
    err "登录校验未通过（可能是后端未就绪或账号缺失）: ${resp:-无响应}"
  fi
else
  warn '[what-if] 跳过登录校验'
fi

step '完成'
echo "  前端: http://localhost:$FRONTEND_PORT"
echo "  后端: http://localhost:$BACKEND_PORT  (文档 /docs, 契约 /openapi.json)"
echo '  日志: --log N   |   停止: --stop'
echo '  演示账号: pm@example.com / pass1234 (owner); dev@example.com / pass1234 (member)'
