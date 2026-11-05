"""任务服务：CRUD、拖拽落位（position 批量更新）、通知触发。"""

import uuid

from sqlalchemy.orm import Session

from app.core.errors import bad_request, not_found
from app.models.task import Task
from app.models.user import User
from app.repositories.board_repo import board_repo
from app.repositories.label_repo import label_repo
from app.repositories.task_repo import task_repo
from app.repositories.team_repo import team_repo
from app.schemas.task import TaskCreateRequest, TaskUpdateRequest
from app.services.due_soon_service import due_soon_service
from app.services.notification_service import notification_service


class TaskService:
    def create(
        self, db: Session, board_id: uuid.UUID, team_id: uuid.UUID, data: TaskCreateRequest, actor: User
    ) -> Task:
        self._ensure_owned_board(db, board_id, team_id)
        self._ensure_column_belongs_to_board(db, data.column_id, board_id)
        if data.assignee_id:
            self._ensure_team_member(db, team_id, data.assignee_id)
        position = task_repo.max_position_in_column(db, data.column_id) + 1
        task = task_repo.create(
            db,
            board_id=board_id,
            column_id=data.column_id,
            title=data.title,
            description=data.description,
            assignee_id=data.assignee_id,
            priority=data.priority,
            status=data.status,
            position=position,
            due_date=data.due_date,
            start_date=data.start_date,
            created_by=actor.id,
        )
        db.flush()
        if data.label_ids:
            self._ensure_labels_belong_to_team(db, team_id, data.label_ids)
            label_repo.replace_task_labels(db, task.id, data.label_ids)

        notifications: list = []
        if data.assignee_id and data.assignee_id != actor.id:
            notifications.append(
                notification_service.create(
                    db,
                    team_id,
                    data.assignee_id,
                    "task_assigned",
                    {
                        "task_id": str(task.id),
                        "task_title": task.title,
                        "board_id": str(board_id),
                        "actor_id": str(actor.id),
                    },
                )
            )
        db.commit()

        # lazy='raise' 下响应序列化需要 assignee/board 关系，重新加载带关联对象
        task = task_repo.get_by_id(db, task.id)
        if task is None:
            raise not_found("任务不存在")

        self._publish_created_notifications(notifications)
        notification_service.publish_board_update(
            db, team_id, {"event": "task_created", "task_id": str(task.id), "board_id": str(board_id)}
        )
        if data.assignee_id:
            self._check_due_soon_and_publish(db, data.assignee_id)
        return task

    def list_by_board(
        self,
        db: Session,
        board_id: uuid.UUID,
        team_id: uuid.UUID,
        *,
        q: str | None = None,
        assignee_id: uuid.UUID | None = None,
        status: str | None = None,
        priority: str | None = None,
        label_id: uuid.UUID | None = None,
        column_id: uuid.UUID | None = None,
        page: int = 1,
        limit: int = 20,
    ) -> tuple[list[Task], int]:
        self._ensure_owned_board(db, board_id, team_id)
        return task_repo.list_by_board(
            db,
            board_id,
            q=q,
            assignee_id=assignee_id,
            status=status,
            priority=priority,
            label_id=label_id,
            column_id=column_id,
            page=page,
            limit=limit,
        )

    def list_my(
        self,
        db: Session,
        user_id: uuid.UUID,
        team_ids: list[uuid.UUID],
        *,
        q: str | None = None,
        status: str | None = None,
        page: int = 1,
        limit: int = 20,
    ) -> tuple[list[Task], int]:
        return task_repo.list_by_assignee(
            db, user_id, team_ids, q=q, status=status, page=page, limit=limit
        )

    def get(self, db: Session, task_id: uuid.UUID, team_id: uuid.UUID) -> Task:
        task = task_repo.get_by_id(db, task_id)
        if task is None or task.board.team_id != team_id:
            raise not_found("任务不存在")
        return task

    def update(
        self, db: Session, task_id: uuid.UUID, team_id: uuid.UUID, data: TaskUpdateRequest, actor: User
    ) -> Task:
        task = self.get(db, task_id, team_id)
        fields = data.model_fields_set
        old_assignee = task.assignee_id
        old_status = task.status

        if "column_id" in fields:
            self._ensure_column_belongs_to_board(db, data.column_id, task.board_id)
        if "assignee_id" in fields and data.assignee_id:
            self._ensure_team_member(db, team_id, data.assignee_id)

        if "title" in fields:
            task.title = data.title
        if "description" in fields:
            task.description = data.description
        if "column_id" in fields:
            task.column_id = data.column_id
        if "assignee_id" in fields:
            task.assignee_id = data.assignee_id
        if "priority" in fields:
            task.priority = data.priority
        if "status" in fields:
            task.status = data.status
        if "due_date" in fields:
            task.due_date = data.due_date
        if "start_date" in fields:
            task.start_date = data.start_date
        if "label_ids" in fields and data.label_ids is not None:
            self._ensure_labels_belong_to_team(db, team_id, data.label_ids)
            label_repo.replace_task_labels(db, task.id, data.label_ids)
        db.flush()
        if "label_ids" in fields and data.label_ids is not None:
            # 同上：刷新 labels 集合，避免 identity map 复用陈旧空集合
            db.refresh(task, ["labels"])

        notifications: list = []
        assignee_changed = "assignee_id" in fields and task.assignee_id != old_assignee
        if assignee_changed and task.assignee_id and task.assignee_id != actor.id:
            notifications.append(
                notification_service.create(
                    db,
                    team_id,
                    task.assignee_id,
                    "task_assigned",
                    {
                        "task_id": str(task.id),
                        "task_title": task.title,
                        "board_id": str(task.board_id),
                        "actor_id": str(actor.id),
                    },
                )
            )
        db.commit()

        self._publish_created_notifications(notifications)
        if "status" in fields and task.status != old_status:
            notification_service.publish_board_update(
                db,
                team_id,
                {
                    "event": "task_status_changed",
                    "task_id": str(task.id),
                    "board_id": str(task.board_id),
                    "status": task.status,
                },
            )
        if "assignee_id" in fields or "due_date" in fields:
            affected = task.assignee_id or old_assignee
            if affected:
                self._check_due_soon_and_publish(db, affected)
        return task

    def delete(self, db: Session, task_id: uuid.UUID, team_id: uuid.UUID) -> None:
        task = self.get(db, task_id, team_id)
        db.delete(task)
        db.commit()

    def move_position(
        self,
        db: Session,
        board_id: uuid.UUID,
        column_id: uuid.UUID,
        task_id: uuid.UUID,
        team_id: uuid.UUID,
        target_column_id: uuid.UUID,
        position: int,
        actor: User,
    ) -> Task:
        if target_column_id != column_id:
            raise bad_request("target_column_id 与路径不一致")
        self._ensure_owned_board(db, board_id, team_id)
        task = task_repo.get_by_id(db, task_id)
        if task is None or task.board_id != board_id:
            raise not_found("任务不存在")
        target_column = board_repo.get_column_by_id(db, column_id)
        if target_column is None or target_column.board_id != board_id:
            raise not_found("目标列不存在")

        from_column_id = task.column_id
        # 批量重排：源列/目标列任务全部重写 position（MVP 规模小，最简正确）
        # 目标列：排除被拖任务自身后按 position 插入（与前端乐观更新同口径）
        tasks_in_target = [t for t in task_repo.list_by_column(db, column_id) if t.id != task.id]
        pos = max(0, min(position, len(tasks_in_target)))
        tasks_in_target.insert(pos, task)

        # 跨列时源列同样需要重排：移除被拖任务后把剩余任务的 position 压紧，
        # 否则源列会留下 position 空洞（如 0,2,3），后续按 position 排序会乱序。
        if from_column_id != column_id:
            tasks_in_source = [
                t for t in task_repo.list_by_column(db, from_column_id) if t.id != task.id
            ]
            for idx, t in enumerate(tasks_in_source):
                t.position = idx

        task.column_id = column_id
        for idx, t in enumerate(tasks_in_target):
            t.position = idx
        db.flush()

        notifications: list = []
        if task.assignee_id and task.assignee_id != actor.id:
            notifications.append(
                notification_service.create(
                    db,
                    team_id,
                    task.assignee_id,
                    "task_moved",
                    {
                        "task_id": str(task.id),
                        "task_title": task.title,
                        "board_id": str(board_id),
                        "from_column_id": str(from_column_id),
                        "to_column_id": str(column_id),
                        "actor_id": str(actor.id),
                    },
                )
            )
        db.commit()

        self._publish_created_notifications(notifications)
        notification_service.publish_board_update(
            db,
            team_id,
            {
                "event": "task_moved",
                "task_id": str(task.id),
                "board_id": str(board_id),
                "column_id": str(column_id),
                "position": position,
            },
        )
        return task

    # ---- 内部工具 ----
    @staticmethod
    def _ensure_owned_board(db: Session, board_id: uuid.UUID, team_id: uuid.UUID) -> None:
        board = board_repo.get_by_id(db, board_id)
        if board is None or board.team_id != team_id:
            raise not_found("看板不存在")

    @staticmethod
    def _ensure_column_belongs_to_board(db: Session, column_id: uuid.UUID, board_id: uuid.UUID) -> None:
        column = board_repo.get_column_by_id(db, column_id)
        if column is None or column.board_id != board_id:
            raise bad_request("目标列不属于该看板")

    @staticmethod
    def _ensure_team_member(db: Session, team_id: uuid.UUID, user_id: uuid.UUID) -> None:
        member = team_repo.get_member(db, team_id, user_id)
        if member is None:
            raise bad_request("指定的负责人不在团队成员中")

    @staticmethod
    def _ensure_labels_belong_to_team(
        db: Session, team_id: uuid.UUID, label_ids: list[uuid.UUID]
    ) -> None:
        if not label_ids:
            return
        owned = {lbl.id for lbl in label_repo.list_by_team(db, team_id)}
        unknown = [lid for lid in label_ids if lid not in owned]
        if unknown:
            raise bad_request("存在不属于本团队的标签")

    @staticmethod
    def _publish_created_notifications(notifications: list) -> None:
        for n in notifications:
            notification_service.publish(n)

    @staticmethod
    def _check_due_soon_and_publish(db: Session, user_id: uuid.UUID) -> None:
        created = due_soon_service.check(db, user_id)
        if created:
            db.commit()
            for n in created:
                notification_service.publish(n)


task_service = TaskService()
