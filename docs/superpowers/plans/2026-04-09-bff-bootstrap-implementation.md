# BFF Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first usable FastAPI BFF slice with local JWT login, SQLite-backed conversation mapping, conversation listing/creation, and SSE chat proxying to DeerFlow Gateway.

**Architecture:** The BFF owns the public API contract, auth boundary, and `conversation_id -> deerflow_thread_id` mapping. DeerFlow Gateway remains an internal runtime accessed only through a dedicated client layer. The first slice keeps scope narrow but preserves long-term boundaries between routes, services, repositories, and downstream integration.

**Tech Stack:** FastAPI, Pydantic, SQLite, SQLAlchemy, JWT, httpx, SSE, pytest, Ruff

---

## File Structure

### Create

- `bff/app/core/config.py`
- `bff/app/core/security.py`
- `bff/app/db/base.py`
- `bff/app/db/session.py`
- `bff/app/models/user.py`
- `bff/app/models/conversation.py`
- `bff/app/schemas/auth.py`
- `bff/app/schemas/user.py`
- `bff/app/schemas/conversation.py`
- `bff/app/schemas/common.py`
- `bff/app/repositories/user_repo.py`
- `bff/app/repositories/conversation_repo.py`
- `bff/app/services/auth_service.py`
- `bff/app/services/conversation_service.py`
- `bff/app/clients/deerflow.py`
- `bff/app/api/deps.py`
- `bff/app/api/errors.py`
- `bff/app/api/routes/auth.py`
- `bff/app/api/routes/users.py`
- `bff/app/api/routes/conversations.py`
- `bff/app/sse/proxy.py`
- `bff/tests/conftest.py`
- `bff/tests/test_config.py`
- `bff/tests/test_health.py`
- `bff/tests/services/test_auth_service.py`
- `bff/tests/services/test_conversation_service.py`
- `bff/tests/clients/test_deerflow_client.py`
- `bff/tests/api/test_auth_routes.py`
- `bff/tests/api/test_conversation_routes.py`
- `bff/tests/api/test_stream_routes.py`

### Modify

- `bff/pyproject.toml`
- `bff/.env.example`
- `bff/app/main.py`
- `bff/README.md`
- `bff/docs/API.md`
- `bff/docs/DEVELOPMENT.md`

## Task 1: Add Runtime Dependencies And App Wiring

**Files:**
- Modify: `bff/pyproject.toml`
- Modify: `bff/.env.example`
- Modify: `bff/app/main.py`
- Test: `bff/tests/test_health.py`

- [ ] **Step 1: Write the failing health test**

```python
from fastapi.testclient import TestClient

from app.main import app


def test_health_returns_ok() -> None:
    client = TestClient(app)

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 2: Run test to verify baseline still works**

Run: `cd bff && uv run pytest tests/test_health.py -q`
Expected: PASS with `1 passed`

- [ ] **Step 3: Expand project dependencies for the first slice**

Update `bff/pyproject.toml` dependencies to include at least:

```toml
dependencies = [
    "fastapi>=0.115.0",
    "httpx>=0.28.0",
    "pydantic-settings>=2.0.0",
    "python-dotenv>=1.0.0",
    "python-jose[cryptography]>=3.3.0",
    "passlib[bcrypt]>=1.7.4",
    "sqlalchemy>=2.0.0",
    "sse-starlette>=2.1.0",
    "uvicorn[standard]>=0.34.0",
]
```

And dev dependencies to include:

```toml
dev = [
    "pytest>=8.0.0",
    "ruff>=0.14.11",
]
```

- [ ] **Step 4: Add environment placeholders for auth, db, and downstream gateway**

Ensure `bff/.env.example` includes these entries:

```env
BFF_ENV=development
BFF_HOST=0.0.0.0
BFF_PORT=9000

DATABASE_URL=sqlite:///./bff.db
BFF_SECRET_KEY=change-me
BFF_ACCESS_TOKEN_EXPIRE_MINUTES=10080

