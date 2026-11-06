"""看板/列服务。"""

from __future__ import annotations

import uuid
from collections import defaultdict

from sqlalchemy.orm import Session

from app.core.errors import conflict, not_found
from app.models.board import Board
from app.models.board_column import BoardColumn
from app.repositories.board_repo import board_repo
from app.repositories.task_repo import task_repo


class BoardService:
    def list_boards(self, db: Session, team_id: uuid.UUID) -> list[Board]:
        return board_repo.list_by_team(db, team_id)

    def create(self, db: Session, team_id: uuid.UUID, name: str) -> Board:
        board = board_repo.create(db, team_id, name)
        db.commit()
        return board

    def get_detail(self, db: Session, board_id: uuid.UUID, team_id: uuid.UUID) -> dict:
        board = self._get_owned(db, board_id, team_id)
        columns = board_repo.list_columns_by_board(db, board_id)
        tasks_by_column: dict[uuid.UUID, list] = defaultdict(list)
        top_level: list = []
        if columns:
            col_ids = [c.id for c in columns]
            for task in task_repo.list_by_columns(db, col_ids):
                tasks_by_column[task.column_id].append(task)
                top_level.append(task)
        # 一次性批量统计每个顶层任务的直接子任务数，挂到对象上供前端列表视图展示层级
        if top_level:
            counts = task_repo.count_subtasks_batch(db, [t.id for t in top_level])
            for t in top_level:
                t.subtask_count = counts.get(t.id, 0)  # 非映射字段，序列化时由 from_attributes 读取
        return {
            "id": board.id,
            "team_id": board.team_id,
            "name": board.name,
            "columns": [
                {
                    "id": c.id,
                    "board_id": c.board_id,
                    "name": c.name,
                    "position": c.position,
                    "tasks": tasks_by_column.get(c.id, []),
                }
                for c in columns
            ],
        }

    def update(self, db: Session, board_id: uuid.UUID, team_id: uuid.UUID, name: str) -> Board:
        board = self._get_owned(db, board_id, team_id)
        board.name = name
        db.commit()
        return board

    def delete(self, db: Session, board_id: uuid.UUID, team_id: uuid.UUID) -> None:
        board = self._get_owned(db, board_id, team_id)
        db.delete(board)
        db.commit()

    def create_column(
        self, db: Session, board_id: uuid.UUID, team_id: uuid.UUID, name: str, position: int | None
    ) -> BoardColumn:
        self._get_owned(db, board_id, team_id)
        pos = position if position is not None else board_repo.max_column_position(db, board_id) + 1
        column = board_repo.create_column(db, board_id, name, pos)
        db.commit()
        return column

    def update_column(
        self,
        db: Session,
        column_id: uuid.UUID,
        team_id: uuid.UUID,
        name: str | None,
        position: int | None,
    ) -> BoardColumn:
        column = self._get_owned_column(db, column_id, team_id)
        if name is not None:
            column.name = name
        if position is not None:
            column.position = position
        db.commit()
        return column

    def delete_column(self, db: Session, column_id: uuid.UUID, team_id: uuid.UUID) -> None:
        column = self._get_owned_column(db, column_id, team_id)
        # 非空保护：tasks.column_id 是 ON DELETE CASCADE，若直接删列会静默连删任务，
        # 对协作场景属数据丢失，故先拦截，引导用户清空/移动任务。
        if task_repo.count_by_column(db, column_id) > 0:
            raise conflict("该列仍有任务，请先清空或移动任务后再删除")
        db.delete(column)
        db.commit()

    @staticmethod
    def _get_owned(db: Session, board_id: uuid.UUID, team_id: uuid.UUID) -> Board:
        board = board_repo.get_by_id(db, board_id)
        if board is None or board.team_id != team_id:
            raise not_found("看板不存在")
        return board

    @staticmethod
    def _get_owned_column(db: Session, column_id: uuid.UUID, team_id: uuid.UUID) -> BoardColumn:
        column = board_repo.get_column_by_id(db, column_id)
        if column is None:
            raise not_found("列不存在")
        board = board_repo.get_by_id(db, column.board_id)
        if board is None or board.team_id != team_id:
            raise not_found("列不存在")
        return column


board_service = BoardService()
