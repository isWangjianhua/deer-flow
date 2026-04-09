from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_id, get_db_session
from app.schemas.user import CurrentUserResponse
from app.services.auth_service import AuthService


router = APIRouter(tags=["users"])


@router.get("/me", response_model=CurrentUserResponse)
def me(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db_session),
) -> CurrentUserResponse:
    return AuthService(db).get_current_user(user_id)
