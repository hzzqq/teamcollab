"""标签服务：团队级 CRUD + 任务标签赋值（同团队校验）。"""

import uuid

from sqlalchemy.orm import Session

from app.core.errors import bad_request, not_found
from app.models.label import Label
from app.repositories.label_repo import label_repo
from app.repositories.task_repo import task_repo
from app.schemas.label import LabelCreateRequest, LabelUpdateRequest, TaskLabelsRequest


class LabelService:
    def list_labels(self, db: Session, team_id: uuid.UUID) -> list[Label]:
        return label_repo.list_by_team(db, team_id)

    def create_label(
        self, db: Session, team_id: uuid.UUID, data: LabelCreateRequest
    ) -> Label:
        label = label_repo.create(db, team_id, data.name, data.color)
        db.commit()
        return label

    def update_label(
        self,
        db: Session,
        team_id: uuid.UUID,
        label_id: uuid.UUID,
        data: LabelUpdateRequest,
    ) -> Label:
        label = self._get_owned(db, team_id, label_id)
        if data.name is not None:
            label.name = data.name
        if data.color is not None:
            label.color = data.color
        db.commit()
        return label

    def delete_label(self, db: Session, team_id: uuid.UUID, label_id: uuid.UUID) -> Label:
        label = self._get_owned(db, team_id, label_id)
        db.delete(label)
        db.commit()
        return label

    def set_task_labels(
        self, db: Session, team_id: uuid.UUID, task_id: uuid.UUID, req: TaskLabelsRequest
    ) -> Label:
        """整体覆盖任务标签；校验任务与标签均属同一团队。返回带 labels 的任务。"""
        task = task_repo.get_by_id(db, task_id)
        if task is None or task.board.team_id != team_id:
            raise not_found("任务不存在")
        if req.label_ids:
            owned = {lbl.id for lbl in label_repo.list_by_team(db, team_id)}
            unknown = [lid for lid in req.label_ids if lid not in owned]
            if unknown:
                raise bad_request("存在不属于本团队的标签")
        label_repo.replace_task_labels(db, task_id, req.label_ids)
        db.commit()
        # 同一会话内 identity map 会复用原对象，且其 labels 集合已在加载时置空；
        # 必须显式 refresh 该集合以反映新建的关联。
        db.refresh(task, ["labels"])
        return task

    def _get_owned(
        self, db: Session, team_id: uuid.UUID, label_id: uuid.UUID
    ) -> Label:
        label = label_repo.get_by_id(db, label_id)
        if label is None or label.team_id != team_id:
            raise not_found("标签不存在")
        return label


label_service = LabelService()
