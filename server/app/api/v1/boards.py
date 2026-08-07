"""看板/列路由。"""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import (
    require_board_roles,
    require_column_roles,
    require_team_roles,
)
from app.core.db import get_db
from app.schemas.board import (
    BoardCreateRequest,
    BoardDetailResponse,
    BoardListResponse,
    BoardResponse,
    BoardUpdateRequest,
    ColumnCreateRequest,
    ColumnResponse,
    ColumnUpdateRequest,
)
from app.schemas.common import OkResponse
from app.services.board_service import board_service

router = APIRouter(tags=["boards"])

ROLE_VIEWER_PLUS = ("owner", "admin", "member", "viewer")
ROLE_MEMBER_PLUS = ("owner", "admin", "member")
ROLE_ADMIN_PLUS = ("owner", "admin")


@router.get("/teams/{team_id}/boards", response_model=BoardListResponse)
def list_boards(
    team_id: uuid.UUID,
    ctx=Depends(require_team_roles(*ROLE_VIEWER_PLUS)),
    db: Session = Depends(get_db),
):
    boards = board_service.list_boards(db, team_id)
    return {"code": 0, "data": boards, "message": ""}


@router.post("/teams/{team_id}/boards", response_model=BoardResponse, status_code=201)
def create_board(
    team_id: uuid.UUID,
    payload: BoardCreateRequest,
    ctx=Depends(require_team_roles(*ROLE_MEMBER_PLUS)),
    db: Session = Depends(get_db),
):
    board = board_service.create(db, team_id, payload.name)
    return {"code": 0, "data": board, "message": ""}


@router.get("/boards/{board_id}", response_model=BoardDetailResponse)
def get_board_detail(
    board_id: uuid.UUID,
    ctx=Depends(require_board_roles(*ROLE_VIEWER_PLUS)),
    db: Session = Depends(get_db),
):
    data = board_service.get_detail(db, board_id, ctx.team_id)
    return {"code": 0, "data": data, "message": ""}


@router.patch("/boards/{board_id}", response_model=BoardResponse)
def update_board(
    board_id: uuid.UUID,
    payload: BoardUpdateRequest,
    ctx=Depends(require_board_roles(*ROLE_MEMBER_PLUS)),
    db: Session = Depends(get_db),
):
    board = board_service.update(db, board_id, ctx.team_id, payload.name)
    return {"code": 0, "data": board, "message": ""}


@router.delete("/boards/{board_id}", response_model=OkResponse)
def delete_board(
    board_id: uuid.UUID,
    ctx=Depends(require_board_roles(*ROLE_ADMIN_PLUS)),
    db: Session = Depends(get_db),
):
    board_service.delete(db, board_id, ctx.team_id)
    return {"code": 0, "data": {"ok": True}, "message": ""}


@router.post("/boards/{board_id}/columns", response_model=ColumnResponse, status_code=201)
def create_column(
    board_id: uuid.UUID,
    payload: ColumnCreateRequest,
    ctx=Depends(require_board_roles(*ROLE_MEMBER_PLUS)),
    db: Session = Depends(get_db),
):
    column = board_service.create_column(db, board_id, ctx.team_id, payload.name, payload.position)
    return {"code": 0, "data": column, "message": ""}


@router.patch("/columns/{column_id}", response_model=ColumnResponse)
def update_column(
    column_id: uuid.UUID,
    payload: ColumnUpdateRequest,
    ctx=Depends(require_column_roles(*ROLE_MEMBER_PLUS)),
    db: Session = Depends(get_db),
):
    column = board_service.update_column(db, column_id, ctx.team_id, payload.name, payload.position)
    return {"code": 0, "data": column, "message": ""}
