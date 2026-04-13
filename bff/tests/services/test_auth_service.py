from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.core.security import get_password_hash, verify_password
from app.core.config import Settings
from app.services import auth_service as auth_service_module
from app.services.auth_service import AuthService


def test_password_hash_round_trip() -> None:
    password = "secret123"
    password_hash = get_password_hash(password)

    assert password_hash != password
    assert verify_password(password, password_hash) is True
    assert verify_password("wrong", password_hash) is False


def test_auth_service_selects_local_provider_from_settings(db_session, monkeypatch) -> None:
    calls: list[tuple[object, ...]] = []
    settings = SimpleNamespace(bff_auth_provider="local")

    class FakeLocalProvider:
        def __init__(self, db) -> None:
            calls.append(("local_provider_init", db))

    class FakeOidcProvider:
        def __init__(self, **kwargs) -> None:
            raise AssertionError("OidcAuthProvider should not be used for local auth")

    monkeypatch.setattr(auth_service_module, "get_settings", lambda: settings)
    monkeypatch.setattr(auth_service_module, "LocalAuthProvider", FakeLocalProvider)
    monkeypatch.setattr(auth_service_module, "OidcAuthProvider", FakeOidcProvider)

    service = AuthService(db_session)

    assert isinstance(service.provider, FakeLocalProvider)
    assert calls == [("local_provider_init", db_session)]


def test_auth_service_selects_oidc_provider_from_settings(db_session, monkeypatch) -> None:
    calls: list[tuple[object, ...]] = []
    settings = Settings(
        bff_auth_provider="oidc",
        bff_oidc_issuer="https://issuer.example.com",
        bff_oidc_audience="deerflow-bff",
        bff_oidc_jwks_url="https://issuer.example.com/.well-known/jwks.json",
        database_url="sqlite:///./test.db",
        bff_secret_key="test-secret",
        deerflow_gateway_base_url="http://127.0.0.1:8001",
    )

    class FakeLocalProvider:
        def __init__(self, db) -> None:
            raise AssertionError("LocalAuthProvider should not be used for oidc auth")

    class FakeOidcProvider:
        def __init__(self, *, issuer, audience, jwks_url) -> None:
            assert isinstance(issuer, str)
            assert isinstance(jwks_url, str)
            calls.append(("oidc_provider_init", issuer, audience, jwks_url))

    monkeypatch.setattr(auth_service_module, "get_settings", lambda: settings)
    monkeypatch.setattr(auth_service_module, "LocalAuthProvider", FakeLocalProvider)
    monkeypatch.setattr(auth_service_module, "OidcAuthProvider", FakeOidcProvider)

    service = AuthService(db_session)

    assert isinstance(service.provider, FakeOidcProvider)
    assert calls == [
        (
            "oidc_provider_init",
            str(settings.bff_oidc_issuer),
            "deerflow-bff",
            str(settings.bff_oidc_jwks_url),
        )
    ]


def test_login_routes_through_provider_and_mapper(db_session, monkeypatch) -> None:
    calls: list[tuple[object, ...]] = []
    identity = SimpleNamespace(provider="local", subject="demo", claims={"username": "demo"})
    user = SimpleNamespace(id="user-123", username="demo")

    class FakeProvider:
        def __init__(self, db) -> None:
            calls.append(("provider_init", db))

        def authenticate_credentials(self, username: str, password: str):
            calls.append(("authenticate_credentials", username, password))
            return identity

        def resolve_token_identity(self, user_id: str):
            raise AssertionError("resolve_token_identity should not be used during login")

    class FakeMapper:
        def __init__(self, db) -> None:
            calls.append(("mapper_init", db))

        def resolve_or_create_user(self, received_identity):
            calls.append(("resolve_or_create_user", received_identity))
            return user

    monkeypatch.setattr(auth_service_module, "LocalAuthProvider", FakeProvider)
    monkeypatch.setattr(auth_service_module, "IdentityMapper", FakeMapper)
    monkeypatch.setattr(
        auth_service_module,
        "create_access_token",
        lambda user_id: calls.append(("create_access_token", user_id)) or "token-user-123",
    )

    response = AuthService(db_session).login("demo", "demo123")

    assert response.access_token == "token-user-123"
    assert calls == [
        ("provider_init", db_session),
        ("mapper_init", db_session),
        ("authenticate_credentials", "demo", "demo123"),
        ("resolve_or_create_user", identity),
        ("create_access_token", "user-123"),
    ]


