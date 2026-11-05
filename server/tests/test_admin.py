"""管理员后台（/admin）回归测试：超级管理员守卫 + 账号治理 CRUD + 护栏。

注意：conftest 在每个 session 开始清空业务表，测试库里不存在 seed 的
pm@example.com 超级管理员。因此本文件通过把注册用户直接置为 is_superuser
来构造管理员身份——token 从 DB 实时读取该字段，置位后既有 token 即具备权限。
"""

import uuid

from sqlalchemy import text

from app.core.db import engine
from tests.conftest import register_user


def _promote(user_id: str) -> None:
    with engine.begin() as conn:
        conn.execute(
            text("UPDATE users SET is_superuser = true WHERE id = :uid"),
            {"uid": str(user_id)},
        )


def test_anonymous_forbidden(client):
    r = client.get("/api/v1/admin/users")
    assert r.status_code == 401


def test_normal_user_forbidden(client):
    u = register_user(client)
    r = client.get("/api/v1/admin/users", headers=u["headers"])
    assert r.status_code == 403
    assert r.json()["code"] == 40301


def test_superuser_list_users(client):
    u = register_user(client)
    _promote(u["user"]["id"])
    r = client.get("/api/v1/admin/users", headers=u["headers"])
    assert r.status_code == 200
    assert r.json()["code"] == 0
    assert isinstance(r.json()["data"], list)


def test_superuser_list_teams(client):
    u = register_user(client)
    _promote(u["user"]["id"])
    r = client.get("/api/v1/admin/teams", headers=u["headers"])
    assert r.status_code == 200
    teams = r.json()["data"]
    assert isinstance(teams, list)
    assert any(t["name"].endswith("的团队") for t in teams)
    assert all("member_count" in t for t in teams)


def test_create_promote_reset_delete(client):
    admin = register_user(client)
    _promote(admin["user"]["id"])
    email = f"admin-test-{uuid.uuid4().hex[:8]}@example.com"
    r = client.post(
        "/api/v1/admin/users",
        json={"email": email, "password": "pass1234", "display_name": "测试账号"},
        headers=admin["headers"],
    )
    assert r.status_code == 201
    new_user = r.json()["data"]
    assert new_user["email"] == email
    assert new_user["is_superuser"] is False

    # 提升为超级管理员
    r = client.patch(
        f"/api/v1/admin/users/{new_user['id']}",
        json={"is_superuser": True},
        headers=admin["headers"],
    )
    assert r.status_code == 200
    assert r.json()["data"]["is_superuser"] is True

    # 重置密码
    r = client.post(
        f"/api/v1/admin/users/{new_user['id']}/reset-password",
        json={"new_password": "newpass99"},
        headers=admin["headers"],
    )
    assert r.status_code == 200

    # 删除
    r = client.delete(f"/api/v1/admin/users/{new_user['id']}", headers=admin["headers"])
    assert r.status_code == 200


def test_create_duplicate_email_conflict(client):
    admin = register_user(client)
    _promote(admin["user"]["id"])
    email = f"dup-{uuid.uuid4().hex[:8]}@example.com"
    r1 = client.post(
        "/api/v1/admin/users",
        json={"email": email, "password": "pass1234", "display_name": "A"},
        headers=admin["headers"],
    )
    assert r1.status_code == 201
    r2 = client.post(
        "/api/v1/admin/users",
        json={"email": email, "password": "pass1234", "display_name": "B"},
        headers=admin["headers"],
    )
    assert r2.status_code == 409
    assert r2.json()["code"] == 40901


def test_self_delete_blocked(client):
    admin = register_user(client)
    _promote(admin["user"]["id"])
    r = client.delete(
        f"/api/v1/admin/users/{admin['user']['id']}", headers=admin["headers"]
    )
    assert r.status_code == 403
    assert r.json()["code"] == 40301


def test_demote_last_superuser_blocked(client):
    admin = register_user(client)
    _promote(admin["user"]["id"])
    # 把其它超级管理员全部降权，确保 admin 是最后一个
    sup = client.get("/api/v1/admin/users", headers=admin["headers"]).json()["data"]
    for other in sup:
        if other["id"] != admin["user"]["id"] and other["is_superuser"]:
            r = client.patch(
                f"/api/v1/admin/users/{other['id']}",
                json={"is_superuser": False},
                headers=admin["headers"],
            )
            assert r.status_code == 200
    r = client.patch(
        f"/api/v1/admin/users/{admin['user']['id']}",
        json={"is_superuser": False},
        headers=admin["headers"],
    )
    assert r.status_code == 400
    assert r.json()["code"] == 40001
