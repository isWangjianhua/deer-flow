import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.db.base import Base
from app.models.conversation import Conversation
from app.models.user import User


@pytest.fixture
def db_session() -> Session:
    engine = create_engine("sqlite+pysqlite:///:memory:", connect_args={"check_same_thread": False})
    testing_session = sessionmaker(bind=engine, autoflush=False, autocommit=False, class_=Session)

    Base.metadata.create_all(engine)

    db = testing_session()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(engine)
