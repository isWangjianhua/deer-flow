"""Ownership helpers for thin business-thread isolation in the Gateway."""

from __future__ import annotations

import time
import uuid
from sqlite3 import Row

from app.gateway.db.models import ChatThread
from app.gateway.db.session import get_db_connection


def _row_to_chat_thread(row: Row | None) -> ChatThread | None:
    if row is None:
        return None
    return ChatThread(
        id=row["id"],
        langgraph_thread_id=row["langgraph_thread_id"],
        user_id=row["user_id"],
        title=row["title"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def get_thread_owner_record(biz_thread_id: str) -> ChatThread | None:
    with get_db_connection() as conn:
        row = conn.execute(
            """
            SELECT id, langgraph_thread_id, user_id, title, created_at, updated_at
            FROM chat_thread
            WHERE id = ?
            """,
            (biz_thread_id,),
        ).fetchone()
    return _row_to_chat_thread(row)


def create_owned_thread(*, user_id: str, biz_thread_id: str | None = None, title: str = "") -> ChatThread:
    """Create or return a business-owned thread record.

    For the thin isolation layer we deliberately keep the LangGraph thread id
    equal to the exposed business thread id. This avoids a larger proxy/mapping
    refactor while still letting us persist ownership metadata now.
    """

    existing = get_thread_owner_record(biz_thread_id) if biz_thread_id else None
    if existing is not None:
        if existing.user_id != user_id:
            raise PermissionError(biz_thread_id)
        return existing

    now = str(time.time())
    thread_id = biz_thread_id or f"thread_{uuid.uuid4().hex[:16]}"
    record = ChatThread(
        id=thread_id,
        langgraph_thread_id=thread_id,
        user_id=user_id,
        title=title,
        created_at=now,
        updated_at=now,
    )
    with get_db_connection() as conn:
        conn.execute(
            """
            INSERT INTO chat_thread(id, langgraph_thread_id, user_id, title, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                record.id,
                record.langgraph_thread_id,
                record.user_id,
                record.title,
                record.created_at,
                record.updated_at,
            ),
        )
    return record


def list_owned_threads(user_id: str) -> list[ChatThread]:
    with get_db_connection() as conn:
        rows = conn.execute(
            """
            SELECT id, langgraph_thread_id, user_id, title, created_at, updated_at
            FROM chat_thread
            WHERE user_id = ?
            ORDER BY updated_at DESC
            """,
            (user_id,),
        ).fetchall()
    return [_row_to_chat_thread(row) for row in rows if row is not None]


def delete_owned_thread(*, biz_thread_id: str, user_id: str) -> bool:
    with get_db_connection() as conn:
        result = conn.execute(
            "DELETE FROM chat_thread WHERE id = ? AND user_id = ?",
            (biz_thread_id, user_id),
        )
    return result.rowcount > 0


def update_owned_thread_title(*, biz_thread_id: str, user_id: str, title: str) -> None:
    with get_db_connection() as conn:
        conn.execute(
            """
            UPDATE chat_thread
            SET title = ?, updated_at = ?
            WHERE id = ? AND user_id = ?
            """,
            (title, str(time.time()), biz_thread_id, user_id),
        )


def ensure_thread_belongs_to_user(*, biz_thread_id: str, user_id: str) -> ChatThread:
    record = get_thread_owner_record(biz_thread_id)
    if record is None or record.user_id != user_id:
        raise PermissionError(biz_thread_id)
    return record
