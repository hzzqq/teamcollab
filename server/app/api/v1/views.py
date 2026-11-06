"""保存视图路由：团队级命名视图的 CRUD。"""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_team_context
from app.core.db import get_db
from app.schemas.common import OkResponse
from app.schemas.saved_view import (
    SavedViewCreateRequest,
    SavedViewListResponse,
    SavedViewResponse,
    SavedViewUpdateRequest,
)
from app.services.saved_view_service import saved_view_service

router = APIRouter(prefix="/teams", tags=["saved_views"])

ROLE_VIEWER_PLUS = ("owner", "admin", "member", "viewer")
ROLE_MEMBER_PLUS = ("owner", "admin", "member")


@router.get("/{team_id}/views", response_model=SavedViewListResponse)
def list_views(
    team_id: uuid.UUID,
    ctx=Depends(get_team_context),
    db: Session = Depends(get_db),
):
    items = saved_view_service.list_by_team(db, ctx.team_id)
    return {"code": 0, "data": {"items": items, "total": len(items)}, "message": ""}


@router.post("/{team_id}/views", response_model=SavedViewResponse, status_code=201)
def create_view(
    team_id: uuid.UUID,
    payload: SavedViewCreateRequest,
    ctx=Depends(get_team_context),
    db: Session = Depends(get_db),
):
    view = saved_view_service.create(
        db, team_id=ctx.team_id, owner_id=ctx.user.id, data=payload
    )
    db.commit()
    return {"code": 0, "data": view, "message": ""}


@router.put("/{team_id}/views/{view_id}", response_model=SavedViewResponse)
def update_view(
    team_id: uuid.UUID,
    view_id: uuid.UUID,
    payload: SavedViewUpdateRequest,
    ctx=Depends(get_team_context),
    db: Session = Depends(get_db),
):
    view = saved_view_service.update(
        db,
        view_id=view_id,
        team_id=ctx.team_id,
        user_id=ctx.user.id,
        role=ctx.role,
        data=payload,
    )
    db.commit()
    return {"code": 0, "data": view, "message": ""}


@router.delete("/{team_id}/views/{view_id}", response_model=OkResponse)
def delete_view(
    team_id: uuid.UUID,
    view_id: uuid.UUID,
    ctx=Depends(get_team_context),
    db: Session = Depends(get_db),
):
    saved_view_service.delete(
        db,
        view_id=view_id,
        team_id=ctx.team_id,
        user_id=ctx.user.id,
        role=ctx.role,
    )
    db.commit()
    return {"code": 0, "data": None, "message": ""}
