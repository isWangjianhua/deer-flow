import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import get_password_hash
from app.db.base import Base
from app.db.session import engine, SessionLocal
from app.models.user import User
from app.models.user_identity import UserIdentity
from app.main import app


@pytest.fixture
def db_session() -> Session:
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)

    db = SessionLocal()
    try:
        db.add(User(username="demo", password_hash=get_password_hash("demo123")))
        db.commit()
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(engine)


@pytest.fixture
def client(db_session: Session) -> TestClient:
    return TestClient(app)
