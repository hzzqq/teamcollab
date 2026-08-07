#!/usr/bin/env python3
"""TeamCollab 一键本地启动（开发模式）。

负责把「能跑起来」变成一条命令：
  1. 若本地 PostgreSQL 未启动，则用 .pgtmp 自带的 PG 实例拉起（无 Docker 也能跑）；
  2. 执行 alembic 迁移到 head；
  3. 启动 FastAPI 后端（默认前台常驻；--db-only 只准备库与迁移后退出）。

用法：
  python start_dev.py              # 准备 DB + 迁移 + 启动后端（前台）
  python start_dev.py --db-only    # 仅确保 PG 启动 + 迁移，不启后端（CI/验证用）
  python start_dev.py --no-db      # 假设 PG 已在 5432，只跑迁移 + 后端

依赖：server/.venv（已建好）。PG 端口固定 5432，与 config.py 默认值一致。
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.abspath(__file__))
SERVER = os.path.join(ROOT, "server")
VENV_PY = os.path.join(SERVER, ".venv", "Scripts", "python.exe")
PG_DIR = os.path.join(ROOT, ".pgtmp")
PG_BIN = os.path.join(PG_DIR, "pgsql", "bin")
PG_DATA = os.path.join(PG_DIR, "data")
PG_LOG = os.path.join(PG_DIR, "pg.log")
PG_PORT = "5432"


def log(msg: str) -> None:
    print(f"[start_dev] {msg}", flush=True)


def run(cmd, **kw):
    log("RUN " + " ".join(cmd))
    return subprocess.run(cmd, **kw)


def venv_python() -> str:
    return VENV_PY if os.path.isfile(VENV_PY) else sys.executable


def pg_is_ready() -> bool:
    exe = os.path.join(PG_BIN, "pg_isready.exe")
    if not os.path.isfile(exe):
        return False
    r = run([exe, "-h", "localhost", "-p", PG_PORT], capture_output=True, text=True)
    return r.returncode == 0


def ensure_postgres() -> bool:
    """确保本地 PG 启动；无可执行文件或已运行时安全跳过。返回是否可用。"""
    if pg_is_ready():
        log("PostgreSQL 已在 5432 监听，跳过启动")
        return True
    pg_ctl = os.path.join(PG_BIN, "pg_ctl.exe")
    if not os.path.isfile(pg_ctl):
        log("未找到 .pgtmp/pgsql 自带 PG，且 5432 无监听——请先 docker compose up -d 或准备 PG")
        return False
    if not os.path.isdir(PG_DATA):
        log(f"数据目录不存在：{PG_DATA}，请先运行 .pgtmp/setup_pg.py 初始化")
        return False
    log("启动本地 PostgreSQL ...")
    run([pg_ctl, "-D", PG_DATA, "-l", PG_LOG, "-o", f'-p {PG_PORT} -k ""', "start"], timeout=60)
    for _ in range(30):
        if pg_is_ready():
            log("PostgreSQL 就绪")
            return True
        time.sleep(1)
    log("PostgreSQL 启动超时，详见 " + PG_LOG)
    return False


def migrate() -> bool:
    log("执行 alembic 迁移到 head ...")
    r = run([venv_python(), "-m", "alembic", "upgrade", "head"], cwd=SERVER, timeout=120)
    return r.returncode == 0


def start_backend() -> int:
    log("启动 FastAPI 后端（前台，Ctrl+C 退出）...")
    return run([venv_python(), "-m", "uvicorn", "app.main:app", "--port", "8000", "--reload"], cwd=SERVER).returncode


def main() -> int:
    ap = argparse.ArgumentParser(description="TeamCollab 本地一键启动")
    ap.add_argument("--db-only", action="store_true", help="仅准备 PG + 迁移，不启动后端")
    ap.add_argument("--no-db", action="store_true", help="假设 PG 已在 5432，跳过启库")
    args = ap.parse_args()

    if not args.no_db:
        if not ensure_postgres():
            return 2
    if not migrate():
        return 3
    if args.db_only:
        log("DB 与迁移就绪（--db-only），退出")
        return 0
    return start_backend()


if __name__ == "__main__":
    sys.exit(main())
