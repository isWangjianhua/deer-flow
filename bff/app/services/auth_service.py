from sqlalchemy.orm import Session

from app.auth.identity_mapper import IdentityMapper
from app.auth.providers.local import LocalAuthProvider
from app.auth.providers.oidc import OidcAuthProvider
from app.core.config import get_settings
from app.core.security import create_access_token
from app.schemas.auth import TokenResponse
from app.schemas.user import CurrentUserResponse


class AuthService:
    def __init__(self, db: Session) -> None:
        settings = get_settings()
        if settings.bff_auth_provider == "oidc":
            self.provider = OidcAuthProvider(
                issuer=settings.bff_oidc_issuer,
                audience=settings.bff_oidc_audience,
                jwks_url=settings.bff_oidc_jwks_url,
            )
        else:
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
