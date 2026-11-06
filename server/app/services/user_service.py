"""用户后台服务（超级管理员专用，/admin）。

与团队内 owner/admin 角色正交：这里是平台级账号治理（创建/禁用/重置密码/
升降 superuser），不触碰团队内成员关系（那归 team_service）。

安全护栏：
- 至少保留一个超级管理员（降/删最后一个 superuser 会被拒绝）；
- 禁止管理员删除自己的账号（避免锁死后台）。
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import bad_request, conflict, forbidden, not_found
from app.core.security import hash_password
from app.models.team import Team
from app.models.team_member import TeamMember
from app.models.user import User
from app.repositories.team_repo import team_repo
from app.repositories.user_repo import user_repo


class UserService:
    def list_users(self, db: Session) -> list[User]:
        return list(
            db.scalars(select(User).order_by(User.created_at.asc(), User.email.asc()))
        )

    def list_teams(self, db: Session) -> list[tuple[Team, int]]:
        rows = (
            db.execute(
                select(Team, func.count(TeamMember.user_id))
                .join(TeamMember, TeamMember.team_id == Team.id, isouter=True)
                .group_by(Team.id)
                .order_by(Team.created_at.asc())
            )
            .all()
        )
        return [(team, int(cnt)) for team, cnt in rows]

    def get_by_id(self, db: Session, user_id: uuid.UUID) -> User:
        user = user_repo.get_by_id(db, user_id)
        if user is None:
            raise not_found("用户不存在")
        return user

    def _superuser_count(self, db: Session) -> int:
        return db.scalar(select(func.count()).select_from(User).where(User.is_superuser.is_(True))) or 0

    def create_user(
        self,
        db: Session,
        email: str,
        password: str,
        display_name: str,
        is_superuser: bool = False,
    ) -> User:
        if user_repo.get_by_email(db, email):
            raise conflict("该邮箱已注册")
        user = user_repo.create(db, email, hash_password(password), display_name)
        db.flush()  # 主键由 DB server_default 生成，取 user.id 前需 flush
        user.is_superuser = is_superuser
        # 与 auth_service.register 保持一致：每个用户自带默认团队并成为 owner。
        # 否则 login/me 组装出的 team=None 会让 AuthData/MeData 校验失败（登录直接 500），
        # 后台新建的账号将完全无法使用。
        team = team_repo.create(db, f"{display_name} 的团队"[:100])
        db.flush()
        team_repo.add_member(db, team.id, user.id, "owner")
        db.commit()
        return user

    def update_user(
        self,
        db: Session,
        user_id: uuid.UUID,
        *,
        display_name: str | None = None,
        is_superuser: bool | None = None,
    ) -> User:
        user = self.get_by_id(db, user_id)
        if is_superuser is not None and is_superuser != user.is_superuser:
            # 降权前确保至少还有一个 superuser
            if not is_superuser and self._superuser_count(db) <= 1:
                raise bad_request("至少需保留一个超级管理员")
            user.is_superuser = is_superuser
        if display_name is not None:
            user.display_name = display_name
        db.commit()
        return user

    def reset_password(self, db: Session, user_id: uuid.UUID, new_password: str) -> None:
        user = self.get_by_id(db, user_id)
        user.password_hash = hash_password(new_password)
        db.commit()

    def delete_user(self, db: Session, actor: User, user_id: uuid.UUID) -> None:
        if actor.id == user_id:
            raise forbidden("不能删除自己的账号")
        user = self.get_by_id(db, user_id)
        if user.is_superuser and self._superuser_count(db) <= 1:
            raise bad_request("至少需保留一个超级管理员，无法删除最后一个超级管理员")
        db.delete(user)
        db.commit()


user_service = UserService()
