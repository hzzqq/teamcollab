"""子任务 / 多层级（方案 A parent_id 树状）回归。

覆盖：子任务继承父 board/column、列表查询、设上级的环检测 / 自引用 / 跨租户、
删除父任务后子任务 SET NULL 变顶层、看板详情只返顶层、viewer 可读 / member 可写。
"""

import uuid

from tests.conftest import register_user


def _create_board_with_task(client, headers, team_id):
    r = client.post(f"/api/v1/teams/{team_id}/boards", json={"name": "层级看板"}, headers=headers)
    assert r.status_code == 201, r.text
    board = r.json()["data"]
    r = client.post(
        f"/api/v1/boards/{board['id']}/columns",
        json={"name": "列一", "position": 0},
        headers=headers,
    )
    assert r.status_code == 201, r.text
    col = r.json()["data"]
    r = client.post(
        f"/api/v1/boards/{board['id']}/tasks",
        json={"title": "父任务", "column_id": col["id"]},
        headers=headers,
    )
    assert r.status_code == 201, r.text
    task = r.json()["data"]
    return board, col, task


def _subtask(client, headers, parent_id, title="子任务"):
    r = client.post(
        f"/api/v1/tasks/{parent_id}/subtasks",
        json={"title": title, "priority": "high"},
        headers=headers,
    )
    assert r.status_code == 201, r.text
    return r.json()["data"]


def test_create_subtask_inherits_parent(client):
    owner = register_user(client, display_name="层级Owner")
    board, col, parent = _create_board_with_task(client, owner["headers"], owner["team"]["id"])

    child = _subtask(client, owner["headers"], parent["id"], "子任务一")
    assert child["parent_id"] == parent["id"]
    assert child["board_id"] == board["id"]
    assert child["column_id"] == col["id"]
    assert child["title"] == "子任务一"


def test_list_subtasks(client):
    owner = register_user(client, display_name="层级Owner2")
    _, _, parent = _create_board_with_task(client, owner["headers"], owner["team"]["id"])
    _subtask(client, owner["headers"], parent["id"], "子一")
    _subtask(client, owner["headers"], parent["id"], "子二")

    r = client.get(
        f"/api/v1/tasks/{parent['id']}/subtasks", headers=owner["headers"]
    )
    assert r.status_code == 200, r.text
    items = r.json()["data"]
    assert len(items) == 2
    assert all(t["parent_id"] == parent["id"] for t in items)


def test_set_parent_self_rejected(client):
    owner = register_user(client, display_name="层级Owner3")
    _, _, parent = _create_board_with_task(client, owner["headers"], owner["team"]["id"])
    r = client.patch(
        f"/api/v1/tasks/{parent['id']}",
        json={"parent_id": str(parent["id"])},
        headers=owner["headers"],
    )
    assert r.status_code == 400, r.text


def test_set_parent_cycle_rejected(client):
    owner = register_user(client, display_name="层级Owner4")
    _, _, parent = _create_board_with_task(client, owner["headers"], owner["team"]["id"])
    child = _subtask(client, owner["headers"], parent["id"], "子任务")
    # 把父任务的上级设成它自己的子任务 -> 成环，应被拒绝
    r = client.patch(
        f"/api/v1/tasks/{parent['id']}",
        json={"parent_id": str(child["id"])},
        headers=owner["headers"],
    )
    assert r.status_code == 400, r.text
    # 父任务的 parent_id 不应被改
    r = client.get(f"/api/v1/tasks/{parent['id']}", headers=owner["headers"])
    assert r.json()["data"]["parent_id"] is None


def test_set_parent_nonexistent_404(client):
    owner = register_user(client, display_name="层级Owner5")
    _, _, parent = _create_board_with_task(client, owner["headers"], owner["team"]["id"])
    r = client.patch(
        f"/api/v1/tasks/{parent['id']}",
        json={"parent_id": str(uuid.uuid4())},
        headers=owner["headers"],
    )
    assert r.status_code == 404, r.text


