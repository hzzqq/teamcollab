"""init schema: users teams team_members boards board_columns tasks task_comments notifications

Revision ID: 0001
Revises:
Create Date: 2026-08-05

与 docs/phase2/db-schema.md §2 的 8 张表 DDL 一一对应（含全部索引 + CHECK + 级联外键 + JSONB 默认）。
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _uuid_pk() -> sa.Column:
    return sa.Column(
        "id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")
    )


def upgrade() -> None:
    # ---- users ----
    op.create_table(
        "users",
        _uuid_pk(),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("display_name", sa.String(100), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")
        ),
    )
    op.create_index("uq_users_email", "users", [sa.text("lower(email)")], unique=True)
    op.create_index("idx_users_created_at", "users", ["created_at"])

    # ---- teams ----
    op.create_table(
        "teams",
        _uuid_pk(),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")
        ),
    )
    op.create_check_constraint(
        "chk_teams_name_not_blank", "teams", "LENGTH(TRIM(name)) > 0"
    )

    # ---- team_members ----
    op.create_table(
        "team_members",
        _uuid_pk(),
        sa.Column("team_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("role", sa.String(20), nullable=False, server_default="member"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")
        ),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index(
        "uq_team_members_team_user", "team_members", ["team_id", "user_id"], unique=True
    )
    op.create_index("idx_team_members_user", "team_members", ["user_id"])
    op.create_index("idx_team_members_team", "team_members", ["team_id"])
    op.create_check_constraint(
        "chk_team_members_role",
        "team_members",
        "role IN ('owner', 'admin', 'member', 'viewer')",
    )

    # ---- boards ----
    op.create_table(
        "boards",
        _uuid_pk(),
        sa.Column("team_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")
        ),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"], ondelete="CASCADE"),
    )
    op.create_index("idx_boards_team", "boards", ["team_id"])
    op.create_index("idx_boards_created_at", "boards", ["created_at"])
    op.create_check_constraint("chk_boards_name_not_blank", "boards", "LENGTH(TRIM(name)) > 0")

    # ---- board_columns ----
    op.create_table(
        "board_columns",
        _uuid_pk(),
        sa.Column("board_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")
        ),
        sa.ForeignKeyConstraint(["board_id"], ["boards.id"], ondelete="CASCADE"),
    )
    op.create_index(
        "idx_board_columns_board_position", "board_columns", ["board_id", "position"]
    )
    op.create_check_constraint(
        "chk_board_columns_name_not_blank", "board_columns", "LENGTH(TRIM(name)) > 0"
    )
    op.create_check_constraint(
        "chk_board_columns_position_nonneg", "board_columns", "position >= 0"
    )

    # ---- tasks ----
    op.create_table(
        "tasks",
        _uuid_pk(),
        sa.Column("board_id", sa.Uuid(), nullable=False),
        sa.Column("column_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("assignee_id", sa.Uuid(), nullable=True),
        sa.Column("priority", sa.String(20), nullable=False, server_default="medium"),
        sa.Column("status", sa.String(20), nullable=False, server_default="todo"),
        sa.Column("position", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")
        ),
        sa.ForeignKeyConstraint(["board_id"], ["boards.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["column_id"], ["board_columns.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["assignee_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="RESTRICT"),
    )
    op.create_index(
        "idx_tasks_board_column_position", "tasks", ["board_id", "column_id", "position"]
    )
    op.create_index("idx_tasks_assignee", "tasks", ["assignee_id"])
    op.create_index("idx_tasks_created_at", "tasks", ["created_at"])
    op.create_index("idx_tasks_due_date", "tasks", ["due_date"])
    op.create_index("idx_tasks_status", "tasks", ["status"])
    op.create_check_constraint("chk_tasks_title_not_blank", "tasks", "LENGTH(TRIM(title)) > 0")
    op.create_check_constraint(
        "chk_tasks_priority", "tasks", "priority IN ('low', 'medium', 'high', 'urgent')"
    )
    op.create_check_constraint(
        "chk_tasks_status", "tasks", "status IN ('todo', 'in_progress', 'done')"
    )
    op.create_check_constraint("chk_tasks_position_nonneg", "tasks", "position >= 0")
    op.create_check_constraint(
        "chk_tasks_dates",
        "tasks",
        "start_date IS NULL OR due_date IS NULL OR start_date <= due_date",
    )

    # ---- task_comments ----
    op.create_table(
        "task_comments",
        _uuid_pk(),
        sa.Column("task_id", sa.Uuid(), nullable=False),
        sa.Column("author_id", sa.Uuid(), nullable=False),
        sa.Column("content", sa.String(2000), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")
        ),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index(
        "idx_task_comments_task_created", "task_comments", ["task_id", "created_at"]
    )
    op.create_check_constraint(
        "chk_task_comments_content_not_blank", "task_comments", "LENGTH(TRIM(content)) > 0"
    )

    # ---- notifications ----
    op.create_table(
        "notifications",
        _uuid_pk(),
        sa.Column("team_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("type", sa.String(30), nullable=False),
        sa.Column(
            "payload",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")
        ),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index(
        "idx_notifications_user_unread_created",
        "notifications",
        ["user_id", "is_read", sa.text("created_at DESC")],
    )
    op.create_check_constraint(
        "chk_notifications_type",
        "notifications",
        "type IN ('task_assigned', 'task_moved', 'comment_added', 'task_due_soon')",
    )


def downgrade() -> None:
    op.drop_table("notifications")
    op.drop_table("task_comments")
    op.drop_table("tasks")
    op.drop_table("board_columns")
    op.drop_table("boards")
    op.drop_table("team_members")
    op.drop_table("teams")
    op.drop_table("users")
