"""GET /me/teams：多租户下枚举当前用户所属的全部团队及其角色。"""

import uuid

from fastapi.testclient import TestClient


def _register(client: TestClient) -> dict:
    email = f"v{uuid.uuid4().hex[:10]}@example.com"
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "pass1234", "display_name": "用户B"},
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()["data"]
    data["email"] = email
    data["headers"] = {"Authorization": f"Bearer {data['access_token']}"}
    return data


def test_me_teams_single(client: TestClient, team_with_members):
    t = team_with_members
    owner = t["owner"]
    resp = client.get("/api/v1/me/teams", headers=owner["headers"])
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert len(data) == 1
    assert data[0]["role"] == "owner"
    assert data[0]["team"]["id"] == t["team_id"]


def test_me_teams_multi_team(client: TestClient):
    # 干净用户 alice 自带 1 个团队；bob 建团队并邀请 alice 加入
    alice = _register(client)
    bob = _register(client)
    invite = client.post(
        f"/api/v1/teams/{bob['team']['id']}/members",
        json={"email": alice["email"], "role": "member"},
        headers=bob["headers"],
    )
    assert invite.status_code == 201

    resp = client.get("/api/v1/me/teams", headers=alice["headers"])
    assert resp.status_code == 200
    data = resp.json()["data"]
    by_team = {d["team"]["id"]: d["role"] for d in data}
    assert alice["team"]["id"] in by_team
    assert bob["team"]["id"] in by_team
    assert by_team[alice["team"]["id"]] == "owner"
    assert by_team[bob["team"]["id"]] == "member"
    assert len(data) == 2


def test_me_teams_requires_auth(client: TestClient):
    resp = client.get("/api/v1/me/teams")
    assert resp.status_code == 401
