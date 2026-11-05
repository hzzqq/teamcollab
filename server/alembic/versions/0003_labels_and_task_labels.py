"""labels + task_labels 表（团队级标签 + 任务多对多）

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-05

标签是团队级资源；task_labels 为任务与标签的关联表（双 CASCADE，删标签解绑任务、
删任务解绑标签）。color 限定固定调色板，与前端 tag-* 令牌对齐。
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "labels",
        sa.Column(
            "id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column("team_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(50), nullable=False),
        sa.Column("color", sa.String(20), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"], ondelete="CASCADE"),
    )
    op.create_index("idx_labels_team", "labels", ["team_id"])
    op.create_check_constraint(
        "chk_labels_name_not_blank", "labels", "LENGTH(TRIM(name)) > 0"
    )
    op.create_check_constraint(
        "chk_labels_color",
        "labels",
        "color IN ('blue', 'green', 'amber', 'rose', 'slate')",
    )

    op.create_table(
        "task_labels",
        sa.Column("task_id", sa.Uuid(), nullable=False),
        sa.Column("label_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["label_id"], ["labels.id"], ondelete="CASCADE"),
    )
    op.create_index(
        "uq_task_labels_task_label", "task_labels", ["task_id", "label_id"], unique=True
    )


def downgrade() -> None:
    op.drop_table("task_labels")
    op.drop_table("labels")
