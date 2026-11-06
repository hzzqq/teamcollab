"""任务相关模型。"""

import uuid
from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.common import ApiResponse, Paginated, strip_non_blank
from app.schemas.label import LabelOut

Priority = Literal["low", "medium", "high", "urgent"]
TaskStatus = Literal["todo", "in_progress", "done"]


class ChecklistItem(BaseModel):
    """单个子任务；id 由前端生成（稳定、无需后端序列）。"""

    id: str = Field(min_length=1, max_length=64)
    text: str = Field(min_length=1, max_length=200)
    done: bool = False

    @field_validator("text")
    @classmethod
    def _strip_text(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("子任务内容不能为空")
        return stripped


def _validate_checklist(v: list[ChecklistItem] | None) -> list[ChecklistItem] | None:
    if v is None:
        return v
    if len(v) > 50:
        raise ValueError("子任务最多 50 项")
    if len({item.id for item in v}) != len(v):
        raise ValueError("子任务 id 不能重复")
    return v


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
    labels: list[LabelOut] = []
    checklist: list[ChecklistItem] = []


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
    label_ids: Optional[list[uuid.UUID]] = None
    checklist: Optional[list[ChecklistItem]] = None

    @field_validator("checklist")
    @classmethod
    def _check_checklist(cls, v):
        return _validate_checklist(v)

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
    label_ids: Optional[list[uuid.UUID]] = None
    checklist: Optional[list[ChecklistItem]] = None

    @field_validator("title")
    @classmethod
    def _strip_title(cls, v: Optional[str]) -> Optional[str]:
        return strip_non_blank(v)

    @field_validator("checklist")
    @classmethod
    def _check_checklist(cls, v):
        return _validate_checklist(v)

    @model_validator(mode="after")
    def _check_dates(self) -> "TaskUpdateRequest":
        if self.start_date and self.due_date and self.start_date > self.due_date:
            raise ValueError("start_date 不能晚于 due_date")
        return self


class TaskMoveRequest(BaseModel):
    target_column_id: uuid.UUID
    position: int = Field(ge=0)
