"""任务活动流 DTO（GET /tasks/{id}/activities）。"""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.common import ApiResponse


class TaskActivityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    task_id: uuid.UUID
    actor_id: uuid.UUID | None = None
    actor_name: str
    action: str
    field: str | None = None
    old_value: str | None = None
    new_value: str | None = None
    created_at: datetime


class TaskActivityListData(BaseModel):
    items: list[TaskActivityOut] = []
    total: int = 0


class TaskActivityListResponse(ApiResponse[TaskActivityListData]):
    pass
