"""通知相关模型。"""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict

from app.schemas.common import ApiResponse, Paginated


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    team_id: uuid.UUID
    type: str
    payload: dict[str, Any]
    is_read: bool
    created_at: datetime


class NotificationResponse(ApiResponse[NotificationOut]):
    pass


class PaginatedNotificationsData(Paginated[NotificationOut]):
    """通知分页 + 未读总数。

    unreadTotal 独立于 items：前端若用 items 过滤未读，只会统计到已加载的
    limit 条（默认 20），未读数会被严重低估。
    """

    unreadTotal: int


class PaginatedNotifications(ApiResponse[PaginatedNotificationsData]):
    pass
