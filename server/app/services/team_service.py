"""团队/成员服务：建团、成员列表、邀请、改角色、移除（owner 保护）。"""

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import bad_request, conflict, forbidden, not_found
from app.models.team import Team
from app.models.team_member import TeamMember
from app.models.user import User
from app.repositories.team_repo import team_repo
from app.repositories.user_repo import user_repo

MAX_MEMBERS = 100


class TeamService:
    def list_user_team_ids(self, db: Session, user_id: uuid.UUID) -> list[uuid.UUID]:
        return list(db.scalars(select(TeamMember.team_id).where(TeamMember.user_id == user_id)))

    def list_teams_for_user(self, db: Session, user_id: uuid.UUID) -> list[tuple[Team, str]]:
        return team_repo.list_teams_for_user(db, user_id)

    def create(self, db: Session, user: User, name: str) -> Team:
        team = team_repo.create(db, name)
        db.flush()  # 主键为 DB 侧生成，flush 后才能取到 team.id
        team_repo.add_member(db, team.id, user.id, "owner")
        db.commit()
        return team

    def list_members(self, db: Session, team_id: uuid.UUID) -> list[dict[str, Any]]:
        members = team_repo.list_members(db, team_id)
        return [
            {"user": m.user, "role": m.role, "created_at": m.created_at}
            for m in members
        ]

    def invite(
        self, db: Session, team_id: uuid.UUID, email: str, role: str
    ) -> dict[str, Any]:
        target = user_repo.get_by_email(db, email)
        if not target:
            raise bad_request("该邮箱尚未注册，无法邀请")
        if team_repo.get_member(db, team_id, target.id):
            raise conflict("该成员已在团队中")
        if team_repo.count_members(db, team_id) >= MAX_MEMBERS:
            raise conflict(f"团队成员数量已达上限 {MAX_MEMBERS}")
        member = team_repo.add_member(db, team_id, target.id, role)
        db.commit()
        return {"user": target, "role": member.role, "created_at": member.created_at}

    def change_role(
        self, db: Session, team_id: uuid.UUID, target_user_id: uuid.UUID, role: str
    ) -> dict[str, Any]:
        member = team_repo.get_member(db, team_id, target_user_id)
        if not member:
            raise not_found("成员不存在")
        if member.role == "owner":
            raise bad_request("owner 角色不可被修改")
        member.role = role
        db.commit()
        user = user_repo.get_by_id(db, target_user_id)
        return {"user": user, "role": member.role, "created_at": member.created_at}

    def remove_member(
        self, db: Session, team_id: uuid.UUID, target_user_id: uuid.UUID
    ) -> None:
        member = team_repo.get_member(db, team_id, target_user_id)
        if not member:
            raise not_found("成员不存在")
        if member.role == "owner":
            raise forbidden("owner 不可被移除")
        db.delete(member)
        db.commit()


team_service = TeamService()
