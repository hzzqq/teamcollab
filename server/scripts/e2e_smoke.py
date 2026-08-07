"""端到端冒烟：证明 TeamCollab 后端「真能跑、核心功能可用」。

与 .pgtmp/smoke.py 的区别：本脚本自注册全新用户（不依赖 seed 数据），
因此可重复运行、无副作用。覆盖：注册/登录/me/me-teams/看板/列/任务/
评论/拖拽移动/我的任务/通知/RBAC 越权拦截/SSE 实时流/CORS。

前置：PostgreSQL 已启动 + alembic upgrade head + uvicorn 在 :8000。
用法：python scripts/e2e_smoke.py [BASE_URL]
"""

import sys
import time
import uuid
from datetime import date

import httpx

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000"

PASSED, FAILED = [], []


def check(name, cond, detail=""):
    if cond:
        PASSED.append(name)
        print(f"  PASS  {name}")
    else:
        FAILED.append(name)
        print(f"  FAIL  {name}  {detail}")


def register(c, email=None, display_name=None, password="pass1234"):
    email = email or f"e2e-{uuid.uuid4().hex[:10]}@example.com"
    display_name = display_name or f"E2E{uuid.uuid4().hex[:6]}"
    r = c.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "display_name": display_name},
    )
    assert r.status_code == 201, f"注册失败 {r.status_code} {r.text[:120]}"
    d = r.json()["data"]
    return {
        "email": email,
        "password": password,
        "user": d["user"],
        "team": d["team"],
        "access_token": d["access_token"],
        "refresh_token": d["refresh_token"],
        "headers": {"Authorization": f"Bearer {d['access_token']}"},
    }


