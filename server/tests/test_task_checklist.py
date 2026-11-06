"""任务子任务清单（checklist JSONB）+ 开始日期契约回归。"""

from tests.conftest import register_user


def _board_with_column(client, owner):
    r = client.post(
        f"/api/v1/teams/{owner['team']['id']}/boards",
        json={"name": "清单看板"},
        headers=owner["headers"],
    )
    assert r.status_code == 201, r.text
    board = r.json()["data"]
    r = client.post(
        f"/api/v1/boards/{board['id']}/columns",
        json={"name": "待办", "position": 0},
        headers=owner["headers"],
    )
    assert r.status_code == 201, r.text
    return board, r.json()["data"]["id"]


def _create(client, owner, board_id, column_id, **extra):
    body = {"title": "带清单的任务", "column_id": column_id, **extra}
    return client.post(
        f"/api/v1/boards/{board_id}/tasks", json=body, headers=owner["headers"]
    )


def test_default_checklist_is_empty(client):
    owner = register_user(client)
    board, col = _board_with_column(client, owner)
    r = _create(client, owner, board["id"], col)
    assert r.status_code == 201, r.text
    assert r.json()["data"]["checklist"] == []


def test_create_and_patch_checklist(client):
    owner = register_user(client)
    board, col = _board_with_column(client, owner)
    items = [
        {"id": "c1", "text": "  写单测  ", "done": False},
        {"id": "c2", "text": "跑回归", "done": True},
    ]
    r = _create(client, owner, board["id"], col, checklist=items)
    assert r.status_code == 201, r.text
    task = r.json()["data"]
    assert task["checklist"] == [
        {"id": "c1", "text": "写单测", "done": False},
        {"id": "c2", "text": "跑回归", "done": True},
    ]

    # 详情接口也要带清单（Drawer 读的是 /tasks/{id}）
    detail = client.get(f"/api/v1/tasks/{task['id']}", headers=owner["headers"])
    assert detail.status_code == 200
    assert len(detail.json()["data"]["checklist"]) == 2

    patch = client.patch(
        f"/api/v1/tasks/{task['id']}",
        json={"checklist": [{"id": "c1", "text": "写单测", "done": True}]},
        headers=owner["headers"],
    )
    assert patch.status_code == 200, patch.text
    assert patch.json()["data"]["checklist"] == [
        {"id": "c1", "text": "写单测", "done": True}
    ]

    cleared = client.patch(
        f"/api/v1/tasks/{task['id']}",
        json={"checklist": []},
        headers=owner["headers"],
    )
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["data"]["checklist"] == []


def test_checklist_validation(client):
    owner = register_user(client)
    board, col = _board_with_column(client, owner)

    blank = _create(
        client, owner, board["id"], col,
        checklist=[{"id": "c1", "text": "   "}],
    )
    assert blank.status_code in (400, 422), blank.text

    duplicate = _create(
        client, owner, board["id"], col,
        checklist=[{"id": "x", "text": "a"}, {"id": "x", "text": "b"}],
    )
    assert duplicate.status_code in (400, 422), duplicate.text

    too_many = _create(
        client, owner, board["id"], col,
        checklist=[{"id": f"c{i}", "text": f"项{i}"} for i in range(51)],
    )
    assert too_many.status_code in (400, 422), too_many.text


def test_create_with_start_date_and_checklist(client):
    """复制任务会一次性带全套字段，验证 create 契约完整。"""
    owner = register_user(client)
    board, col = _board_with_column(client, owner)
    r = _create(
        client, owner, board["id"], col,
        title="原任务 (副本)",
        description="背景说明",
        start_date="2026-11-01",
        due_date="2026-11-10",
        priority="high",
        status="in_progress",
        checklist=[{"id": "c1", "text": "子任务", "done": False}],
    )
    assert r.status_code == 201, r.text
    data = r.json()["data"]
    assert data["start_date"] == "2026-11-01"
    assert data["due_date"] == "2026-11-10"
    assert data["priority"] == "high"
    assert data["status"] == "in_progress"
    assert len(data["checklist"]) == 1

    bad = _create(
        client, owner, board["id"], col,
        start_date="2026-11-20", due_date="2026-11-10",
    )
    assert bad.status_code in (400, 422), bad.text


def test_cross_tenant_cannot_patch_checklist(client):
    owner = register_user(client)
    outsider = register_user(client)
    board, col = _board_with_column(client, owner)
    r = _create(client, owner, board["id"], col)
    task_id = r.json()["data"]["id"]

    patch = client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"checklist": [{"id": "c1", "text": "越权"}]},
        headers=outsider["headers"],
    )
    assert patch.status_code == 404
    assert patch.json()["code"] == 40401
