"""输入校验：纯空白的名称/标题/评论此前会绕过 Pydantic 的 min_length=1，
命中 DB 侧 TRIM(name) > 0 约束而返回 500；修复后应在请求校验层返回 422。"""

import uuid

from fastapi.testclient import TestClient


def _register(client: TestClient) -> dict:
    email = f"v{uuid.uuid4().hex[:10]}@example.com"
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "pass1234", "display_name": "用户A"},
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()["data"]
    data["email"] = email
    data["password"] = "pass1234"
    data["headers"] = {"Authorization": f"Bearer {data['access_token']}"}
    return data


def test_create_board_blank_name_is_422(client: TestClient):
    u = _register(client)
    team_id = u["team"]["id"]
    resp = client.post(
        f"/api/v1/teams/{team_id}/boards", json={"name": "   "}, headers=u["headers"]
    )
    assert resp.status_code == 400


def test_create_column_blank_name_is_422(client: TestClient):
    u = _register(client)
    team_id = u["team"]["id"]
    board = client.post(
        f"/api/v1/teams/{team_id}/boards", json={"name": "看板"}, headers=u["headers"]
    ).json()["data"]
    resp = client.post(
        f"/api/v1/boards/{board['id']}/columns", json={"name": "\t"}, headers=u["headers"]
    )
    assert resp.status_code == 400


def test_create_task_blank_title_is_422(client: TestClient):
    u = _register(client)
    team_id = u["team"]["id"]
    board = client.post(
        f"/api/v1/teams/{team_id}/boards", json={"name": "看板"}, headers=u["headers"]
    ).json()["data"]
    col = client.post(
        f"/api/v1/boards/{board['id']}/columns", json={"name": "列"}, headers=u["headers"]
    ).json()["data"]
    resp = client.post(
        f"/api/v1/boards/{board['id']}/tasks",
        json={"title": "   ", "column_id": col["id"]},
        headers=u["headers"],
    )
    assert resp.status_code == 400


def test_patch_board_blank_name_is_422(client: TestClient):
    u = _register(client)
    team_id = u["team"]["id"]
    board = client.post(
        f"/api/v1/teams/{team_id}/boards", json={"name": "看板"}, headers=u["headers"]
    ).json()["data"]
    resp = client.patch(
        f"/api/v1/boards/{board['id']}", json={"name": "  "}, headers=u["headers"]
    )
    assert resp.status_code == 400


def test_patch_column_blank_name_is_422(client: TestClient):
    u = _register(client)
    team_id = u["team"]["id"]
    board = client.post(
        f"/api/v1/teams/{team_id}/boards", json={"name": "看板"}, headers=u["headers"]
    ).json()["data"]
    col = client.post(
        f"/api/v1/boards/{board['id']}/columns", json={"name": "列"}, headers=u["headers"]
    ).json()["data"]
    resp = client.patch(
        f"/api/v1/columns/{col['id']}", json={"name": "  "}, headers=u["headers"]
    )
    assert resp.status_code == 400


def test_create_comment_blank_content_is_422(client: TestClient):
    u = _register(client)
    team_id = u["team"]["id"]
    board = client.post(
        f"/api/v1/teams/{team_id}/boards", json={"name": "看板"}, headers=u["headers"]
    ).json()["data"]
    col = client.post(
        f"/api/v1/boards/{board['id']}/columns", json={"name": "列"}, headers=u["headers"]
    ).json()["data"]
    task = client.post(
        f"/api/v1/boards/{board['id']}/tasks",
        json={"title": "任务", "column_id": col["id"]},
        headers=u["headers"],
    ).json()["data"]
    resp = client.post(
        f"/api/v1/tasks/{task['id']}/comments",
        json={"content": "   "},
        headers=u["headers"],
    )
    assert resp.status_code == 400


def test_register_blank_display_name_is_422(client: TestClient):
    resp = client.post(
        "/api/v1/auth/register",
        json={
            "email": f"v{uuid.uuid4().hex[:10]}@example.com",
            "password": "pass1234",
            "display_name": "   ",
        },
    )
    assert resp.status_code == 400


def test_normal_names_still_work(client: TestClient):
    u = _register(client)
    team_id = u["team"]["id"]
    board = client.post(
        f"/api/v1/teams/{team_id}/boards",
        json={"name": "  正常名称  "},
        headers=u["headers"],
    )
    assert board.status_code == 201
    # 首尾空白应被 trim，存储为 "正常名称"
    assert board.json()["data"]["name"] == "正常名称"