DEERFLOW_GATEWAY_BASE_URL=http://127.0.0.1:8001
DEERFLOW_TIMEOUT_SECONDS=300
```

- [ ] **Step 5: Keep `app.main` minimal but ready for router registration**

Target shape for `bff/app/main.py`:

```python
from fastapi import FastAPI


def create_app() -> FastAPI:
    app = FastAPI(
        title="DeerFlow BFF",
        version="0.1.0",
        description="Frontend-facing BFF for DeerFlow Gateway.",
    )

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
```

- [ ] **Step 6: Re-run the health test**

Run: `cd bff && uv run pytest tests/test_health.py -q`
Expected: PASS with `1 passed`

- [ ] **Step 7: Commit**

```bash
git add bff/pyproject.toml bff/.env.example bff/app/main.py bff/tests/test_health.py
git commit -m "chore: prepare bff runtime dependencies"
```

## Task 2: Add Configuration, Database Session, And Core Models

**Files:**
- Create: `bff/app/core/config.py`
- Create: `bff/app/db/base.py`
- Create: `bff/app/db/session.py`
- Create: `bff/app/models/user.py`
- Create: `bff/app/models/conversation.py`
- Create: `bff/tests/conftest.py`
- Test: `bff/tests/test_config.py`

- [ ] **Step 1: Write a failing configuration import test in `tests/test_config.py`**

Add a smoke test module with:

```python
from app.core.config import Settings


def test_settings_smoke() -> None:
    settings = Settings(
        database_url="sqlite:///./test.db",
        bff_secret_key="test-secret",
        deerflow_gateway_base_url="http://127.0.0.1:8001",
    )

    assert settings.database_url == "sqlite:///./test.db"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd bff && uv run pytest tests/test_config.py -q`
Expected: FAIL with `ModuleNotFoundError` or missing `Settings`

- [ ] **Step 3: Implement typed settings**

Create `bff/app/core/config.py`:

```python
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", case_sensitive=False)

    bff_env: str = Field(default="development")
    bff_host: str = Field(default="0.0.0.0")
    bff_port: int = Field(default=9000)
    database_url: str = Field(default="sqlite:///./bff.db")
    bff_secret_key: str = Field(default="change-me")
    bff_access_token_expire_minutes: int = Field(default=10080)
    deerflow_gateway_base_url: str = Field(default="http://127.0.0.1:8001")
    deerflow_timeout_seconds: int = Field(default=300)


@lru_cache
def get_settings() -> Settings:
    return Settings()
```

- [ ] **Step 4: Implement SQLAlchemy base and session factory**

Create `bff/app/db/base.py`:

```python
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
```

Create `bff/app/db/session.py`:

```python
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings


settings = get_settings()
connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, class_=Session)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

- [ ] **Step 5: Implement the initial models**

Create `bff/app/models/user.py`:

```python
from datetime import datetime, UTC
from uuid import uuid4

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(32), default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
```

Create `bff/app/models/conversation.py`:

```python
from datetime import datetime, UTC
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), index=True)
    deerflow_thread_id: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(255), default="New conversation")
    status: Mapped[str] = mapped_column(String(32), default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))
```

- [ ] **Step 6: Import models before metadata creation**

Ensure future metadata initialization imports both model modules before calling `Base.metadata.create_all(...)`.

- [ ] **Step 7: Re-run the smoke test**

Run: `cd bff && uv run pytest tests/test_config.py -q`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add bff/app/core/config.py bff/app/db/base.py bff/app/db/session.py bff/app/models/user.py bff/app/models/conversation.py bff/tests/conftest.py bff/tests/test_config.py
git commit -m "feat: add bff settings and persistence models"
```

## Task 3: Add Security And Auth Service

**Files:**
- Create: `bff/app/core/security.py`
- Create: `bff/app/schemas/auth.py`
- Create: `bff/app/schemas/user.py`
- Create: `bff/app/repositories/user_repo.py`
- Create: `bff/app/services/auth_service.py`
- Test: `bff/tests/services/test_auth_service.py`

- [ ] **Step 1: Write the failing auth service tests**

Create `bff/tests/services/test_auth_service.py`:

```python
from app.core.security import get_password_hash, verify_password


