"""评论路由。"""

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import require_task_roles
from app.core.db import get_db
from app.schemas.comment import (
    CommentCreateRequest,
    CommentResponse,
    PaginatedComments,
)
from app.services.comment_service import comment_service

router = APIRouter(tags=["comments"])

ROLE_VIEWER_PLUS = ("owner", "admin", "member", "viewer")
ROLE_MEMBER_PLUS = ("owner", "admin", "member")


@router.get("/tasks/{task_id}/comments", response_model=PaginatedComments)
def list_comments(
    task_id: uuid.UUID,
    ctx=Depends(require_task_roles(*ROLE_VIEWER_PLUS)),
    db: Session = Depends(get_db),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
):
    items, total = comment_service.list_comments(db, task_id, ctx.team_id, page=page, limit=limit)
    payload = []
    for c in items:
        payload.append(
            {
                "id": c.id,
                "task_id": c.task_id,
                "author": {"id": c.author.id, "display_name": c.author.display_name},
                "content": c.content,
                "mentions": [],
                "created_at": c.created_at,
            }
        )
    data = {
        "items": payload,
        "total": total,
        "page": page,
        "limit": limit,
        "hasMore": page * limit < total,
    }
    return {"code": 0, "data": data, "message": ""}


@router.post("/tasks/{task_id}/comments", response_model=CommentResponse, status_code=201)
def create_comment(
    task_id: uuid.UUID,
    payload: CommentCreateRequest,
    ctx=Depends(require_task_roles(*ROLE_MEMBER_PLUS)),
    db: Session = Depends(get_db),
):
    comment = comment_service.create(db, task_id, ctx.team_id, payload.content, ctx.user)
    return {"code": 0, "data": comment, "message": ""}
