"""port_env 单一端口真相源回归（纯函数，不依赖 DB / PG / 网络）。

覆盖：.port.env 解析、三级优先级、WEB_PORT 统一读取、后端端口冲突判定。
三个启动入口（start_dev.py / start-teamcollab.ps1 / .sh）都按本文件约定的口径实现。
"""
from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))  # noqa: E402

import port_env  # noqa: E402


def _write(tmp_path: Path, text: str) -> Path:
    p = tmp_path / ".port.env"
    p.write_text(text, encoding="utf-8")
    return p


def test_port_from_env_file_basic(tmp_path: Path) -> None:
    p = _write(tmp_path, "# 由 port-doctor 生成\nPORT=5105\nWEB_PORT=5115\n")
    assert port_env.port_from_env_file("PORT", env_file=p) == 5105
    assert port_env.port_from_env_file("WEB_PORT", env_file=p) == 5115


def test_port_from_env_file_ignores_comment_and_invalid(tmp_path: Path) -> None:
    p = _write(tmp_path, "# PORT=9999\nPORT = abc\nWEB_PORT = 3000\n")
    assert port_env.port_from_env_file("PORT", env_file=p) is None
    assert port_env.port_from_env_file("WEB_PORT", env_file=p) == 3000


def test_missing_or_invalid_file_falls_back_to_default(tmp_path: Path) -> None:
    assert port_env.port_from_env_file("PORT", 8000, env_file=tmp_path / "nope") == 8000
    p = _write(tmp_path, "PORT=\nWEB_PORT=-1\n")
    assert port_env.port_from_env_file("PORT", 8000, env_file=p) == 8000
    assert port_env.port_from_env_file("WEB_PORT", 3000, env_file=p) == 3000


def test_resolve_port_priority_env_var_wins(monkeypatch, tmp_path: Path) -> None:
    _write(tmp_path, "PORT=5105\n")
    monkeypatch.setattr(port_env, "repo_root", lambda: tmp_path)
    monkeypatch.delenv("BACKEND_PORT", raising=False)
    assert port_env.resolve_port("PORT", 8000) == 5105
    monkeypatch.setenv("BACKEND_PORT", "8200")
    assert port_env.resolve_port("PORT", 8000, env_var="BACKEND_PORT") == 8200
    monkeypatch.setenv("BACKEND_PORT", "not-a-number")
    assert port_env.resolve_port("PORT", 8000, env_var="BACKEND_PORT") == 5105


def test_resolve_web_port_reads_web_port_key(monkeypatch, tmp_path: Path) -> None:
    _write(tmp_path, "PORT=8000\nWEB_PORT=5115\n")
    monkeypatch.setattr(port_env, "repo_root", lambda: tmp_path)
    monkeypatch.delenv("WEB_PORT", raising=False)
    assert port_env.resolve_web_port() == 5115
    monkeypatch.setenv("WEB_PORT", "3900")
    assert port_env.resolve_web_port() == 3900


def test_defaults_when_no_port_env_file(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(port_env, "repo_root", lambda: tmp_path)
    monkeypatch.delenv("BACKEND_PORT", raising=False)
    monkeypatch.delenv("WEB_PORT", raising=False)
    assert port_env.resolve_port("PORT", 8000) == 8000
    assert port_env.resolve_web_port() == 3000


def test_backend_port_issue_blocks_non_baked_port() -> None:
    assert port_env.backend_port_issue(8000) is None
    issue = port_env.backend_port_issue(5105)
    assert issue is not None
    assert "5105" in issue and "8000" in issue
    assert "npm run build" in issue and "nginx" in issue


def test_backend_port_issue_allows_explicit_override() -> None:
    assert port_env.backend_port_issue(5105, explicit=True) is None
    assert port_env.backend_port_issue(8000, explicit=True) is None


def test_baked_port_constant_is_locked() -> None:
    # 前端 NEXT_PUBLIC_API_BASE 烤死 8000；改这里必须同步重编前端 + 改三个启动入口
    assert port_env.FRONTEND_BAKED_BACKEND_PORT == 8000
    assert port_env.DEFAULT_FRONTEND_PORT == 3000


def test_start_dev_refuses_conflicting_port(monkeypatch, capsys) -> None:
    """start_dev.py 不再静默采用 .port.env 分来的 5105（会必然断链）。"""
    import start_dev  # noqa: PLC0415  # 延迟导入：需先插好仓库根 sys.path

    monkeypatch.setattr(start_dev, "resolve_port", lambda *a, **k: 5105)
    monkeypatch.delenv("BACKEND_PORT", raising=False)
    called = []
    monkeypatch.setattr(start_dev, "run", lambda *a, **k: called.append(a))
    assert start_dev.start_backend() == 4
    assert called == []  # 必须在起 uvicorn 之前拦下
    assert "端口配置冲突" in capsys.readouterr().out


def test_start_dev_allows_explicit_port(monkeypatch) -> None:
    """显式 BACKEND_PORT 环境变量视为人已知情，放行。"""
    import start_dev  # noqa: PLC0415

    monkeypatch.setattr(start_dev, "resolve_port", lambda *a, **k: 5105)
    monkeypatch.setenv("BACKEND_PORT", "5105")
    called = []
    monkeypatch.setattr(
        start_dev, "run",
        lambda *a, **k: called.append(a) or SimpleNamespace(returncode=0),
    )
    assert start_dev.start_backend() == 0
    assert len(called) == 1 and "5105" in called[0][0]
