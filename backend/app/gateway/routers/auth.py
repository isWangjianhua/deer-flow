"""Minimal auth router for the Gateway thin user layer."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field

from app.gateway.auth.passwords import hash_password, verify_password
from app.gateway.auth.session import (
    DEFAULT_SESSION_DAYS,
    SESSION_COOKIE_NAME,
    SESSION_HEADER_NAME,
    create_user,
    create_user_session,
    delete_session_by_token,
    get_user_by_username,
)
from app.gateway.deps import get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


class AuthRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=64)
    password: str = Field(..., min_length=6, max_length=256)


class MeResponse(BaseModel):
    id: str
    username: str


class AuthResponse(MeResponse):
    session_token: str


def _set_session_cookie(response: Response, session_token: str) -> None:
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=session_token,
        httponly=True,
        samesite="lax",
        secure=False,
        path="/",
        max_age=DEFAULT_SESSION_DAYS * 24 * 60 * 60,
    )


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register(request: AuthRequest, response: Response) -> AuthResponse:
    existing = get_user_by_username(request.username)
    if existing is not None:
        raise HTTPException(status_code=409, detail="Username already exists")

    user = create_user(username=request.username, password_hash=hash_password(request.password))
    session = create_user_session(user_id=user.id)
    _set_session_cookie(response, session.session_token)
    return AuthResponse(id=user.id, username=user.username, session_token=session.session_token)


@router.post("/login", response_model=AuthResponse)
async def login(request: AuthRequest, response: Response) -> AuthResponse:
    user = get_user_by_username(request.username)
    if user is None or not verify_password(request.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    session = create_user_session(user_id=user.id)
    _set_session_cookie(response, session.session_token)
    return AuthResponse(id=user.id, username=user.username, session_token=session.session_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: Request, user=Depends(get_current_user)) -> Response:
    # Delete the same session token transport used by current auth resolution:
    # cookie first, then header fallback.
    del user  # unused beyond authentication
    session_token = request.cookies.get(SESSION_COOKIE_NAME) or request.headers.get(SESSION_HEADER_NAME)
    if session_token:
        delete_session_by_token(session_token)
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    response.delete_cookie(key=SESSION_COOKIE_NAME, path="/")
    return response


@router.get("/me", response_model=MeResponse)
async def me(user=Depends(get_current_user)) -> MeResponse:
    return MeResponse(id=user.id, username=user.username)
