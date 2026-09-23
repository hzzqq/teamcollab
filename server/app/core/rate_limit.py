"""速率限制：固定窗口计数，双实现（按 settings.redis_url 选择）。

- RateLimiter：进程内内存版（单实例 MVP 默认）；超限按最久未活跃淘汰钳制水位。
- RedisRateLimiter：Redis INCR 固定窗口（多实例共享计数，登录暴力破解防护不被实例数稀释）；
  Redis 不可用时降级为放行并记日志（fail-open，可用性优先——限流仅为防护盾，不是数据边界）。

key 形如 f"{client_ip}:{scope}"。
"""

import logging
import threading
import time
from collections import defaultdict
from typing import Any

from app.core.config import get_settings

logger = logging.getLogger("app.core.rate_limit")

# 内存水位上限：超出后淘汰最久未活跃的 key（按窗口内最新一次命中的时间戳）。
MAX_KEYS = 200_000


class RateLimiter:
    """固定窗口计数。key 形如 f"{client_ip}:{scope}"。"""

    def __init__(self) -> None:
        self._hits: dict[str, list[float]] = defaultdict(list)
        self._lock = threading.Lock()

    def check(self, key: str, limit: int, window_seconds: float) -> None:
        now = time.monotonic()
        with self._lock:
            recent = [t for t in self._hits.get(key, []) if now - t < window_seconds]
            if len(recent) >= limit:
                # 维持窗口内计数（不含本次被拒绝的命中），便于后续连续性判断
                if recent:
                    self._hits[key] = recent
                raise RateLimitExceeded()
            recent.append(now)
            self._hits[key] = recent
            if len(self._hits) > MAX_KEYS:
                self._evict_oldest()

    def _evict_oldest(self) -> None:
        """淘汰窗口内最新命中时间戳最小的 key，钳制内存水位。"""
        oldest_key: str | None = None
        oldest_ts: float | None = None
        for k, hits in self._hits.items():
            ts = hits[-1] if hits else 0.0
            if oldest_ts is None or ts < oldest_ts:
                oldest_ts = ts
                oldest_key = k
        if oldest_key is not None:
            self._hits.pop(oldest_key, None)


class RateLimitExceeded(Exception):
    pass


class RedisRateLimiter:
    """Redis 固定窗口计数（多实例共享同一计数，限额全局生效）。

    窗口对齐到整秒边界（now - now % window），key 带窗口起点：
    ratelimit:{key}:{window_start}，INCR 后首次计数补 EXPIRE 自动过期。
    Redis 故障时 fail-open（放行 + 日志），不阻断业务请求。
    """

    def __init__(self, redis_url: str) -> None:
        self._redis_url = redis_url
        self._client: Any = None

    def _get_client(self) -> Any:
        import redis

        if self._client is None:
            self._client = redis.Redis.from_url(self._redis_url)
        return self._client

    def check(self, key: str, limit: int, window_seconds: float) -> None:
        window = max(1, int(window_seconds))
        now = int(time.time())
        window_start = now - (now % window)
        redis_key = f"ratelimit:{key}:{window_start}"
        try:
            client = self._get_client()
            pipe = client.pipeline()
            pipe.incr(redis_key)
            pipe.expire(redis_key, window + 1)
            count = pipe.execute()[0]
        except Exception:
            logger.exception("Redis 限流计数失败，本请求放行（fail-open）")
            return
        if int(count) > limit:
            raise RateLimitExceeded()


def get_rate_limiter() -> RateLimiter | RedisRateLimiter:
    """按配置选择实现：REDIS_URL 非空启用多实例共享计数。"""
    settings = get_settings()
    if settings.redis_url:
        return RedisRateLimiter(settings.redis_url)
    return RateLimiter()


rate_limiter = get_rate_limiter()
