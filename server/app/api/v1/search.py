"""跨看板全局搜索（命令面板数据源）：只读、跨当前用户全部团队。"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.db import get_db
from app.models.user import User
from app.schemas.search import SearchResponse
from app.services.search_service import search_service

router = APIRouter(tags=["search"])


@router.get("/search", response_model=SearchResponse)
def search(
    q: str = Query(default="", max_length=200),
    limit: int = Query(default=8, ge=1, le=20),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    data = search_service.search(db, user.id, q, limit)
    return {"code": 0, "data": data, "message": ""}
