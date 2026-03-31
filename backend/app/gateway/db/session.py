"""SQLite-backed persistence helpers for the thin Gateway auth layer."""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from deerflow.config.paths import get_paths

AUTH_DB_ENV = "DEER_FLOW_AUTH_DB_PATH"

_SCHEMA = """
CREATE TABLE IF NOT EXISTS user_account (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_session (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    session_token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES user_account(id)
);

CREATE TABLE IF NOT EXISTS chat_thread (
    id TEXT PRIMARY KEY,
    langgraph_thread_id TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES user_account(id)
);
"""


def get_auth_db_path() -> Path:
    from os import getenv

    raw = getenv(AUTH_DB_ENV)
    if raw:
        return Path(raw).expanduser().resolve()
    return get_paths().base_dir / "auth.db"


def connect_auth_db(path: Path | None = None) -> sqlite3.Connection:
    db_path = path or get_auth_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path, detect_types=sqlite3.PARSE_DECLTYPES)
    conn.row_factory = sqlite3.Row
    conn.executescript(_SCHEMA)
    conn.commit()
    return conn


@contextmanager
def get_db_connection(path: Path | None = None) -> Iterator[sqlite3.Connection]:
    conn = connect_auth_db(path)
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()
