"""实时 broker 健壮性测试：慢消费者背压 + 双实现（内存/Redis）路由。"""

import asyncio
import json
from types import SimpleNamespace

from app.realtime import broker as broker_mod
from app.realtime.broker import broker, sse_channel


def test_safe_put_swallows_queue_full():
    """队列已满时 _safe_put 必须吞掉 asyncio.QueueFull，而非抛异常。"""

    async def run() -> int:
        q: asyncio.Queue = asyncio.Queue(maxsize=1)
        await q.put("old")
        broker._safe_put(q, "u1", {"event": "new"})
        return q.qsize()

    # 仍为 1：新事件被安全丢弃，原事件保留，且未抛异常
    assert asyncio.run(run()) == 1


def test_publish_to_full_queue_does_not_raise():
    """经事件循环发布到已满队列：触发方不应抛异常，循环回调也不崩溃。"""

    async def run() -> tuple[int, bool]:
        q: asyncio.Queue = asyncio.Queue(maxsize=1)
        await q.put("old")
        loop = asyncio.get_running_loop()
        broker.subscribe("u2", q, loop)
        try:
            broker.publish("u2", {"event": "new"})  # 调度到循环回调执行
            await asyncio.sleep(0.02)  # 让 call_soon_threadsafe 回调跑完
        finally:
            broker.unsubscribe("u2", q)
        return q.qsize(), q.full()

    size, full = asyncio.run(run())
    assert size == 1 and full


def test_get_broker_memory_by_default(monkeypatch):
    """REDIS_URL 为空（默认）→ 进程内内存 broker。"""
    monkeypatch.setattr(broker_mod, "get_settings", lambda: SimpleNamespace(redis_url=""))
    assert isinstance(broker_mod.get_broker(), broker_mod.MemoryNotificationBroker)


def test_get_broker_redis_when_configured(monkeypatch):
    """REDIS_URL 配置后 → Redis pub/sub broker。"""
    monkeypatch.setattr(
        broker_mod, "get_settings", lambda: SimpleNamespace(redis_url="redis://localhost:6379/0")
    )
    assert isinstance(broker_mod.get_broker(), broker_mod.RedisNotificationBroker)


def test_redis_broker_routes_message_to_local_subscriber():
    """Redis broker 收到 pmessage 后正确路由给本进程订阅者。"""
    rb = broker_mod.RedisNotificationBroker("redis://localhost:6379/0")

    async def run() -> int:
        q: asyncio.Queue = asyncio.Queue(maxsize=10)
        loop = asyncio.get_running_loop()
        rb.subscribe("u9", q, loop)
        try:
            rb._route(sse_channel("u9"), json.dumps({"type": "task_assigned", "payload": {}}))
            await asyncio.sleep(0.02)
        finally:
            rb.unsubscribe("u9", q)
        return q.qsize()

    assert asyncio.run(run()) == 1


def test_redis_broker_route_invalid_json_dropped():
    """非法 JSON 消息被丢弃且不抛异常。"""
    rb = broker_mod.RedisNotificationBroker("redis://localhost:6379/0")

    async def run() -> int:
        q: asyncio.Queue = asyncio.Queue(maxsize=10)
        loop = asyncio.get_running_loop()
        rb.subscribe("uX", q, loop)
        try:
            rb._route(sse_channel("uX"), "not-json")
            await asyncio.sleep(0.02)
        finally:
            rb.unsubscribe("uX", q)
        return q.qsize()

    assert asyncio.run(run()) == 0


def test_redis_broker_publish_failure_does_not_raise(monkeypatch):
    """Redis 不可用时发布降级为日志，不向请求方抛异常。"""
    rb = broker_mod.RedisNotificationBroker("redis://127.0.0.1:1/0")  # 必然连不上
    rb.publish("uY", {"type": "task_moved"})  # 不应抛异常
    rb.publish_to_users(["uY", "uZ"], {"type": "task_moved"})  # 批量同样不抛
