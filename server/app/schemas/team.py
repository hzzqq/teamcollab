"""团队/成员相关模型。"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.schemas.auth import TeamOut, UserOut
from app.schemas.common import ApiResponse, strip_non_blank

Role = Literal["owner", "admin", "member", "viewer"]
InviteRole = Literal["admin", "member", "viewer"]


class TeamCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)

    @field_validator("name")
    @classmethod
    def _v_name(cls, v: str) -> str:
        return strip_non_blank(v)


class TeamResponse(ApiResponse[TeamOut]):
    pass


class MemberOut(BaseModel):
    user: UserOut
    role: str
    created_at: datetime


class MemberResponse(ApiResponse[MemberOut]):
    pass


class MemberListResponse(ApiResponse[list[MemberOut]]):
    pass


class InviteMemberRequest(BaseModel):
    email: EmailStr = Field(max_length=255)
    role: InviteRole

    @field_validator("email")
    @classmethod
    def _normalize_email(cls, v: str) -> str:
        return v.strip().lower()


class ChangeRoleRequest(BaseModel):
    role: InviteRole
