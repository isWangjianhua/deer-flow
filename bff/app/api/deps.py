from fastapi import Depends, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.api.errors import error_response
from app.core.security import decode_access_token
from app.db.session import get_db


bearer_scheme = HTTPBearer()


def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> str:
    try:
        return decode_access_token(credentials.credentials)
    except Exception as exc:
        raise error_response(status.HTTP_401_UNAUTHORIZED, "invalid_token", "Invalid token") from exc


def get_db_session(db: Session = Depends(get_db)) -> Session:
    return db
