"""保存视图服务：团队级命名视图的 CRUD 与权限。"""

import uuid

from sqlalchemy.orm import Session

from app.core.errors import forbidden, not_found
from app.repositories.saved_view_repo import saved_view_repo
from app.schemas.saved_view import SavedViewCreateRequest, SavedViewUpdateRequest


class SavedViewService:
    def create(
        self,
        db: Session,
        *,
        team_id: uuid.UUID,
        owner_id: uuid.UUID,
        data: SavedViewCreateRequest,
    ):
        return saved_view_repo.create(
            db,
            team_id=team_id,
            owner_id=owner_id,
            name=data.name,
            view=data.view,
            filters=data.filters.model_dump(exclude_none=True),
            sort_key=data.sort_key,
            sort_dir=data.sort_dir,
        )

    def list_by_team(self, db: Session, team_id: uuid.UUID) -> list:
        return saved_view_repo.list_by_team(db, team_id)

    def _get_owned(self, db: Session, view_id: uuid.UUID, team_id: uuid.UUID):
        view = saved_view_repo.get(db, view_id)
        if view is None or view.team_id != team_id:
            raise not_found("视图不存在")
        return view

    def update(
        self,
        db: Session,
        *,
        view_id: uuid.UUID,
        team_id: uuid.UUID,
        user_id: uuid.UUID,
        role: str,
        data: SavedViewUpdateRequest,
    ):
        view = self._get_owned(db, view_id, team_id)
        if view.owner_id != user_id and role not in ("owner", "admin"):
            raise forbidden("只有创建者或团队管理员可修改视图")
        if data.name is not None:
            view.name = data.name
        if data.view is not None:
            view.view = data.view
        if data.filters is not None:
            view.filters = data.filters.model_dump(exclude_none=True)
        if data.sort_key is not None:
            view.sort_key = data.sort_key
        if data.sort_dir is not None:
            view.sort_dir = data.sort_dir
        return view

    def delete(
        self,
        db: Session,
        *,
        view_id: uuid.UUID,
        team_id: uuid.UUID,
        user_id: uuid.UUID,
        role: str,
    ) -> None:
        view = self._get_owned(db, view_id, team_id)
        if view.owner_id != user_id and role not in ("owner", "admin"):
            raise forbidden("只有创建者或团队管理员可删除视图")
        saved_view_repo.delete(db, view)


saved_view_service = SavedViewService()
