"""后台调度器（定时到期提醒）集成测试：调度生成、重提醒窗口幂等、与登录惰性检查共存。

语义约定：
- 任务创建/指派路径即时生成第一条 task_due_soon（既有行为）；
- 调度器每轮扫描，但同任务在重提醒窗口（默认 12h）内已提醒过（无论已读未读）则跳过，
  即「窗口过期且任务仍未完成」才会再次提醒，防已读后每轮重发；
- 登录惰性检查语义不变：同任务未读去重、已读后重新触发。
"""

from sqlalchemy import text

from app.core.db import engine
from tests.conftest import register_user
from tests.test_due_soon import (
    _create_due_task,
    _make_board_column,
    _unread_due_soon,
)


def _setup_due_task(client):
    owner = register_user(client, display_name="调度Owner")
    member = register_user(client, display_name="调度Member")
    team_id = owner["team"]["id"]

    r = client.post(
        f"/api/v1/teams/{team_id}/members",
        json={"email": member["email"], "role": "member"},
        headers=owner["headers"],
    )
    assert r.status_code == 201, r.text

    board, column = _make_board_column(client, owner["headers"], team_id)
    task = _create_due_task(client, owner["headers"], board, column, member["user"]["id"])
    return owner, member, task


def _backdate_due_soon(user_id: str, hours: int) -> None:
    """把该用户全部 task_due_soon 的 created_at 回拨（模拟窗口早已过期）。"""
    with engine.begin() as conn:
        conn.execute(
            text(
                "UPDATE notifications SET created_at = now() - (:h || ' hours')::interval "
                "WHERE user_id = :uid AND type = 'task_due_soon'"
            ),
            {"h": str(hours), "uid": user_id},
        )


def _all_due_soon_count(client, headers) -> int:
    r = client.get("/api/v1/notifications", headers=headers)
    assert r.status_code == 200, r.text
    return sum(1 for n in r.json()["data"]["items"] if n["type"] == "task_due_soon")


def test_scheduler_scan_creates_reminder_after_window(client):
    """窗口过期（>12h）且任务未完成 → 调度器扫描生成新提醒。"""
    from app.core.scheduler import scan_once

    owner, member, task = _setup_due_task(client)

    # 创建路径已即时生成一条提醒；回拨 13h 模拟「上一轮提醒已过窗口」，并清空未读
    _backdate_due_soon(member["user"]["id"], hours=13)
    client.post("/api/v1/notifications/read-all", headers=member["headers"])

    created = scan_once()
    assert created >= 1

    due_soon = _unread_due_soon(client, member["headers"])
    assert len(due_soon) == 1, due_soon
    assert due_soon[0]["payload"]["task_id"] == task["id"]


def test_scheduler_scan_idempotent_within_resurface_window(client):
    """窗口内重复扫描不重发（即使已读），防调度器噪声。"""
    from app.core.scheduler import scan_once

    owner, member, _ = _setup_due_task(client)

    # 回拨后首轮扫描 → 生成新提醒
    _backdate_due_soon(member["user"]["id"], hours=13)
    scan_once()

    # 已读后再扫描：新提醒在 12h 窗口内 → 不重发
    client.post("/api/v1/notifications/read-all", headers=member["headers"])
    before = _all_due_soon_count(client, member["headers"])
    scan_once()
    assert _all_due_soon_count(client, member["headers"]) == before

    # 登录惰性检查仍按原语义：无未读 → 重新触发（保证用户不会漏看）
    client.post(
        "/api/v1/auth/login",
        data={"username": member["email"], "password": member["password"]},
    )
    assert len(_unread_due_soon(client, member["headers"])) == 1


def test_scheduler_and_login_check_coexist_no_duplicate(client):
    """调度器已生成未读提醒时，登录惰性检查不重复生成。"""
    from app.core.scheduler import scan_once

    owner, member, task = _setup_due_task(client)

    # 创建路径的提醒即未读存在；直接登录 → 不重复
    client.post(
        "/api/v1/auth/login",
        data={"username": member["email"], "password": member["password"]},
    )
    assert len(_unread_due_soon(client, member["headers"])) == 1

    # 调度器扫描：窗口内已提醒过 → 跳过，不会生成第二条
    scan_once()
    assert len(_unread_due_soon(client, member["headers"])) == 1
    assert _unread_due_soon(client, member["headers"])[0]["payload"]["task_id"] == task["id"]


def test_scheduler_ignores_far_future(client):
    """窗口外（60 天后）到期任务不被调度器提醒。"""
    from datetime import date, timedelta

    from app.core.scheduler import scan_once

    owner = register_user(client, display_name="远期Owner")
    member = register_user(client, display_name="远期Member")
    team_id = owner["team"]["id"]
    r = client.post(
        f"/api/v1/teams/{team_id}/members",
        json={"email": member["email"], "role": "member"},
        headers=owner["headers"],
    )
    assert r.status_code == 201, r.text
    board, column = _make_board_column(client, owner["headers"], team_id)
    r = client.post(
        f"/api/v1/boards/{board['id']}/tasks",
        json={
            "title": "远期任务",
            "column_id": column["id"],
            "assignee_id": member["user"]["id"],
            "due_date": (date.today() + timedelta(days=60)).isoformat(),
        },
        headers=owner["headers"],
    )
    assert r.status_code == 201, r.text

    scan_once()
    assert _unread_due_soon(client, member["headers"]) == []


def test_scheduler_scan_skipped_when_lock_held(client):
    """多实例互斥：advisory lock 被其他实例持有时，本轮扫描直接跳过（不重复提醒）。"""
    from app.core.scheduler import _DUE_SOON_SCAN_LOCK_KEY, scan_once

    owner, member, _ = _setup_due_task(client)
    _backdate_due_soon(member["user"]["id"], hours=13)
    client.post("/api/v1/notifications/read-all", headers=member["headers"])

    # 模拟另一个实例持有锁（连接级事务锁，with 结束才释放）
    with engine.connect() as conn:
        conn.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": _DUE_SOON_SCAN_LOCK_KEY})
        assert scan_once() == 0
        assert _unread_due_soon(client, member["headers"]) == []

    # 锁释放后扫描恢复正常
    assert scan_once() >= 1
    assert len(_unread_due_soon(client, member["headers"])) == 1
