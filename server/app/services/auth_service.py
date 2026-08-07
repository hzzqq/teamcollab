"""认证服务：注册（用户+默认团队+owner）、登录（OAuth2）、刷新。"""

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import conflict, unauthorized
from app.core.security import create_access_token, create_refresh_token, decode_token, hash_password, verify_password
from app.models.team_member import TeamMember
from app.models.user import User
from app.repositories.team_repo import team_repo
from app.repositories.user_repo import user_repo
from app.services.due_soon_service import due_soon_service
from app.services.notification_service import notification_service

MAX_TEAM_NAME_LEN = 100


class AuthService:
    def register(self, db: Session, email: str, password: str, display_name: str) -> dict[str, Any]:
        if user_repo.get_by_email(db, email):
            raise conflict("该邮箱已注册")
        user = user_repo.create(db, email, hash_password(password), display_name)
        team_name = f"{display_name} 的团队"[:MAX_TEAM_NAME_LEN]
        team = team_repo.create(db, team_name)
        db.flush()  # 主键为 DB 侧 server_default 生成，flush 后才能取到 user.id / team.id
        team_repo.add_member(db, team.id, user.id, "owner")
        db.commit()
        access_token, expires_in = create_access_token(str(user.id))
        refresh_token, _ = create_refresh_token(str(user.id))
        return {
            "user": user,
            "team": team,
            "role": "owner",
            "access_token": access_token,
            "refresh_token": refresh_token,
            "expires_in": expires_in,
        }

    def login(self, db: Session, email: str, password: str) -> dict[str, Any]:
        user = user_repo.get_by_email(db, email)
        if not user or not verify_password(password, user.password_hash):
            raise unauthorized("邮箱或密码错误")
        member = self._default_membership(db, user.id)
        team = team_repo.get_by_id(db, member.team_id) if member else None
        role = member.role if member else "member"

        access_token, expires_in = create_access_token(str(user.id))
        refresh_token, _ = create_refresh_token(str(user.id))

        # 惰性到期提醒（AC-08）：登录即检查并即时 SSE 推送
        created = due_soon_service.check(db, user.id)
        if created:
            db.commit()
            for n in created:
                notification_service.publish(n)
        else:
            db.commit()

        return {
            "user": user,
            "team": team,
            "role": role,
            "access_token": access_token,
            "refresh_token": refresh_token,
            "expires_in": expires_in,
        }

    def refresh(self, db: Session, refresh_token: str) -> dict[str, Any]:
        payload = decode_token(refresh_token, expected_type="refresh")
        user = user_repo.get_by_id(db, uuid.UUID(payload["sub"]))
        if not user:
            raise unauthorized("用户不存在或凭证已失效")
        access_token, expires_in = create_access_token(str(user.id))
        return {"access_token": access_token, "expires_in": expires_in}

    def me(self, db: Session, user: User) -> dict[str, Any]:
        member = self._default_membership(db, user.id)
        team = team_repo.get_by_id(db, member.team_id) if member else None
        role = member.role if member else None
        return {"user": user, "team": team, "role": role}

    @staticmethod
    def _default_membership(db: Session, user_id: uuid.UUID) -> TeamMember | None:
        return db.scalar(
            select(TeamMember)
            .where(TeamMember.user_id == user_id)
            .order_by(TeamMember.created_at.asc())
            .limit(1)
        )


auth_service = AuthService()
