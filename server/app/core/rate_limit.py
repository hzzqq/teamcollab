"""内存版速率限制（单进程内有效，MVP 够用；多实例需换 Redis）。

固定窗口计数。key 形如 f"{client_ip}:{scope}"。

内存水位：长时间运行下，每个不同的 (客户端IP, 路径) 都会占一个 key，
命中窗口过期后该 key 不会再被访问，若从不清理会缓慢泄漏内存。
这里在超限时按"最久未活跃"淘汰，把内存占用钳制在上限内。
"""

import threading
import time
from collections import defaultdict

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


rate_limiter = RateLimiter()
