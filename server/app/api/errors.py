"""全局异常处理器（统一 {code, data: null, message} 响应）。"""

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.errors import AppError

logger = logging.getLogger("app.errors")


def _error_body(code: int, message: str) -> dict:
    return {"code": code, "data": None, "message": message}


async def _app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content=_error_body(exc.code, exc.message))


async def _validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    errors = exc.errors()
    first = errors[0] if errors else {}
    loc = ".".join(str(x) for x in first.get("loc", []) if x not in ("body",))
    msg = str(first.get("msg", "参数校验失败"))[:120]
    detail = "参数校验失败"
    if loc:
        detail += f": {loc}"
    if msg and "Value error" not in msg:
        detail += f"（{msg}）"
    return JSONResponse(status_code=400, content=_error_body(40001, detail))


async def _http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    mapping = {
        400: (40001, "参数校验失败"),
        401: (40101, "未认证或凭证无效"),
        403: (40301, "无权限执行此操作"),
        404: (40401, "资源不存在"),
        429: (42901, "请求过于频繁"),
    }
    code, message = mapping.get(exc.status_code, (50000, "服务器内部错误"))
    return JSONResponse(status_code=exc.status_code, content=_error_body(code, message))


async def _integrity_error_handler(request: Request, exc: IntegrityError) -> JSONResponse:
    logger.warning("IntegrityError: %s", exc.orig)
    return JSONResponse(status_code=409, content=_error_body(40901, "数据冲突，请检查重复提交"))


async def _unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error: %s", exc)
    return JSONResponse(status_code=500, content=_error_body(50000, "服务器内部错误"))


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, _app_error_handler)
    app.add_exception_handler(RequestValidationError, _validation_error_handler)
    app.add_exception_handler(StarletteHTTPException, _http_exception_handler)
    app.add_exception_handler(IntegrityError, _integrity_error_handler)
    app.add_exception_handler(Exception, _unhandled_error_handler)
