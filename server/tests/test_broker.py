"""实时 broker 健壮性测试：慢消费者背压下发布不崩溃。"""

import asyncio

from app.realtime.broker import broker


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
