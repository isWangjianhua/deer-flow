from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.user import User


class UserRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_by_username(self, username: str) -> User | None:
        return self.db.scalar(select(User).where(User.username == username))

    def get_by_id(self, user_id: str) -> User | None:
        return self.db.scalar(select(User).where(User.id == user_id))

    def create_local_user(self, username: str, password_hash: str, status: str = "active") -> User:
        user = User(username=username, password_hash=password_hash, status=status)
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user
