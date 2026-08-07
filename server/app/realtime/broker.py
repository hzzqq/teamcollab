"""进程内 SSE 发布/订阅桥（MVP 单进程；多实例需换 Redis pub/sub）。

- 订阅方：SSE 端点按 user_id 订阅一个 asyncio.Queue。
- 发布方：同步请求线程（Service）经 loop.call_soon_threadsafe 投递事件。
"""

import asyncio
import logging
import threading
from typing import Any

logger = logging.getLogger("app.realtime.broker")


class NotificationBroker:
    def __init__(self) -> None:
        self._subscribers: dict[str, list[tuple[asyncio.Queue, asyncio.AbstractEventLoop]]] = {}
        self._lock = threading.Lock()

    def subscribe(
        self, user_id: str, queue: asyncio.Queue, loop: asyncio.AbstractEventLoop
    ) -> None:
        with self._lock:
            self._subscribers.setdefault(user_id, []).append((queue, loop))

    def unsubscribe(self, user_id: str, queue: asyncio.Queue) -> None:
        with self._lock:
            subs = self._subscribers.get(user_id, [])
            remaining = [(q, loop) for q, loop in subs if q is not queue]
            if remaining:
                self._subscribers[user_id] = remaining
            else:
                self._subscribers.pop(user_id, None)

    def publish(self, user_id: str, event: dict[str, Any]) -> None:
        with self._lock:
            targets = list(self._subscribers.get(user_id, []))
        for queue, loop in targets:
            try:
                loop.call_soon_threadsafe(self._safe_put, queue, user_id, event)
            except (RuntimeError, ValueError):
                # 订阅方事件循环已关闭（断线清理竞态），忽略
                pass

    @staticmethod
    def _safe_put(queue: asyncio.Queue, user_id: str, event: dict[str, Any]) -> None:
        """在事件循环回调内安全投递：队列已满（慢消费者背压）时丢弃并记日志，
        而不是让 asyncio.QueueFull 成为事件循环里的未处理异常。"""
        try:
            queue.put_nowait(event)
        except asyncio.QueueFull:
            logger.debug("丢弃 SSE 事件 user=%s（队列已满，慢消费者背压）", user_id)

    def publish_to_users(self, user_ids: list[str], event: dict[str, Any]) -> None:
        for user_id in user_ids:
            self.publish(user_id, event)

    def subscriber_count(self, user_id: str) -> int:
        with self._lock:
            return len(self._subscribers.get(user_id, []))


broker = NotificationBroker()
