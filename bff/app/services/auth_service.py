from sqlalchemy.orm import Session

from app.auth.identity_mapper import IdentityMapper
from app.auth.providers.local import LocalAuthProvider
from app.auth.providers.oidc import OidcAuthProvider
from app.core.config import get_settings
from app.api.errors import error_response
from app.core.security import create_access_token, get_password_hash
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

    def register(self, username: str, password: str) -> TokenResponse:
        if not isinstance(self.provider, LocalAuthProvider):
            raise error_response(404, "local_registration_disabled", "Local registration is unavailable")

        normalized_username = self._normalize_registration_username(username)
        self._validate_registration_password(password)

        existing_user = self.user_repo.get_by_username(normalized_username)
        if existing_user is not None:
            raise error_response(409, "username_exists", "Username already exists")

        user = self.user_repo.create_local_user(
            username=normalized_username,
            password_hash=get_password_hash(password),
        )
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

    def _normalize_registration_username(self, username: str) -> str:
        normalized = username.strip()
        if len(normalized) < 3 or len(normalized) > 64:
            raise error_response(
                400,
                "invalid_username",
                "Username must be between 3 and 64 characters",
            )
        return normalized

    def _validate_registration_password(self, password: str) -> None:
        if len(password) < 8:
            raise error_response(400, "invalid_password", "Password must be at least 8 characters")
