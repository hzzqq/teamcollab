"""看板/列冒烟测试。"""


def test_board_crud_and_detail(client, team_with_members):
    t = team_with_members
    board_id = t["board"]["id"]
    team_id = t["team_id"]
    headers = t["owner"]["headers"]

    # 列表
    resp = client.get(f"/api/v1/teams/{team_id}/boards", headers=headers)
    assert resp.status_code == 200
    assert any(b["id"] == board_id for b in resp.json()["data"])

    # 详情（列 + 任务）
    resp = client.get(f"/api/v1/boards/{board_id}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert len(data["columns"]) == 3
    by_pos = {c["position"]: c for c in data["columns"]}
    assert by_pos[0]["name"] == "待办"
    assert any(task["id"] == t["task"]["id"] for task in by_pos[0]["tasks"])

    # 更新
    resp = client.patch(f"/api/v1/boards/{board_id}", json={"name": "改名看板"}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["data"]["name"] == "改名看板"


def test_delete_board_admin_only(client, team_with_members):
    t = team_with_members
    # member 不可删看板
    resp = client.delete(f"/api/v1/boards/{t['board']['id']}", headers=t["member"]["headers"])
    assert resp.status_code == 403
    assert resp.json()["code"] == 40301

    # admin+ 可删
    resp = client.delete(f"/api/v1/boards/{t['board']['id']}", headers=t["owner"]["headers"])
    assert resp.status_code == 200
    # 删除后详情应 40401
    resp = client.get(f"/api/v1/boards/{t['board']['id']}", headers=t["owner"]["headers"])
    assert resp.status_code == 404
    assert resp.json()["code"] == 40401


def test_column_create_default_position(client, team_with_members):
    t = team_with_members
    resp = client.post(
        f"/api/v1/boards/{t['board']['id']}/columns",
        json={"name": "追加列"},
        headers=t["owner"]["headers"],
    )
    assert resp.status_code == 201
    assert resp.json()["data"]["position"] == 3  # 缺省追加到末尾


def test_update_column(client, team_with_members):
    t = team_with_members
    col_id = t["columns"][0]
    resp = client.patch(
        f"/api/v1/columns/{col_id}",
        json={"name": "改名列", "position": 5},
        headers=t["owner"]["headers"],
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["name"] == "改名列"
    assert data["position"] == 5


def test_viewer_cannot_create_column(client, team_with_members):
    t = team_with_members
    resp = client.post(
        f"/api/v1/boards/{t['board']['id']}/columns",
        json={"name": "越权列"},
        headers=t["viewer"]["headers"],
    )
    assert resp.status_code == 403
    assert resp.json()["code"] == 40301
