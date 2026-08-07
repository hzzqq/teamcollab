"""不依赖 PostgreSQL 的纯逻辑单测（与需要 DB 的集成测试解耦）。

覆盖：
- AC-13 令牌：access/refresh 签发-校验往返、类型不符拒绝
- 密码哈希：bcrypt 校验一致性
- AC-07 @提及：正则提取 display_name 与邮箱前缀
"""

import pytest

from app.core.errors import AppError
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.services.comment_service import _MENTION_RE


def test_access_token_roundtrip():
    token, expires = create_access_token("user-1")
    assert expires > 0
    payload = decode_token(token, expected_type="access")
    assert payload["sub"] == "user-1"
    assert payload["type"] == "access"


def test_refresh_token_roundtrip_and_type_rejected():
    refresh, _ = create_refresh_token("user-1")
    # refresh token 能被正确类型校验
    assert decode_token(refresh, expected_type="refresh")["sub"] == "user-1"
    # 用 access 期望去解 refresh token 必须拒绝（凭证类型无效 → 40101）
    with pytest.raises(AppError):
        decode_token(refresh, expected_type="access")


def test_expired_or_garbage_token_rejected():
    with pytest.raises(AppError):
        decode_token("not-a-real-jwt", expected_type="access")


def test_password_hash_verify():
    h = hash_password("pass1234")
    assert h != "pass1234"
    assert verify_password("pass1234", h) is True
    assert verify_password("wrong", h) is False


@pytest.mark.parametrize(
    "text,expected",
    [
        ("请 @张三 看一下", ["张三"]),
        ("cc @alice.li and @bob+ ", ["alice.li", "bob+"]),
        ("无提及内容", []),
        ("邮箱前缀 @john.doe@example.com 命中", ["john.doe", "example.com"]),
    ],
)
def test_mention_regex_extraction(text, expected):
    assert _MENTION_RE.findall(text) == expected
