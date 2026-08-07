"""到期提醒（task_due_soon）集成测试：验证 spec AC-08 的真实行为。

覆盖三条真实链路（均面向真实 PostgreSQL）：
1. 创建「当天到期且指派给自己」的任务时，立即生成未读 task_due_soon 通知；
2. 登录时的惰性检查对同一未读通知幂等（不重复生成）；
3. 通知被标记已读后，再次登录会重新生成一条（确保用户不会漏看临近到期）。
"""

from datetime import date

from tests.conftest import register_user


def _make_board_column(client, headers, team_id):
    r = client.post(f"/api/v1/teams/{team_id}/boards", json={"name": "测试看板"}, headers=headers)
    assert r.status_code == 201, r.text
    board = r.json()["data"]
    r = client.post(
        f"/api/v1/boards/{board['id']}/columns",
        json={"name": "待办", "position": 0},
        headers=headers,
    )
    assert r.status_code == 201, r.text
    return board, r.json()["data"]


def _create_due_task(client, owner_headers, board, column, assignee_id):
    r = client.post(
        f"/api/v1/boards/{board['id']}/tasks",
        json={
            "title": "临近到期任务",
            "column_id": column["id"],
            "assignee_id": str(assignee_id),
            "due_date": date.today().isoformat(),
        },
        headers=owner_headers,
    )
    assert r.status_code == 201, r.text
    return r.json()["data"]


def _unread_due_soon(client, headers):
    r = client.get("/api/v1/notifications?unread=true", headers=headers)
    assert r.status_code == 200, r.text
    return [n for n in r.json()["data"]["items"] if n["type"] == "task_due_soon"]


def test_due_soon_creation_trigger_and_login_idempotency(client):
    owner = register_user(client, display_name="Owner")
    member = register_user(client, display_name="Member")
    team_id = owner["team"]["id"]

    r = client.post(
        f"/api/v1/teams/{team_id}/members",
        json={"email": member["email"], "role": "member"},
        headers=owner["headers"],
    )
    assert r.status_code == 201, r.text

    board, column = _make_board_column(client, owner["headers"], team_id)
    task = _create_due_task(client, owner["headers"], board, column, member["user"]["id"])

    # 1) 任务创建即触发到期提醒（指派发生在创建路径内）
    due_soon = _unread_due_soon(client, member["headers"])
    assert len(due_soon) == 1, due_soon
    assert due_soon[0]["payload"]["task_id"] == task["id"]

    # 2) 登录时惰性检查：未读通知幂等，二次登录不重复生成
    client.post(
        "/api/v1/auth/login",
        data={"username": member["email"], "password": member["password"]},
    )
    due_soon = _unread_due_soon(client, member["headers"])
    assert len(due_soon) == 1, "登录不应为同一条未读提醒重复生成通知"

    # 3) 标记为已读后再次登录，应重新生成一条，确保不会漏看
    r = client.post("/api/v1/notifications/read-all", headers=member["headers"])
    assert r.status_code == 200, r.text
    assert _unread_due_soon(client, member["headers"]) == []

    client.post(
        "/api/v1/auth/login",
        data={"username": member["email"], "password": member["password"]},
    )
    due_soon = _unread_due_soon(client, member["headers"])
    assert len(due_soon) == 1, "已读后登录应重新生成到期提醒"
    assert due_soon[0]["payload"]["task_id"] == task["id"]


def test_due_soon_not_fired_for_far_future(client):
    """非窗口内的任务不应生成到期提醒（避免噪声）。"""
    owner = register_user(client, display_name="Owner2")
    member = register_user(client, display_name="Member2")
    team_id = owner["team"]["id"]

    r = client.post(
        f"/api/v1/teams/{team_id}/members",
        json={"email": member["email"], "role": "member"},
        headers=owner["headers"],
    )
    assert r.status_code == 201, r.text

    from datetime import timedelta

    board, column = _make_board_column(client, owner["headers"], team_id)
    # 60 天后的任务明显在 24h 窗口之外，创建与登录都不应触发到期提醒
    r = client.post(
        f"/api/v1/boards/{board['id']}/tasks",
        json={
            "title": "远期任务",
            "column_id": column["id"],
            "assignee_id": str(member["user"]["id"]),
            "due_date": (date.today() + timedelta(days=60)).isoformat(),
        },
        headers=owner["headers"],
    )
    assert r.status_code == 201, r.text

    # 登录不该产生到期提醒
    client.post(
        "/api/v1/auth/login",
        data={"username": member["email"], "password": member["password"]},
    )
    assert _unread_due_soon(client, member["headers"]) == []
