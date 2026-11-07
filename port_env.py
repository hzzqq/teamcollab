"""port_env —— 读取本机分配的端口（由 port-doctor skill 管理）。

`.port.env` 是**本机文件**（已 gitignore），由 `portctl alloc --write` / `portctl prelaunch` 写入：

    # 由 port-doctor 自动生成（端口冲突自动分配）
    PORT=5100

端口优先级（从高到低）：显式环境变量 > `.port.env` > 调用方给的默认值。
诚实红线：文件缺失或取值非法时**回退默认值**，绝不臆造端口、绝不阻断启动。
"""
from __future__ import annotations

import os
from pathlib import Path

ENV_FILE_NAME = ".port.env"


def repo_root() -> Path:
    """仓库根目录（本文件所在目录）。"""
    return Path(__file__).resolve().parent


def port_from_env_file(key: str = "PORT", default: int | None = None,
                       env_file: Path | None = None) -> int | None:
    """从 .port.env 读取指定键的端口值；取不到返回 default。"""
    path = Path(env_file) if env_file is not None else repo_root() / ENV_FILE_NAME
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError:
        return default
    for line in raw.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        if k.strip() != key:
            continue
        v = v.strip()
        if v.isdigit():
            return int(v)
    return default


def resolve_port(key: str = "PORT", default: int = 0, env_var: str | None = None) -> int:
    """三级优先级解析端口：环境变量 > .port.env > 默认值。"""
    if env_var:
        env_val = (os.environ.get(env_var) or "").strip()
        if env_val.isdigit():
            return int(env_val)
    val = port_from_env_file(key, None)
    if val is not None:
        return val
    return default


# ---------------------------------------------------------------------------
# 单一端口真相源（start_dev.py / scripts/start-teamcollab.ps1 / .sh 同口径）
#
#   优先级：显式参数 > 同名环境变量 > .port.env > 默认（后端 8000 / 前端 3000）
#
# 硬约束：前端 NEXT_PUBLIC_API_BASE 在 next build 时烤死为 http://localhost:8000，
# 所以**后端端口不可由 port-doctor 自由分配**。三个入口对「.port.env PORT≠8000」
# 做同一件事：拒绝静默启动，明确报错并给出修复路径。人显式覆盖端口则视为知情，放行。
# ---------------------------------------------------------------------------
FRONTEND_BAKED_BACKEND_PORT = 8000
DEFAULT_FRONTEND_PORT = 3000


def resolve_web_port(default: int = DEFAULT_FRONTEND_PORT,
                     env_var: str | None = "WEB_PORT") -> int:
    """前端端口：环境变量 WEB_PORT > .port.env WEB_PORT > 默认 3000。"""
    return resolve_port("WEB_PORT", default, env_var=env_var)


def backend_port_issue(port: int, *, explicit: bool = False) -> str | None:
    """若该后端端口会让前端静默断链，返回可读说明；无问题返回 None。

    explicit=True 表示端口来自调用方显式覆盖（命令行参数 / 环境变量），此时人已知情。
    """
    if explicit or port == FRONTEND_BAKED_BACKEND_PORT:
        return None
    return (
        f".port.env PORT={port}，但前端 NEXT_PUBLIC_API_BASE 在 build 时烤死为 "
        f"http://localhost:{FRONTEND_BAKED_BACKEND_PORT}；按 :{port} 起后端前端会静默连不上。\n"
        f"  ① 把 .port.env 的 PORT 改回 {FRONTEND_BAKED_BACKEND_PORT}"
        f"（推荐；port-doctor 不应给本项目后端分配其它端口）\n"
        f"  ② 显式指定端口并同步重编前端："
        f"NEXT_PUBLIC_API_BASE=http://localhost:{port} npm run build\n"
        f"  ③ 配 nginx 同源代理，前端统一走同源 /api"
    )
