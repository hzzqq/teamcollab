"""v1 路由聚合。"""

from fastapi import APIRouter

from app.api.v1 import auth, boards, comments, me, notifications, tasks, teams

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(me.router)
api_router.include_router(teams.router)
api_router.include_router(boards.router)
api_router.include_router(tasks.router)
api_router.include_router(comments.router)
api_router.include_router(notifications.router)
