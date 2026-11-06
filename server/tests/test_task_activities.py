"""任务活动流（/tasks/{id}/activities）回归。

重点覆盖：日志与业务写同事务、值可读、无变化不刷屏、跨租户不可读、级联清理。
"""

from tests.conftest import register_user


def _fixture(client):
    """owner + 看板 + 两列 + 一个任务。返回 (owner, board, [col1, col2], task)。"""
    owner = register_user(client, display_name="活动流负责人")
    r = client.post(
        f"/api/v1/teams/{owner['team']['id']}/boards",
        json={"name": "活动流看板"},
        headers=owner["headers"],
    )
    assert r.status_code == 201, r.text
    board = r.json()["data"]

    cols = []
    for name, pos in [("待办", 0), ("进行中", 1)]:
        r = client.post(
            f"/api/v1/boards/{board['id']}/columns",
            json={"name": name, "position": pos},
            headers=owner["headers"],
        )
        assert r.status_code == 201, r.text
        cols.append(r.json()["data"]["id"])

    r = client.post(
        f"/api/v1/boards/{board['id']}/tasks",
        json={"title": "写活动时间线", "column_id": cols[0]},
        headers=owner["headers"],
    )
    assert r.status_code == 201, r.text
    return owner, board, cols, r.json()["data"]


def _activities(client, headers, task_id, limit=None):
    params = {"limit": limit} if limit is not None else None
    r = client.get(f"/api/v1/tasks/{task_id}/activities", params=params, headers=headers)
    assert r.status_code == 200, r.text
    assert r.json()["code"] == 0
    return r.json()["data"]


def test_anonymous_401(client):
    _, _, _, task = _fixture(client)
    assert client.get(f"/api/v1/tasks/{task['id']}/activities").status_code == 401


def test_create_records_created_activity(client):
    owner, _, _, task = _fixture(client)
    data = _activities(client, owner["headers"], task["id"])
    assert data["total"] == 1
    row = data["items"][0]
    assert row["action"] == "created"
    assert row["actor_name"] == "活动流负责人"
    assert row["actor_id"] == owner["user"]["id"]
    assert row["new_value"] == "写活动时间线"
    assert row["task_id"] == task["id"]
    for key in ("id", "field", "old_value", "created_at"):
        assert key in row, f"missing {key}"


def test_patch_records_field_changes_with_readable_values(client):
    owner, _, _, task = _fixture(client)
    r = client.patch(
        f"/api/v1/tasks/{task['id']}",
        json={"status": "in_progress", "title": "写活动时间线 v2", "assignee_id": owner["user"]["id"]},
        headers=owner["headers"],
    )
    assert r.status_code == 200, r.text

    rows = _activities(client, owner["headers"], task["id"])["items"]
    changed = {row["field"]: row for row in rows if row["action"] == "field_changed"}
    assert set(changed) == {"status", "title", "assignee_id"}
    assert (changed["status"]["old_value"], changed["status"]["new_value"]) == ("待办", "进行中")
    assert (changed["title"]["old_value"], changed["title"]["new_value"]) == (
        "写活动时间线",
        "写活动时间线 v2",
    )
    assert changed["assignee_id"]["old_value"] == "空"
    assert changed["assignee_id"]["new_value"] == "活动流负责人"


def test_no_op_patch_does_not_spam(client):
    owner, _, _, task = _fixture(client)
    r = client.patch(
        f"/api/v1/tasks/{task['id']}",
        json={"status": "todo", "title": "写活动时间线"},
        headers=owner["headers"],
    )
    assert r.status_code == 200, r.text
    assert _activities(client, owner["headers"], task["id"])["total"] == 1


def test_move_records_cross_column_only(client):
    owner, board, cols, task = _fixture(client)
    url = f"/api/v1/boards/{board['id']}/columns/{cols[1]}/tasks/{task['id']}/position"

    # 同列排序不记日志（避免每次拖拽刷屏）
    same = client.patch(
        f"/api/v1/boards/{board['id']}/columns/{cols[0]}/tasks/{task['id']}/position",
        json={"target_column_id": cols[0], "position": 0},
        headers=owner["headers"],
    )
    assert same.status_code == 200, same.text
    assert _activities(client, owner["headers"], task["id"])["total"] == 1

    cross = client.patch(
        url,
        json={"target_column_id": cols[1], "position": 0},
        headers=owner["headers"],
    )
    assert cross.status_code == 200, cross.text
    rows = _activities(client, owner["headers"], task["id"])["items"]
    moved = [row for row in rows if row["action"] == "moved"]
    assert len(moved) == 1
    assert (moved[0]["old_value"], moved[0]["new_value"]) == ("待办", "进行中")


