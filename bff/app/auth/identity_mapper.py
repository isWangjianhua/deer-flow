import json

from sqlalchemy.orm import Session

from app.api.errors import error_response
from app.auth.types import AuthIdentity
from app.core.security import get_password_hash
from app.models.user_identity import UserIdentity
from app.repositories.user_identity_repo import UserIdentityRepository
from app.repositories.user_repo import UserRepository


class IdentityMapper:
    def __init__(self, db: Session) -> None:
        self.user_repo = UserRepository(db)
        self.identity_repo = UserIdentityRepository(db)

    def resolve_or_create_user(self, identity: AuthIdentity):
        existing = self.identity_repo.get_by_provider_subject(identity.provider, identity.subject)
        if existing is not None:
            user = self.user_repo.get_by_id(existing.user_id)
            if user is None:
                raise error_response(500, "identity_mapping_failed", "Mapped user not found")
            return user

        user = self.user_repo.get_by_username(identity.subject)
        if user is None:
            user = self.user_repo.create_local_user(
                username=identity.subject,
                password_hash=get_password_hash("provider-managed-placeholder"),
            )

        identity_record = UserIdentity(
            user_id=user.id,
            provider=identity.provider,
            subject=identity.subject,
            email=identity.email,
            claims_json=json.dumps(identity.claims),
        )
        self.identity_repo.create(identity_record)
        return user
