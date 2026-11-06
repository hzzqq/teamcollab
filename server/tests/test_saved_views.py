"""保存视图回归（CRUD + 权限 + 租户隔离）。"""

from tests.conftest import register_user


def _view(client, headers, team_id, name="我的视图", view="list", filters=None):
    payload = {"name": name, "view": view}
    if filters is not None:
        payload["filters"] = filters
    r = client.post(f"/api/v1/teams/{team_id}/views", json=payload, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()["data"]


def test_create_and_list(client):
    owner = register_user(client, display_name="视图创建者")
    v = _view(client, owner["headers"], owner["team"]["id"])
    assert v["name"] == "我的视图"
    assert v["owner_id"] == owner["user"]["id"]
    r = client.get(f"/api/v1/teams/{owner['team']['id']}/views", headers=owner["headers"])
    assert r.status_code == 200
    ids = [x["id"] for x in r.json()["data"]["items"]]
    assert v["id"] in ids


def test_filters_roundtrip(client):
    owner = register_user(client, display_name="视图过滤")
    v = _view(client, owner["headers"], owner["team"]["id"], filters={"priority": "high"})
    r = client.get(f"/api/v1/teams/{owner['team']['id']}/views", headers=owner["headers"])
    row = next(x for x in r.json()["data"]["items"] if x["id"] == v["id"])
    assert row["filters"] == {"priority": "high"}


def test_anon_cannot_list(client):
    owner = register_user(client)
    r = client.get(f"/api/v1/teams/{owner['team']['id']}/views")
    assert r.status_code == 401


def test_update_and_delete_permissions(client):
    owner = register_user(client, display_name="Owner")
    member = register_user(client, display_name="Member")
    team_id = owner["team"]["id"]
    client.post(
        f"/api/v1/teams/{team_id}/members",
        json={"email": member["email"], "role": "member"},
        headers=owner["headers"],
    )
    v = _view(client, owner["headers"], team_id)
    # owner 更新
    r = client.put(
        f"/api/v1/teams/{team_id}/views/{v['id']}",
        json={"name": "改名"},
        headers=owner["headers"],
    )
    assert r.status_code == 200, r.text
    assert r.json()["data"]["name"] == "改名"
    # member 不可更新
    r = client.put(
        f"/api/v1/teams/{team_id}/views/{v['id']}",
        json={"name": "成员改"},
        headers=member["headers"],
    )
    assert r.status_code == 403, r.text
    # member 不可删除
    r = client.delete(
        f"/api/v1/teams/{team_id}/views/{v['id']}", headers=member["headers"]
    )
    assert r.status_code == 403
    # owner 删除
    r = client.delete(
        f"/api/v1/teams/{team_id}/views/{v['id']}", headers=owner["headers"]
    )
    assert r.status_code == 200
    r = client.get(f"/api/v1/teams/{team_id}/views", headers=owner["headers"])
    assert all(x["id"] != v["id"] for x in r.json()["data"]["items"])


def test_viewer_can_list(client):
    owner = register_user(client, display_name="Owner")
    viewer = register_user(client, display_name="Viewer")
    team_id = owner["team"]["id"]
    client.post(
        f"/api/v1/teams/{team_id}/members",
        json={"email": viewer["email"], "role": "viewer"},
        headers=owner["headers"],
    )
    _view(client, owner["headers"], team_id)
    r = client.get(f"/api/v1/teams/{team_id}/views", headers=viewer["headers"])
    assert r.status_code == 200
    assert r.json()["data"]["total"] >= 1


def test_cross_team_cannot_access(client):
    owner = register_user(client, display_name="Owner")
    outsider = register_user(client, display_name="Outsider")
    v = _view(client, owner["headers"], owner["team"]["id"])
    r = client.put(
        f"/api/v1/teams/{owner['team']['id']}/views/{v['id']}",
        json={"name": "x"},
        headers=outsider["headers"],
    )
    assert r.status_code == 404
