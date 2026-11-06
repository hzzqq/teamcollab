"""任务活动流服务：写操作埋点 + 时间线读取（带租户校验）。

埋点约定：
- 日志与业务写操作在「同一个事务」里提交，业务成功但日志丢失不会出现。
- 值统一落人类可读字符串（status/priority 中文、assignee 人名、column 列名），
  前端只负责拼句子，不需要为了渲染再反查。
- 无实质变化的字段不记日志（PATCH 幂等不会刷屏）。
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.core.errors import not_found
from app.models.task_activity import TaskActivity
from app.models.user import User
from app.repositories.board_repo import board_repo
from app.repositories.task_activity_repo import task_activity_repo
from app.repositories.task_repo import task_repo
from app.repositories.user_repo import user_repo

STATUS_LABEL = {"todo": "待办", "in_progress": "进行中", "done": "已完成"}
PRIORITY_LABEL = {"low": "低", "medium": "中", "high": "高", "urgent": "紧急"}

# PATCH 里被追踪的字段顺序即时间线里的展示顺序
TRACKED_FIELDS = (
    "title",
    "description",
    "status",
    "priority",
    "assignee_id",
    "column_id",
    "start_date",
    "due_date",
    "labels",
    "checklist",
)


class TaskActivityService:
    # ---- 值格式化 ----
    @staticmethod
    def describe(db: Session, field: str, value: Any) -> str:
        """把原始字段值转成审计文本；None / 空串统一为「空」。"""
        if value is None or value == "":
            return "空"
        if field == "status":
            return STATUS_LABEL.get(str(value), str(value))
        if field == "priority":
            return PRIORITY_LABEL.get(str(value), str(value))
        if field == "assignee_id":
            try:
                user = user_repo.get_by_id(db, uuid.UUID(str(value)))
            except ValueError:
                return str(value)
            return user.display_name if user else "已移除的账号"
        if field == "column_id":
            try:
                column = board_repo.get_column_by_id(db, uuid.UUID(str(value)))
            except ValueError:
                return str(value)
            return column.name if column else "已删除的列"
        if isinstance(value, (date, datetime)):
            return value.isoformat()
        text = str(value).strip()
        return f"{text[:160]}…" if len(text) > 160 else (text or "空")

    # ---- 写入 ----
    def _add(
        self,
        db: Session,
        *,
        task_id: uuid.UUID,
        team_id: uuid.UUID,
        actor: User,
        action: str,
        field: str | None = None,
        old_value: str | None = None,
        new_value: str | None = None,
        created_at: datetime | None = None,
    ) -> TaskActivity:
        return task_activity_repo.add(
            db,
            task_id=task_id,
            team_id=team_id,
            actor_id=actor.id,
            actor_name=actor.display_name,
            action=action,
            field=field,
            old_value=old_value,
            new_value=new_value,
            created_at=created_at,
        )

    def record_created(
        self, db: Session, *, task_id: uuid.UUID, team_id: uuid.UUID, actor: User, title: str
    ) -> None:
        self._add(
            db,
            task_id=task_id,
            team_id=team_id,
            actor=actor,
            action="created",
            new_value=title,
        )

    def record_moved(
        self,
        db: Session,
        *,
        task_id: uuid.UUID,
        team_id: uuid.UUID,
        actor: User,
        from_column: str,
        to_column: str,
    ) -> None:
        self._add(
            db,
            task_id=task_id,
            team_id=team_id,
            actor=actor,
            action="moved",
            field="column",
            old_value=from_column,
            new_value=to_column,
        )

    def record_comment(
        self, db: Session, *, task_id: uuid.UUID, team_id: uuid.UUID, actor: User, content: str
    ) -> None:
        self._add(
            db,
            task_id=task_id,
            team_id=team_id,
            actor=actor,
            action="comment_added",
            new_value=content[:80],
        )

    def record_update(
        self,
        db: Session,
        *,
        task_id: uuid.UUID,
        team_id: uuid.UUID,
        actor: User,
        before: dict[str, Any],
        after: dict[str, Any],
    ) -> int:
        """逐字段 diff，返回写入的日志条数（无变化返回 0）。"""
        changes: list[tuple[str, str, str]] = []
        for field in TRACKED_FIELDS:
            old_raw, new_raw = before.get(field), after.get(field)
            if old_raw == new_raw:
                continue
            changes.append(
                (field, self.describe(db, field, old_raw), self.describe(db, field, new_raw))
            )
        if not changes:
            return 0

        # 同事务内 PG now() 恒定，显式给每条日志毫秒级递增时间保证倒序稳定
        base = datetime.now(timezone.utc)
        for idx, (field, old_text, new_text) in enumerate(changes):
            self._add(
                db,
                task_id=task_id,
                team_id=team_id,
                actor=actor,
                action="field_changed",
                field=field,
                old_value=old_text,
                new_value=new_text,
                created_at=base + timedelta(milliseconds=idx),
            )
        return len(changes)

    # ---- 读取 ----
    def list_activities(
        self, db: Session, task_id: uuid.UUID, team_id: uuid.UUID, limit: int = 50
    ) -> tuple[list[TaskActivity], int]:
        task = task_repo.get_by_id(db, task_id)
        if task is None or task.board.team_id != team_id:
            raise not_found("任务不存在")
        return (
            task_activity_repo.list_by_task(db, task_id, limit),
            task_activity_repo.count_by_task(db, task_id),
        )


task_activity_service = TaskActivityService()
