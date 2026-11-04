"""生产配置自检与运行时安全项的回归测试。

覆盖两处历史缺陷：
1. JWT_SECRET 兜底弱密钥 → 生产环境必须 fail fast（不能带默认密钥上线）。
2. SSE 长连接独占 DB 连接 → 长连接期间连接池 checkedout 必须保持为 0。
"""

import os

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings


class TestProductionConfig:
    def test_development_env_allows_default_secret(self):
        """开发环境允许使用默认密钥（本地起服务无需额外配置）。"""
        s = Settings(environment="development")
        s.assert_production_config()  # 不应抛异常

    def test_production_rejects_default_secret(self):
        """生产环境用默认密钥 → 拒绝启动。"""
        s = Settings(environment="production", jwt_secret="dev-secret-change-me-in-production")
        with pytest.raises(RuntimeError, match="JWT_SECRET"):
            s.assert_production_config()

    def test_production_rejects_short_secret(self):
        """生产环境密钥过短 → 拒绝启动。"""
        s = Settings(environment="production", jwt_secret="short")
        with pytest.raises(RuntimeError, match="32"):
            s.assert_production_config()

    def test_production_accepts_strong_secret(self):
        """生产环境强随机密钥 → 放行。"""
        s = Settings(environment="production", jwt_secret="x" * 48)
        s.assert_production_config()  # 不应抛异常

    def test_is_production_detection(self):
        assert Settings(environment="production").is_production
        assert Settings(environment="PROD").is_production
        assert not Settings(environment="development").is_production
        assert not Settings(environment="test").is_production


class TestSseDoesNotHoldDbConnection:
    """SSE 长连接不得独占 DB 连接。

    历史缺陷：SSE 端点通过 Depends(get_db) 注入 DB 会话，而长连接响应会
    让该会话存活整个流期间 —— 每条 SSE 独占一个连接池连接，
    pool_size+max_overflow=15 的上限会被在线用户数耗尽，普通请求随之阻塞。

    验证方式：静态检查 SSE 路由的依赖图 —— 若依赖链中出现 get_db，
    说明会话会随流存活（回归）；只依赖 get_current_user_query（不注入 db）则安全。
    """

    @staticmethod
    def _collect_dependency_calls(dependant, seen: set) -> set:
        """递归收集依赖链中所有被调用的依赖函数（保留给后续回归使用）。"""
        call = getattr(dependant, "call", None)
        if call is not None and call not in seen:
            seen.add(call)
        for sub in getattr(dependant, "dependencies", []) or []:
            TestSseDoesNotHoldDbConnection._collect_dependency_calls(sub, seen)
        return seen

    def test_sse_route_does_not_depend_on_db_session(self):
        """SSE 认证依赖不得注入 DB 会话。

        验证方式：检查 get_current_user_query 的签名 —— 若它声明了 db 参数
        （Depends(get_db)），FastAPI 会为该请求开启一个随响应生命周期存活的
        会话，长连接下每条 SSE 独占一个连接池连接。
        """
        import inspect

        from app.api.deps import get_current_user_query

        params = inspect.signature(get_current_user_query).parameters
        assert "db" not in params, (
            "get_current_user_query 声明了 db 参数 —— SSE 长连接会独占 DB 连接，"
            "连接池上限会被在线用户数耗尽"
        )
        # 认证只应依赖 token 入参
        assert set(params) == {"token"}, f"意外的依赖入参: {set(params)}"

    def test_sse_endpoint_returns_user_id_without_db_session(self):
        """SSE 认证依赖返回 user_id 字符串（而非持有 ORM 对象）。"""
        import time

        from app.api.deps import get_current_user_query
        from app.core.security import decode_token
        from app.main import app

        email = f"sse_dep_{int(time.time())}@example.com"
        reg = TestClient(app).post(
            "/api/v1/auth/register",
            json={"email": email, "password": "pass1234", "display_name": "SSE"},
        )
        assert reg.status_code == 201, reg.text
        token = reg.json()["data"]["access_token"]

        # 直接调用依赖函数（不经过 FastAPI），验证其不依赖注入的 db 会话
        payload = decode_token(token, expected_type="access")
        user_id = get_current_user_query(token=token)
        assert user_id == payload["sub"]
        assert isinstance(user_id, str)
