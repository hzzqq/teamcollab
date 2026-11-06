"""模型聚合导出（Alembic autogenerate 与业务层统一从这里导入）。"""

from app.core.db import Base
from app.models.board import Board
from app.models.board_column import BoardColumn
from app.models.label import Label, task_labels
from app.models.notification import Notification
from app.models.saved_view import SavedView
from app.models.task import Task
from app.models.task_activity import TaskActivity
from app.models.task_comment import TaskComment
from app.models.team import Team
from app.models.team_member import TeamMember
from app.models.user import User

__all__ = [
    "Base",
    "User",
    "Team",
    "TeamMember",
    "Board",
    "BoardColumn",
    "Task",
    "TaskActivity",
    "SavedView",
    "TaskComment",
    "Notification",
    "Label",
    "task_labels",
]
