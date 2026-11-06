"""任务操作服务：跨看板移动 + 批量操作。

租户规则：tasks 表没有 team_id，归属一律经 task.board.team_id 判断；
批量操作先做「全量校验」再写，避免部分成功造成数据不一致。
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.errors import bad_request, forbidden, not_found
from app.models.task import Task
from app.models.user import User
from app.repositories.board_repo import board_repo
from app.repositories.task_repo import task_repo
from app.repositories.team_repo import team_repo
from app.schemas.task_ops import BatchTaskRequest, MoveToBoardRequest
from app.services.notification_service import notification_service
from app.services.task_activity_service import task_activity_service

ROLE_MEMBER_PLUS = ("owner", "admin", "member")


def _board_label(board_name: str, column_name: str | None) -> str:
    return f"{board_name} / {column_name or '已删除的列'}"


class TaskOpsService:
    def move_to_board(
        self,
        db: Session,
        task_id: uuid.UUID,
        team_id: uuid.UUID,
        req: MoveToBoardRequest,
        actor: User,
    ) -> Task:
        task = task_repo.get_by_id(db, task_id)
        if task is None or task.board.team_id != team_id:
            raise not_found("任务不存在")

        target_board = board_repo.get_by_id(db, req.board_id)
        if target_board is None or target_board.team_id != team_id:
            # 跨团队统一 404，不泄露看板存在性
            raise not_found("目标看板不存在")
        target_column = board_repo.get_column_by_id(db, req.column_id)
        if target_column is None or target_column.board_id != req.board_id:
            raise bad_request("目标列不属于该看板")

        from_board_id = task.board_id
        from_column_id = task.column_id
        from_column = board_repo.get_column_by_id(db, from_column_id)
        from_label = _board_label(task.board.name, from_column.name if from_column else None)
        to_label = _board_label(target_board.name, target_column.name)

        # 源列压紧（换列时），目标列先移除自身再按 position 插入
        if from_column_id != req.column_id:
            source = [t for t in task_repo.list_by_column(db, from_column_id) if t.id != task.id]
            for idx, row in enumerate(source):
                row.position = idx
        target = [t for t in task_repo.list_by_column(db, req.column_id) if t.id != task.id]
        pos = max(0, min(req.position, len(target)))
        target.insert(pos, task)

        task.board_id = req.board_id
        task.column_id = req.column_id
        for idx, row in enumerate(target):
            row.position = idx
        db.flush()

        if from_board_id != req.board_id or from_column_id != req.column_id:
            task_activity_service.record_moved(
                db,
                task_id=task.id,
                team_id=team_id,
                actor=actor,
                from_column=from_label,
                to_column=to_label,
            )
        db.commit()

        # board_id 改了，重新加载带关联的对象（identity map 里仍是旧 board）
        refreshed = task_repo.get_by_id(db, task.id)
        if refreshed is None:
            raise not_found("任务不存在")
        for bid in {from_board_id, req.board_id}:
            notification_service.publish_board_update(
                db,
                team_id,
                {"event": "task_moved", "task_id": str(task.id), "board_id": str(bid)},
            )
        return refreshed

    def batch(self, db: Session, user: User, req: BatchTaskRequest) -> int:
        ids = list(dict.fromkeys(req.task_ids))
        rows = list(
            db.scalars(
                select(Task)
                .options(joinedload(Task.board), selectinload(Task.labels))
                .where(Task.id.in_(ids))
            )
        )
        # 数量不符说明有不存在的任务（或跨租户不可见），整批拒绝
        if len(rows) != len(ids):
            raise not_found("任务不存在")

        checked_teams: set[uuid.UUID] = set()
        for task in rows:
            tid = task.board.team_id
            if tid in checked_teams:
                continue
            member = team_repo.get_member(db, tid, user.id)
            if member is None:
                raise not_found("任务不存在")
            if member.role not in ROLE_MEMBER_PLUS:
                raise forbidden("无权限批量修改任务")
            checked_teams.add(tid)

        if req.action == "delete":
            for task in rows:
                db.delete(task)
            db.commit()
            return len(rows)

        field = {
            "set_status": "status",
            "set_priority": "priority",
            "set_assignee": "assignee_id",
        }[req.action]
        new_raw: str | uuid.UUID | None
        if req.action == "set_assignee":
            new_raw = uuid.UUID(req.value) if req.value else None
            if new_raw is not None:
                # 负责人必须是任务所在团队的成员
                for task in rows:
                    if team_repo.get_member(db, task.board.team_id, new_raw) is None:
                        raise bad_request("指定的负责人不在团队成员中")
        else:
            new_raw = req.value

        for task in rows:
            old_raw = getattr(task, field)
            if old_raw == new_raw:
                continue
            setattr(task, field, new_raw)
            task_activity_service.record_update(
                db,
                task_id=task.id,
                team_id=task.board.team_id,
                actor=user,
                before={field: old_raw},
                after={field: new_raw},
            )
        db.commit()
        return len(rows)


task_ops_service = TaskOpsService()
