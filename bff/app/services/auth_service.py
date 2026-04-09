from sqlalchemy.orm import Session

from app.auth.identity_mapper import IdentityMapper
from app.auth.providers.local import LocalAuthProvider
from app.core.security import create_access_token
from app.schemas.auth import TokenResponse
from app.schemas.user import CurrentUserResponse


class AuthService:
    def __init__(self, db: Session) -> None:
        self.provider = LocalAuthProvider(db)
        self.identity_mapper = IdentityMapper(db)

    def login(self, username: str, password: str) -> TokenResponse:
        identity = self.provider.authenticate_credentials(username, password)
        user = self.identity_mapper.resolve_or_create_user(identity)
        token = create_access_token(user.id)
        return TokenResponse(access_token=token)

    def get_current_user(self, user_id: str) -> CurrentUserResponse:
        identity = self.provider.resolve_token_identity(user_id)
        user = self.identity_mapper.resolve_or_create_user(identity)
        return CurrentUserResponse.model_validate(user)
