"""全局搜索 /api/v1/search 回归：租户隔离是重点。

历史风险：tasks 表无 team_id，若只按 title/description 模糊查会跨团队泄漏。
本测试用两个互不相关的注册用户（各自默认团队）交叉验证不可见性。
"""

from tests.conftest import register_user


def _board_with_column(client, owner, name="搜索看板"):
    r = client.post(
        f"/api/v1/teams/{owner['team']['id']}/boards",
        json={"name": name},
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


def _task(client, owner, board_id, column_id, title, description=None):
    body = {"title": title, "column_id": column_id}
    if description is not None:
        body["description"] = description
    r = client.post(
        f"/api/v1/boards/{board_id}/tasks",
        json=body,
        headers=owner["headers"],
    )
    assert r.status_code == 201, r.text
    return r.json()["data"]


def _search(client, headers, q, limit=None):
    params = {"q": q}
    if limit is not None:
        params["limit"] = limit
    r = client.get("/api/v1/search", params=params, headers=headers)
    assert r.status_code == 200, r.text
    assert r.json()["code"] == 0
    return r.json()["data"]


def test_anonymous_401(client):
    assert client.get("/api/v1/search", params={"q": "任意"}).status_code == 401


def test_empty_query_returns_empty(client):
    owner = register_user(client)
    _board_with_column(client, owner)
    data = _search(client, owner["headers"], "")
    assert data["query"] == ""
    assert data["tasks"] == [] and data["boards"] == []


def test_matches_title_and_description_case_insensitive(client):
    owner = register_user(client)
    board, col = _board_with_column(client, owner, name="迭代看板")
    _task(client, owner, board["id"], col, "登录页面优化", "支持 SSO 单点登录")

    by_title = _search(client, owner["headers"], "登录")
    assert [t["title"] for t in by_title["tasks"]] == ["登录页面优化"]

    by_desc = _search(client, owner["headers"], "sso")
    assert [t["title"] for t in by_desc["tasks"]] == ["登录页面优化"]
    hit = by_desc["tasks"][0]
    assert hit["board_name"] == "迭代看板"
    assert hit["column_name"] == "待办"
    assert hit["team_id"] == owner["team"]["id"]
    assert hit["team_name"] == owner["team"]["name"]
    assert hit["due_date"] is None


def test_like_wildcards_are_literal(client):
    owner = register_user(client)
    board, col = _board_with_column(client, owner, name="通配符看板")
    _task(client, owner, board["id"], col, "普通任务")
    _task(client, owner, board["id"], col, "100% 完成率")

    # 未转义时 '%' 会匹配全部任务；转义后只有字面量含 % 的命中
    data = _search(client, owner["headers"], "%")
    assert [t["title"] for t in data["tasks"]] == ["100% 完成率"]

    underscore = _search(client, owner["headers"], "_")
    assert underscore["tasks"] == []


def test_tenant_isolation(client):
    owner_a = register_user(client)
    outsider = register_user(client)
    board_a, col_a = _board_with_column(client, owner_a, name="A 团队机密看板")
    _task(client, owner_a, board_a["id"], col_a, "绝密路线图")

    own = _search(client, owner_a["headers"], "绝密")
    assert [t["title"] for t in own["tasks"]] == ["绝密路线图"]

    foreign = _search(client, outsider["headers"], "绝密")
    assert foreign["tasks"] == []
    # 看板名同样不能跨租户泄漏
    assert _search(client, outsider["headers"], "A 团队机密看板")["boards"] == []


def test_board_name_match(client):
    owner = register_user(client)
    _board_with_column(client, owner, name="Q4 规划看板")
    data = _search(client, owner["headers"], "q4")
    assert [b["name"] for b in data["boards"]] == ["Q4 规划看板"]
    assert data["boards"][0]["team_id"] == owner["team"]["id"]


def test_limit_applied_and_shape(client):
    owner = register_user(client)
    board, col = _board_with_column(client, owner, name="限量看板")
    for i in range(3):
        _task(client, owner, board["id"], col, f"同前缀任务 {i}")

    data = _search(client, owner["headers"], "同前缀", limit=1)
    assert len(data["tasks"]) == 1
    assert data["query"] == "同前缀"
    hit = data["tasks"][0]
    for key in (
        "id", "title", "description", "board_id", "board_name", "team_id",
        "team_name", "column_id", "column_name", "priority", "status", "due_date",
    ):
        assert key in hit, f"missing {key}"


def test_team_member_sees_team_tasks(client):
    owner = register_user(client)
    member = register_user(client)
    board, col = _board_with_column(client, owner, name="共享看板")
    _task(client, owner, board["id"], col, "成员可见任务")

    r = client.post(
        f"/api/v1/teams/{owner['team']['id']}/members",
        json={"email": member["email"], "role": "viewer"},
        headers=owner["headers"],
    )
    assert r.status_code == 201, r.text

    data = _search(client, member["headers"], "成员可见")
    assert [t["title"] for t in data["tasks"]] == ["成员可见任务"]
    assert data["tasks"][0]["team_id"] == owner["team"]["id"]
