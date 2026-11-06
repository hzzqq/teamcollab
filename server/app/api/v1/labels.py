"""标签路由：团队级 CRUD（admin+ 写）+ 任务标签赋值（member+）。"""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import require_task_roles, require_team_roles
from app.core.db import get_db
from app.schemas.label import (
    LabelCreateRequest,
    LabelListResponse,
    LabelResponse,
    LabelUpdateRequest,
    TaskLabelsRequest,
)
from app.services.label_service import label_service

router = APIRouter(tags=["labels"])

ROLE_ADMIN_PLUS = ("owner", "admin")
ROLE_MEMBER_PLUS = ("owner", "admin", "member")
ROLE_VIEWER_PLUS = ("owner", "admin", "member", "viewer")


@router.get("/teams/{team_id}/labels", response_model=LabelListResponse)
def list_labels(
    team_id: uuid.UUID,
    ctx=Depends(require_team_roles(*ROLE_VIEWER_PLUS)),
    db: Session = Depends(get_db),
):
    labels = label_service.list_labels(db, team_id)
    return {"code": 0, "data": labels, "message": ""}


@router.post("/teams/{team_id}/labels", response_model=LabelResponse, status_code=201)
def create_label(
    team_id: uuid.UUID,
    payload: LabelCreateRequest,
    ctx=Depends(require_team_roles(*ROLE_ADMIN_PLUS)),
    db: Session = Depends(get_db),
):
    label = label_service.create_label(db, team_id, payload)
    return {"code": 0, "data": label, "message": ""}


@router.put("/teams/{team_id}/labels/{label_id}", response_model=LabelResponse)
def update_label(
    team_id: uuid.UUID,
    label_id: uuid.UUID,
    payload: LabelUpdateRequest,
    ctx=Depends(require_team_roles(*ROLE_ADMIN_PLUS)),
    db: Session = Depends(get_db),
):
    label = label_service.update_label(db, team_id, label_id, payload)
    return {"code": 0, "data": label, "message": ""}


@router.delete("/teams/{team_id}/labels/{label_id}", response_model=LabelResponse)
def delete_label(
    team_id: uuid.UUID,
    label_id: uuid.UUID,
    ctx=Depends(require_team_roles(*ROLE_ADMIN_PLUS)),
    db: Session = Depends(get_db),
):
    label = label_service.delete_label(db, team_id, label_id)
    return {"code": 0, "data": label, "message": ""}


@router.put("/tasks/{task_id}/labels", response_model=LabelListResponse)
def set_task_labels(
    task_id: uuid.UUID,
    payload: TaskLabelsRequest,
    ctx=Depends(require_task_roles(*ROLE_MEMBER_PLUS)),
    db: Session = Depends(get_db),
):
    task = label_service.set_task_labels(db, ctx.team_id, task_id, payload, ctx.user)
    return {"code": 0, "data": task.labels, "message": ""}
