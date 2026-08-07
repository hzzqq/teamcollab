"""看板/列相关模型。"""

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.common import ApiResponse, strip_non_blank
from app.schemas.task import TaskOut


class BoardOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    team_id: uuid.UUID
    name: str
    created_at: datetime
    updated_at: datetime


class BoardResponse(ApiResponse[BoardOut]):
    pass


class BoardListResponse(ApiResponse[list[BoardOut]]):
    pass


class BoardCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)

    @field_validator("name")
    @classmethod
    def _v_name(cls, v: str) -> str:
        return strip_non_blank(v)


class BoardUpdateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)

    @field_validator("name")
    @classmethod
    def _v_name(cls, v: str) -> str:
        return strip_non_blank(v)


class ColumnOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    board_id: uuid.UUID
    name: str
    position: int
    created_at: datetime
    updated_at: datetime


class ColumnResponse(ApiResponse[ColumnOut]):
    pass


class ColumnCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    position: Optional[int] = Field(default=None, ge=0)

    @field_validator("name")
    @classmethod
    def _v_name(cls, v: str) -> str:
        return strip_non_blank(v)


class ColumnUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    position: Optional[int] = Field(default=None, ge=0)

    @field_validator("name")
    @classmethod
    def _v_name(cls, v: Optional[str]) -> Optional[str]:
        return strip_non_blank(v)


class ColumnWithTasks(BaseModel):
    id: uuid.UUID
    board_id: uuid.UUID
    name: str
    position: int
    tasks: list[TaskOut] = []


class BoardDetailData(BaseModel):
    id: uuid.UUID
    team_id: uuid.UUID
    name: str
    columns: list[ColumnWithTasks] = []


class BoardDetailResponse(ApiResponse[BoardDetailData]):
    pass
