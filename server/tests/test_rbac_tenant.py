"""RBAC 与多租户隔离（AC-09 / AC-10 / AC-11）。"""

from tests.conftest import register_user


def test_viewer_cannot_edit_task(client, team_with_members):
    t = team_with_members
    resp = client.patch(
        f"/api/v1/tasks/{t['task']['id']}",
        json={"title": "越权改名"},
        headers=t["viewer"]["headers"],
    )
    assert resp.status_code == 403
    assert resp.json()["code"] == 40301


def test_viewer_can_read(client, team_with_members):
    t = team_with_members
    resp = client.get(f"/api/v1/boards/{t['board']['id']}", headers=t["viewer"]["headers"])
    assert resp.status_code == 200


def test_cross_team_board_404(client, team_with_members):
    t = team_with_members
    outsider = register_user(client)  # 另一团队 owner
    resp = client.get(f"/api/v1/boards/{t['board']['id']}", headers=outsider["headers"])
    assert resp.status_code == 404
    assert resp.json()["code"] == 40401


def test_cross_team_task_404(client, team_with_members):
    t = team_with_members
    outsider = register_user(client)
    resp = client.get(f"/api/v1/tasks/{t['task']['id']}", headers=outsider["headers"])
    assert resp.status_code == 404
    assert resp.json()["code"] == 40401


def test_cross_team_members_404(client, team_with_members):
    t = team_with_members
    outsider = register_user(client)
    resp = client.get(f"/api/v1/teams/{t['team_id']}/members", headers=outsider["headers"])
    assert resp.status_code == 404
    assert resp.json()["code"] == 40401


def test_cross_team_comment_404(client, team_with_members):
    t = team_with_members
    outsider = register_user(client)
    resp = client.post(
        f"/api/v1/tasks/{t['task']['id']}/comments",
        json={"content": "跨团队评论"},
        headers=outsider["headers"],
    )
    assert resp.status_code == 404
    assert resp.json()["code"] == 40401


def test_role_change_takes_effect_immediately(client, team_with_members):
    """AC-10：角色实时查询，改角色后同一 token 立即生效（不依赖过期 claim）。"""
    t = team_with_members
    viewer = t["viewer"]
    # viewer 越权编辑 → 40301
    resp = client.patch(
        f"/api/v1/tasks/{t['task']['id']}",
        json={"title": "越权"},
        headers=viewer["headers"],
    )
    assert resp.status_code == 403

    # owner 把 viewer 提升为 member（同一 token）
    resp = client.patch(
        f"/api/v1/teams/{t['team_id']}/members/{viewer['user']['id']}/role",
        json={"role": "member"},
        headers=t["owner"]["headers"],
    )
    assert resp.status_code == 200

    # 同一 access token 现在可以编辑
    resp = client.patch(
        f"/api/v1/tasks/{t['task']['id']}",
        json={"title": "升级后可编辑"},
        headers=viewer["headers"],
    )
    assert resp.status_code == 200


def test_no_tenant_leak_in_404_message(client, team_with_members):
    """40401 响应不泄露资源存在性（跨团队与不存在返回同样消息）。"""
    t = team_with_members
    outsider = register_user(client)
    resp_existing = client.get(f"/api/v1/boards/{t['board']['id']}", headers=outsider["headers"])
    resp_missing = client.get(
        "/api/v1/boards/00000000-0000-0000-0000-000000000000",
        headers=outsider["headers"],
    )
    assert resp_existing.status_code == 404 and resp_missing.status_code == 404
    assert resp_existing.json()["message"] == resp_missing.json()["message"]
