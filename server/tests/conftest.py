"""pytest 共享夹具：TestClient + 注册辅助。

前置条件：PostgreSQL 已启动且 schema 已迁移（alembic upgrade head）。
若数据库不可达，整个测试集会跳过并在控制台说明（避免误报为代码失败）。
"""

import os
import uuid

# 必须在导入 app 前设置（get_settings 为 lru_cache）
os.environ.setdefault("RATE_LIMIT_AUTH_PER_MINUTE", "100000")
os.environ.setdefault("RATE_LIMIT_GENERAL_PER_MINUTE", "1000000")
os.environ.setdefault(
    "DATABASE_URL", "postgresql+psycopg://collab:collab@localhost:5432/collab"
)

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.db import engine
from app.main import app


def _db_reachable() -> bool:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


@pytest.fixture(scope="session")
def client() -> TestClient:
    if not _db_reachable():
        pytest.skip(
            "PostgreSQL 不可达（localhost:5432）。请先执行 docker compose up -d && "
            "alembic upgrade head 后再跑测试。"
        )
    # 测试可重复性：每个 session 开始时清空业务表（固定邮箱用例避免跨轮冲突）
    _TRUNCATE = (
        "TRUNCATE TABLE notifications, task_comments, tasks, board_columns, "
        "boards, team_members, teams, users CASCADE"
    )
    with engine.begin() as conn:
        conn.execute(text(_TRUNCATE))
    return TestClient(app)


def register_user(client: TestClient, *, email: str | None = None, display_name: str | None = None, password: str = "pass1234") -> dict:
    email = email or f"u{uuid.uuid4().hex[:10]}@example.com"
    display_name = display_name or f"用户{uuid.uuid4().hex[:6]}"
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "display_name": display_name},
    )
    assert resp.status_code == 201, f"注册失败: {resp.text}"
    data = resp.json()["data"]
    return {
        "email": email,
        "password": password,
        "display_name": display_name,
        "user": data["user"],
        "team": data["team"],
        "role": data["role"],
        "access_token": data["access_token"],
        "refresh_token": data["refresh_token"],
        "headers": {"Authorization": f"Bearer {data['access_token']}"},
    }


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def team_with_members(client: TestClient) -> dict:
    """owner + member + viewer 三个账号，同属 owner 的团队，含看板/列/任务。"""
    owner = register_user(client, display_name="Owner")
    member = register_user(client, display_name="Member")
    viewer = register_user(client, display_name="Viewer")
    team_id = owner["team"]["id"]

    resp = client.post(
        f"/api/v1/teams/{team_id}/members",
        json={"email": member["email"], "role": "member"},
        headers=owner["headers"],
    )
    assert resp.status_code == 201, resp.text
    resp = client.post(
        f"/api/v1/teams/{team_id}/members",
        json={"email": viewer["email"], "role": "viewer"},
        headers=owner["headers"],
    )
    assert resp.status_code == 201, resp.text

    resp = client.post(
        f"/api/v1/teams/{team_id}/boards",
        json={"name": "测试看板"},
        headers=owner["headers"],
    )
    assert resp.status_code == 201, resp.text
    board = resp.json()["data"]

    col_ids = []
    for name, pos in [("待办", 0), ("进行中", 1), ("完成", 2)]:
        resp = client.post(
            f"/api/v1/boards/{board['id']}/columns",
            json={"name": name, "position": pos},
            headers=owner["headers"],
        )
        assert resp.status_code == 201, resp.text
        col_ids.append(resp.json()["data"]["id"])

    resp = client.post(
        f"/api/v1/boards/{board['id']}/tasks",
        json={"title": "任务A", "column_id": col_ids[0], "assignee_id": member["user"]["id"]},
        headers=owner["headers"],
    )
    assert resp.status_code == 201, resp.text
    task_a = resp.json()["data"]

    return {
        "owner": owner,
        "member": member,
        "viewer": viewer,
        "team_id": team_id,
        "board": board,
        "columns": col_ids,
        "task": task_a,
    }