def test_password_hash_round_trip() -> None:
    password = "secret123"
    password_hash = get_password_hash(password)

    assert password_hash != password
    assert verify_password(password, password_hash) is True
    assert verify_password("wrong", password_hash) is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd bff && uv run pytest tests/services/test_auth_service.py -q`
Expected: FAIL with missing `app.core.security`

- [ ] **Step 3: Implement security helpers**

Create `bff/app/core/security.py`:

```python
from datetime import UTC, datetime, timedelta

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import get_settings


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, password_hash: str) -> bool:
    return pwd_context.verify(plain_password, password_hash)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(subject: str) -> str:
    settings = get_settings()
    expires_at = datetime.now(UTC) + timedelta(minutes=settings.bff_access_token_expire_minutes)
    payload = {"sub": subject, "exp": expires_at}
    return jwt.encode(payload, settings.bff_secret_key, algorithm="HS256")


def decode_access_token(token: str) -> str:
    settings = get_settings()
    payload = jwt.decode(token, settings.bff_secret_key, algorithms=["HS256"])
    subject = payload.get("sub")
    if not isinstance(subject, str) or not subject:
        raise JWTError("missing subject")
    return subject
```

- [ ] **Step 4: Add auth schemas**

Create `bff/app/schemas/auth.py`:

```python
from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
```

Create `bff/app/schemas/user.py`:

```python
from datetime import datetime

from pydantic import BaseModel


class CurrentUserResponse(BaseModel):
    id: str
    username: str
    status: str
    created_at: datetime
```

- [ ] **Step 5: Implement repository and service**

Create `bff/app/repositories/user_repo.py`:

```python
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.user import User


class UserRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_by_username(self, username: str) -> User | None:
        return self.db.scalar(select(User).where(User.username == username))

    def get_by_id(self, user_id: str) -> User | None:
        return self.db.scalar(select(User).where(User.id == user_id))
```

Create `bff/app/services/auth_service.py`:

```python
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.api.errors import error_response
from app.core.security import create_access_token, verify_password
from app.repositories.user_repo import UserRepository
from app.schemas.auth import TokenResponse
from app.schemas.user import CurrentUserResponse


class AuthService:
    def __init__(self, db: Session) -> None:
        self.user_repo = UserRepository(db)

    def login(self, username: str, password: str) -> TokenResponse:
        user = self.user_repo.get_by_username(username)
        if user is None or not verify_password(password, user.password_hash):
            raise error_response(status.HTTP_401_UNAUTHORIZED, "invalid_credentials", "Invalid credentials")
        token = create_access_token(user.id)
        return TokenResponse(access_token=token)

    def get_current_user(self, user_id: str) -> CurrentUserResponse:
        user = self.user_repo.get_by_id(user_id)
        if user is None:
            raise error_response(status.HTTP_401_UNAUTHORIZED, "user_not_found", "User not found")
        return CurrentUserResponse.model_validate(user, from_attributes=True)
```

- [ ] **Step 6: Re-run auth service tests**

Run: `cd bff && uv run pytest tests/services/test_auth_service.py -q`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add bff/app/core/security.py bff/app/schemas/auth.py bff/app/schemas/user.py bff/app/repositories/user_repo.py bff/app/services/auth_service.py bff/tests/services/test_auth_service.py
git commit -m "feat: add bff auth service"
```

## Task 4: Add Conversation Schemas, Repository, And Service

**Files:**
- Create: `bff/app/schemas/conversation.py`
- Create: `bff/app/schemas/common.py`
- Create: `bff/app/repositories/conversation_repo.py`
- Create: `bff/app/services/conversation_service.py`
- Test: `bff/tests/services/test_conversation_service.py`

- [ ] **Step 1: Write the failing conversation service tests**

Create `bff/tests/services/test_conversation_service.py`:

