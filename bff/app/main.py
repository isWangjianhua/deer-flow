from fastapi import FastAPI

from app.api.routes import auth, conversations, models, users
from app.core.security import get_password_hash
from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.models.user import User


def init_db() -> None:
    Base.metadata.create_all(bind=engine)

    with SessionLocal() as db:
        existing = db.query(User).filter(User.username == "demo").first()
        if existing is None:
            db.add(
                User(
                    username="demo",
                    password_hash=get_password_hash("demo123"),
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
    app.include_router(conversations.router)
    app.include_router(models.router)

    return app


app = create_app()
