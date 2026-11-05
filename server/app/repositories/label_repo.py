"""标签数据访问（团队级作用域，禁全表扫描）。"""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.label import Label, task_labels


class LabelRepo:
    def get_by_id(self, db: Session, label_id: uuid.UUID) -> Label | None:
        return db.scalar(select(Label).where(Label.id == label_id))

    def list_by_team(self, db: Session, team_id: uuid.UUID) -> list[Label]:
        return list(
            db.scalars(
                select(Label)
                .where(Label.team_id == team_id)
                .order_by(Label.created_at.asc(), Label.name.asc())
            )
        )

    def create(self, db: Session, team_id: uuid.UUID, name: str, color: str) -> Label:
        label = Label(team_id=team_id, name=name, color=color)
        db.add(label)
        db.flush()
        return label

    def replace_task_labels(
        self, db: Session, task_id: uuid.UUID, label_ids: list[uuid.UUID]
    ) -> None:
        """整体覆盖某任务的标签关联。直接操作关联表，绕开 lazy='raise' 关系集合。"""
        db.execute(task_labels.delete().where(task_labels.c.task_id == task_id))
        for label_id in label_ids:
            db.execute(
                task_labels.insert().values(task_id=task_id, label_id=label_id)
            )
        db.flush()


label_repo = LabelRepo()
