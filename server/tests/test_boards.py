"""看板/列冒烟测试。"""

from sqlalchemy import text

from app.core.db import SessionLocal


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


def test_delete_board_cascades_columns_and_tasks(client, team_with_members):
    """删除看板应级联清除其下列与任务（核心破坏性操作的数据正确性）。"""
    t = team_with_members
    owner = t["owner"]
    board_id = t["board"]["id"]
    col_id = t["columns"][0]

    # 在列下建一个任务
    r = client.post(
        f"/api/v1/boards/{board_id}/tasks",
        json={"title": "待级联删除的任务", "column_id": col_id},
        headers=owner["headers"],
    )
    assert r.status_code == 201, r.text
    task_id = r.json()["data"]["id"]

    # 删除看板
    r = client.delete(f"/api/v1/boards/{board_id}", headers=owner["headers"])
    assert r.status_code == 200, r.text

    # 看板详情应 404
    r = client.get(f"/api/v1/boards/{board_id}", headers=owner["headers"])
    assert r.status_code == 404

    # 级联核对：任务与列在库中已不存在
    db = SessionLocal()
    try:
        n_task = db.scalar(text("SELECT count(*) FROM tasks WHERE id = :id"), {"id": task_id})
        n_col = db.scalar(
            text("SELECT count(*) FROM board_columns WHERE board_id = :id"), {"id": board_id}
        )
    finally:
        db.close()
    assert n_task == 0, "删除看板后任务应被级联删除"
    assert n_col == 0, "删除看板后列应被级联删除"


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


def test_delete_column_admin_only(client, team_with_members):
    """删除列是 admin+ 专属（与删除看板一致）。"""
    t = team_with_members
    owner = t["owner"]
    board_id = t["board"]["id"]
    # 先建一个空列用于删除测试（种子列均含任务，会被非空保护拦截）
    r = client.post(f"/api/v1/boards/{board_id}/columns", json={"name": "待删列"}, headers=owner["headers"])
    assert r.status_code == 201, r.text
    col_id = r.json()["data"]["id"]
    # member 不可删列
    resp = client.delete(f"/api/v1/columns/{col_id}", headers=t["member"]["headers"])
    assert resp.status_code == 403
    assert resp.json()["code"] == 40301
    # owner 可删
    resp = client.delete(f"/api/v1/columns/{col_id}", headers=owner["headers"])
    assert resp.status_code == 200
    assert resp.json()["data"]["ok"] is True


def test_delete_column_rejects_nonempty(client, team_with_members):
    """非空列（含任务）删除应被 409 拦截，避免 ON DELETE CASCADE 静默删任务。"""
    t = team_with_members
    col_id = t["columns"][0]  # 该列下已有种子任务
    resp = client.delete(f"/api/v1/columns/{col_id}", headers=t["owner"]["headers"])
    assert resp.status_code == 409
    assert resp.json()["code"] == 40901


def test_delete_empty_column_succeeds(client, team_with_members):
    """空列可直接删除，且详情中不再出现该列。"""
    t = team_with_members
    owner = t["owner"]
    board_id = t["board"]["id"]
    # 新建一个空列
    r = client.post(f"/api/v1/boards/{board_id}/columns", json={"name": "空列"}, headers=owner["headers"])
    assert r.status_code == 201, r.text
    col_id = r.json()["data"]["id"]
    resp = client.delete(f"/api/v1/columns/{col_id}", headers=owner["headers"])
    assert resp.status_code == 200

    # 看板详情中该列消失
    resp = client.get(f"/api/v1/boards/{board_id}", headers=owner["headers"])
    assert resp.status_code == 200
    col_ids = [c["id"] for c in resp.json()["data"]["columns"]]
    assert col_id not in col_ids
