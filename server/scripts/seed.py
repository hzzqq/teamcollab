"""开发种子数据：1 个 owner 用户 + 默认团队 + 示例看板/列/任务。

用法（server/ 目录下，需先完成 alembic upgrade head）：
    .venv/Scripts/python.exe -m scripts.seed
"""

import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.db import SessionLocal
from app.core.security import hash_password
from app.models.board import Board
from app.models.board_column import BoardColumn
from app.models.task import Task
from app.models.team import Team
from app.models.team_member import TeamMember
from app.repositories.user_repo import user_repo


def main() -> None:
    db = SessionLocal()
    try:
        email = "pm@example.com"
        existing = user_repo.get_by_email(db, email)
        if existing:
            print(f"种子已存在（{email}），跳过")
            return
        user = user_repo.create(db, email, hash_password("pass1234"), "PM 晓明")
        teammate = user_repo.create(db, "dev@example.com", hash_password("pass1234"), "开发 阿强")
        team = Team(name="Demo 产品团队")
        db.add(team)
        db.flush()
        db.add(TeamMember(team_id=team.id, user_id=user.id, role="owner"))
        db.add(TeamMember(team_id=team.id, user_id=teammate.id, role="member"))
        board = Board(team_id=team.id, name="产品迭代 v1.0")
        db.add(board)
        db.flush()
        col_todo = BoardColumn(board_id=board.id, name="待办", position=0)
        col_doing = BoardColumn(board_id=board.id, name="进行中", position=1)
        col_done = BoardColumn(board_id=board.id, name="完成", position=2)
        db.add_all([col_todo, col_doing, col_done])
        db.flush()
        db.add_all(
            [
                Task(
                    board_id=board.id,
                    column_id=col_todo.id,
                    title="梳理 MVP 验收主线",
                    description="对照 Spec §9 逐条核对",
                    priority="high",
                    status="todo",
                    position=0,
                    created_by=user.id,
                    assignee_id=user.id,
                    due_date=date.today() + timedelta(days=3),
                ),
                Task(
                    board_id=board.id,
                    column_id=col_doing.id,
                    title="实现看板拖拽落位",
                    description="dnd-kit + position 批量更新",
                    priority="urgent",
                    status="in_progress",
                    position=0,
                    created_by=user.id,
                    assignee_id=user.id,
                    due_date=date.today() + timedelta(days=6),
                ),
                # 指派给队友、临近到期的任务：演示跨用户指派与登录到期提醒
                Task(
                    board_id=board.id,
                    column_id=col_todo.id,
                    title="联调通知实时推送（SSE）",
                    description="owner 指派给队友，队友登录即收到 task_assigned + 到期提醒",
                    priority="medium",
                    status="todo",
                    position=1,
                    created_by=user.id,
                    assignee_id=teammate.id,
                    due_date=date.today() + timedelta(days=1),
                ),
            ]
        )
        db.commit()
        print(
            f"种子完成：\n"
            f"  PM   : {email} / pass1234（owner）\n"
            f"  开发 : dev@example.com / pass1234（member）\n"
            f"  团队={team.name}，看板={board.name}（含 3 个任务，其中 1 个指派给队友且临近到期）"
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
