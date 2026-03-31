"""Session and user persistence helpers for thin Gateway auth."""

from __future__ import annotations

import secrets
import uuid
from datetime import UTC, datetime, timedelta
from sqlite3 import Row

from app.gateway.db.models import UserAccount, UserSession
from app.gateway.db.session import get_db_connection

SESSION_COOKIE_NAME = "deerflow_session"
DEFAULT_SESSION_DAYS = 14


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _row_to_user(row: Row | None) -> UserAccount | None:
    if row is None:
        return None
    return UserAccount(
        id=row["id"],
        username=row["username"],
        password_hash=row["password_hash"],
        created_at=row["created_at"],
    )


def _row_to_session(row: Row | None) -> UserSession | None:
    if row is None:
        return None
    return UserSession(
        id=row["id"],
        user_id=row["user_id"],
        session_token=row["session_token"],
        expires_at=row["expires_at"],
        created_at=row["created_at"],
    )


def create_user(*, username: str, password_hash: str) -> UserAccount:
    now = _utcnow().isoformat()
    user = UserAccount(
        id=f"user_{uuid.uuid4().hex[:16]}",
        username=username,
        password_hash=password_hash,
        created_at=now,
    )
    with get_db_connection() as conn:
        conn.execute(
            "INSERT INTO user_account(id, username, password_hash, created_at) VALUES (?, ?, ?, ?)",
            (user.id, user.username, user.password_hash, user.created_at),
        )
    return user


def get_user_by_username(username: str) -> UserAccount | None:
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT id, username, password_hash, created_at FROM user_account WHERE username = ?",
            (username,),
        ).fetchone()
    return _row_to_user(row)


def get_user_by_id(user_id: str) -> UserAccount | None:
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT id, username, password_hash, created_at FROM user_account WHERE id = ?",
            (user_id,),
        ).fetchone()
    return _row_to_user(row)


def create_user_session(*, user_id: str, lifetime: timedelta | None = None) -> UserSession:
    now = _utcnow()
    ttl = lifetime or timedelta(days=DEFAULT_SESSION_DAYS)
    session = UserSession(
        id=f"sess_{uuid.uuid4().hex[:16]}",
        user_id=user_id,
        session_token=secrets.token_urlsafe(32),
        created_at=now.isoformat(),
        expires_at=(now + ttl).isoformat(),
    )
    with get_db_connection() as conn:
        conn.execute(
            "INSERT INTO user_session(id, user_id, session_token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
            (session.id, session.user_id, session.session_token, session.expires_at, session.created_at),
        )
    return session


def get_session_by_token(session_token: str) -> UserSession | None:
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT id, user_id, session_token, expires_at, created_at FROM user_session WHERE session_token = ?",
            (session_token,),
        ).fetchone()
    session = _row_to_session(row)
    if session is None:
        return None
    expires_at = datetime.fromisoformat(session.expires_at)
    if expires_at <= _utcnow():
        delete_session_by_token(session_token)
        return None
    return session


def delete_session_by_token(session_token: str) -> None:
    with get_db_connection() as conn:
        conn.execute("DELETE FROM user_session WHERE session_token = ?", (session_token,))
