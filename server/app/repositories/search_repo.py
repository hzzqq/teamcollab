"""全局搜索数据访问。

租户隔离要点：tasks 表**没有 team_id**，归属只能经由 boards.team_id 得到。
因此任何跨看板查询都必须带 `Board.team_id.in_(team_ids)`，team_ids 由上层
从 team_members 按当前登录用户实时取出；本层不信任调用方传入的看板 ID。
"""

import uuid

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models.board import Board
from app.models.board_column import BoardColumn
from app.models.task import Task
from app.models.team import Team

LIKE_ESCAPE = "\\"


def escape_like(value: str) -> str:
    """把 LIKE 通配符转义为字面量。

    否则用户输入 `%` 会退化成「匹配全部任务」，既不是期望结果，也会把
    其它团队的任务带进候选集（虽然仍被 team_ids 过滤，但结果完全失真）。
    """
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


class SearchRepo:
    def search_tasks(
        self, db: Session, team_ids: list[uuid.UUID], q: str, limit: int
    ) -> list[dict]:
        if not team_ids:
            return []
        pattern = f"%{escape_like(q)}%"
        stmt = (
            select(
                Task.id,
                Task.title,
                Task.description,
                Task.board_id,
                Board.name.label("board_name"),
                Board.team_id,
                Team.name.label("team_name"),
                Task.column_id,
                BoardColumn.name.label("column_name"),
                Task.priority,
                Task.status,
                Task.due_date,
            )
            .join(Board, Task.board_id == Board.id)
            .join(Team, Board.team_id == Team.id)
            .join(BoardColumn, Task.column_id == BoardColumn.id)
            .where(
                Board.team_id.in_(team_ids),
                or_(
                    Task.title.ilike(pattern, escape=LIKE_ESCAPE),
                    Task.description.ilike(pattern, escape=LIKE_ESCAPE),
                ),
            )
            .order_by(Task.updated_at.desc(), Task.id)
            .limit(limit)
        )
        return [dict(row) for row in db.execute(stmt).mappings()]

    def search_boards(
        self, db: Session, team_ids: list[uuid.UUID], q: str, limit: int
    ) -> list[dict]:
        if not team_ids:
            return []
        pattern = f"%{escape_like(q)}%"
        stmt = (
            select(
                Board.id,
                Board.name,
                Board.team_id,
                Team.name.label("team_name"),
            )
            .join(Team, Board.team_id == Team.id)
            .where(
                Board.team_id.in_(team_ids),
                Board.name.ilike(pattern, escape=LIKE_ESCAPE),
            )
            .order_by(Board.updated_at.desc(), Board.id)
            .limit(limit)
        )
        return [dict(row) for row in db.execute(stmt).mappings()]


search_repo = SearchRepo()