def test_set_parent_cross_team_404(client):
    owner = register_user(client, display_name="层级Owner6")
    _, _, parent = _create_board_with_task(client, owner["headers"], owner["team"]["id"])

    outsider = register_user(client, display_name="层级Outsider")
    _, _, outside_task = _create_board_with_task(
        client, outsider["headers"], outsider["team"]["id"]
    )
    r = client.patch(
        f"/api/v1/tasks/{parent['id']}",
        json={"parent_id": str(outside_task["id"])},
        headers=owner["headers"],
    )
    assert r.status_code == 404, r.text


def test_delete_parent_sets_child_top_level(client):
    owner = register_user(client, display_name="层级Owner7")
    board, _, parent = _create_board_with_task(client, owner["headers"], owner["team"]["id"])
    child = _subtask(client, owner["headers"], parent["id"], "子任务")

    r = client.delete(f"/api/v1/tasks/{parent['id']}", headers=owner["headers"])
    assert r.status_code == 200, r.text

    # 子任务未被误删，且 parent_id 已置空变为顶层
    r = client.get(f"/api/v1/tasks/{child['id']}", headers=owner["headers"])
    assert r.status_code == 200, r.text
    assert r.json()["data"]["parent_id"] is None

    # 看板详情：子任务作为顶层出现在列任务中，父任务已删除
    r = client.get(f"/api/v1/boards/{board['id']}", headers=owner["headers"])
    assert r.status_code == 200, r.text
    flat = [t["id"] for col in r.json()["data"]["columns"] for t in col["tasks"]]
    assert child["id"] in flat
    assert parent["id"] not in flat


def test_board_detail_excludes_subtasks(client):
    owner = register_user(client, display_name="层级Owner8")
    board, _, parent = _create_board_with_task(client, owner["headers"], owner["team"]["id"])
    _subtask(client, owner["headers"], parent["id"], "子任务")

    r = client.get(f"/api/v1/boards/{board['id']}", headers=owner["headers"])
    assert r.status_code == 200, r.text
    flat = [t["id"] for col in r.json()["data"]["columns"] for t in col["tasks"]]
    # 顶层只含父任务，子任务不污染列卡片
    assert parent["id"] in flat
    assert len([t for t in flat if t == parent["id"]]) == 1
    parent_row = next(t for t in flat_tasks(r.json()["data"]) if t["id"] == parent["id"])
    assert parent_row["subtask_count"] == 1


def flat_tasks(detail):
    return [t for col in detail["columns"] for t in col["tasks"]]


def test_viewer_can_read_subtasks(client):
    owner = register_user(client, display_name="层级Owner9")
    viewer = register_user(client, display_name="层级Viewer")
    team_id = owner["team"]["id"]
    client.post(
        f"/api/v1/teams/{team_id}/members",
        json={"email": viewer["email"], "role": "viewer"},
        headers=owner["headers"],
    )
    _, _, parent = _create_board_with_task(client, owner["headers"], team_id)
    _subtask(client, owner["headers"], parent["id"], "子任务")

    r = client.get(
        f"/api/v1/tasks/{parent['id']}/subtasks", headers=viewer["headers"]
    )
    assert r.status_code == 200, r.text


def test_member_can_create_subtask(client):
    owner = register_user(client, display_name="层级Owner10")
    member = register_user(client, display_name="层级Member")
    team_id = owner["team"]["id"]
    client.post(
        f"/api/v1/teams/{team_id}/members",
        json={"email": member["email"], "role": "member"},
        headers=owner["headers"],
    )
    _, _, parent = _create_board_with_task(client, owner["headers"], team_id)

    r = client.post(
        f"/api/v1/tasks/{parent['id']}/subtasks",
        json={"title": "成员创建的子任务"},
        headers=member["headers"],
    )
    assert r.status_code == 201, r.text
    assert r.json()["data"]["parent_id"] == parent["id"]
