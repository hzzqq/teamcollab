"""当前用户路由：/me 与 /me/tasks（我的任务聚合，跨团队）。"""


from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.db import get_db
from app.models.user import User
from app.schemas.auth import MeResponse, MeTeamsResponse, UserTeamOut
from app.schemas.task import PaginatedTasks
from app.services.auth_service import auth_service
from app.services.task_service import task_service
from app.services.team_service import team_service

router = APIRouter(tags=["me"])


@router.get("/me", response_model=MeResponse)
def get_me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    data = auth_service.me(db, user)
    return {"code": 0, "data": data, "message": ""}


@router.get("/me/teams", response_model=MeTeamsResponse)
def get_my_teams(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    memberships = team_service.list_teams_for_user(db, user.id)
    data = [UserTeamOut(team=team, role=role) for team, role in memberships]
    return {"code": 0, "data": data, "message": ""}


@router.get("/me/tasks", response_model=PaginatedTasks)
def get_my_tasks(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    status: str | None = Query(default=None, pattern="^(todo|in_progress|done)$"),
    q: str | None = Query(default=None, max_length=200),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
):
    team_ids = team_service.list_user_team_ids(db, user.id)
    items, total = task_service.list_my(
        db, user.id, team_ids, q=q, status=status, page=page, limit=limit
    )
    for task in items:
        task.board_name = task.board.name
    data = {
        "items": items,
        "total": total,
        "page": page,
        "limit": limit,
        "hasMore": page * limit < total,
    }
    return {"code": 0, "data": data, "message": ""}
