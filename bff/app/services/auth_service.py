from sqlalchemy.orm import Session

from app.api.errors import error_response
from app.core.security import create_access_token, verify_password
from app.repositories.user_repo import UserRepository
from app.schemas.auth import TokenResponse
from app.schemas.user import CurrentUserResponse


class AuthService:
    def __init__(self, db: Session) -> None:
        self.user_repo = UserRepository(db)

    def login(self, username: str, password: str) -> TokenResponse:
        user = self.user_repo.get_by_username(username)
        if user is None or not verify_password(password, user.password_hash):
            raise error_response(401, "invalid_credentials", "Invalid credentials")
        token = create_access_token(user.id)
        return TokenResponse(access_token=token)

    def get_current_user(self, user_id: str) -> CurrentUserResponse:
        user = self.user_repo.get_by_id(user_id)
        if user is None:
            raise error_response(401, "user_not_found", "User not found")
        return CurrentUserResponse.model_validate(user)
