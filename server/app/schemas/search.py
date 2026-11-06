"""全局搜索 DTO：跨看板的任务 / 看板命中项（命令面板消费）。"""

import uuid
from datetime import date

from pydantic import BaseModel, ConfigDict

from app.schemas.common import ApiResponse


class SearchTaskHit(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    description: str | None = None
    board_id: uuid.UUID
    board_name: str
    team_id: uuid.UUID
    team_name: str
    column_id: uuid.UUID
    column_name: str
    priority: str
    status: str
    due_date: date | None = None


class SearchBoardHit(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    team_id: uuid.UUID
    team_name: str


class SearchData(BaseModel):
    query: str
    tasks: list[SearchTaskHit] = []
    boards: list[SearchBoardHit] = []


class SearchResponse(ApiResponse[SearchData]):
    pass
