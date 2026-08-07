"""评论 + @提及 冒烟测试。"""


def test_comment_create_and_list(client, team_with_members):
    t = team_with_members
    task_id = t["task"]["id"]
    resp = client.post(
        f"/api/v1/tasks/{task_id}/comments",
        json={"content": "第一条评论"},
        headers=t["owner"]["headers"],
    )
    assert resp.status_code == 201
    assert resp.json()["data"]["content"] == "第一条评论"

    resp = client.get(f"/api/v1/tasks/{task_id}/comments", headers=t["owner"]["headers"])
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["total"] == 1
    assert data["items"][0]["author"]["display_name"] == t["owner"]["display_name"]


def test_comment_mention_notifies(client, team_with_members):
    t = team_with_members
    task_id = t["task"]["id"]
    member = t["member"]

    # @ 用 display_name 提及 member
    resp = client.post(
        f"/api/v1/tasks/{task_id}/comments",
        json={"content": f"请 @{member['display_name']} 确认一下"},
        headers=t["owner"]["headers"],
    )
    assert resp.status_code == 201
    mentions = resp.json()["data"]["mentions"]
    assert member["user"]["id"] in mentions

    # member 收到 comment_added 通知
    notif = client.get("/api/v1/notifications", headers=member["headers"])
    assert notif.status_code == 200
    types = [n["type"] for n in notif.json()["data"]["items"]]
    assert "comment_added" in types


def test_comment_mention_by_email_prefix(client, team_with_members):
    t = team_with_members
    member = t["member"]
    email_prefix = member["email"].split("@")[0]
    resp = client.post(
        f"/api/v1/tasks/{t['task']['id']}/comments",
        json={"content": f"看这里 @{email_prefix}"},
        headers=t["owner"]["headers"],
    )
    assert resp.status_code == 201
    assert member["user"]["id"] in resp.json()["data"]["mentions"]


def test_comment_too_long(client, team_with_members):
    t = team_with_members
    resp = client.post(
        f"/api/v1/tasks/{t['task']['id']}/comments",
        json={"content": "长" * 2001},
        headers=t["owner"]["headers"],
    )
    assert resp.status_code == 400
    assert resp.json()["code"] == 40001


def test_viewer_cannot_comment(client, team_with_members):
    resp = client.post(
        f"/api/v1/tasks/{team_with_members['task']['id']}/comments",
        json={"content": "越权评论"},
        headers=team_with_members["viewer"]["headers"],
    )
    assert resp.status_code == 403
    assert resp.json()["code"] == 40301