def main():
    with httpx.Client(timeout=15, base_url=BASE) as c:
        # 0. 健康检查（OpenAPI 可达）
        r = c.get("/openapi.json")
        check("openapi", r.status_code == 200 and "TeamCollab" in r.text, f"{r.status_code}")

        # 1. 注册主账号 A（自动建团队）
        a = register(c)
        H = a["headers"]
        team_id = a["team"]["id"]

        # 2. /me
        r = c.get("/api/v1/me", headers=H)
        check("me", r.status_code == 200 and r.json()["data"]["team"]["id"] == team_id, r.text[:120])

        # 3. /me/teams（cycle2 新增端点）
        r = c.get("/api/v1/me/teams", headers=H)
        check("me_teams", r.status_code == 200 and len(r.json()["data"]) >= 1, r.text[:120])

        # 4. 建看板
        r = c.post(f"/api/v1/teams/{team_id}/boards", json={"name": "E2E 看板"}, headers=H)
        check("create_board", r.status_code == 201 and r.json()["code"] == 0, f"{r.status_code} {r.text[:120]}")
        board = r.json()["data"]

        # 5. 建三列
        col_ids = []
        for name, pos in [("待办", 0), ("进行中", 1), ("完成", 2)]:
            r = c.post(f"/api/v1/boards/{board['id']}/columns", json={"name": name, "position": pos}, headers=H)
            check(f"create_column_{name}", r.status_code == 201, f"{r.status_code} {r.text[:120]}")
            col_ids.append(r.json()["data"]["id"])

        # 6. 建任务（指派给创建者本人，使其出现在「我的任务」）
        r = c.post(
            f"/api/v1/boards/{board['id']}/tasks",
            json={"title": "E2E 任务", "column_id": col_ids[0], "priority": "high", "assignee_id": a["user"]["id"]},
            headers=H,
        )
        check("create_task", r.status_code == 201 and r.json()["code"] == 0, f"{r.status_code} {r.text[:120]}")
        task = r.json()["data"]

        # 7. 更新任务状态
        r = c.patch(f"/api/v1/tasks/{task['id']}", json={"status": "in_progress"}, headers=H)
        check("update_task", r.status_code == 200 and r.json()["data"]["status"] == "in_progress", r.text[:120])

        # 8. 评论 + 列表
        r = c.post(f"/api/v1/tasks/{task['id']}/comments", json={"content": "E2E 评论"}, headers=H)
        check("create_comment", r.status_code == 201, f"{r.status_code} {r.text[:120]}")
        r = c.get(f"/api/v1/tasks/{task['id']}/comments", headers=H)
        check("list_comments", r.status_code == 200 and len(r.json()["data"]["items"]) >= 1, r.text[:120])

        # 9. 拖拽移动任务（跨列）
        r = c.patch(
            f"/api/v1/boards/{board['id']}/columns/{col_ids[1]}/tasks/{task['id']}/position",
            json={"target_column_id": col_ids[1], "position": 0},
            headers=H,
        )
        check("move_task", r.status_code == 200 and r.json()["data"]["column_id"] == col_ids[1], f"{r.status_code} {r.text[:120]}")

        # 10. 我的任务聚合
        r = c.get("/api/v1/me/tasks", headers=H)
        check("my_tasks", r.status_code == 200 and r.json()["data"]["total"] >= 1, r.text[:120])

        # 11. 通知列表
        r = c.get("/api/v1/notifications", headers=H)
        check("notifications", r.status_code == 200 and "items" in r.json()["data"], f"{r.status_code} {r.text[:120]}")

        # 11.5 到期提醒（AC-08）：建一个当日到期、指派给本人的任务，登录触发惰性检查 -> 生成 task_due_soon
        r = c.post(
            f"/api/v1/boards/{board['id']}/tasks",
            json={"title": "E2E 到期任务", "column_id": col_ids[0], "assignee_id": a["user"]["id"], "due_date": date.today().isoformat()},
            headers=H,
        )
        check("create_due_task", r.status_code == 201, f"{r.status_code} {r.text[:120]}")
        r = c.post(
            "/api/v1/auth/login",
            data={"username": a["email"], "password": a["password"]},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        check("login_trigger", r.status_code == 200, f"{r.status_code} {r.text[:120]}")
        r = c.get("/api/v1/notifications?unread=true", headers=H)
        due = [n for n in r.json()["data"]["items"] if n["type"] == "task_due_soon"]
        check("due_soon_notification", len(due) >= 1, f"task_due_soon 数量={len(due)}")

        # 12. RBAC：注册 B（独立团队）越权读 A 的看板 -> 40401
        b = register(c)
        r = c.get(f"/api/v1/teams/{team_id}/boards", headers=b["headers"])
        check("cross_team_404", r.status_code == 404 and r.json()["code"] == 40401, f"{r.status_code} {r.text[:120]}")

        # 13. SSE 实时通知流：连接后应收到 connected 事件
        sse_ok = False
        try:
            with httpx.Client(timeout=6, base_url=BASE) as s:
                with s.stream("GET", f"/api/v1/notifications/stream?token={a['access_token']}") as resp:
                    check("sse_connect", resp.status_code == 200 and resp.headers.get("content-type", "").startswith("text/event-stream"), f"{resp.status_code} {resp.headers.get('content-type')}")
                    for line in resp.iter_lines():
                        if "connected" in line:
                            sse_ok = True
                            break
            check("sse_event", sse_ok, "未收到 connected 事件")
        except Exception as e:  # noqa: BLE001
            check("sse_event", False, str(e)[:120])

        # 14. CORS：浏览器跨域预检/实际请求应带允许头
        r = c.get("/api/v1/me", headers={**H, "Origin": "http://localhost:3000"})
        allow = r.headers.get("access-control-allow-origin")
        check("cors", allow in (None, "http://localhost:3000") or allow == "*", f"allow-origin={allow}")
        # 实际跨域请求需返回具体 origin（非 *，因带凭证）
        check("cors_explicit", allow == "http://localhost:3000", f"allow-origin={allow}")

    print(f"\nRESULT: {len(PASSED)} passed, {len(FAILED)} failed")
    if FAILED:
        print("FAILED:", FAILED)
    sys.exit(1 if FAILED else 0)


if __name__ == "__main__":
    main()