```python
from app.models.user import User
from app.repositories.conversation_repo import ConversationRepository
from app.services.conversation_service import ConversationService


def test_create_conversation_persists_mapping(db_session) -> None:
    user = User(username="alice", password_hash="hashed")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    result = ConversationService(db_session).create_conversation(
        user_id=user.id,
        deerflow_thread_id="thread-123",
    )
    persisted = ConversationRepository(db_session).get_by_id(result.id)

    assert result.title == "New conversation"
    assert result.status == "active"
    assert persisted is not None
    assert persisted.user_id == user.id
    assert persisted.deerflow_thread_id == "thread-123"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd bff && uv run pytest tests/services/test_conversation_service.py -q`
Expected: FAIL

- [ ] **Step 3: Implement schemas**

Create `bff/app/schemas/common.py`:

```python
from pydantic import BaseModel


class ErrorDetail(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorDetail
```

Create `bff/app/schemas/conversation.py`:

```python
from datetime import datetime

from pydantic import BaseModel


class ConversationCreateResponse(BaseModel):
    id: str
    title: str
    status: str
    created_at: datetime


class ConversationListItem(BaseModel):
    id: str
    title: str
    status: str
    created_at: datetime
    updated_at: datetime


class StreamMessageRequest(BaseModel):
    message: str
```

- [ ] **Step 4: Implement conversation repository**

Create `bff/app/repositories/conversation_repo.py`:

```python
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.conversation import Conversation


class ConversationRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create(self, conversation: Conversation) -> Conversation:
        self.db.add(conversation)
        self.db.commit()
        self.db.refresh(conversation)
        return conversation

    def list_by_user_id(self, user_id: str) -> list[Conversation]:
        statement = select(Conversation).where(Conversation.user_id == user_id).order_by(Conversation.updated_at.desc())
        return list(self.db.scalars(statement))

    def get_by_id(self, conversation_id: str) -> Conversation | None:
        return self.db.scalar(select(Conversation).where(Conversation.id == conversation_id))
```

- [ ] **Step 5: Implement conversation service**

Create `bff/app/services/conversation_service.py`:

```python
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.conversation import Conversation
from app.repositories.conversation_repo import ConversationRepository
from app.schemas.conversation import ConversationCreateResponse, ConversationListItem


class ConversationService:
    def __init__(self, db: Session) -> None:
        self.repo = ConversationRepository(db)

    def create_conversation(self, user_id: str, deerflow_thread_id: str, title: str = "New conversation") -> ConversationCreateResponse:
        conversation = Conversation(user_id=user_id, deerflow_thread_id=deerflow_thread_id, title=title)
        created = self.repo.create(conversation)
        return ConversationCreateResponse.model_validate(created, from_attributes=True)

    def list_conversations(self, user_id: str) -> list[ConversationListItem]:
        items = self.repo.list_by_user_id(user_id)
        return [ConversationListItem.model_validate(item, from_attributes=True) for item in items]

    def require_owned_conversation(self, user_id: str, conversation_id: str) -> Conversation:
        conversation = self.repo.get_by_id(conversation_id)
        if conversation is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
        if conversation.user_id != user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        return conversation
```

- [ ] **Step 6: Replace placeholder test with real assertions**

Update `bff/tests/services/test_conversation_service.py` to create a test DB session, call `create_conversation`, and assert:

```python
assert result.title == "New conversation"
assert result.status == "active"
assert persisted.user_id == user.id
assert persisted.deerflow_thread_id == "thread-123"
```

- [ ] **Step 7: Run conversation service tests**

Run: `cd bff && uv run pytest tests/services/test_conversation_service.py -q`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add bff/app/schemas/conversation.py bff/app/schemas/common.py bff/app/repositories/conversation_repo.py bff/app/services/conversation_service.py bff/tests/services/test_conversation_service.py
git commit -m "feat: add bff conversation service"
```

## Task 5: Add DeerFlow Client And SSE Proxy Helpers

**Files:**
- Create: `bff/app/clients/deerflow.py`
- Create: `bff/app/sse/proxy.py`
- Test: `bff/tests/clients/test_deerflow_client.py`

- [ ] **Step 1: Write the failing DeerFlow client test**

Create `bff/tests/clients/test_deerflow_client.py`:

```python
import httpx
import pytest

