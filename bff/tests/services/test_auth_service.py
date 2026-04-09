from types import SimpleNamespace

from app.core.security import get_password_hash, verify_password
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
    settings = SimpleNamespace(
        bff_auth_provider="oidc",
        bff_oidc_issuer="https://issuer.example.com",
        bff_oidc_audience="deerflow-bff",
        bff_oidc_jwks_url="https://issuer.example.com/.well-known/jwks.json",
    )

    class FakeLocalProvider:
        def __init__(self, db) -> None:
            raise AssertionError("LocalAuthProvider should not be used for oidc auth")

    class FakeOidcProvider:
        def __init__(self, *, issuer, audience, jwks_url) -> None:
            calls.append(("oidc_provider_init", issuer, audience, jwks_url))

    monkeypatch.setattr(auth_service_module, "get_settings", lambda: settings)
    monkeypatch.setattr(auth_service_module, "LocalAuthProvider", FakeLocalProvider)
    monkeypatch.setattr(auth_service_module, "OidcAuthProvider", FakeOidcProvider)

    service = AuthService(db_session)

    assert isinstance(service.provider, FakeOidcProvider)
    assert calls == [
        (
            "oidc_provider_init",
            "https://issuer.example.com",
            "deerflow-bff",
            "https://issuer.example.com/.well-known/jwks.json",
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
