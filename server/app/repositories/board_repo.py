"""看板/列数据访问（board_id 定位后由成员关系承担租户门禁）。"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.board import Board
from app.models.board_column import BoardColumn


class BoardRepo:
    def get_by_id(self, db: Session, board_id: uuid.UUID) -> Board | None:
        return db.get(Board, board_id)

    def list_by_team(self, db: Session, team_id: uuid.UUID) -> list[Board]:
        return list(
            db.scalars(
                select(Board).where(Board.team_id == team_id).order_by(Board.created_at.asc())
            )
        )

    def create(self, db: Session, team_id: uuid.UUID, name: str) -> Board:
        board = Board(team_id=team_id, name=name)
        db.add(board)
        return board

    # ---- 列 ----
    def get_column_by_id(self, db: Session, column_id: uuid.UUID) -> BoardColumn | None:
        return db.get(BoardColumn, column_id)

    def list_columns_by_board(self, db: Session, board_id: uuid.UUID) -> list[BoardColumn]:
        return list(
            db.scalars(
                select(BoardColumn)
                .where(BoardColumn.board_id == board_id)
                .order_by(BoardColumn.position.asc(), BoardColumn.created_at.asc())
            )
        )

    def max_column_position(self, db: Session, board_id: uuid.UUID) -> int:
        """看板内最大列 position；空板返回 -1（使下一列 position=0）。

        注意：不能写 `or 0`——max 返回 0 时 0 是 falsy 会被吞掉。
        """
        max_pos = db.scalar(
            select(func.max(BoardColumn.position)).where(BoardColumn.board_id == board_id)
        )
        return -1 if max_pos is None else max_pos

    def create_column(
        self, db: Session, board_id: uuid.UUID, name: str, position: int
    ) -> BoardColumn:
        column = BoardColumn(board_id=board_id, name=name, position=position)
        db.add(column)
        return column


board_repo = BoardRepo()
