"""安全工具：bcrypt 密码哈希 + PyJWT 令牌签发/校验。"""

from datetime import UTC, datetime, timedelta
from typing import Any, Optional

import bcrypt
import jwt

from app.core.config import get_settings
from app.core.errors import unauthorized

settings = get_settings()

TOKEN_TYPE_ACCESS = "access"
TOKEN_TYPE_REFRESH = "refresh"


def hash_password(password: str) -> str:
    """bcrypt 哈希（4.x，密码 ≤72 字节由 Pydantic 校验）。"""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def _create_token(user_id: str, token_type: str, expires_delta: timedelta) -> str:
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "sub": user_id,
        "type": token_type,
        "iat": now,
        "exp": now + expires_delta,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_access_token(user_id: str) -> tuple[str, int]:
    expires = timedelta(minutes=settings.access_token_expire_minutes)
    return _create_token(user_id, TOKEN_TYPE_ACCESS, expires), int(expires.total_seconds())


def create_refresh_token(user_id: str) -> tuple[str, int]:
    expires = timedelta(days=settings.refresh_token_expire_days)
    return _create_token(user_id, TOKEN_TYPE_REFRESH, expires), int(expires.total_seconds())


def decode_token(token: str, expected_type: Optional[str] = None) -> dict[str, Any]:
    """解码并校验 JWT；无效/过期/类型不符统一抛 40101。"""
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError:
        raise unauthorized("凭证无效或已过期") from None
    if expected_type is not None and payload.get("type") != expected_type:
        raise unauthorized("凭证类型无效")
    user_id = payload.get("sub")
    if not user_id:
        raise unauthorized("凭证无效")
    return payload