def test_comment_records_activity(client):
    owner, _, _, task = _fixture(client)
    r = client.post(
        f"/api/v1/tasks/{task['id']}/comments",
        json={"content": "@活动流负责人 帮忙验收"},
        headers=owner["headers"],
    )
    assert r.status_code == 201, r.text
    rows = _activities(client, owner["headers"], task["id"])["items"]
    assert [row["action"] for row in rows][0] == "comment_added"
    assert rows[0]["new_value"] == "@活动流负责人 帮忙验收"


def test_label_assignment_records_activity(client):
    """PUT /tasks/{id}/labels 走独立路由，必须同样留痕（real/mock 等价）。"""
    owner, _, _, task = _fixture(client)
    r = client.post(
        f"/api/v1/teams/{owner['team']['id']}/labels",
        json={"name": "需求", "color": "blue"},
        headers=owner["headers"],
    )
    assert r.status_code == 201, r.text
    label_id = r.json()["data"]["id"]

    r = client.put(
        f"/api/v1/tasks/{task['id']}/labels",
        json={"label_ids": [label_id]},
        headers=owner["headers"],
    )
    assert r.status_code == 200, r.text

    rows = _activities(client, owner["headers"], task["id"])["items"]
    changed = [row for row in rows if row["field"] == "labels"]
    assert len(changed) == 1
    assert (changed[0]["old_value"], changed[0]["new_value"]) == ("空", "需求")

    # 重复赋同一组标签不应再刷一条
    again = client.put(
        f"/api/v1/tasks/{task['id']}/labels",
        json={"label_ids": [label_id]},
        headers=owner["headers"],
    )
    assert again.status_code == 200, again.text
    assert _activities(client, owner["headers"], task["id"])["total"] == 2


def test_newest_first_and_limit_applied(client):
    owner, _, _, task = _fixture(client)
    for i in range(3):
        r = client.patch(
            f"/api/v1/tasks/{task['id']}",
            json={"title": f"标题 {i}"},
            headers=owner["headers"],
        )
        assert r.status_code == 200, r.text

    all_rows = _activities(client, owner["headers"], task["id"])
    assert all_rows["total"] == 4
    assert len(all_rows["items"]) == 4
    assert all_rows["items"][0]["action"] == "field_changed"
    assert all_rows["items"][-1]["action"] == "created"
    assert all_rows["items"][0]["created_at"] >= all_rows["items"][-1]["created_at"]

    limited = _activities(client, owner["headers"], task["id"], limit=2)
    assert len(limited["items"]) == 2
    assert limited["total"] == 4


def test_cross_tenant_cannot_read_activities(client):
    owner, _, _, task = _fixture(client)
    outsider = register_user(client)
    r = client.get(
        f"/api/v1/tasks/{task['id']}/activities", headers=outsider["headers"]
    )
    assert r.status_code == 404
    assert r.json()["code"] == 40401
    # 属主视角不受影响
    assert _activities(client, owner["headers"], task["id"])["total"] == 1


def test_viewer_can_read_activities(client):
    owner, _, _, task = _fixture(client)
    viewer = register_user(client)
    r = client.post(
        f"/api/v1/teams/{owner['team']['id']}/members",
        json={"email": viewer["email"], "role": "viewer"},
        headers=owner["headers"],
    )
    assert r.status_code == 201, r.text
    assert _activities(client, viewer["headers"], task["id"])["total"] == 1


def test_delete_task_cascades_activities(client):
    owner, _, _, task = _fixture(client)
    assert _activities(client, owner["headers"], task["id"])["total"] == 1
    r = client.delete(f"/api/v1/tasks/{task['id']}", headers=owner["headers"])
    assert r.status_code == 200, r.text
    gone = client.get(
        f"/api/v1/tasks/{task['id']}/activities", headers=owner["headers"]
    )
    assert gone.status_code == 404
    assert gone.json()["code"] == 40401
