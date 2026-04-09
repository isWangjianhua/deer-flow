import sys

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings
from app.core.security import get_password_hash
from app.db.base import Base
from app.db import session as session_module
from app.models.user import User


@pytest.fixture(autouse=True)
def clear_settings_cache() -> None:
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def db_session(tmp_path) -> Session:
    database_url = f"sqlite:///{tmp_path / 'test.db'}"
    engine = create_engine(
        database_url,
        connect_args={"check_same_thread": False},
    )
    session_local = sessionmaker(
        bind=engine,
        autoflush=False,
        autocommit=False,
        class_=Session,
    )

    original_engine = session_module.engine
    original_session_local = session_module.SessionLocal
    session_module.engine = engine
    session_module.SessionLocal = session_local

    app_main = None
    if "app.main" in sys.modules:
        import app.main as app_main_module

        app_main = app_main_module
        app_main.engine = engine
        app_main.SessionLocal = session_local

    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)

    db = session_local()
    try:
        db.add(User(username="demo", password_hash=get_password_hash("demo123")))
        db.commit()
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(engine)
        engine.dispose()
        session_module.engine = original_engine
        session_module.SessionLocal = original_session_local
        if app_main is not None:
            app_main.engine = original_engine
            app_main.SessionLocal = original_session_local


@pytest.fixture
def client(db_session: Session) -> TestClient:
    from app.main import app

    return TestClient(app)
