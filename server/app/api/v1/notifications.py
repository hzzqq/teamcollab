"""通知路由：SSE 流（query token 认证）+ 历史列表。"""

import asyncio
import json
import logging
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_current_user_query
from app.core.db import get_db
from app.models.user import User
from app.realtime.broker import broker
from app.schemas.common import OkResponse
from app.schemas.notification import PaginatedNotifications
from app.services.notification_service import notification_service

logger = logging.getLogger("app.notifications")

router = APIRouter(tags=["notifications"])

_SSE_KEEPALIVE_SECONDS = 15


async def _event_stream(user_id: str) -> AsyncGenerator[str, None]:
    queue: asyncio.Queue = asyncio.Queue(maxsize=200)
    loop = asyncio.get_running_loop()
    broker.subscribe(user_id, queue, loop)
    try:
        yield "event: connected\ndata: {\"ok\": true}\n\n"
        while True:
            try:
                payload = await asyncio.wait_for(queue.get(), timeout=_SSE_KEEPALIVE_SECONDS)
                yield f"event: notification\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
            except asyncio.TimeoutError:
                # 心跳注释行，避免代理/客户端判定连接超时
                yield ": ping\n\n"
    finally:
        broker.unsubscribe(user_id, queue)


@router.get("/notifications/stream", response_class=StreamingResponse)
def stream_notifications(user: User = Depends(get_current_user_query)):
    return StreamingResponse(
        _event_stream(str(user.id)),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/notifications", response_model=PaginatedNotifications)
def list_notifications(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    unread: bool = Query(default=False),
):
    items, total = notification_service.list_notifications(db, user.id, page=page, limit=limit, unread_only=unread)
    data = {
        "items": items,
        "total": total,
        "page": page,
        "limit": limit,
        "hasMore": page * limit < total,
    }
    return {"code": 0, "data": data, "message": ""}


@router.post("/notifications/read-all", response_model=OkResponse)
def mark_all_read(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    updated = notification_service.mark_all_read(db, user.id)
    return {"code": 0, "data": {"ok": True, "updated": updated}, "message": ""}