from app.clients.deerflow import DeerFlowClient


@pytest.mark.asyncio
async def test_create_thread_returns_thread_id(monkeypatch) -> None:
    async def mock_post(self, url: str, *args, **kwargs):
        return httpx.Response(200, json={"thread_id": "thread-123"})

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    result = await DeerFlowClient().create_thread()

    assert result == "thread-123"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd bff && uv run pytest tests/clients/test_deerflow_client.py -q`
Expected: FAIL

- [ ] **Step 3: Implement DeerFlow client**

Create `bff/app/clients/deerflow.py` with a class shaped like:

```python
import httpx

from app.core.config import get_settings


class DeerFlowClient:
    def __init__(self) -> None:
        settings = get_settings()
        self.base_url = settings.deerflow_gateway_base_url.rstrip("/")
        self.timeout = settings.deerflow_timeout_seconds

    async def create_thread(self) -> str:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(f"{self.base_url}/api/langgraph/threads")
            response.raise_for_status()
            payload = response.json()
            return payload["thread_id"]

    async def stream_message(self, thread_id: str, message: str) -> httpx.Response:
        client = httpx.AsyncClient(timeout=None)
        request = client.build_request(
            "POST",
            f"{self.base_url}/api/langgraph/threads/{thread_id}/runs/stream",
            json={"message": message},
        )
        return await client.send(request, stream=True)
```

Adjust the exact downstream routes to match the live DeerFlow Gateway or LangGraph proxy behavior discovered in implementation.

- [ ] **Step 4: Implement SSE proxy helper**

Create `bff/app/sse/proxy.py`:

```python
from collections.abc import AsyncIterator


async def iter_sse_lines(response) -> AsyncIterator[str]:
    async for line in response.aiter_lines():
        if line:
            yield f"{line}\n"
```

- [ ] **Step 5: Replace placeholder test with a real mocked client test**

Use `httpx.MockTransport` or monkeypatching to assert:

- `create_thread()` returns the parsed thread id
- `stream_message()` hits the expected downstream path

- [ ] **Step 6: Run DeerFlow client tests**

Run: `cd bff && uv run pytest tests/clients/test_deerflow_client.py -q`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add bff/app/clients/deerflow.py bff/app/sse/proxy.py bff/tests/clients/test_deerflow_client.py
git commit -m "feat: add deerflow client and sse helpers"
```

## Task 6: Add Auth Dependencies And Route Modules

**Files:**
- Create: `bff/app/api/deps.py`
- Create: `bff/app/api/errors.py`
- Create: `bff/app/api/routes/auth.py`
- Create: `bff/app/api/routes/users.py`
- Test: `bff/tests/api/test_auth_routes.py`

- [ ] **Step 1: Write the failing auth route tests**

Create `bff/tests/api/test_auth_routes.py`:

```python
from fastapi.testclient import TestClient

from app.main import app


def test_me_requires_auth() -> None:
    client = TestClient(app)

    response = client.get("/me")

    assert response.status_code == 401
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd bff && uv run pytest tests/api/test_auth_routes.py -q`
Expected: FAIL

- [ ] **Step 3: Implement dependency helpers**

Create `bff/app/api/deps.py`:

```python
from fastapi import Depends, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.api.errors import error_response
from app.core.security import decode_access_token
from app.db.session import get_db


bearer_scheme = HTTPBearer()


def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> str:
    try:
        return decode_access_token(credentials.credentials)
    except Exception as exc:
        raise error_response(status.HTTP_401_UNAUTHORIZED, "invalid_token", "Invalid token") from exc


def get_db_session(db: Session = Depends(get_db)) -> Session:
    return db
```

- [ ] **Step 4: Implement normalized error helpers**

Create `bff/app/api/errors.py`:

```python
from fastapi import HTTPException


def error_response(status_code: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"code": code, "message": message})
```

- [ ] **Step 5: Implement auth and user routes**

