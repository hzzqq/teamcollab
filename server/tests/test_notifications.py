"""通知：落库、历史列表、SSE 流、任务分配通知、到期提醒。"""

import asyncio
from datetime import date, timedelta

from app.api.v1.notifications import _event_stream
from app.realtime.broker import broker


def test_notification_list_and_unread(client, team_with_members):
    t = team_with_members
    member = t["member"]
    # conftest 中 owner 创建任务并指派给 member → 应生成 task_assigned
    resp = client.get("/api/v1/notifications", headers=member["headers"])
    assert resp.status_code == 200
    data = resp.json()["data"]
    types = [n["type"] for n in data["items"]]
    assert "task_assigned" in types
    # unread 过滤
    resp = client.get("/api/v1/notifications?unread=true", headers=member["headers"])
    assert resp.status_code == 200
    assert all(n["is_read"] is False for n in resp.json()["data"]["items"])


def test_task_assigned_notification_payload(client, team_with_members):
    t = team_with_members
    member = t["member"]
    notif = client.get("/api/v1/notifications", headers=member["headers"]).json()["data"]["items"]
    assigned = [n for n in notif if n["type"] == "task_assigned"]
    assert assigned
    assert assigned[0]["payload"]["task_id"] == t["task"]["id"]
    assert assigned[0]["payload"]["task_title"] == "任务A"
    assert assigned[0]["payload"]["board_id"] == t["board"]["id"]


def test_due_soon_notification_on_create(client, team_with_members):
    t = team_with_members
    member = t["member"]
    due = (date.today() + timedelta(days=1)).isoformat()
    resp = client.post(
        f"/api/v1/boards/{t['board']['id']}/tasks",
        json={
            "title": "临近截止的任务",
            "column_id": t["columns"][0],
            "assignee_id": member["user"]["id"],
            "due_date": due,
        },
        headers=t["owner"]["headers"],
    )
    assert resp.status_code == 201
    notif = client.get("/api/v1/notifications", headers=member["headers"]).json()["data"]["items"]
    assert any(n["type"] == "task_due_soon" for n in notif)


def test_sse_stream_bad_token(client):
    resp = client.get("/api/v1/notifications/stream", params={"token": "invalid-token"})
    assert resp.status_code == 401
    assert resp.json()["code"] == 40101


def test_sse_stream_connected_event():
    """SSE connected 事件契约：直接迭代 generator 验证。

    注：不用 TestClient 流式读取——其对长连接 SSE 流的行读取在 portal
    线程下会挂起（已知兼容性问题）；真实服务器上 curl -N 已验证端点正常，
    此处改为验证 generator 首帧契约（事件格式与即时性）。
    """

    async def _probe() -> str:
        gen = _event_stream("probe-user")
        try:
            return await gen.__anext__()
        finally:
            await gen.aclose()

    first = asyncio.run(_probe())
    assert "connected" in first
    assert '"ok": true' in first


def test_broker_publish_subscribe():
    """进程内 broker：发布方（同步线程）→ 订阅队列（事件循环）确定性验证。"""
    queue: asyncio.Queue = asyncio.Queue()
    loop = asyncio.new_event_loop()
    try:
        broker.subscribe("user-x", queue, loop)
        broker.publish("user-x", {"type": "task_assigned", "payload": {"task_id": "1"}})
        event = loop.run_until_complete(asyncio.wait_for(queue.get(), timeout=2))
        assert event["type"] == "task_assigned"
        assert event["payload"]["task_id"] == "1"
    finally:
        broker.unsubscribe("user-x", queue)
        loop.close()


def test_http_write_publishes_to_broker(client, team_with_members):
    """HTTP 写操作 → 服务层 → broker 发布 → 订阅队列收到（不依赖真实 SSE 长连接）。"""
    t = team_with_members
    member = t["member"]
    queue: asyncio.Queue = asyncio.Queue()
    loop = asyncio.new_event_loop()
    try:
        broker.subscribe(str(member["user"]["id"]), queue, loop)
        # owner 给 member 建新任务 → task_assigned 事件
        resp = client.post(
            f"/api/v1/boards/{t['board']['id']}/tasks",
            json={
                "title": "触发推送的任务",
                "column_id": t["columns"][0],
                "assignee_id": member["user"]["id"],
            },
            headers=t["owner"]["headers"],
        )
        assert resp.status_code == 201
        event = loop.run_until_complete(asyncio.wait_for(queue.get(), timeout=3))
        assert event["type"] == "task_assigned"
        assert event["payload"]["task_title"] == "触发推送的任务"
    finally:
        broker.unsubscribe(str(member["user"]["id"]), queue)
        loop.close()


def test_mark_all_read(client, team_with_members):
    """全部已读落库：member 有 task_assigned 未读 → read-all 后 is_read 全 true 且持久。"""
    t = team_with_members
    member = t["member"]

    # 前置：存在未读
    r = client.get("/api/v1/notifications?unread=true", headers=member["headers"])
    assert r.status_code == 200
    assert len(r.json()["data"]["items"]) >= 1, "fixture 应产生未读通知"

    # 全部已读
    r = client.post("/api/v1/notifications/read-all", headers=member["headers"])
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["ok"] is True and data["updated"] >= 1

    # 验证落库：unread 过滤应为空；普通列表 is_read 全 true
    r = client.get("/api/v1/notifications?unread=true", headers=member["headers"])
    assert r.status_code == 200
    assert r.json()["data"]["items"] == []

    r = client.get("/api/v1/notifications", headers=member["headers"])
    assert r.status_code == 200
    assert all(n["is_read"] is True for n in r.json()["data"]["items"])

    # 幂等：再次调用 updated=0
    r = client.post("/api/v1/notifications/read-all", headers=member["headers"])
    assert r.json()["data"]["updated"] == 0

