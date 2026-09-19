"""认证冒烟测试：注册/登录/刷新/me。"""

from tests.conftest import register_user


def test_register_success(client):
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": "pm@test-register.com", "password": "pass1234", "display_name": "PM"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["code"] == 0
    data = body["data"]
    assert data["user"]["email"] == "pm@test-register.com"
    assert data["team"]["name"] == "PM 的团队"
    assert data["role"] == "owner"
    assert data["access_token"]
    assert data["refresh_token"]
    assert data["token_type"] == "bearer"
    assert data["expires_in"] == 900


def test_register_conflict(client):
    email = "dup@test-conflict.com"
    r1 = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "pass1234", "display_name": "A"},
    )
    assert r1.status_code == 201
    r2 = client.post(
        "/api/v1/auth/register",
        json={"email": email.upper(), "password": "pass1234", "display_name": "B"},
    )
    # 大小写不同也判冲突（email 统一小写）
    assert r2.status_code == 409
    assert r2.json()["code"] == 40901


def test_register_invalid_password(client):
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": "short@test.com", "password": "123", "display_name": "X"},
    )
    assert resp.status_code == 400
    assert resp.json()["code"] == 40001


def test_login_success_and_refresh(client):
    email = "login@test-refresh.com"
    client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "pass1234", "display_name": "Login"},
    )
    resp = client.post("/api/v1/auth/login", data={"username": email, "password": "pass1234"})
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["access_token"] and data["refresh_token"]

    refresh = data["refresh_token"]
    r2 = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh})
    assert r2.status_code == 200
    assert r2.json()["data"]["access_token"]


def test_login_wrong_password(client):
    email = "wrongpw@test.com"
    client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "pass1234", "display_name": "WP"},
    )
    resp = client.post("/api/v1/auth/login", data={"username": email, "password": "wrongpass"})
    assert resp.status_code == 401
    assert resp.json()["code"] == 40101


def test_refresh_with_access_token_rejected(client):
    u = register_user(client)
    resp = client.post("/api/v1/auth/refresh", json={"refresh_token": u["access_token"]})
    assert resp.status_code == 401
    assert resp.json()["code"] == 40101


def test_me(client):
    u = register_user(client)
    resp = client.get("/api/v1/me", headers=u["headers"])
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["user"]["id"] == u["user"]["id"]
    assert data["team"]["id"] == u["team"]["id"]
    assert data["role"] == "owner"


def test_me_unauthorized(client):
    resp = client.get("/api/v1/me")
    assert resp.status_code == 401
    assert resp.json()["code"] == 40101


def test_register_with_invite_joins_team(client):
    """邀请注册：注册成功后自动以 member 角色加入邀请团队（不另建默认团队）。"""
    # 邀请方（owner）先注册，拿到团队 id
    owner = register_user(client, email="inviter@test-invite.com", display_name="邀请人")
    team_id = owner["team"]["id"]

    email = "invitee@test-invite.com"
    resp = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "pass1234",
            "display_name": "被邀请人",
            "invite_team_id": team_id,
        },
    )
    assert resp.status_code == 201
    data = resp.json()["data"]
    assert data["team"]["id"] == team_id
    assert data["role"] == "member"

    # 登录后默认落在邀请团队
    login = client.post(
        "/api/v1/auth/login", data={"username": email, "password": "pass1234"}
    )
    assert login.status_code == 200
    assert login.json()["data"]["team"]["id"] == team_id
    assert login.json()["data"]["role"] == "member"

    # 成员列表可见
    members = client.get(
        f"/api/v1/teams/{team_id}/members", headers=owner["headers"]
    )
    assert members.status_code == 200
    user_ids = [m["user"]["id"] for m in members.json()["data"]]
    assert data["user"]["id"] in user_ids


def test_register_with_invalid_invite_falls_back(client):
    """邀请链接失效（团队不存在）→ 回退默认注册流程（自建团队 owner）。"""
    resp = client.post(
        "/api/v1/auth/register",
        json={
            "email": "fallback@test-invite.com",
            "password": "pass1234",
            "display_name": "回退用户",
            "invite_team_id": "00000000-0000-0000-0000-000000000000",
        },
    )
    assert resp.status_code == 201
    data = resp.json()["data"]
    assert data["team"]["name"] == "回退用户 的团队"
    assert data["role"] == "owner"
