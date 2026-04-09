from datetime import UTC, datetime
from types import SimpleNamespace

from app.api import deps as deps_module
from app.core.config import Settings
from app.services import auth_service as auth_service_module


def test_me_accepts_oidc_bearer_id_token(client, monkeypatch) -> None:
    settings = Settings(
        bff_auth_provider="oidc",
        bff_oidc_issuer="https://issuer.example.com",
        bff_oidc_audience="deerflow-bff",
        bff_oidc_jwks_url="https://issuer.example.com/.well-known/jwks.json",
        database_url="sqlite:///./test.db",
        bff_secret_key="test-secret",
        deerflow_gateway_base_url="http://127.0.0.1:8001",
    )
    calls: list[tuple[object, ...]] = []

    class FakeOidcProvider:
        def __init__(self, *, issuer, audience, jwks_url) -> None:
            assert issuer == str(settings.bff_oidc_issuer)
            assert audience == settings.bff_oidc_audience
            assert jwks_url == str(settings.bff_oidc_jwks_url)

        def authenticate_credentials(self, username: str, password: str):
            raise AssertionError("authenticate_credentials should not be used in oidc mode")

        def resolve_token_identity(self, user_id: str):
            raise AssertionError("resolve_token_identity should not be used for oidc bearer tokens")

        def resolve_bearer_identity(self, token: str):
            calls.append(("resolve_bearer_identity", token))
            return SimpleNamespace(
                provider="oidc",
                subject="oidc-user",
                email="oidc-user@example.com",
                claims={"sub": "oidc-user", "email": "oidc-user@example.com"},
            )

    class FakeMapper:
        def __init__(self, db) -> None:
            self.db = db

        def resolve_or_create_user(self, identity):
            calls.append(("resolve_or_create_user", identity.subject))
            return SimpleNamespace(
                id="user-oidc",
                username="oidc-user",
                status="active",
                created_at=datetime(2026, 4, 9, tzinfo=UTC),
            )

    class FakeLocalProvider:
        def __init__(self, db) -> None:
            raise AssertionError("LocalAuthProvider should not be used")

    def fake_get_current_user_id_from_bearer_token(self, token: str) -> str:
        calls.append(("get_current_user_id_from_bearer_token", token))
        return "user-oidc"

    def fake_get_current_user(self, user_id: str):
        calls.append(("get_current_user", user_id))
        assert user_id == "user-oidc"
        return SimpleNamespace(
            id="user-oidc",
            username="oidc-user",
            status="active",
            created_at=datetime(2026, 4, 9, tzinfo=UTC),
        )

    monkeypatch.setattr(deps_module, "get_settings", lambda: settings, raising=False)
    monkeypatch.setattr(auth_service_module, "get_settings", lambda: settings)
    monkeypatch.setattr(auth_service_module, "OidcAuthProvider", FakeOidcProvider)
    monkeypatch.setattr(auth_service_module, "LocalAuthProvider", FakeLocalProvider)
    monkeypatch.setattr(auth_service_module, "IdentityMapper", FakeMapper)
    monkeypatch.setattr(
        auth_service_module.AuthService,
        "get_current_user_id_from_bearer_token",
        fake_get_current_user_id_from_bearer_token,
    )
    monkeypatch.setattr(auth_service_module.AuthService, "get_current_user", fake_get_current_user)

    response = client.get("/me", headers={"Authorization": "Bearer oidc-id-token"})

    assert response.status_code == 200
    assert response.json()["id"] == "user-oidc"
    assert response.json()["username"] == "oidc-user"
    assert response.json()["status"] == "active"
    assert calls == [
        ("get_current_user_id_from_bearer_token", "oidc-id-token"),
        ("get_current_user", "user-oidc"),
    ]
