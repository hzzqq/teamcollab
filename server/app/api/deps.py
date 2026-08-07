"""依赖注入：认证（Bearer / SSE query token）+ RBAC（实时查角色）+ 租户上下文。"""

import uuid
from dataclasses import dataclass

from fastapi import Depends, Header, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.errors import forbidden, not_found, unauthorized
from app.core.security import decode_token
from app.models.board import Board
from app.models.board_column import BoardColumn
from app.models.task import Task
from app.models.team_member import TeamMember
from app.models.user import User
from app.repositories.team_repo import team_repo
from app.repositories.user_repo import user_repo


@dataclass
class ResourceContext:
    """已通过成员校验的租户上下文（角色实时取自 team_members）。"""

    team_id: uuid.UUID
    role: str
    user: User


def _user_from_token(token: str, db: Session) -> User:
    payload = decode_token(token, expected_type="access")
    user = user_repo.get_by_id(db, uuid.UUID(payload["sub"]))
    if not user:
        raise unauthorized("用户不存在或凭证已失效")
    return user


def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise unauthorized("未提供有效的访问凭证")
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise unauthorized("未提供有效的访问凭证")
    return _user_from_token(token, db)


def get_current_user_query(
    token: str = Query(default="", description="access token（EventSource 无法自定义 Header，走 query）"),
    db: Session = Depends(get_db),
) -> User:
    if not token:
        raise unauthorized("未提供有效的访问凭证")
    return _user_from_token(token, db)


def _resolve_context(db: Session, user: User, team_id: uuid.UUID) -> ResourceContext:
    member: TeamMember | None = team_repo.get_member(db, team_id, user.id)
    if member is None:
        # 跨租户统一 40401，不泄露存在性
        raise not_found("资源不存在")
    return ResourceContext(team_id=team_id, role=member.role, user=user)


def get_team_context(
    team_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ResourceContext:
    return _resolve_context(db, user, team_id)


def get_board_context(
    board_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ResourceContext:
    board: Board | None = db.get(Board, board_id)
    if board is None:
        raise not_found("资源不存在")
    return _resolve_context(db, user, board.team_id)


def get_column_context(
    column_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ResourceContext:
    column: BoardColumn | None = db.get(BoardColumn, column_id)
    if column is None:
        raise not_found("资源不存在")
    board = db.get(Board, column.board_id)
    if board is None:
        raise not_found("资源不存在")
    return _resolve_context(db, user, board.team_id)


def get_task_context(
    task_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ResourceContext:
    task: Task | None = db.get(Task, task_id)
    if task is None:
        raise not_found("资源不存在")
    board = db.get(Board, task.board_id)
    if board is None:
        raise not_found("资源不存在")
    return _resolve_context(db, user, board.team_id)


def require_team_roles(*roles: str):
    """按团队路径参数校验角色（admin+ / member+ 等）。"""

    def _dep(ctx: ResourceContext = Depends(get_team_context)) -> ResourceContext:
        if ctx.role not in roles:
            raise forbidden("无权限执行此操作")
        return ctx

    return _dep


def require_board_roles(*roles: str):
    def _dep(ctx: ResourceContext = Depends(get_board_context)) -> ResourceContext:
        if ctx.role not in roles:
            raise forbidden("无权限执行此操作")
        return ctx

    return _dep


def require_task_roles(*roles: str):
    def _dep(ctx: ResourceContext = Depends(get_task_context)) -> ResourceContext:
        if ctx.role not in roles:
            raise forbidden("无权限执行此操作")
        return ctx

    return _dep


def require_column_roles(*roles: str):
    def _dep(ctx: ResourceContext = Depends(get_column_context)) -> ResourceContext:
        if ctx.role not in roles:
            raise forbidden("无权限执行此操作")
        return ctx

    return _dep