def test_get_current_user_routes_through_provider_and_mapper(db_session, monkeypatch) -> None:
    calls: list[tuple[object, ...]] = []
    identity = SimpleNamespace(provider="local", subject="demo", claims={"username": "demo"})
    user = SimpleNamespace(id="user-123", username="demo", status="active", created_at=None)

    class FakeProvider:
        def __init__(self, db) -> None:
            calls.append(("provider_init", db))

        def authenticate_credentials(self, username: str, password: str):
            raise AssertionError("authenticate_credentials should not be used when resolving a token")

        def resolve_token_identity(self, user_id: str):
            calls.append(("resolve_token_identity", user_id))
            return identity

    class FakeMapper:
        def __init__(self, db) -> None:
            calls.append(("mapper_init", db))

        def resolve_or_create_user(self, received_identity):
            calls.append(("resolve_or_create_user", received_identity))
            return user

    class FakeCurrentUserResponse:
        @classmethod
        def model_validate(cls, received_user):
            calls.append(("model_validate", received_user))
            return {"username": received_user.username}

    monkeypatch.setattr(auth_service_module, "LocalAuthProvider", FakeProvider)
    monkeypatch.setattr(auth_service_module, "IdentityMapper", FakeMapper)
    monkeypatch.setattr(auth_service_module, "CurrentUserResponse", FakeCurrentUserResponse)

    response = AuthService(db_session).get_current_user("user-123")

    assert response == {"username": "demo"}
    assert calls == [
        ("provider_init", db_session),
        ("mapper_init", db_session),
        ("resolve_token_identity", "user-123"),
        ("resolve_or_create_user", identity),
        ("model_validate", user),
    ]


def test_register_creates_local_user_and_returns_bearer_token(db_session, monkeypatch) -> None:
    calls: list[tuple[object, ...]] = []
    created_user = SimpleNamespace(id="user-456", username="new-user")

    class FakeProvider:
        def __init__(self, db) -> None:
            calls.append(("provider_init", db))

    class FakeMapper:
        def __init__(self, db) -> None:
            calls.append(("mapper_init", db))

    class FakeRepo:
        def __init__(self, db) -> None:
            calls.append(("repo_init", db))

        def get_by_username(self, username: str):
            calls.append(("get_by_username", username))
            return None

        def create_local_user(
            self, username: str, password_hash: str, status: str = "active"
        ):
            calls.append(("create_local_user", username, password_hash, status))
            return created_user

    monkeypatch.setattr(auth_service_module, "LocalAuthProvider", FakeProvider)
    monkeypatch.setattr(auth_service_module, "IdentityMapper", FakeMapper)
    monkeypatch.setattr(auth_service_module, "UserRepository", FakeRepo)
    monkeypatch.setattr(auth_service_module, "get_password_hash", lambda password: f"hashed:{password}")
    monkeypatch.setattr(auth_service_module, "create_access_token", lambda user_id: f"token-{user_id}")

    response = AuthService(db_session).register(" new-user ", "secret123")

    assert response.access_token == "token-user-456"
    assert calls == [
        ("provider_init", db_session),
        ("mapper_init", db_session),
        ("repo_init", db_session),
        ("get_by_username", "new-user"),
        ("create_local_user", "new-user", "hashed:secret123", "active"),
    ]


def test_register_rejects_duplicate_username(db_session) -> None:
    with pytest.raises(HTTPException) as exc_info:
        AuthService(db_session).register("demo", "secret123")

    assert exc_info.value.status_code == 409
    assert exc_info.value.detail == {
        "code": "username_exists",
        "message": "Username already exists",
    }


def test_register_rejects_invalid_username(db_session) -> None:
    with pytest.raises(HTTPException) as exc_info:
        AuthService(db_session).register("  ", "secret123")

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == {
        "code": "invalid_username",
        "message": "Username must be between 3 and 64 characters",
    }


def test_register_rejects_short_password(db_session) -> None:
    with pytest.raises(HTTPException) as exc_info:
        AuthService(db_session).register("new-user", "short")

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == {
        "code": "invalid_password",
        "message": "Password must be at least 8 characters",
    }


def test_register_is_unavailable_when_oidc_provider_is_active(db_session, monkeypatch) -> None:
    settings = Settings(
        bff_auth_provider="oidc",
        bff_oidc_issuer="https://issuer.example.com",
        bff_oidc_audience="deerflow-bff",
        bff_oidc_jwks_url="https://issuer.example.com/.well-known/jwks.json",
        database_url="sqlite:///./test.db",
        bff_secret_key="test-secret",
        deerflow_gateway_base_url="http://127.0.0.1:8001",
    )
    monkeypatch.setattr(auth_service_module, "get_settings", lambda: settings)

    with pytest.raises(HTTPException) as exc_info:
        AuthService(db_session).register("new-user", "secret123")

    assert exc_info.value.status_code == 404
    assert exc_info.value.detail == {
        "code": "local_registration_disabled",
        "message": "Local registration is unavailable",
    }
