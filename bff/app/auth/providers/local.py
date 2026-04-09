from sqlalchemy.orm import Session

from app.api.errors import error_response
from app.auth.providers.base import AuthProvider
from app.auth.types import AuthIdentity
from app.core.security import verify_password
from app.repositories.user_repo import UserRepository


class LocalAuthProvider(AuthProvider):
    def __init__(self, db: Session) -> None:
        self.user_repo = UserRepository(db)

    @property
    def name(self) -> str:
        return "local"

    def authenticate_credentials(self, username: str, password: str) -> AuthIdentity:
        user = self.user_repo.get_by_username(username)
        if user is None or not verify_password(password, user.password_hash):
            raise error_response(401, "invalid_credentials", "Invalid credentials")
        return AuthIdentity(
            provider="local",
            subject=user.username,
            claims={"user_id": user.id, "username": user.username},
        )

    def resolve_token_identity(self, user_id: str) -> AuthIdentity:
        user = self.user_repo.get_by_id(user_id)
        if user is None:
            raise error_response(401, "user_not_found", "User not found")
        return AuthIdentity(
            provider="local",
            subject=user.username,
            claims={"user_id": user.id, "username": user.username},
        )
