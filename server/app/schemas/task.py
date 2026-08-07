"""任务相关模型。"""

import uuid
from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.common import ApiResponse, Paginated, strip_non_blank

Priority = Literal["low", "medium", "high", "urgent"]
TaskStatus = Literal["todo", "in_progress", "done"]


class AssigneeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    display_name: str


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    board_id: uuid.UUID
    board_name: Optional[str] = None
    column_id: uuid.UUID
    title: str
    description: Optional[str] = None
    assignee_id: Optional[uuid.UUID] = None
    assignee: Optional[AssigneeOut] = None
    priority: Priority
    status: TaskStatus
    position: int
    due_date: Optional[date] = None
    start_date: Optional[date] = None
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime


class TaskResponse(ApiResponse[TaskOut]):
    pass


class PaginatedTasks(ApiResponse[Paginated[TaskOut]]):
    pass


class TaskCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=5000)

    @field_validator("title")
    @classmethod
    def _v_title(cls, v: str) -> str:
        return strip_non_blank(v)
    column_id: uuid.UUID
    assignee_id: Optional[uuid.UUID] = None
    priority: Priority = "medium"
    status: TaskStatus = "todo"
    due_date: Optional[date] = None
    start_date: Optional[date] = None

    @model_validator(mode="after")
    def _check_dates(self) -> "TaskCreateRequest":
        if self.start_date and self.due_date and self.start_date > self.due_date:
            raise ValueError("start_date 不能晚于 due_date")
        return self


class TaskUpdateRequest(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=5000)
    column_id: Optional[uuid.UUID] = None
    assignee_id: Optional[uuid.UUID] = None
    priority: Optional[Priority] = None
    status: Optional[TaskStatus] = None
    due_date: Optional[date] = None
    start_date: Optional[date] = None

    @field_validator("title")
    @classmethod
    def _strip_title(cls, v: Optional[str]) -> Optional[str]:
        return strip_non_blank(v)

    @model_validator(mode="after")
    def _check_dates(self) -> "TaskUpdateRequest":
        if self.start_date and self.due_date and self.start_date > self.due_date:
            raise ValueError("start_date 不能晚于 due_date")
        return self


class TaskMoveRequest(BaseModel):
    target_column_id: uuid.UUID
    position: int = Field(ge=0)
