"""任务 CRUD / 列表搜索 / 拖拽落位 / 我的任务聚合。"""

from tests.conftest import register_user


def test_create_and_list_tasks(client, team_with_members):
    t = team_with_members
    board_id = t["board"]["id"]
    # 注意：col0 已被 fixture 预置任务A，用 col1（空列）验证 position 从 0 递增
    col1 = t["columns"][1]
    headers = t["owner"]["headers"]

    r1 = client.post(
        f"/api/v1/boards/{board_id}/tasks",
        json={"title": "第一个任务", "column_id": col1},
        headers=headers,
    )
    assert r1.status_code == 201
    assert r1.json()["data"]["position"] == 0

    r2 = client.post(
        f"/api/v1/boards/{board_id}/tasks",
        json={"title": "第二个任务", "column_id": col1, "priority": "high", "status": "in_progress"},
        headers=headers,
    )
    assert r2.status_code == 201
    assert r2.json()["data"]["position"] == 1

    # 列表
    resp = client.get(f"/api/v1/boards/{board_id}/tasks", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["data"]["total"] >= 2

    # 搜索
    resp = client.get(f"/api/v1/boards/{board_id}/tasks?q=第二个", headers=headers)
    assert resp.status_code == 200
    titles = [i["title"] for i in resp.json()["data"]["items"]]
    assert "第二个任务" in titles and "第一个任务" not in titles

    # 状态筛选
    resp = client.get(f"/api/v1/boards/{board_id}/tasks?status=in_progress", headers=headers)
    assert all(i["status"] == "in_progress" for i in resp.json()["data"]["items"])


def test_get_update_delete_task(client, team_with_members):
    t = team_with_members
    task_id = t["task"]["id"]
    headers = t["owner"]["headers"]

    resp = client.get(f"/api/v1/tasks/{task_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["data"]["title"] == "任务A"

    resp = client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"title": "任务A改名", "priority": "urgent", "due_date": "2026-12-31"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["title"] == "任务A改名"
    assert data["priority"] == "urgent"
    assert data["due_date"] == "2026-12-31"

    resp = client.delete(f"/api/v1/tasks/{task_id}", headers=headers)
    assert resp.status_code == 200
    resp = client.get(f"/api/v1/tasks/{task_id}", headers=headers)
    assert resp.status_code == 404
    assert resp.json()["code"] == 40401


def test_move_position_within_and_across_columns(client, team_with_members):
    t = team_with_members
    board_id = t["board"]["id"]
    col0, col1 = t["columns"][0], t["columns"][1]
    headers = t["owner"]["headers"]

    # 再建一个任务在同一列
    r = client.post(
        f"/api/v1/boards/{board_id}/tasks",
        json={"title": "第二个", "column_id": col0},
        headers=headers,
    )
    task2 = r.json()["data"]

    # 把任务A 跨列拖到 col1 位置0
    resp = client.patch(
        f"/api/v1/boards/{board_id}/columns/{col1}/tasks/{t['task']['id']}/position",
        json={"target_column_id": col1, "position": 0},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["column_id"] == col1
    assert data["position"] == 0

    # 列内重排：把 task2 插到 col0 位置0，任务A 原来不在 col0
    resp = client.patch(
        f"/api/v1/boards/{board_id}/columns/{col0}/tasks/{task2['id']}/position",
        json={"target_column_id": col0, "position": 0},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["position"] == 0

    # 校验看板详情 position 连续
    detail = client.get(f"/api/v1/boards/{board_id}", headers=headers).json()["data"]
    col0_tasks = [c for c in detail["columns"] if c["id"] == col0][0]["tasks"]
    assert [x["position"] for x in col0_tasks] == sorted(x["position"] for x in col0_tasks)


def test_move_target_mismatch(client, team_with_members):
    t = team_with_members
    resp = client.patch(
        f"/api/v1/boards/{t['board']['id']}/columns/{t['columns'][1]}/tasks/{t['task']['id']}/position",
        json={"target_column_id": t["columns"][2], "position": 0},
        headers=t["owner"]["headers"],
    )
    assert resp.status_code == 400
    assert resp.json()["code"] == 40001


def test_create_task_invalid_column(client, team_with_members):
    t = team_with_members
    other = t["columns"][1]
    resp = client.post(
        f"/api/v1/boards/{t['board']['id']}/tasks",
        json={"title": "非法列", "column_id": other},  # 合法列但此处应合法
        headers=t["owner"]["headers"],
    )
    assert resp.status_code == 201


def test_create_task_assignee_not_member(client, team_with_members):
    t = team_with_members
    outsider = register_user(client)
    resp = client.post(
        f"/api/v1/boards/{t['board']['id']}/tasks",
        json={
            "title": "非法负责人",
            "column_id": t["columns"][0],
            "assignee_id": outsider["user"]["id"],
        },
        headers=t["owner"]["headers"],
    )
    assert resp.status_code == 400
    assert resp.json()["code"] == 40001


def test_my_tasks_aggregation(client, team_with_members):
    t = team_with_members
    member = t["member"]
    board_id = t["board"]["id"]
    # 给 member 再分配一个任务（与任务A同列）
    resp = client.post(
        f"/api/v1/boards/{board_id}/tasks",
        json={
            "title": "分给member的任务",
            "column_id": t["columns"][1],
            "assignee_id": member["user"]["id"],
        },
        headers=t["owner"]["headers"],
    )
    assert resp.status_code == 201

    # member 自己的任务（任务A 也在列0 指派给了 member，见 conftest）
    resp = client.get("/api/v1/me/tasks", headers=member["headers"])
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["total"] >= 1
    for item in data["items"]:
        assert item["assignee_id"] == member["user"]["id"]
        assert item["board_name"]  # 聚合附带看板名，便于跳转
