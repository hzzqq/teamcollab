"""拖拽落位的前后端契约测试。

背景：本文件的存在是为了终结一类回归 —— 后端测试与前端实现「各测各的」，
后端用例全部按「路径 columnId = 目标列」书写，而前端早期实现传的是「源列」，
两边各自测试都通过，真实环境跨列拖拽却 100% 返回 400。

本文件的用例全部按【前端真实调用形态】书写：
    PATCH /api/v1/boards/{board_id}/columns/{目标列 column_id}/tasks/{task_id}/position
    body: { target_column_id: 目标列 column_id, position: N }

任何一方改动拖拽契约，都必须同步修改本文件，否则这里会红。
"""


import pytest

from fastapi.testclient import TestClient


def _move(client: TestClient, board_id: str, column_id: str, task_id: str, position: int, headers: dict):
    """按前端真实调用形态发起拖拽落位请求（路径列 = 目标列）。"""
    return client.patch(
        f"/api/v1/boards/{board_id}/columns/{column_id}/tasks/{task_id}/position",
        json={"target_column_id": column_id, "position": position},
        headers=headers,
    )


def _board_columns(client: TestClient, board_id: str, headers: dict) -> dict:
    resp = client.get(f"/api/v1/boards/{board_id}", headers=headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    return {c["id"]: c for c in data["columns"]}


def _fresh_board_with_columns(
    client: TestClient, t: dict, column_names: list[str]
) -> tuple[str, ...]:
    """建一个独立看板并按名字建列，返回 (board_id, *column_ids)。

    用独立看板而非夹具看板，是为了精确控制初始状态（夹具看板已在 col0 预置任务）。
    """
    headers = t["owner"]["headers"]
    resp = client.post(
        f"/api/v1/teams/{t['team_id']}/boards",
        json={"name": "契约测试看板"},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    board_id = resp.json()["data"]["id"]
    column_ids = []
    for pos, name in enumerate(column_names):
        resp = client.post(
            f"/api/v1/boards/{board_id}/columns",
            json={"name": name, "position": pos},
            headers=headers,
        )
        assert resp.status_code == 201, resp.text
        column_ids.append(resp.json()["data"]["id"])
    return (board_id, *column_ids)


def test_contract_cross_column_move_uses_target_column_in_path(client, team_with_members):
    """跨列拖拽：路径 columnId 传目标列 → 200 且任务落到目标列。

    这是前端 KanbanBoard 的真实调用形态（早期实现传源列 → 400）。
    """
    t = team_with_members
    board_id = t["board"]["id"]
    col1 = t["columns"][1]
    headers = t["owner"]["headers"]

    resp = _move(client, board_id, col1, t["task"]["id"], 0, headers)
    assert resp.status_code == 200, f"跨列拖拽应成功，实际 {resp.status_code}: {resp.text}"
    data = resp.json()["data"]
    assert data["column_id"] == col1
    assert data["position"] == 0


def test_contract_source_column_in_path_is_rejected(client, team_with_members):
    """反向守卫：路径列与 body.target_column_id 不一致 → 400（不静默接受）。

    明确记录「路径列 = 目标列」是唯一合法形态，防止实现悄悄放宽。
    """
    t = team_with_members
    board_id = t["board"]["id"]
    col0, col1 = t["columns"][0], t["columns"][1]

    resp = client.patch(
        f"/api/v1/boards/{board_id}/columns/{col0}/tasks/{t['task']['id']}/position",
        json={"target_column_id": col1, "position": 0},
        headers=t["owner"]["headers"],
    )
    assert resp.status_code == 400
    assert resp.json()["code"] == 40001


def test_contract_cross_column_move_repacks_source_column_positions(client, team_with_members):
    """跨列后源列 position 必须压紧为 0..n-1，不能留空洞。

    历史缺陷：from_column_id 计算后未使用，源列残留 position 空洞（如 0,2,3），
    导致后续按 position 排序乱序。
    """
    t = team_with_members
    board_id = t["board"]["id"]
    col0, col1 = t["columns"][0], t["columns"][1]
    headers = t["owner"]["headers"]

    # 用独立看板精确控制初始状态（夹具已在 col0 预置了「任务A」，不便断言数量）
    board_id, col0, col1 = _fresh_board_with_columns(client, t, ["待办", "完成"])

    # 源列建 3 个任务（position 0/1/2）
    task_ids = []
    for title in ("源任务1", "源任务2", "源任务3"):
        resp = client.post(
            f"/api/v1/boards/{board_id}/tasks",
            json={"title": title, "column_id": col0},
            headers=headers,
        )
        assert resp.status_code == 201, resp.text
        task_ids.append(resp.json()["data"]["id"])

    # 把第 1 个（position 0）拖到另一列 → 源列应剩 2 个并重排为 position 0,1
    resp = _move(client, board_id, col1, task_ids[0], 0, headers)
    assert resp.status_code == 200, resp.text

    cols = _board_columns(client, board_id, headers)
    src_tasks = cols[col0]["tasks"]
    assert len(src_tasks) == 2, f"源列应剩 2 个任务，实际 {len(src_tasks)}"
    positions = [task["position"] for task in src_tasks]
    assert positions == [0, 1], f"源列 position 应压紧为 [0,1]，实际 {positions}"
    # 任务顺序应保持相对次序（源任务2 在前）
    assert [task["title"] for task in src_tasks] == ["源任务2", "源任务3"]


def test_contract_cross_column_move_repacks_target_column_positions(client, team_with_members):
    """跨列后目标列 position 也必须压紧为 0..n-1。"""
    t = team_with_members
    headers = t["owner"]["headers"]
    board_id, col0, col1 = _fresh_board_with_columns(client, t, ["待办", "完成"])

    resp = client.post(
        f"/api/v1/boards/{board_id}/tasks",
        json={"title": "目标任务", "column_id": col1},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text

    # 另建一个任务从待办列拖入目标列（position 0），目标列应变成 2 个任务、position 0,1
    resp = client.post(
        f"/api/v1/boards/{board_id}/tasks",
        json={"title": "迁入任务", "column_id": col0},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    moving_task = resp.json()["data"]["id"]

    resp = _move(client, board_id, col1, moving_task, 0, headers)
    assert resp.status_code == 200, resp.text

    cols = _board_columns(client, board_id, headers)
    positions = [task["position"] for task in cols[col1]["tasks"]]
    assert positions == [0, 1], f"目标列 position 应压紧为 [0,1]，实际 {positions}"


def test_contract_same_column_reorder_positions_are_dense(client, team_with_members):
    """同列排序：列内 position 始终是 0..n-1 的连续序列。"""
    t = team_with_members
    headers = t["owner"]["headers"]
    board_id, col0 = _fresh_board_with_columns(client, t, ["待办"])

    task_ids = []
    for title in ("甲", "乙", "丙"):
        resp = client.post(
            f"/api/v1/boards/{board_id}/tasks",
            json={"title": title, "column_id": col0},
            headers=headers,
        )
        assert resp.status_code == 201, resp.text
        task_ids.append(resp.json()["data"]["id"])

    # 把最后一个拖到 position 0
    resp = _move(client, board_id, col0, task_ids[2], 0, headers)
    assert resp.status_code == 200, resp.text

    cols = _board_columns(client, board_id, headers)
    titles = [task["title"] for task in cols[col0]["tasks"]]
    positions = [task["position"] for task in cols[col0]["tasks"]]
    assert positions == [0, 1, 2], f"position 应连续，实际 {positions}"
    assert titles[0] == "丙", f"被拖任务应落到列首，实际 {titles}"
    assert titles == ["丙", "甲", "乙"], f"同列落位顺序不符，实际 {titles}"


def test_contract_move_to_empty_column_appends_at_zero(client, team_with_members):
    """拖到空列 → 落 position 0。"""
    t = team_with_members
    board_id = t["board"]["id"]
    col2 = t["columns"][2]

    resp = _move(client, board_id, col2, t["task"]["id"], 0, t["owner"]["headers"])
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["position"] == 0
    assert resp.json()["data"]["column_id"] == col2


def test_contract_move_position_clamped_to_column_size(client, team_with_members):
    """position 超出列容量时钳制到末尾，不报错。"""
    t = team_with_members
    board_id = t["board"]["id"]
    col0 = t["columns"][0]

    resp = _move(client, board_id, col0, t["task"]["id"], 999, t["owner"]["headers"])
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["position"] == 0


def test_contract_move_rejects_task_from_other_board(client, team_with_members):
    """跨看板拖拽被拒（任务必须属于该看板）。"""
    t = team_with_members
    owner = t["owner"]

    other_board = client.post(
        f"/api/v1/teams/{t['team_id']}/boards",
        json={"name": "另一个看板"},
        headers=owner["headers"],
    ).json()["data"]
    other_col = client.post(
        f"/api/v1/boards/{other_board['id']}/columns",
        json={"name": "列"},
        headers=owner["headers"],
    ).json()["data"]["id"]

    resp = _move(client, other_board["id"], other_col, t["task"]["id"], 0, owner["headers"])
    assert resp.status_code == 404
    assert resp.json()["code"] == 40401


def test_contract_move_rejects_column_from_other_board(client, team_with_members):
    """目标列不属于该看板 → 404。"""
    t = team_with_members
    owner = t["owner"]

    other_board = client.post(
        f"/api/v1/teams/{t['team_id']}/boards",
        json={"name": "另一个看板2"},
        headers=owner["headers"],
    ).json()["data"]
    other_col = client.post(
        f"/api/v1/boards/{other_board['id']}/columns",
        json={"name": "列"},
        headers=owner["headers"],
    ).json()["data"]["id"]

    resp = _move(client, t["board"]["id"], other_col, t["task"]["id"], 0, owner["headers"])
    assert resp.status_code == 404
    assert resp.json()["code"] == 40401


@pytest.mark.parametrize("role", ["viewer"])
def test_contract_viewer_cannot_move_task(client, team_with_members, role):
    """viewer 只读：拖拽落位被拒（403）。"""
    t = team_with_members
    resp = _move(
        client,
        t["board"]["id"],
        t["columns"][1],
        t["task"]["id"],
        0,
        t[role]["headers"],
    )
    assert resp.status_code == 403
    assert resp.json()["code"] == 40301
