from sqlalchemy import inspect, text

from fastapi import FastAPI

from app.api.routes import agents, auth, conversation_resources, conversations, memory, models, users
from app.core.security import get_password_hash
from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.models.agent_ownership import AgentOwnership
from app.models.user import User


def ensure_conversation_schema() -> None:
    inspector = inspect(engine)
    if "conversations" not in inspector.get_table_names():
        return

    columns = {column["name"] for column in inspector.get_columns("conversations")}
    has_agent_name_index = any(
        tuple(index.get("column_names", [])) == ("agent_name",)
        for index in inspector.get_indexes("conversations")
    )

    with engine.begin() as conn:
        if "is_pinned" not in columns:
            conn.execute(
                text(
                    "ALTER TABLE conversations ADD COLUMN is_pinned BOOLEAN NOT NULL DEFAULT 0"
                )
            )
        if "pinned_at" not in columns:
            conn.execute(text("ALTER TABLE conversations ADD COLUMN pinned_at DATETIME"))
        if "agent_name" not in columns:
            conn.execute(text("ALTER TABLE conversations ADD COLUMN agent_name VARCHAR(255)"))
        if not has_agent_name_index:
            conn.execute(text("CREATE INDEX ix_conversations_agent_name ON conversations (agent_name)"))


def ensure_agent_ownership_schema() -> None:
    inspector = inspect(engine)
    if "agent_ownerships" in inspector.get_table_names():
        return

    Base.metadata.create_all(bind=engine, tables=[AgentOwnership.__table__])


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    ensure_agent_ownership_schema()
    ensure_conversation_schema()

    with SessionLocal() as db:
        existing = db.query(User).filter(User.username == "demo").first()
        if existing is None:
            db.add(
                User(
                    username="demo",
                    password_hash=get_password_hash("demo1234"),
                )
            )
            db.commit()


def create_app() -> FastAPI:
    app = FastAPI(
        title="DeerFlow BFF",
        version="0.1.0",
        description="Frontend-facing BFF for DeerFlow Gateway.",
    )

    init_db()

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(auth.router)
    app.include_router(users.router)
    app.include_router(agents.router)
    app.include_router(conversations.router)
    app.include_router(conversation_resources.router)
    app.include_router(models.router)
    app.include_router(memory.router)

    return app


app = create_app()
