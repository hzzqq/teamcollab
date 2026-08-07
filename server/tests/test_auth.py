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
