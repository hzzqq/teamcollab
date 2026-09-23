"""性能冒烟：Spec §10「API p95 < 500ms」验收证据。

用法（限流会拦连续压测，需放开后启动后端）：
  RATE_LIMIT_GENERAL_PER_MINUTE=1000000 RATE_LIMIT_AUTH_PER_MINUTE=100000 \
      python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
  python scripts/perf_smoke.py

前提：后端已在 :8000。流程幂等可重复（注册邮箱带时间戳）：
自注册全新账号 → 建看板/3 列/120 个任务 → 并发压测核心端点：
  - GET /boards/{id}（看板详情，全量列+120 任务，最重的读路径）
  - GET /me/tasks（跨项目聚合 + 逾期置顶排序）
  - GET /boards/{id}/tasks?q=（ILIKE 搜索）
  - POST /boards/{id}/tasks（写路径小样本）
输出 p50/p95/p99/max；阈值 p95 < 500ms（Spec 锁定）。
注：看板 1000 卡片滚动流畅属前端指标（虚拟滚动预留），不在本脚本范围。
"""

import asyncio
import time

import httpx

BASE = "http://127.0.0.1:8000"
API = f"{BASE}/api/v1"
N_TASKS = 120
N_READ = 60
N_WRITE = 20
CONCURRENCY = 10
P95_BUDGET_MS = 500.0

results: list[tuple[str, list[float], bool]] = []


def pct(latencies: list[float], p: float) -> float:
    s = sorted(latencies)
    idx = min(len(s) - 1, max(0, round(p / 100 * len(s) + 0.5) - 1))
    return s[idx]


async def bench(client: httpx.AsyncClient, name: str, n: int, make_request):
    sem = asyncio.Semaphore(CONCURRENCY)
    latencies: list[float] = []
    errors: list[str] = []

    async def one() -> None:
        async with sem:
            t0 = time.perf_counter()
            try:
                resp = await make_request(client)
                ok = resp.status_code in (200, 201)
                if not ok:
                    errors.append(f"HTTP {resp.status_code}")
            except Exception as e:  # noqa: BLE001
                errors.append(str(e)[:80])
                ok = False
            latencies.append((time.perf_counter() - t0) * 1000)

    await asyncio.gather(*(one() for _ in range(n)))
    ok = not errors and pct(latencies, 95) < P95_BUDGET_MS
    results.append((name, latencies, ok))
    detail = "" if not errors else f"  errors={errors[:3]}"
    print(f"  {name:<28} p50={pct(latencies,50):6.1f}ms  p95={pct(latencies,95):6.1f}ms  "
          f"p99={pct(latencies,99):6.1f}ms  max={max(latencies):6.1f}ms  "
          f"[{'PASS' if ok else 'FAIL'}]{detail}")


async def main() -> int:
    suffix = str(int(time.time()))
    async with httpx.AsyncClient(timeout=30.0) as client:
        # ---- 造数（顺序执行，不计入压测） ----
        r = await client.post(
            f"{API}/auth/register",
            json={"email": f"perf-{suffix}@test.com", "password": "pass1234", "display_name": "性能测试"},
        )
        assert r.status_code == 201, r.text
        data = r.json()["data"]
        headers = {"Authorization": f"Bearer {data['access_token']}"}
        team_id = data["team"]["id"]

        r = await client.post(f"{API}/teams/{team_id}/boards", json={"name": "性能看板"}, headers=headers)
        board_id = r.json()["data"]["id"]
        column_ids = []
        for i, name in enumerate(["待办", "进行中", "完成"]):
            r = await client.post(
                f"{API}/boards/{board_id}/columns", json={"name": name, "position": i}, headers=headers
            )
            column_ids.append(r.json()["data"]["id"])

        t0 = time.perf_counter()
        sem = asyncio.Semaphore(CONCURRENCY)

        async def create_task(i: int) -> None:
            async with sem:
                resp = await client.post(
                    f"{API}/boards/{board_id}/tasks",
                    json={
                        "title": f"性能任务 {i}",
                        "description": "性能冒烟造数任务" * 5,
                        "column_id": column_ids[i % 3],
                        "priority": ["low", "medium", "high", "urgent"][i % 4],
                        "due_date": f"2026-12-{(i % 28) + 1:02d}",
                    },
                    headers=headers,
                )
                assert resp.status_code == 201, resp.text

        await asyncio.gather(*(create_task(i) for i in range(N_TASKS)))
        setup_s = time.perf_counter() - t0
        print(f"造数完成：1 看板 / 3 列 / {N_TASKS} 任务（{setup_s:.1f}s）\n")

        # ---- 压测 ----
        await bench(client, "GET /boards/{id} 全量", N_READ,
                    lambda c: c.get(f"{API}/boards/{board_id}", headers=headers))
        await bench(client, "GET /me/tasks 聚合", N_READ,
                    lambda c: c.get(f"{API}/me/tasks?page=1&limit=20", headers=headers))
        await bench(client, "GET tasks?q= 搜索", N_READ,
                    lambda c: c.get(f"{API}/boards/{board_id}/tasks?q=性能", headers=headers))
        await bench(client, "POST /boards/{{id}}/tasks 写", N_WRITE,
                    lambda c: c.post(
                        f"{API}/boards/{board_id}/tasks",
                        json={"title": f"压测写入 {suffix}-{time.perf_counter_ns()}", "column_id": column_ids[0]},
                        headers=headers,
                    ))

    print()
    failed = [name for name, _, ok in results if not ok]
    worst = max(pct(lats, 95) for _, lats, _ in results)
    if failed:
        print(f"PERF_SMOKE: FAIL（超预算端点：{'、'.join(failed)}）")
        return 1
    print(f"PERF_SMOKE: PASS（全部端点 p95 < {P95_BUDGET_MS:.0f}ms，最差 p95={worst:.1f}ms）")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
