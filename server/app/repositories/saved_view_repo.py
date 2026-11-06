"""保存视图数据访问。"""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.saved_view import SavedView


class SavedViewRepo:
    def create(
        self,
        db: Session,
        *,
        team_id: uuid.UUID,
        owner_id: uuid.UUID,
        name: str,
        view: str,
        filters: dict,
        sort_key: str | None,
        sort_dir: str | None,
    ) -> SavedView:
        view_row = SavedView(
            team_id=team_id,
            owner_id=owner_id,
            name=name,
            view=view,
            filters=filters or {},
            sort_key=sort_key,
            sort_dir=sort_dir,
        )
        db.add(view_row)
        return view_row

    def list_by_team(self, db: Session, team_id: uuid.UUID) -> list[SavedView]:
        return list(
            db.scalars(
                select(SavedView)
                .where(SavedView.team_id == team_id)
                .order_by(SavedView.created_at.asc())
            )
        )

    def get(self, db: Session, view_id: uuid.UUID) -> SavedView | None:
        return db.get(SavedView, view_id)

    def delete(self, db: Session, view: SavedView) -> None:
        db.delete(view)


saved_view_repo = SavedViewRepo()
