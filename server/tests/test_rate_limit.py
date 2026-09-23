"""速率限制器：窗口过期重置 + 内存水位上限淘汰 + Redis 多实现（多实例共享计数）。"""

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


# ---------- Redis 实现（多实例共享计数） ----------


class _FakePipeline:
    def __init__(self, store: dict):
        self._store = store
        self._ops: list = []

    def incr(self, key: str):
        self._ops.append(("incr", key))
        return self

    def expire(self, key: str, ttl: int):
        self._ops.append(("expire", key, ttl))
        return self

    def execute(self) -> list:
        results = []
        for op in self._ops:
            if op[0] == "incr":
                value = self._store.get(op[1], 0) + 1
                self._store[op[1]] = value
                results.append(value)
            else:
                results.append(True)
        self._ops = []
        return results


class _FakeRedis:
    def __init__(self):
        self.store: dict = {}

    def pipeline(self):
        return _FakePipeline(self.store)


class _DownRedis:
    def pipeline(self):  # 模拟 Redis 宕机
        raise ConnectionError("redis down")


def _redis_limiter(fake) -> rl.RedisRateLimiter:
    limiter = rl.RedisRateLimiter("redis://localhost:6379/0")
    limiter._client = fake
    return limiter


def test_get_rate_limiter_memory_by_default(monkeypatch):
    monkeypatch.setattr(rl, "get_settings", lambda: type("S", (), {"redis_url": ""})())
    assert isinstance(rl.get_rate_limiter(), rl.RateLimiter)


def test_get_rate_limiter_redis_when_configured(monkeypatch):
    monkeypatch.setattr(
        rl, "get_settings", lambda: type("S", (), {"redis_url": "redis://localhost:6379/0"})()
    )
    assert isinstance(rl.get_rate_limiter(), rl.RedisRateLimiter)


def test_redis_limiter_allows_up_to_limit_then_blocks():
    fake = _FakeRedis()
    limiter = _redis_limiter(fake)

    for _ in range(10):
        limiter.check("ip:login", limit=10, window_seconds=60)
    with pytest.raises(rl.RateLimitExceeded):
        limiter.check("ip:login", limit=10, window_seconds=60)

    # 单 key 累计到 11（被拒绝的命中也计数），并已设置过期 TTL
    assert len(fake.store) == 1
    assert max(fake.store.values()) == 11


def test_redis_limiter_window_expiry_resets(monkeypatch):
    fake = _FakeRedis()
    limiter = _redis_limiter(fake)
    now = {"t": 1_000_000}
    monkeypatch.setattr(rl.time, "time", lambda: now["t"])

    for _ in range(5):
        limiter.check("ip", limit=5, window_seconds=60)
    with pytest.raises(rl.RateLimitExceeded):
        limiter.check("ip", limit=5, window_seconds=60)

    now["t"] += 61  # 跨入新窗口 → 新 key，重新计数
    limiter.check("ip", limit=5, window_seconds=60)
    assert len(fake.store) == 2


def test_redis_limiter_fail_open_when_redis_down():
    limiter = _redis_limiter(_DownRedis())
    limiter.check("ip", limit=1, window_seconds=60)  # 不抛异常 = 放行
    limiter.check("ip", limit=1, window_seconds=60)
