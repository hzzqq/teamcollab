"""管理员后台路由（/admin，需超级管理员）。

平台级账号治理：列出/创建/更新/重置密码/删除用户，列出全部团队（含成员数）。
与团队内成员管理（team_service）正交，仅 superuser 可访问。
"""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import require_superuser
from app.core.db import get_db
from app.models.user import User
from app.schemas.admin import (
    AdminCreateUserRequest,
    AdminOkResponse,
    AdminResetPasswordRequest,
    AdminTeamListResponse,
    AdminUpdateUserRequest,
    AdminUserListResponse,
    AdminUserOut,
    AdminUserResponse,
)
from app.services.user_service import user_service

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users", response_model=AdminUserListResponse)
def list_users(
    user: User = Depends(require_superuser),
    db: Session = Depends(get_db),
):
    users = user_service.list_users(db)
    return {"code": 0, "data": [AdminUserOut.model_validate(u) for u in users], "message": ""}


@router.post("/users", response_model=AdminUserResponse, status_code=201)
def create_user(
    payload: AdminCreateUserRequest,
    user: User = Depends(require_superuser),
    db: Session = Depends(get_db),
):
    created = user_service.create_user(
        db,
        payload.email,
        payload.password,
        payload.display_name,
        is_superuser=payload.is_superuser,
    )
    return {"code": 0, "data": AdminUserOut.model_validate(created), "message": ""}


@router.patch("/users/{user_id}", response_model=AdminUserResponse)
def update_user(
    user_id: uuid.UUID,
    payload: AdminUpdateUserRequest,
    user: User = Depends(require_superuser),
    db: Session = Depends(get_db),
):
    updated = user_service.update_user(
        db,
        user_id,
        display_name=payload.display_name,
        is_superuser=payload.is_superuser,
    )
    return {"code": 0, "data": AdminUserOut.model_validate(updated), "message": ""}


@router.post("/users/{user_id}/reset-password", response_model=AdminOkResponse)
def reset_password(
    user_id: uuid.UUID,
    payload: AdminResetPasswordRequest,
    user: User = Depends(require_superuser),
    db: Session = Depends(get_db),
):
    user_service.reset_password(db, user_id, payload.new_password)
    return {"code": 0, "data": {"ok": True}, "message": ""}


@router.delete("/users/{user_id}", response_model=AdminOkResponse)
def delete_user(
    user_id: uuid.UUID,
    actor: User = Depends(require_superuser),
    db: Session = Depends(get_db),
):
    user_service.delete_user(db, actor, user_id)
    return {"code": 0, "data": {"ok": True}, "message": ""}


@router.get("/teams", response_model=AdminTeamListResponse)
def list_teams(
    user: User = Depends(require_superuser),
    db: Session = Depends(get_db),
):
    teams = [
        {"id": t.id, "name": t.name, "member_count": cnt}
        for t, cnt in user_service.list_teams(db)
    ]
    return {"code": 0, "data": teams, "message": ""}
