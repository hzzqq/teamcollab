"""管理员后台相关请求/响应模型（/admin，需超级管理员）。"""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.schemas.common import ApiResponse


class AdminCreateUserRequest(BaseModel):
    email: EmailStr = Field(max_length=255)
    password: str = Field(min_length=8, max_length=72)
    display_name: str = Field(min_length=1, max_length=100)
    is_superuser: bool = False


class AdminUpdateUserRequest(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=100)
    is_superuser: bool | None = None


class AdminResetPasswordRequest(BaseModel):
    new_password: str = Field(min_length=8, max_length=72)


class AdminUserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    display_name: str
    is_superuser: bool
    created_at: datetime


class AdminTeamOut(BaseModel):
    id: uuid.UUID
    name: str
    member_count: int


class AdminUserListResponse(ApiResponse[list[AdminUserOut]]):
    pass


class AdminTeamListResponse(ApiResponse[list[AdminTeamOut]]):
    pass


class AdminUserResponse(ApiResponse[AdminUserOut]):
    pass


class AdminOkResponse(ApiResponse[dict]):
    pass
