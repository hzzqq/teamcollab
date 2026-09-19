"""后台调度器：定时到期提醒（替代仅登录惰性检查，AC-08 实时性补全）。

- 由 FastAPI lifespan 启动/停止的 asyncio 任务；
- 每轮扫描窗口内（now-5min ~ now+24h）有临近到期任务的全部 assignee，
  逐人执行 due_soon_service.check（带重提醒窗口去重，防已读后每轮重发）；
- 扫描为同步 DB 操作，经 asyncio.to_thread 执行避免阻塞事件循环；
- 每轮独立 Session，异常记日志不中断调度。
"""

import asyncio
import logging
from datetime import UTC, datetime, timedelta

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.repositories.task_repo import task_repo
from app.services.due_soon_service import due_soon_service
from app.services.notification_service import notification_service

logger = logging.getLogger("app.core.scheduler")


def scan_once() -> int:
    """同步执行一轮到期提醒扫描，返回本轮新建通知数（独立会话、自行提交）。"""
    settings = get_settings()
    now = datetime.now(UTC)
    start = now - timedelta(minutes=5)
    end = now + timedelta(hours=24)
    resurface_since = now - timedelta(hours=settings.due_soon_resurface_hours)
    created: list = []
    with SessionLocal() as db:
        assignee_ids = task_repo.list_due_soon_assignees(db, start, end)
        for uid in assignee_ids:
            created.extend(
                due_soon_service.check(db, uid, resurface_since=resurface_since)
            )
        db.commit()
    for n in created:
        notification_service.publish(n)
    return len(created)


class DueSoonScheduler:
    def __init__(self) -> None:
        self._task: asyncio.Task | None = None

    def start(self) -> None:
        settings = get_settings()
        if not settings.scheduler_enabled:
            logger.info("后台调度器未启用（SCHEDULER_ENABLED=false）")
            return
        if self._task is not None and not self._task.done():
            return
        self._task = asyncio.create_task(self._run(), name="due-soon-scheduler")
        logger.info(
            "后台调度器已启动：到期提醒每 %ss 扫描一次，重提醒窗口 %sh",
            settings.scheduler_due_soon_interval_seconds,
            settings.due_soon_resurface_hours,
        )

    async def stop(self) -> None:
        if self._task is None:
            return
        self._task.cancel()
        try:
            await self._task
        except asyncio.CancelledError:
            pass
        self._task = None
        logger.info("后台调度器已停止")

    async def _run(self) -> None:
        settings = get_settings()
        interval = settings.scheduler_due_soon_interval_seconds
        while True:
            await asyncio.sleep(interval)
            try:
                count = await asyncio.to_thread(scan_once)
                if count:
                    logger.info("到期提醒扫描完成：新建 %s 条通知", count)
            except Exception:
                logger.exception("到期提醒扫描失败（下一轮重试）")


due_soon_scheduler = DueSoonScheduler()
