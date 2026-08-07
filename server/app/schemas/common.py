"""通用响应模型（统一 {code, data, message} + 分页）。"""

from typing import Generic, TypeVar

from pydantic import BaseModel, field_validator

T = TypeVar("T")


def strip_non_blank(v: str | None) -> str | None:
    """去首尾空白；结果为空白串则拒绝（与 DB 侧 TRIM(...) > 0 约束对齐，避免触发 500）。

    用于可选字段：None 原样返回，非空值被 trim 后若为空则抛错。
    """
    if v is None:
        return None
    v = v.strip()
    if not v:
        raise ValueError("不能为纯空白")
    return v


class ApiResponse(BaseModel, Generic[T]):
    code: int = 0
    data: T | None = None
    message: str = ""


class OkData(BaseModel):
    ok: bool = True
    updated: int | None = None


class OkResponse(ApiResponse[OkData]):
    pass


class PageMeta(BaseModel):
    total: int
    page: int
    limit: int
    hasMore: bool


class Paginated(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    limit: int
    hasMore: bool
