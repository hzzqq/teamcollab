"""标签相关模型。"""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import ApiResponse

LabelColor = Literal["blue", "green", "amber", "rose", "slate"]


class LabelOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    team_id: uuid.UUID
    name: str
    color: LabelColor
    created_at: datetime
    updated_at: datetime


class LabelCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    color: LabelColor = "blue"


class LabelUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=50)
    color: LabelColor | None = None


class TaskLabelsRequest(BaseModel):
    label_ids: list[uuid.UUID] = Field(default_factory=list)


class LabelResponse(ApiResponse[LabelOut]):
    pass


class LabelListResponse(ApiResponse[list[LabelOut]]):
    pass
