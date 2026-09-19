"""应用入口：只装配（中间件 + 路由 + 异常处理器 + lifespan 后台任务），零业务逻辑。"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.errors import register_exception_handlers
from app.api.v1 import api_router
from app.core.config import get_settings
from app.core.errors import too_many_requests
from app.core.rate_limit import RateLimitExceeded, rate_limiter
from app.core.scheduler import due_soon_scheduler
from app.realtime.broker import broker

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("app")

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await broker.start()
    due_soon_scheduler.start()
    logger.info("应用启动完成（broker=%s）", type(broker).__name__)
    yield
    await due_soon_scheduler.stop()
    await broker.stop()


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    docs_url="/docs",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
    max_age=86400,
)

_SENSITIVE_PATHS = ("/api/v1/auth/login", "/api/v1/auth/register")


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    if request.url.path.startswith("/api/v1/notifications/stream"):
        return await call_next(request)
    client_ip = request.client.host if request.client else "unknown"
    if request.url.path in _SENSITIVE_PATHS:
        limit = settings.rate_limit_auth_per_minute
    elif request.url.path.startswith("/api/v1/"):
        limit = settings.rate_limit_general_per_minute
    else:
        limit = settings.rate_limit_general_per_minute
    try:
        rate_limiter.check(f"{client_ip}:{request.url.path}", limit=limit, window_seconds=60)
    except RateLimitExceeded:
        err = too_many_requests()
        return JSONResponse(status_code=err.status_code, content={"code": err.code, "data": None, "message": err.message})
    return await call_next(request)


app.include_router(api_router)
register_exception_handlers(app)
