"""团队/成员路由。"""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_team_roles
from app.core.db import get_db
from app.models.user import User
from app.schemas.common import OkResponse
from app.schemas.team import (
    ChangeRoleRequest,
    InviteMemberRequest,
    MemberListResponse,
    MemberResponse,
    TeamCreateRequest,
    TeamResponse,
)
from app.services.team_service import team_service

router = APIRouter(tags=["teams"])

ROLE_ADMIN_PLUS = ("owner", "admin")
ROLE_ANY = ("owner", "admin", "member", "viewer")


@router.post("/teams", response_model=TeamResponse, status_code=201)
def create_team(
    payload: TeamCreateRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    team = team_service.create(db, user, payload.name)
    return {"code": 0, "data": team, "message": ""}


@router.get("/teams/{team_id}/members", response_model=MemberListResponse)
def list_members(
    team_id: uuid.UUID,
    ctx=Depends(require_team_roles(*ROLE_ANY)),
    db: Session = Depends(get_db),
):
    members = team_service.list_members(db, team_id)
    return {"code": 0, "data": members, "message": ""}


@router.post("/teams/{team_id}/members", response_model=MemberResponse, status_code=201)
def invite_member(
    team_id: uuid.UUID,
    payload: InviteMemberRequest,
    ctx=Depends(require_team_roles(*ROLE_ADMIN_PLUS)),
    db: Session = Depends(get_db),
):
    member = team_service.invite(db, team_id, payload.email, payload.role)
    return {"code": 0, "data": member, "message": ""}


@router.patch("/teams/{team_id}/members/{user_id}/role", response_model=MemberResponse)
def change_member_role(
    team_id: uuid.UUID,
    user_id: uuid.UUID,
    payload: ChangeRoleRequest,
    ctx=Depends(require_team_roles(*ROLE_ADMIN_PLUS)),
    db: Session = Depends(get_db),
):
    member = team_service.change_role(db, team_id, user_id, payload.role)
    return {"code": 0, "data": member, "message": ""}


@router.delete("/teams/{team_id}/members/{user_id}", response_model=OkResponse)
def remove_member(
    team_id: uuid.UUID,
    user_id: uuid.UUID,
    ctx=Depends(require_team_roles(*ROLE_ADMIN_PLUS)),
    db: Session = Depends(get_db),
):
    team_service.remove_member(db, team_id, user_id)
    return {"code": 0, "data": {"ok": True}, "message": ""}
