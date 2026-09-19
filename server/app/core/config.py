"""应用配置（pydantic-settings，环境变量覆盖，禁止硬编码散落）。"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # 数据库
    database_url: str = "postgresql+psycopg://collab:collab@localhost:5432/collab"

    # JWT（开发默认值，生产必须通过环境变量覆盖）
    jwt_secret: str = "dev-secret-change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    # 应用
    app_name: str = "TeamCollab MVP API"
    cors_origins: str = (
        "http://localhost:3000,http://localhost:5173,"
        "http://127.0.0.1:3000,http://127.0.0.1:5173"
    )

    # 限流（内存版，单进程内有效）
    rate_limit_auth_per_minute: int = 10
    rate_limit_general_per_minute: int = 120

    # 后台调度器（定时到期提醒）
    scheduler_enabled: bool = True
    scheduler_due_soon_interval_seconds: int = 300
    # 调度器重提醒窗口：同任务在该窗口内已提醒过（无论已读未读）则跳过
    due_soon_resurface_hours: int = 12

    # 实时（SSE broker）：空 = 进程内单实例模式；配置后启用 Redis pub/sub 多实例
    redis_url: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
