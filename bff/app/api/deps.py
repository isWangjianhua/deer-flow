from fastapi import Depends, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.api.errors import error_response
from app.core.config import get_settings
from app.core.security import decode_access_token
from app.db.session import get_db
from app.services.auth_service import AuthService


bearer_scheme = HTTPBearer()


def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> str:
    settings = get_settings()
    try:
        if settings.bff_auth_provider == "oidc":
            return AuthService(db).get_current_user_id_from_bearer_token(credentials.credentials)
        return decode_access_token(credentials.credentials)
    except Exception as exc:
        raise error_response(status.HTTP_401_UNAUTHORIZED, "invalid_token", "Invalid token") from exc


def get_db_session(db: Session = Depends(get_db)) -> Session:
    return db
