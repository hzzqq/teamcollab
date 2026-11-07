#!/usr/bin/env bash
# TeamCollab 一键干净启动 / 停止 / 看日志 —— Linux / WSL 版
#
# 为什么是独立 .sh 而不是给 .ps1 加兼容层：
#   Windows 版依赖 kernel32.dll(P/Invoke)、Get-NetTCPConnection、Get-Service collabpg，
#   这些在 Linux 上都不存在，硬改只会得到一个两边都跑不好的脚本。
#
# 注意：本文件为 LF 换行 + UTF-8（bash 要求；CRLF 会直接炸）。
# 状态：在 Windows 本机仅做 `bash -n` 语法校验，未在真实 Linux/WSL 实测，
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
# 端口真相源：前端 NEXT_PUBLIC_API_BASE 在 build 时烤死为 http://localhost:8000，
#   故后端默认 8000 保证前后端连通。仓库根 .port.env（port-doctor 生成、已 gitignore）
#   若其中 PORT≠8000，脚本显式警告但仍按 8000 启动，避免静默断链。

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

BACKEND_PORT=8000
FRONTEND_PORT=3000
STOP=0; DRY=0; SKIP_SEED=0; AUTO_AVOID=0; SHOW_LOG=0; TAIL_N=40

while [[ $# -gt 0 ]]; do
  case "$1" in
    --stop) STOP=1; shift ;;
    --what-if) DRY=1; shift ;;
    --skip-seed) SKIP_SEED=1; shift ;;
    --auto-avoid) AUTO_AVOID=1; shift ;;
    --log) SHOW_LOG=1; if [[ "${2:-}" =~ ^[0-9]+$ ]]; then TAIL_N="$2"; shift; fi; shift ;;
    --backend-port) BACKEND_PORT="$2"; shift 2 ;;
    --frontend-port) FRONTEND_PORT="$2"; shift 2 ;;
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

# 只杀命令行明确属于本项目的旧实例，绝不误杀 ks / 其它服务
stop_one(){
  local pattern="$1" pidfile="$2" p
  if [[ -f "$pidfile" ]]; then
    p="$(cat "$pidfile" 2>/dev/null || true)"
    if [[ -n "$p" ]] && kill -0 "$p" 2>/dev/null; then
      if (( DRY )); then warn "[what-if] 将结束 PID=$p (pidfile)"; else kill "$p" 2>/dev/null || true; ok "已结束旧实例 PID=$p"; fi
    fi
    (( DRY )) || rm -f "$pidfile"
  fi
  # 兜底：按特征精确匹配；pidfile 记的可能是包装进程，这里按命令行再扫一遍
  local ids
  ids="$(pgrep -f "$pattern" 2>/dev/null || true)"
  for p in $ids; do
    local cmd
    cmd="$(tr '\0' ' ' < "/proc/$p/cmdline" 2>/dev/null || true)"
    if [[ "$cmd" == *project4* ]] || [[ "$cmd" == *"$pattern"* ]]; then
      if (( DRY )); then warn "[what-if] 将结束 PID=$p (本项目旧实例)"; else kill "$p" 2>/dev/null || true; ok "已结束旧实例 PID=$p"; fi
    else
      warn "PID=$p 非本项目，跳过不杀"
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

if (( STOP )); then MODE='停止'; else MODE='干净启动'; fi
step "TeamCollab 一键$MODE (后端:$BACKEND_PORT 前端:$FRONTEND_PORT)"

# .port.env 由 port-doctor 写入（本机文件、已 gitignore）。PORT≠脚本端口时只警告不跟随：
# 前端 API_BASE 烤死 8000，静默跟随会导致前后端断链。
PORT_ENV_FILE="$PROJECT_DIR/.port.env"
if [[ -f "$PORT_ENV_FILE" ]]; then
  env_port="$(sed -n 's/^[[:space:]]*PORT[[:space:]]*=[[:space:]]*\([0-9][0-9]*\).*/\1/p' "$PORT_ENV_FILE" | head -1 || true)"
  if [[ -n "$env_port" && "$env_port" != "$BACKEND_PORT" ]]; then
    warn "检测到 .port.env PORT=$env_port；前端 NEXT_PUBLIC_API_BASE 在 build 时烤死为 http://localhost:8000"
    warn "  本脚本后端按 :$BACKEND_PORT 启动，不自动跟随 .port.env，避免前后端静默断链"
  fi
fi
if [[ "$BACKEND_PORT" != "8000" ]]; then
  err "  [!] 后端 :$BACKEND_PORT 与前端写死的 8000 不一致，前端将连不上；需同步重编前端或配 nginx 同源代理"
fi

# 端口被非本项目占用时的避让决策（与 Windows 版同口径）
if port_listening "$BACKEND_PORT"; then
  warn "后端 :$BACKEND_PORT 已被占用（请先确认归属）"
  if (( AUTO_AVOID )); then
    alt="$(find_free_port "$BACKEND_PORT" || true)"
    if [[ -n "$alt" ]]; then
      warn "  --auto-avoid：后端改用 :$alt"
      err "  [!] 前端 NEXT_PUBLIC_API_BASE 烤死为 http://localhost:$BACKEND_PORT，后端换端口会断链；需重编前端或同源代理"
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

stop_one "app.main:app" "$BACKEND_PID"
stop_one "next start"  "$FRONTEND_PID"
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
  resp="$(curl -fsS --max-time 5 -X POST -d 'username=pm@example.com&password=pass1234' \
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
