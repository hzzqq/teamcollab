"""团队/成员数据访问（RBAC 角色实时查询处）。"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models.team import Team
from app.models.team_member import TeamMember


class TeamRepo:
    def get_by_id(self, db: Session, team_id: uuid.UUID) -> Team | None:
        return db.get(Team, team_id)

    def create(self, db: Session, name: str) -> Team:
        team = Team(name=name)
        db.add(team)
        return team

    def get_member(self, db: Session, team_id: uuid.UUID, user_id: uuid.UUID) -> TeamMember | None:
        return db.scalar(
            select(TeamMember).where(
                TeamMember.team_id == team_id, TeamMember.user_id == user_id
            )
        )

    def list_members(self, db: Session, team_id: uuid.UUID) -> list[TeamMember]:
        return list(
            db.scalars(
                select(TeamMember)
                .options(selectinload(TeamMember.user))
                .where(TeamMember.team_id == team_id)
                .order_by(TeamMember.created_at.asc())
            )
        )

    def count_members(self, db: Session, team_id: uuid.UUID) -> int:
        return db.scalar(
            select(func.count()).select_from(TeamMember).where(TeamMember.team_id == team_id)
        ) or 0

    def add_member(self, db: Session, team_id: uuid.UUID, user_id: uuid.UUID, role: str) -> TeamMember:
        member = TeamMember(team_id=team_id, user_id=user_id, role=role)
        db.add(member)
        return member

    def list_teams_for_user(self, db: Session, user_id: uuid.UUID) -> list[tuple[Team, str]]:
        """返回用户所属的全部团队及其角色（按加入先后排序），支撑多租户切换。"""
        rows = db.execute(
            select(Team, TeamMember.role)
            .join(TeamMember, TeamMember.team_id == Team.id)
            .where(TeamMember.user_id == user_id)
            .order_by(TeamMember.created_at.asc())
        ).all()
        return [(team, role) for team, role in rows]


team_repo = TeamRepo()
