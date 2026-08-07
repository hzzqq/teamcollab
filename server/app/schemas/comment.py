"""评论相关模型。"""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.common import ApiResponse, Paginated, strip_non_blank


class CommentAuthorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    display_name: str


class CommentOut(BaseModel):
    id: uuid.UUID
    task_id: uuid.UUID
    author: CommentAuthorOut
    content: str
    mentions: list[uuid.UUID] = []
    created_at: datetime


class CommentCreateRequest(BaseModel):
    content: str = Field(min_length=1, max_length=2000)

    @field_validator("content")
    @classmethod
    def _v_content(cls, v: str) -> str:
        return strip_non_blank(v)


class CommentResponse(ApiResponse[CommentOut]):
    pass


class PaginatedComments(ApiResponse[Paginated[CommentOut]]):
    pass
