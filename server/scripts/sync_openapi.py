"""导出 FastAPI 运行时 OpenAPI 契约快照，并供 CI 做漂移检查。

用法（工作目录任意）：
    python scripts/sync_openapi.py            # 重新生成 docs/openapi-runtime.json
    python scripts/sync_openapi.py --check   # 只校验，不一致或缺失则退出 1

为什么不继续手写 YAML：docs/phase2/openapi-v2.yaml 是 Phase 2 时期的
19 路径 / 27 方法历史快照，功能迭代后必然漂移（当前运行时 44 方法）。
由 app.openapi() 自动导出可保证契约与代码同源；CI 的 --check 会在
新增/删除端点却忘记同步快照时立刻拦下，避免「文档说有、接口没有」。
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parents[1]
ROOT_DIR = SERVER_DIR.parent
SNAPSHOT = ROOT_DIR / "docs" / "openapi-runtime.json"
HTTP_METHODS = ("get", "post", "put", "patch", "delete", "head", "options", "trace")


def build_spec() -> dict:
    # 脚本从 scripts/ 执行时 sys.path[0] 不是 server/，显式补上以便 import app
    if str(SERVER_DIR) not in sys.path:
        sys.path.insert(0, str(SERVER_DIR))
    from app.main import app

    return app.openapi()


def serialize(spec: dict) -> str:
    return json.dumps(spec, ensure_ascii=False, indent=2) + "\n"


def count_methods(spec: dict) -> int:
    return sum(
        1
        for path_item in spec.get("paths", {}).values()
        for method in path_item
        if method in HTTP_METHODS
    )


def main() -> int:
    checking = "--check" in sys.argv[1:]
    spec = build_spec()
    text = serialize(spec)
    methods = count_methods(spec)
    paths = len(spec.get("paths", {}))

    if checking:
        current = SNAPSHOT.read_text(encoding="utf-8") if SNAPSHOT.exists() else ""
        if current != text:
            print(
                "OpenAPI snapshot drifted: run `python scripts/sync_openapi.py` "
                "and commit docs/openapi-runtime.json",
                file=sys.stderr,
            )
            return 1
        print(f"OpenAPI snapshot up to date: {paths} paths / {methods} methods")
        return 0

    SNAPSHOT.parent.mkdir(parents=True, exist_ok=True)
    # 显式 LF：Windows 默认 CRLF 会让同一份契约在不同平台产生字节差异
    with SNAPSHOT.open("w", encoding="utf-8", newline="\n") as fp:
        fp.write(text)
    print(f"Wrote {SNAPSHOT.relative_to(ROOT_DIR)}: {paths} paths / {methods} methods")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
