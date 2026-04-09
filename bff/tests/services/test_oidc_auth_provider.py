import time

import pytest
from fastapi import HTTPException

from app.auth.providers.oidc import OidcAuthProvider


def _provider() -> OidcAuthProvider:
    return OidcAuthProvider(
        issuer="https://issuer.example.com",
        audience="deerflow-bff",
        jwks_url="https://issuer.example.com/jwks",
    )


def _claims(
    *,
    issuer: str = "https://issuer.example.com",
    audience: str | list[str] = "deerflow-bff",
    subject: str = "user-123",
    expires_at: int | None = None,
    email: str = "oidc@example.com",
) -> dict[str, object]:
    if expires_at is None:
        expires_at = int(time.time()) + 3600
    return {
        "iss": issuer,
        "aud": audience,
        "sub": subject,
        "email": email,
        "exp": expires_at,
    }


def assert_invalid_token(exc_info: pytest.ExceptionInfo[HTTPException], message: str) -> None:
    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == {"code": "invalid_token", "message": message}


def test_oidc_provider_accepts_valid_token(monkeypatch) -> None:
    provider = _provider()
    monkeypatch.setattr(provider, "_get_jwks", lambda: {"keys": [{"kid": "test-key"}]})
    monkeypatch.setattr(provider, "_decode_with_jwks", lambda token, jwks: _claims())

    identity = provider.resolve_bearer_identity("token-value")

    assert identity.provider == "oidc"
    assert identity.subject == "user-123"
    assert identity.email == "oidc@example.com"
    assert identity.claims["iss"] == "https://issuer.example.com"
    assert identity.claims["aud"] == "deerflow-bff"


def test_oidc_provider_rejects_invalid_issuer(monkeypatch) -> None:
    provider = _provider()
    monkeypatch.setattr(provider, "_get_jwks", lambda: {"keys": [{"kid": "test-key"}]})
    monkeypatch.setattr(provider, "_decode_with_jwks", lambda token, jwks: _claims(issuer="https://wrong.example.com"))

    with pytest.raises(HTTPException) as exc_info:
        provider.resolve_bearer_identity("token-value")

    assert_invalid_token(exc_info, "Invalid token issuer")


def test_oidc_provider_rejects_invalid_audience(monkeypatch) -> None:
    provider = _provider()
    monkeypatch.setattr(provider, "_get_jwks", lambda: {"keys": [{"kid": "test-key"}]})
    monkeypatch.setattr(provider, "_decode_with_jwks", lambda token, jwks: _claims(audience="another-audience"))

    with pytest.raises(HTTPException) as exc_info:
        provider.resolve_bearer_identity("token-value")

    assert_invalid_token(exc_info, "Invalid token audience")


def test_oidc_provider_rejects_expired_token(monkeypatch) -> None:
    provider = _provider()
    monkeypatch.setattr(provider, "_get_jwks", lambda: {"keys": [{"kid": "test-key"}]})
    monkeypatch.setattr(
        provider,
        "_decode_with_jwks",
        lambda token, jwks: _claims(expires_at=int(time.time()) - 1),
    )

    with pytest.raises(HTTPException) as exc_info:
        provider.resolve_bearer_identity("token-value")

    assert_invalid_token(exc_info, "Token expired")


def test_oidc_provider_rejects_missing_subject(monkeypatch) -> None:
    provider = _provider()
    monkeypatch.setattr(provider, "_get_jwks", lambda: {"keys": [{"kid": "test-key"}]})
    monkeypatch.setattr(provider, "_decode_with_jwks", lambda token, jwks: _claims(subject=""))

    with pytest.raises(HTTPException) as exc_info:
        provider.resolve_bearer_identity("token-value")

    assert_invalid_token(exc_info, "Missing token subject")
