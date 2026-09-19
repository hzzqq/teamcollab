"""SSE 发布/订阅桥。

双实现（按 settings.redis_url 选择，接口一致）：
- MemoryNotificationBroker：进程内直投（单实例 MVP 默认）；
- RedisNotificationBroker：Redis pub/sub 跨实例广播（多实例部署）。
  发布走同步客户端（服务层在同步线程调用 publish），订阅由 lifespan 启动的
  asyncio 任务经 psubscribe 接收后路由给本进程订阅者；Redis 故障时发布降级
  为日志、订阅自动重连，均不阻塞请求。

- 订阅方：SSE 端点按 user_id 订阅一个 asyncio.Queue。
- 发布方：同步请求线程（Service）经 loop.call_soon_threadsafe 投递事件。
"""

import asyncio
import json
import logging
import threading
from typing import Any

from app.core.config import get_settings

logger = logging.getLogger("app.realtime.broker")

_SSE_CHANNEL_PREFIX = "sse:u:"


def sse_channel(user_id: str) -> str:
    return f"{_SSE_CHANNEL_PREFIX}{user_id}"


class _LocalSubscribersMixin:
    """本进程订阅者注册表 + 事件循环安全投递（内存/Redis 两实现共用）。"""

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

    def subscriber_count(self, user_id: str) -> int:
        with self._lock:
            return len(self._subscribers.get(user_id, []))

    def _put_local(self, user_id: str, event: dict[str, Any]) -> None:
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


class MemoryNotificationBroker(_LocalSubscribersMixin):
    """单实例模式：发布直接投递给本进程订阅者。"""

    async def start(self) -> None:  # 接口对齐
        return None

    async def stop(self) -> None:  # 接口对齐
        return None

    def publish(self, user_id: str, event: dict[str, Any]) -> None:
        self._put_local(user_id, event)

    def publish_to_users(self, user_ids: list[str], event: dict[str, Any]) -> None:
        for user_id in user_ids:
            self.publish(user_id, event)


class RedisNotificationBroker(_LocalSubscribersMixin):
    """多实例模式：Redis pub/sub 广播 + 本进程路由。

    发布失败降级为日志（不影响请求事务）；订阅循环断开自动重连。
    """

    def __init__(self, redis_url: str) -> None:
        super().__init__()
        self._redis_url = redis_url
        self._pub_client: Any = None  # 同步客户端，首次发布时惰性创建（线程安全）
        self._sub_client: Any = None
        self._listen_task: asyncio.Task | None = None

    async def start(self) -> None:
        import redis.asyncio as aioredis

        self._aioredis = aioredis
        self._listen_task = asyncio.create_task(self._listen(), name="sse-redis-listen")
        logger.info("SSE Redis broker 已启动（pub/sub 模式）")

    async def stop(self) -> None:
        if self._listen_task is not None:
            self._listen_task.cancel()
            try:
                await self._listen_task
            except asyncio.CancelledError:
                pass
            self._listen_task = None
        if self._sub_client is not None:
            await self._sub_client.aclose()
            self._sub_client = None
        if self._pub_client is not None:
            self._pub_client.close()
            self._pub_client = None

    async def _listen(self) -> None:
        while True:
            try:
                self._sub_client = self._aioredis.from_url(
                    self._redis_url, decode_responses=True
                )
                pubsub = self._sub_client.pubsub()
                await pubsub.psubscribe(f"{_SSE_CHANNEL_PREFIX}*")
                async for msg in pubsub.listen():
                    if msg.get("type") == "pmessage":
                        self._route(str(msg["channel"]), str(msg["data"]))
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Redis SSE 订阅断开，5s 后重连")
                await asyncio.sleep(5)

    def _route(self, channel: str, data: str) -> None:
        user_id = channel.removeprefix(_SSE_CHANNEL_PREFIX)
        try:
            event = json.loads(data)
        except json.JSONDecodeError:
            logger.warning("丢弃非法 SSE 消息 channel=%s", channel)
            return
        self._put_local(user_id, event)

    def _get_pub(self) -> Any:
        import redis

        if self._pub_client is None:
            self._pub_client = redis.Redis.from_url(self._redis_url)
        return self._pub_client

    def publish(self, user_id: str, event: dict[str, Any]) -> None:
        try:
            self._get_pub().publish(
                sse_channel(user_id), json.dumps(event, ensure_ascii=False, default=str)
            )
        except Exception:
            # Redis 不可用：降级为日志，不阻塞请求（通知已落库，不丢）
            logger.exception("Redis SSE 发布失败 user=%s（已落库通知不受影响）", user_id)

    def publish_to_users(self, user_ids: list[str], event: dict[str, Any]) -> None:
        for user_id in user_ids:
            self.publish(user_id, event)


def get_broker() -> MemoryNotificationBroker | RedisNotificationBroker:
    """按配置选择 broker 实现：REDIS_URL 非空启用多实例模式。"""
    settings = get_settings()
    if settings.redis_url:
        return RedisNotificationBroker(settings.redis_url)
    return MemoryNotificationBroker()


broker = get_broker()
