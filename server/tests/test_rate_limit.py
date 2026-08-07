"""速率限制器：窗口过期重置 + 内存水位上限淘汰（防止长运行内存泄漏）。"""

import time

import pytest

from app.core import rate_limit as rl


def test_allows_up_to_limit_then_blocks(monkeypatch):
    limiter = rl.RateLimiter()
    now = {"t": 0.0}
    monkeypatch.setattr(rl.time, "monotonic", lambda: now["t"])

    for _ in range(9):
        limiter.check("ip", limit=10, window_seconds=60)
    limiter.check("ip", limit=10, window_seconds=60)  # 第 10 次仍允许
    with pytest.raises(rl.RateLimitExceeded):
        limiter.check("ip", limit=10, window_seconds=60)  # 第 11 次被限流


def test_window_expiry_resets_counter(monkeypatch):
    limiter = rl.RateLimiter()
    now = {"t": 0.0}
    monkeypatch.setattr(rl.time, "monotonic", lambda: now["t"])

    limiter.check("ip", limit=5, window_seconds=60)
    now["t"] = 61  # 越过窗口
    for _ in range(4):
        limiter.check("ip", limit=5, window_seconds=60)
    limiter.check("ip", limit=5, window_seconds=60)  # 过期命中不计入，仍允许
    with pytest.raises(rl.RateLimitExceeded):
        limiter.check("ip", limit=5, window_seconds=60)


def test_caps_tracked_keys(monkeypatch):
    limiter = rl.RateLimiter()
    monkeypatch.setattr(rl, "MAX_KEYS", 3)
    now = {"t": 0.0}
    monkeypatch.setattr(rl.time, "monotonic", lambda: now["t"])

    for i in range(5):
        limiter.check(f"k{i}", limit=100, window_seconds=60)
    assert len(limiter._hits) <= 3