Create `bff/app/api/routes/auth.py`:

```python
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db_session
from app.schemas.auth import LoginRequest, TokenResponse
from app.services.auth_service import AuthService


router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db_session)) -> TokenResponse:
    return AuthService(db).login(payload.username, payload.password)
```

Create `bff/app/api/routes/users.py`:

```python
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_id, get_db_session
from app.schemas.user import CurrentUserResponse
from app.services.auth_service import AuthService


router = APIRouter(tags=["users"])


@router.get("/me", response_model=CurrentUserResponse)
def me(user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db_session)) -> CurrentUserResponse:
    return AuthService(db).get_current_user(user_id)
```

- [ ] **Step 6: Register routes in `app.main`**

Update `bff/app/main.py` to include:

```python
from app.api.routes import auth, users

app.include_router(auth.router)
app.include_router(users.router)
```

- [ ] **Step 7: Replace placeholder tests with real API tests**

At minimum, assert:

```python
assert response.status_code == 200
assert response.json()["token_type"] == "bearer"
```

And:

```python
assert response.status_code == 401
```

- [ ] **Step 8: Run auth route tests**

Run: `cd bff && uv run pytest tests/api/test_auth_routes.py -q`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add bff/app/api/deps.py bff/app/api/errors.py bff/app/api/routes/auth.py bff/app/api/routes/users.py bff/app/main.py bff/tests/api/test_auth_routes.py
git commit -m "feat: add bff auth routes"
```

## Task 7: Add Conversation Create/List Routes

**Files:**
- Create: `bff/app/api/routes/conversations.py`
- Test: `bff/tests/api/test_conversation_routes.py`

- [ ] **Step 1: Write the failing conversation route tests**

Create `bff/tests/api/test_conversation_routes.py`:

```python
from fastapi.testclient import TestClient

from app.main import app


def test_create_conversation_requires_auth() -> None:
    client = TestClient(app)

    response = client.post("/conversations")

    assert response.status_code == 401
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd bff && uv run pytest tests/api/test_conversation_routes.py -q`
Expected: FAIL

- [ ] **Step 3: Implement the conversation route module**

Create `bff/app/api/routes/conversations.py`:

```python
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_id, get_db_session
from app.clients.deerflow import DeerFlowClient
from app.schemas.conversation import ConversationCreateResponse, ConversationListItem
from app.services.conversation_service import ConversationService


router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.post("", response_model=ConversationCreateResponse)
async def create_conversation(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db_session),
) -> ConversationCreateResponse:
    deerflow_thread_id = await DeerFlowClient().create_thread()
    return ConversationService(db).create_conversation(user_id=user_id, deerflow_thread_id=deerflow_thread_id)


@router.get("", response_model=list[ConversationListItem])
def list_conversations(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db_session),
) -> list[ConversationListItem]:
    return ConversationService(db).list_conversations(user_id)
```

- [ ] **Step 4: Register the conversation router**

Update `bff/app/main.py`:

```python
from app.api.routes import auth, conversations, users

app.include_router(conversations.router)
```

- [ ] **Step 5: Replace placeholder tests with real route tests**

At minimum, assert:

```python
assert response.status_code == 200
assert "id" in response.json()
```

And for listing:

```python
assert len(response.json()) == 1
assert response.json()[0]["id"] == created_id
```

- [ ] **Step 6: Run conversation route tests**

Run: `cd bff && uv run pytest tests/api/test_conversation_routes.py -q`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add bff/app/api/routes/conversations.py bff/app/main.py bff/tests/api/test_conversation_routes.py
git commit -m "feat: add bff conversation routes"
```

## Task 8: Add SSE Stream Route

**Files:**
- Modify: `bff/app/api/routes/conversations.py`
- Test: `bff/tests/api/test_stream_routes.py`

- [ ] **Step 1: Write the failing stream route tests**

Create `bff/tests/api/test_stream_routes.py`:

