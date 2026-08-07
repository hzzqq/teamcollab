"""团队/成员冒烟测试：建团、邀请、改角色、移除、owner 保护、越权。"""

from tests.conftest import register_user


def test_create_team(client):
    u = register_user(client)
    resp = client.post("/api/v1/teams", json={"name": "新团队"}, headers=u["headers"])
    assert resp.status_code == 201
    data = resp.json()["data"]
    assert data["name"] == "新团队"
    # 创建者应为 owner
    members = client.get(f"/api/v1/teams/{data['id']}/members", headers=u["headers"])
    assert members.status_code == 200
    assert members.json()["data"][0]["role"] == "owner"


def test_invite_and_list_members(client):
    owner = register_user(client)
    target = register_user(client)
    team_id = owner["team"]["id"]
    resp = client.post(
        f"/api/v1/teams/{team_id}/members",
        json={"email": target["email"], "role": "member"},
        headers=owner["headers"],
    )
    assert resp.status_code == 201
    assert resp.json()["data"]["role"] == "member"

    listed = client.get(f"/api/v1/teams/{team_id}/members", headers=owner["headers"])
    assert listed.status_code == 200
    emails = [m["user"]["email"] for m in listed.json()["data"]]
    assert owner["email"] in emails and target["email"] in emails


def test_invite_unregistered_email(client):
    owner = register_user(client)
    resp = client.post(
        f"/api/v1/teams/{owner['team']['id']}/members",
        json={"email": "nobody@example.com", "role": "member"},
        headers=owner["headers"],
    )
    assert resp.status_code == 400
    assert resp.json()["code"] == 40001


def test_invite_duplicate(client):
    owner = register_user(client)
    target = register_user(client)
    team_id = owner["team"]["id"]
    client.post(
        f"/api/v1/teams/{team_id}/members",
        json={"email": target["email"], "role": "member"},
        headers=owner["headers"],
    )
    resp = client.post(
        f"/api/v1/teams/{team_id}/members",
        json={"email": target["email"], "role": "viewer"},
        headers=owner["headers"],
    )
    assert resp.status_code == 409
    assert resp.json()["code"] == 40901


def test_change_role_and_owner_protection(client, team_with_members):
    t = team_with_members
    member = t["member"]
    resp = client.patch(
        f"/api/v1/teams/{t['team_id']}/members/{member['user']['id']}/role",
        json={"role": "admin"},
        headers=t["owner"]["headers"],
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["role"] == "admin"

    # owner 不可被修改
    owner_id = t["owner"]["user"]["id"]
    resp = client.patch(
        f"/api/v1/teams/{t['team_id']}/members/{owner_id}/role",
        json={"role": "member"},
        headers=t["owner"]["headers"],
    )
    assert resp.status_code == 400
    assert resp.json()["code"] == 40001


def test_remove_member_and_owner_protection(client, team_with_members):
    t = team_with_members
    member = t["member"]
    resp = client.delete(
        f"/api/v1/teams/{t['team_id']}/members/{member['user']['id']}",
        headers=t["owner"]["headers"],
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["ok"] is True

    # owner 不可被移除
    owner_id = t["owner"]["user"]["id"]
    resp = client.delete(
        f"/api/v1/teams/{t['team_id']}/members/{owner_id}",
        headers=t["owner"]["headers"],
    )
    assert resp.status_code == 403
    assert resp.json()["code"] == 40301


def test_viewer_cannot_invite(client, team_with_members):
    t = team_with_members
    outsider = register_user(client)
    resp = client.post(
        f"/api/v1/teams/{t['team_id']}/members",
        json={"email": outsider["email"], "role": "member"},
        headers=t["viewer"]["headers"],
    )
    assert resp.status_code == 403
    assert resp.json()["code"] == 40301


def test_member_cannot_invite(client, team_with_members):
    t = team_with_members
    outsider = register_user(client)
    resp = client.post(
        f"/api/v1/teams/{t['team_id']}/members",
        json={"email": outsider["email"], "role": "member"},
        headers=t["member"]["headers"],
    )
    assert resp.status_code == 403
    assert resp.json()["code"] == 40301
