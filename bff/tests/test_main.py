from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker

import app.main as app_main
from app.db.base import Base
from app.models.user import User


def test_init_db_backfills_conversation_pin_columns(tmp_path, monkeypatch) -> None:
    database_url = f"sqlite:///{tmp_path / 'test.db'}"
    engine = create_engine(database_url, connect_args={"check_same_thread": False})
    session_local = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE users (
                    id VARCHAR(36) PRIMARY KEY,
                    username VARCHAR(255),
                    password_hash VARCHAR(255),
                    status VARCHAR(32),
                    created_at DATETIME
                )
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE TABLE conversations (
                    id VARCHAR(36) PRIMARY KEY,
                    user_id VARCHAR(36),
                    deerflow_thread_id VARCHAR(128) UNIQUE,
                    title VARCHAR(255),
                    status VARCHAR(32),
                    created_at DATETIME,
                    updated_at DATETIME
                )
                """
            )
        )

    original_engine = app_main.engine
    original_session_local = app_main.SessionLocal
    app_main.engine = engine
    app_main.SessionLocal = session_local

    try:
        app_main.init_db()
        columns = {column["name"] for column in inspect(engine).get_columns("conversations")}
        assert "is_pinned" in columns
        assert "pinned_at" in columns
    finally:
        app_main.engine = original_engine
        app_main.SessionLocal = original_session_local
        Base.metadata.drop_all(engine)
        engine.dispose()
