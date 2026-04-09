from sqlalchemy.orm import Session

from app.auth.identity_mapper import IdentityMapper
from app.auth.providers.local import LocalAuthProvider
from app.auth.providers.oidc import OidcAuthProvider
from app.core.config import get_settings
from app.api.errors import error_response
from app.core.security import create_access_token
from app.schemas.auth import TokenResponse
from app.schemas.user import CurrentUserResponse
from app.repositories.user_repo import UserRepository


class AuthService:
    def __init__(self, db: Session) -> None:
        settings = get_settings()
        if settings.bff_auth_provider == "oidc":
            self.provider = OidcAuthProvider(
                issuer=str(settings.bff_oidc_issuer),
                audience=settings.bff_oidc_audience,
                jwks_url=str(settings.bff_oidc_jwks_url),
            )
        else:
            self.provider = LocalAuthProvider(db)
        self.identity_mapper = IdentityMapper(db)
        self.user_repo = UserRepository(db)

    def login(self, username: str, password: str) -> TokenResponse:
        identity = self.provider.authenticate_credentials(username, password)
        user = self.identity_mapper.resolve_or_create_user(identity)
        token = create_access_token(user.id)
        return TokenResponse(access_token=token)

    def get_current_user_id_from_bearer_token(self, token: str) -> str:
        identity = self.provider.resolve_bearer_identity(token)
        user = self.identity_mapper.resolve_or_create_user(identity)
        return user.id

    def get_current_user(self, user_id: str) -> CurrentUserResponse:
        user = self.user_repo.get_by_id(user_id)
        if user is not None:
            return CurrentUserResponse.model_validate(user)

        if isinstance(self.provider, OidcAuthProvider):
            identity = self.provider.resolve_bearer_identity(user_id)
        else:
            identity = self.provider.resolve_token_identity(user_id)
        user = self.identity_mapper.resolve_or_create_user(identity)
        if user is None:
            raise error_response(401, "user_not_found", "User not found")
        return CurrentUserResponse.model_validate(user)
