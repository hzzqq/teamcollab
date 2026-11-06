"""保存视图（命名筛选 + 排序快照）模型。"""

import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import ApiResponse


class ViewFilter(BaseModel):
    """视图筛选条件，与前端 BoardFilter 一致。"""

    model_config = ConfigDict(exclude_none=True)

    label_id: Optional[uuid.UUID] = None
    priority: Optional[str] = None
    assignee_id: Optional[uuid.UUID] = None


class SavedViewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    team_id: uuid.UUID
    owner_id: uuid.UUID
    name: str
    view: str
    filters: dict[str, Any] = Field(default_factory=dict)
    sort_key: Optional[str] = None
    sort_dir: Optional[str] = None
    created_at: datetime


class SavedViewResponse(ApiResponse[SavedViewOut]):
    pass


class SavedViewListData(BaseModel):
    items: list[SavedViewOut] = []
    total: int = 0


class SavedViewListResponse(ApiResponse[SavedViewListData]):
    pass


class SavedViewCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    view: str = Field(default="board", pattern="^(board|list)$")
    filters: ViewFilter = Field(default_factory=ViewFilter)
    sort_key: Optional[str] = Field(default=None, max_length=20)
    sort_dir: Optional[str] = Field(default=None, pattern="^(asc|desc)$")


class SavedViewUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    view: Optional[str] = Field(default=None, pattern="^(board|list)$")
    filters: Optional[ViewFilter] = None
    sort_key: Optional[str] = Field(default=None, max_length=20)
    sort_dir: Optional[str] = Field(default=None, pattern="^(asc|desc)$")
