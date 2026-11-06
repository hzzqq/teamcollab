"""跨看板移动 + 批量操作回归（租户隔离、原子性、活动留痕）。"""

from tests.conftest import register_user


def _board_with_column(client, headers, team_id, name):
    r = client.post(
        f"/api/v1/teams/{team_id}/boards", json={"name": name}, headers=headers
    )
    assert r.status_code == 201, r.text
    board = r.json()["data"]
    r = client.post(
        f"/api/v1/boards/{board['id']}/columns",
        json={"name": "待办", "position": 0},
        headers=headers,
    )
    assert r.status_code == 201, r.text
    return board["id"], r.json()["data"]["id"]


def _task(client, headers, board_id, column_id, title):
    r = client.post(
        f"/api/v1/boards/{board_id}/tasks",
        json={"title": title, "column_id": column_id},
        headers=headers,
    )
    assert r.status_code == 201, r.text
    return r.json()["data"]


def _tasks_on_board(client, headers, board_id):
    r = client.get(f"/api/v1/boards/{board_id}/tasks", headers=headers)
    assert r.status_code == 200, r.text
    return r.json()["data"]["items"]


def _fixture(client):
    owner = register_user(client, display_name="操作负责人")
    src_board, src_col = _board_with_column(client, owner["headers"], owner["team"]["id"], "源看板")
    dst_board, dst_col = _board_with_column(client, owner["headers"], owner["team"]["id"], "目标看板")
    task = _task(client, owner["headers"], src_board, src_col, "待迁移任务")
    return owner, src_board, src_col, dst_board, dst_col, task


def _move(client, headers, task_id, board_id, column_id, position=0):
    return client.post(
        f"/api/v1/tasks/{task_id}/move-to-board",
        json={"board_id": board_id, "column_id": column_id, "position": position},
        headers=headers,
    )


def _batch(client, headers, task_ids, action, value=None):
    body = {"task_ids": task_ids, "action": action}
    if value is not None:
        body["value"] = value
    return client.post("/api/v1/tasks/batch", json=body, headers=headers)


# ---------------- 跨看板移动 ----------------

def test_move_to_board_success(client):
    owner, src, _, dst, dst_col, task = _fixture(client)
    r = _move(client, owner["headers"], task["id"], dst, dst_col)
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["board_id"] == dst and data["column_id"] == dst_col
    assert _tasks_on_board(client, owner["headers"], src) == []
    assert [t["id"] for t in _tasks_on_board(client, owner["headers"], dst)] == [task["id"]]


def test_move_to_board_rejects_foreign_column(client):
    owner, src, src_col, dst, _, task = _fixture(client)
    r = _move(client, owner["headers"], task["id"], dst, src_col)
    assert r.status_code == 400, r.text
    assert r.json()["code"] == 40001


def test_move_to_board_cross_team_404(client):
    owner, _, _, _, _, task = _fixture(client)
    outsider = register_user(client)
    foreign_board, foreign_col = _board_with_column(
        client, outsider["headers"], outsider["team"]["id"], "外部看板"
    )
    r = _move(client, owner["headers"], task["id"], foreign_board, foreign_col)
    assert r.status_code == 404
    assert r.json()["code"] == 40401


def test_move_to_board_records_activity(client):
    owner, _, _, dst, dst_col, task = _fixture(client)
    assert _move(client, owner["headers"], task["id"], dst, dst_col).status_code == 200
    r = client.get(f"/api/v1/tasks/{task['id']}/activities", headers=owner["headers"])
    assert r.status_code == 200, r.text
    moved = [row for row in r.json()["data"]["items"] if row["action"] == "moved"]
    assert len(moved) == 1
    assert "源看板" in moved[0]["old_value"]
    assert "目标看板" in moved[0]["new_value"]


# ---------------- 批量操作 ----------------

def test_batch_set_status_and_priority(client):
    owner, board, col, _, _, task = _fixture(client)
    second = _task(client, owner["headers"], board, col, "第二个任务")
    ids = [task["id"], second["id"]]

    r = _batch(client, owner["headers"], ids, "set_status", "in_progress")
    assert r.status_code == 200, r.text
    assert r.json()["data"]["updated"] == 2
    assert all(t["status"] == "in_progress" for t in _tasks_on_board(client, owner["headers"], board))

    r = _batch(client, owner["headers"], ids, "set_priority", "urgent")
    assert r.status_code == 200, r.text
    assert all(t["priority"] == "urgent" for t in _tasks_on_board(client, owner["headers"], board))


def test_batch_set_assignee(client, team_with_members):
    t = team_with_members
    owner = t["owner"]
    task_id = t["task"]["id"]
    member_id = t["member"]["user"]["id"]

    r = _batch(client, owner["headers"], [task_id], "set_assignee", member_id)
    assert r.status_code == 200, r.text
    r = client.get(f"/api/v1/tasks/{task_id}", headers=owner["headers"])
    assert r.json()["data"]["assignee_id"] == member_id

    outsider = register_user(client)
    bad = _batch(client, owner["headers"], [task_id], "set_assignee", outsider["user"]["id"])
    assert bad.status_code == 400, bad.text


def test_batch_delete(client):
    owner, board, col, _, _, task = _fixture(client)
    r = _batch(client, owner["headers"], [task["id"]], "delete")
    assert r.status_code == 200, r.text
    assert r.json()["data"]["updated"] == 1
    assert _tasks_on_board(client, owner["headers"], board) == []


def test_batch_validation(client):
    owner, _, _, _, _, task = _fixture(client)
    assert _batch(client, owner["headers"], [], "delete").status_code in (400, 422)
    assert _batch(client, owner["headers"], [task["id"]] * 51, "delete").status_code in (400, 422)
    assert _batch(client, owner["headers"], [task["id"]], "set_status", "bad").status_code in (400, 422)
    assert _batch(client, owner["headers"], [task["id"]], "delete", "x").status_code in (400, 422)


def test_batch_rejects_whole_batch_on_cross_tenant(client):
    """混入一个跨租户 id：整批拒绝，本团队任务也不能被部分修改。"""
    owner, board, col, _, _, task = _fixture(client)
    outsider = register_user(client)
    foreign_board, foreign_col = _board_with_column(
        client, outsider["headers"], outsider["team"]["id"], "外部看板"
    )
    foreign = _task(client, outsider["headers"], foreign_board, foreign_col, "外部任务")

    r = _batch(client, owner["headers"], [task["id"], foreign["id"]], "set_status", "done")
    assert r.status_code == 404
    assert r.json()["code"] == 40401
    assert _tasks_on_board(client, owner["headers"], board)[0]["status"] == "todo"


def test_batch_anonymous_401_and_viewer_403(client, team_with_members):
    t = team_with_members
    task_id = t["task"]["id"]
    assert client.post(
        "/api/v1/tasks/batch", json={"task_ids": [task_id], "action": "delete"}
    ).status_code == 401
    r = _batch(client, t["viewer"]["headers"], [task_id], "set_status", "done")
    assert r.status_code == 403, r.text


def test_batch_records_activities_only_on_change(client):
    owner, _, _, _, _, task = _fixture(client)
    r = client.get(f"/api/v1/tasks/{task['id']}/activities", headers=owner["headers"])
    before = r.json()["data"]["total"]
    assert _batch(client, owner["headers"], [task["id"]], "set_status", "done").status_code == 200
    assert _batch(client, owner["headers"], [task["id"]], "set_status", "done").status_code == 200
    r = client.get(f"/api/v1/tasks/{task['id']}/activities", headers=owner["headers"])
    assert r.json()["data"]["total"] == before + 1
