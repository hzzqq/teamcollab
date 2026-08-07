"""认证相关请求/响应模型。"""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.schemas.common import ApiResponse, strip_non_blank


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    display_name: str
    created_at: datetime


class TeamOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    created_at: datetime


class RegisterRequest(BaseModel):
    email: EmailStr = Field(max_length=255)
    password: str = Field(min_length=8, max_length=72)
    display_name: str = Field(min_length=1, max_length=100)

    @field_validator("email")
    @classmethod
    def _normalize_email(cls, v: str) -> str:
        return v.strip().lower()

    @field_validator("display_name")
    @classmethod
    def _v_display_name(cls, v: str) -> str:
        return strip_non_blank(v)


class LoginRequest(BaseModel):
    username: EmailStr = Field(max_length=255, description="邮箱")
    password: str = Field(min_length=1, max_length=72)


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=1)


class AuthData(BaseModel):
    user: UserOut
    team: TeamOut
    role: str
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class AuthResponse(ApiResponse[AuthData]):
    pass


class RefreshData(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class RefreshResponse(ApiResponse[RefreshData]):
    pass


class MeData(BaseModel):
    user: UserOut
    team: TeamOut
    role: str


class MeResponse(ApiResponse[MeData]):
    pass


class UserTeamOut(BaseModel):
    team: TeamOut
    role: str


class MeTeamsResponse(ApiResponse[list[UserTeamOut]]):
    pass
