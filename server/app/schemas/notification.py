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


class PaginatedNotifications(ApiResponse[Paginated[NotificationOut]]):
    pass
