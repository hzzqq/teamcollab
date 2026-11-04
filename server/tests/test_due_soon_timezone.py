"""到期提醒窗口的时区回归测试。

背景：tasks.due_date 是无时区的 date，语义是「用户的本地自然日」。
历史缺陷：窗口用 UTC 计算 now 后取 .date()，在 UTC+8 下比本地日少算一天 ——
本地「明天」到期���任务落在 24 小时窗口之外，到期提醒漏发。

本文件锁死「本地明天到期必须能触发提醒」这一行为。
"""

from datetime import date, datetime, timedelta

from app.services.due_soon_service import due_soon_window


def test_due_soon_window_covers_local_tomorrow():
    """窗口上界必须覆盖本地「明天」——这是到期提醒的核心语义。"""
    start, end = due_soon_window()
    local_today = datetime.now().astimezone().date()
    local_tomorrow = local_today + timedelta(days=1)

    assert start.date() <= local_today, "窗口下界应覆盖今天"
    assert end.date() >= local_tomorrow, (
        f"窗口上界 {end.date()} 未覆盖本地明天 {local_tomorrow} —— "
        "到期提醒会漏发（时区回归）"
    )


def test_due_soon_window_uses_local_timezone_not_utc():
    """窗口按本地时区计算：与本地 today 对齐，而非 UTC 日期。"""
    start, end = due_soon_window()
    local_today = datetime.now().astimezone().date()
    utc_today = datetime.now(tz=None).astimezone(tz=datetime.now().astimezone().tzinfo).date()
    assert start.date() == local_today
    assert start.date() == utc_today


def test_due_soon_window_span_is_24h_plus_5min_buffer():
    """窗口跨度：24h 未来 + 5min 过去缓冲。"""
    start, end = due_soon_window()
    span = end - start
    assert span == timedelta(hours=24, minutes=5)


def test_due_soon_window_accepts_injected_now():
    """支持注入 now（便于确定性测试）。"""
    fixed = datetime(2026, 11, 5, 0, 7, tzinfo=datetime.now().astimezone().tzinfo)
    start, end = due_soon_window(fixed)
    assert start.date() == fixed.date()
    assert end.date() == fixed.date() + timedelta(days=1)