```python
from fastapi.testclient import TestClient

from app.main import app


def test_stream_route_requires_auth() -> None:
    client = TestClient(app)

    response = client.post(
        "/conversations/test-conversation/messages/stream",
        json={"message": "hello"},
    )

    assert response.status_code == 401
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd bff && uv run pytest tests/api/test_stream_routes.py -q`
Expected: FAIL

- [ ] **Step 3: Add the stream route**

Update `bff/app/api/routes/conversations.py` with:

```python
from fastapi.responses import StreamingResponse

from app.schemas.conversation import StreamMessageRequest
from app.sse.proxy import iter_sse_lines


@router.post("/{conversation_id}/messages/stream")
async def stream_message(
    conversation_id: str,
    payload: StreamMessageRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db_session),
) -> StreamingResponse:
    conversation = ConversationService(db).require_owned_conversation(user_id, conversation_id)
    downstream = await DeerFlowClient().stream_message(
        thread_id=conversation.deerflow_thread_id,
        message=payload.message,
    )
    return StreamingResponse(iter_sse_lines(downstream), media_type="text/event-stream")
```

- [ ] **Step 4: Replace placeholder tests with real streaming tests**

At minimum, assert:

```python
assert response.status_code == 401
```

For forbidden ownership:

```python
assert response.status_code == 403
```

For success:

```python
assert response.status_code == 200
assert response.headers["content-type"].startswith("text/event-stream")
```

- [ ] **Step 5: Run stream route tests**

Run: `cd bff && uv run pytest tests/api/test_stream_routes.py -q`
Expected: PASS

- [ ] **Step 6: Run the full BFF test suite**

Run: `cd bff && uv run pytest -q`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add bff/app/api/routes/conversations.py bff/tests/api/test_stream_routes.py
git commit -m "feat: add bff stream route"
```

## Task 9: Update Docs And Developer Guidance

**Files:**
- Modify: `bff/README.md`
- Modify: `bff/docs/API.md`
- Modify: `bff/docs/DEVELOPMENT.md`

- [ ] **Step 1: Update README to reflect actual first-slice commands**

Add concrete commands for:

```bash
cd bff
uv sync
uv run uvicorn app.main:app --host 0.0.0.0 --port 9000 --reload
```

And document that the implemented first slice now includes:

- local JWT login
- SQLite persistence
- conversation create/list
- SSE chat route

- [ ] **Step 2: Update `bff/docs/API.md` to distinguish implemented vs deferred endpoints**

Mark as implemented:

- `POST /auth/login`
- `GET /me`
- `POST /conversations`
- `GET /conversations`
- `POST /conversations/{conversation_id}/messages/stream`

Mark as deferred:

- uploads
- artifacts
- delete conversation

- [ ] **Step 3: Update `bff/docs/DEVELOPMENT.md` with real implementation status**

Replace future-only language with:

- current completed slice
- next planned slice for uploads and artifacts
- test commands that now work

- [ ] **Step 4: Run formatting and lints**

Run: `cd bff && uv run ruff check .`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add bff/README.md bff/docs/API.md bff/docs/DEVELOPMENT.md
git commit -m "docs: update bff bootstrap docs"
```

## Task 10: Final Verification

**Files:**
- Modify: none
- Test: whole `bff/` package

- [ ] **Step 1: Run full BFF tests**

Run: `cd bff && uv run pytest -q`
Expected: PASS

- [ ] **Step 2: Run lints**

Run: `cd bff && uv run ruff check .`
Expected: PASS

- [ ] **Step 3: Run app import smoke test**

Run:

```bash
cd bff && uv run python -c "from app.main import app; print(app.title)"
```

Expected:

```text
DeerFlow BFF
```

- [ ] **Step 4: Manual runtime smoke test**

Run:

```bash
cd bff && uv run uvicorn app.main:app --host 0.0.0.0 --port 9000
```

Then in another terminal:

```bash
curl http://127.0.0.1:9000/health
```

Expected:

```json
{"status":"ok"}
```

- [ ] **Step 5: Commit final verification-only changes if any**

```bash
git status --short
```

Expected: clean working tree or only intentional doc updates already committed
