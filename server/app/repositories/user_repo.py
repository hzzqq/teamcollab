"""用户数据访问。"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.user import User


class UserRepo:
    def get_by_id(self, db: Session, user_id: uuid.UUID) -> User | None:
        return db.get(User, user_id)

    def get_by_email(self, db: Session, email: str) -> User | None:
        normalized = email.strip().lower()
        return db.scalar(select(User).where(func.lower(User.email) == normalized))

    def create(self, db: Session, email: str, password_hash: str, display_name: str) -> User:
        user = User(email=email.strip().lower(), password_hash=password_hash, display_name=display_name)
        db.add(user)
        return user


user_repo = UserRepo()
