"""任务路由：CRUD、列表/搜索、我的任务、拖拽落位。"""

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import require_board_roles, require_task_roles
from app.core.db import get_db
from app.schemas.common import OkResponse
from app.schemas.task import (
    PaginatedTasks,
    TaskCreateRequest,
    TaskMoveRequest,
    TaskResponse,
    TaskUpdateRequest,
)
from app.services.task_service import task_service

router = APIRouter(tags=["tasks"])

ROLE_VIEWER_PLUS = ("owner", "admin", "member", "viewer")
ROLE_MEMBER_PLUS = ("owner", "admin", "member")


@router.post("/boards/{board_id}/tasks", response_model=TaskResponse, status_code=201)
def create_task(
    board_id: uuid.UUID,
    payload: TaskCreateRequest,
    ctx=Depends(require_board_roles(*ROLE_MEMBER_PLUS)),
    db: Session = Depends(get_db),
):
    task = task_service.create(db, board_id, ctx.team_id, payload, ctx.user)
    return {"code": 0, "data": task, "message": ""}


@router.get("/boards/{board_id}/tasks", response_model=PaginatedTasks)
def list_tasks(
    board_id: uuid.UUID,
    ctx=Depends(require_board_roles(*ROLE_VIEWER_PLUS)),
    db: Session = Depends(get_db),
    q: str | None = Query(default=None, max_length=200),
    assignee_id: uuid.UUID | None = Query(default=None),
    status: str | None = Query(default=None, pattern="^(todo|in_progress|done)$"),
    column_id: uuid.UUID | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
):
    items, total = task_service.list_by_board(
        db,
        board_id,
        ctx.team_id,
        q=q,
        assignee_id=assignee_id,
        status=status,
        column_id=column_id,
        page=page,
        limit=limit,
    )
    data = {
        "items": items,
        "total": total,
        "page": page,
        "limit": limit,
        "hasMore": page * limit < total,
    }
    return {"code": 0, "data": data, "message": ""}


@router.get("/tasks/{task_id}", response_model=TaskResponse)
def get_task(
    task_id: uuid.UUID,
    ctx=Depends(require_task_roles(*ROLE_VIEWER_PLUS)),
    db: Session = Depends(get_db),
):
    task = task_service.get(db, task_id, ctx.team_id)
    return {"code": 0, "data": task, "message": ""}


@router.patch("/tasks/{task_id}", response_model=TaskResponse)
def update_task(
    task_id: uuid.UUID,
    payload: TaskUpdateRequest,
    ctx=Depends(require_task_roles(*ROLE_MEMBER_PLUS)),
    db: Session = Depends(get_db),
):
    task = task_service.update(db, task_id, ctx.team_id, payload, ctx.user)
    return {"code": 0, "data": task, "message": ""}


@router.delete("/tasks/{task_id}", response_model=OkResponse)
def delete_task(
    task_id: uuid.UUID,
    ctx=Depends(require_task_roles(*ROLE_MEMBER_PLUS)),
    db: Session = Depends(get_db),
):
    task_service.delete(db, task_id, ctx.team_id)
    return {"code": 0, "data": {"ok": True}, "message": ""}


@router.patch(
    "/boards/{board_id}/columns/{column_id}/tasks/{task_id}/position",
    response_model=TaskResponse,
)
def move_task_position(
    board_id: uuid.UUID,
    column_id: uuid.UUID,
    task_id: uuid.UUID,
    payload: TaskMoveRequest,
    ctx=Depends(require_board_roles(*ROLE_MEMBER_PLUS)),
    db: Session = Depends(get_db),
):
    task = task_service.move_position(
        db,
        board_id,
        column_id,
        task_id,
        ctx.team_id,
        payload.target_column_id,
        payload.position,
        ctx.user,
    )
    return {"code": 0, "data": task, "message": ""}
