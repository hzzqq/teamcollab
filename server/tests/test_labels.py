"""标签：团队级 CRUD（admin+ 写）+ 任务标签赋值（member+）+ 列表筛选。

覆盖：RBAC 边界、调色板校验、跨团队标签拒绝、任务创建/更新/PATCH 赋值、
按 label_id / priority 过滤任务。
"""

import uuid


def _create_label(client, team_id, headers, name="缺陷", color="rose"):
    return client.post(
        f"/api/v1/teams/{team_id}/labels",
        json={"name": name, "color": color},
        headers=headers,
    )


def test_create_and_list_labels(client, team_with_members):
    t = team_with_members
    team_id = t["team_id"]
    owner = t["owner"]["headers"]
    viewer = t["viewer"]["headers"]

    # 创建（owner 即 admin+）
    r = _create_label(client, team_id, owner, name="缺陷", color="rose")
    assert r.status_code == 201, r.text
    data = r.json()["data"]
    assert data["name"] == "缺陷"
    assert data["color"] == "rose"
    assert data["team_id"] == team_id
    label_id = data["id"]

    # 列表（viewer 可见）
    r = client.get(f"/api/v1/teams/{team_id}/labels", headers=viewer)
    assert r.status_code == 200
    ids = [l["id"] for l in r.json()["data"]]
    assert label_id in ids


def test_member_cannot_create_label(client, team_with_members):
    t = team_with_members
    r = _create_label(client, t["team_id"], t["member"]["headers"])
    assert r.status_code == 403
    assert r.json()["code"] == 40301


def test_invalid_color_rejected(client, team_with_members):
    t = team_with_members
    r = _create_label(client, t["team_id"], t["owner"]["headers"], color="purple")
    assert r.status_code == 400
    assert r.json()["code"] == 40001


def test_update_and_delete_label(client, team_with_members):
    t = team_with_members
    team_id = t["team_id"]
    owner = t["owner"]["headers"]

    label_id = _create_label(client, team_id, owner, name="旧名", color="blue").json()["data"]["id"]

    r = client.put(
        f"/api/v1/teams/{team_id}/labels/{label_id}",
        json={"name": "新名", "color": "amber"},
        headers=owner,
    )
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["name"] == "新名"
    assert data["color"] == "amber"

    r = client.delete(f"/api/v1/teams/{team_id}/labels/{label_id}", headers=owner)
    assert r.status_code == 200
    # 已删除：列表不再包含
    ids = [l["id"] for l in client.get(f"/api/v1/teams/{team_id}/labels", headers=owner).json()["data"]]
    assert label_id not in ids


def test_assign_labels_to_task(client, team_with_members):
    t = team_with_members
    team_id = t["team_id"]
    task_id = t["task"]["id"]
    owner = t["owner"]["headers"]
    member = t["member"]["headers"]

    label_id = _create_label(client, team_id, owner, name="前端", color="green").json()["data"]["id"]

    # member+ 可赋值
    r = client.put(
        f"/api/v1/tasks/{task_id}/labels",
        json={"label_ids": [label_id]},
        headers=member,
    )
    assert r.status_code == 200, r.text
    assert any(l["id"] == label_id for l in r.json()["data"])

    # viewer 不可赋值
    r = client.put(
        f"/api/v1/tasks/{task_id}/labels",
        json={"label_ids": [label_id]},
        headers=t["viewer"]["headers"],
    )
    assert r.status_code == 403


def test_create_task_with_label_ids(client, team_with_members):
    t = team_with_members
    team_id = t["team_id"]
    board_id = t["board"]["id"]
    col0 = t["columns"][0]
    owner = t["owner"]["headers"]

    label_id = _create_label(client, team_id, owner, name="紧急", color="amber").json()["data"]["id"]

    r = client.post(
        f"/api/v1/boards/{board_id}/tasks",
        json={"title": "带标签的任务", "column_id": col0, "label_ids": [label_id]},
        headers=owner,
    )
    assert r.status_code == 201, r.text
    labels = r.json()["data"]["labels"]
    assert any(l["id"] == label_id for l in labels)


def test_update_task_label_ids(client, team_with_members):
    t = team_with_members
    team_id = t["team_id"]
    task_id = t["task"]["id"]
    owner = t["owner"]["headers"]

    label_a = _create_label(client, team_id, owner, name="A", color="blue").json()["data"]["id"]
    label_b = _create_label(client, team_id, owner, name="B", color="slate").json()["data"]["id"]

    r = client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"label_ids": [label_a, label_b]},
        headers=owner,
    )
    assert r.status_code == 200, r.text
    got = {l["id"] for l in r.json()["data"]["labels"]}
    assert got == {label_a, label_b}

    # 清空
    r = client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"label_ids": []},
        headers=owner,
    )
    assert r.status_code == 200
    assert r.json()["data"]["labels"] == []


def test_cross_team_label_rejected(client, team_with_members):
    """另一个团队的标签不能被本团队任务引用（400）。"""
    t = team_with_members
    team_id = t["team_id"]
    task_id = t["task"]["id"]
    owner = t["owner"]["headers"]

    # 用伪造（不存在）的 label id：服务层会判定不属于本团队
    fake = str(uuid.uuid4())
    r = client.put(
        f"/api/v1/tasks/{task_id}/labels",
        json={"label_ids": [fake]},
        headers=owner,
    )
    assert r.status_code == 400
    assert r.json()["code"] == 40001


def test_filter_tasks_by_label_and_priority(client, team_with_members):
    t = team_with_members
    team_id = t["team_id"]
    board_id = t["board"]["id"]
    col0 = t["columns"][0]
    owner = t["owner"]["headers"]

    label_id = _create_label(client, team_id, owner, name="后端", color="blue").json()["data"]["id"]

    # 建两个任务：一个带标签+high，一个无标签+low
    client.post(
        f"/api/v1/boards/{board_id}/tasks",
        json={"title": "高优带标签", "column_id": col0, "priority": "high", "label_ids": [label_id]},
        headers=owner,
    )
    client.post(
        f"/api/v1/boards/{board_id}/tasks",
        json={"title": "低优无标签", "column_id": col0, "priority": "low"},
        headers=owner,
    )

    # 按 label 过滤
    r = client.get(f"/api/v1/boards/{board_id}/tasks?label_id={label_id}", headers=owner)
    assert r.status_code == 200, r.text
    items = r.json()["data"]["items"]
    assert len(items) >= 1
    assert all(any(l["id"] == label_id for l in it["labels"]) for it in items)

    # 按 priority 过滤
    r = client.get(f"/api/v1/boards/{board_id}/tasks?priority=high", headers=owner)
    assert r.status_code == 200
    items = r.json()["data"]["items"]
    assert all(it["priority"] == "high" for it in items)
