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

    # JWT（开发默认值；生产必须通过环境变量覆盖，见 assert_production_config）
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

    # 数据库连接池（每个 worker 进程独立）
    db_pool_size: int = 10
    db_max_overflow: int = 20
    db_pool_timeout: int = 30

    # 生产环境标识（compose / 部署时置为 production 以启用配置校验）
    environment: str = "development"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.environment.strip().lower() in ("production", "prod")

    def assert_production_config(self) -> None:
        """生产环境配置自检：弱密钥 / 默认密钥时拒绝启动（fail fast）。

        历史风险：docker-compose.prod.yml 用 ${JWT_SECRET:-dev-secret-change-me-in-production}
        兜底，运维忘记设环境变量就会带着公开的默认密钥上线 —— 任何人都能伪造
        任意用户的 access token。这里改为启动即失败，把问题暴露在部署阶段。
        """
        if not self.is_production:
            return
        if self.jwt_secret == "dev-secret-change-me-in-production":
            raise RuntimeError(
                "生产环境必须设置 JWT_SECRET 环境变量（当前为开发默认密钥）。"
                "生成方式：python -c \"import secrets;print(secrets.token_urlsafe(48))\""
            )
        if len(self.jwt_secret) < 32:
            raise RuntimeError(
                f"JWT_SECRET 长度不足 32 字符（当前 {len(self.jwt_secret)}），"
                "生产环境要求足够随机且足够长。"
            )


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.assert_production_config()
    return settings
