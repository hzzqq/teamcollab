"""任务批量操作 / 跨看板移动 的请求与响应 DTO。"""

import uuid
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.schemas.common import ApiResponse

BatchAction = Literal["set_status", "set_priority", "set_assignee", "delete"]
STATUSES = ("todo", "in_progress", "done")
PRIORITIES = ("low", "medium", "high", "urgent")


class MoveToBoardRequest(BaseModel):
    board_id: uuid.UUID
    column_id: uuid.UUID
    position: int = Field(default=0, ge=0)


class BatchTaskRequest(BaseModel):
    """一次批量操作；任一任务越权则整批拒绝，不做部分更新。"""

    task_ids: list[uuid.UUID] = Field(min_length=1, max_length=50)
    action: BatchAction
    value: str | None = None

    @model_validator(mode="after")
    def _check_value(self) -> "BatchTaskRequest":
        if self.action == "set_status" and self.value not in STATUSES:
            raise ValueError("set_status 的 value 必须是 todo / in_progress / done")
        if self.action == "set_priority" and self.value not in PRIORITIES:
            raise ValueError("set_priority 的 value 必须是 low / medium / high / urgent")
        if self.action == "set_assignee" and self.value is not None:
            try:
                uuid.UUID(self.value)
            except ValueError as exc:
                raise ValueError("set_assignee 的 value 必须是用户 UUID 或 null") from exc
        if self.action == "delete" and self.value is not None:
            raise ValueError("delete 不接受 value")
        return self


class BatchResult(BaseModel):
    updated: int


class BatchResponse(ApiResponse[BatchResult]):
    pass
