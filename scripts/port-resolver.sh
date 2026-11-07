#!/usr/bin/env bash
# 多项目同机演示：端口占用排查 —— Linux / WSL 版（**只读**）
#
# 与 Windows 版 scripts/port-resolver.ps1 同口径，但刻意不提供杀进程能力：
# 释放端口请用 scripts/start-teamcollab.sh --stop（按端口精确停本项目实例）或人工处理。
# 零外部依赖：/proc/net/tcp + /proc/*/fd + bash 内建 /dev/tcp；curl 仅可选用于取 HTTP 标题。
#
# 用法：
#   ./scripts/port-resolver.sh --probe                 列出常用演示端口占用归属
#   ./scripts/port-resolver.sh --port 8000            单端口详情（PID / 进程名 / 命令行 / 标题）
#   ./scripts/port-resolver.sh --find-free 8000       返回第一个空闲端口（不杀进程）
#   ./scripts/port-resolver.sh --port 8000 --what-if  本脚本本就只读，仅提示
#
# 注意：本文件必须是 LF + 无 BOM（bash 要求）。真 Linux 回归见 scripts/ci/verify-startup-sh.sh。
set -euo pipefail

PORTS=(3000 5000 5050 5052 8000 8501 8899 5173)
declare -A DESC=(
  [3000]="Next.js 前端"
  [5000]="Flask"
  [5050]="StockSignal Flask"
  [5052]="StockSignal FastAPI"
  [8000]="uvicorn/FastAPI 后端"
  [8501]="Streamlit 默认"
  [8899]="StockSignal Streamlit"
  [5173]="Vite"
)

MODE='probe'
PORT=''
WHATIF=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --probe) MODE='probe'; shift ;;
    --port) PORT="$2"; MODE='port'; shift 2 ;;
    --find-free) PORT="$2"; MODE='free'; shift 2 ;;
    --what-if) WHATIF=1; shift ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "未知参数: $1" >&2; exit 2 ;;
  esac
done

# bash 内建 /dev/tcp：不依赖 lsof / ss / nc
port_listening() { (exec 3<>"/dev/tcp/127.0.0.1/$1") >/dev/null 2>&1; }

# 从 /proc/net/tcp{,6} 取 LISTEN(0A) 状态的 socket inode
listen_inodes() {
  local hex
  hex="$(printf '%04X' "$1")"
  awk -v hx="$hex" '$4 == "0A" && $2 ~ (":" hx "$") { print $10 }' \
    /proc/net/tcp /proc/net/tcp6 2>/dev/null || true
}

# inode -> PID：扫 /proc/*/fd 找 socket:[inode]
pid_for_inode() {
  local ino="$1" target="socket:[$1]" fd pid
  for fd in /proc/[0-9]*/fd/*; do
    [[ -r "$fd" ]] || continue
    [[ "$(readlink "$fd" 2>/dev/null || true)" == "$target" ]] || continue
    pid="${fd#/proc/}"; pid="${pid%%/*}"
    printf '%s\n' "$pid"
    return 0
  done
  return 1
}

http_title() {
  command -v curl >/dev/null 2>&1 || return 0
  curl -fsS --max-time 2 --noproxy '*' "http://127.0.0.1:$1/" 2>/dev/null \
    | grep -o '<title>[^<]*</title>' | head -1 | sed 's/<[^>]*>//g' || true
}

label_project() {
  local cmd="$1" title="$2"
  if [[ "$cmd" == *project4* || "$cmd" == *teamcollab* || "$title" == *TeamCollab* ]]; then
    echo '[TeamCollab]'
  elif [[ "$cmd" == *StockSignal* || "$cmd" == */ks/* || "$title" == *stock* ]]; then
    echo '[ks/StockSignal]'
  else
    echo '[其他]'
  fi
}

describe_port() {
  local p="$1" ino pid cmd title found=0
  title="$(http_title "$p")"
  printf '  %-6s 占用  (%s)\n' "$p" "${DESC[$p]:-未知用途}"
  while read -r ino; do
    [[ -n "$ino" ]] || continue
    if pid="$(pid_for_inode "$ino")"; then
      cmd="$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)"
      printf '         PID=%-6s %-18s %s\n' \
        "$pid" "$(cat "/proc/$pid/comm" 2>/dev/null || echo '?')" "$(label_project "$cmd" "$title")"
      printf '         cmd=%s\n' "${cmd:0:160}"
      found=1
    fi
  done < <(listen_inodes "$p")
  (( found )) || printf '         (有监听，但无法归属 PID：容器/权限限制或内核态监听)\n'
  [[ -n "$title" ]] && printf '         title="%s"\n' "$title"
  return 0
}

if [[ "$MODE" == 'free' ]]; then
  for (( p=PORT; p<PORT+200; p++ )); do
    if ! port_listening "$p"; then echo "$p"; exit 0; fi
  done
  echo "在 $PORT~$((PORT + 199)) 区间未找到空闲端口" >&2
  exit 1
fi

if [[ "$MODE" == 'probe' ]]; then
  echo "==== 常用演示端口占用排查 ($(uname -s)/$(uname -m)) ===="
  for p in "${PORTS[@]}"; do
    if port_listening "$p"; then describe_port "$p"
    else printf '  %-6s 空闲        (%s)\n' "$p" "${DESC[$p]}"; fi
  done
  echo '只读排查，不结束任何进程；释放端口请用 start-teamcollab.sh --stop'
  exit 0
fi

if port_listening "$PORT"; then
  describe_port "$PORT"
else
  echo "端口 $PORT 当前空闲"
fi
if (( WHATIF )); then
  echo '  [what-if] 本脚本始终只读，不会结束任何进程'
fi
