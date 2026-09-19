"""到期提醒（task_due_soon）：登录时惰性检查 + 幂等去重。

触发点（db-schema.md §4）：
- 登录成功后调用 check()
- 任务 PATCH 改 due_date/assignee 时对受影响 assignee 增量检查
- 幂等：同 task + task_due_soon + 未读 已存在则跳过
"""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from app.models.notification import Notification
from app.repositories.notification_repo import notification_repo
from app.repositories.task_repo import task_repo


class DueSoonService:
    def check(
        self,
        db: Session,
        user_id: uuid.UUID,
        *,
        resurface_since: datetime | None = None,
    ) -> list[Notification]:
        """扫描 assignee=user、due ∈ [now-5min, now+24h]、未完成的任务，生成未消费的提醒。

        去重二态：
        - resurface_since=None（登录惰性检查）：同 task 未读已存在则跳过（已读后可重触发）；
        - resurface_since=时刻（后台调度器）：该时刻之后已提醒过（无论已读未读）则跳过，
          防止调度器在用户每次标记已读后再次重发。
        """
        now = datetime.now(UTC)
        start = now - timedelta(minutes=5)
        end = now + timedelta(hours=24)
        tasks = task_repo.list_due_soon(db, user_id, start, end)
        created: list[Notification] = []
        for task in tasks:
            if resurface_since is not None:
                if notification_repo.exists_recent_due_soon(db, user_id, task.id, resurface_since):
                    continue
            elif notification_repo.exists_unread_due_soon(db, user_id, task.id):
                continue
            n = notification_repo.create(
                db,
                team_id=task.board.team_id,
                user_id=user_id,
                type="task_due_soon",
                payload={
                    "task_id": str(task.id),
                    "task_title": task.title,
                    "due_date": str(task.due_date) if task.due_date else None,
                },
            )
            created.append(n)
        return created


due_soon_service = DueSoonService()
