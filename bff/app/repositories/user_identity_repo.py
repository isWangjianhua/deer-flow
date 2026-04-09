from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.user_identity import UserIdentity


class UserIdentityRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_by_provider_subject(self, provider: str, subject: str) -> UserIdentity | None:
        statement = select(UserIdentity).where(
            UserIdentity.provider == provider,
            UserIdentity.subject == subject,
        )
        return self.db.scalar(statement)

    def create(self, identity: UserIdentity) -> UserIdentity:
        self.db.add(identity)
        self.db.commit()
        self.db.refresh(identity)
        return identity
