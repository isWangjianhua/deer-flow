import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_settings_smoke() -> None:
    settings = Settings(
        database_url="sqlite:///./test.db",
        bff_secret_key="test-secret",
        deerflow_gateway_base_url="http://127.0.0.1:8001",
    )

    assert settings.database_url == "sqlite:///./test.db"


def test_auth_provider_settings_defaults() -> None:
    settings = Settings(
        database_url="sqlite:///./test.db",
        bff_secret_key="test-secret",
        deerflow_gateway_base_url="http://127.0.0.1:8001",
    )

    assert settings.bff_auth_provider == "local"
    assert settings.bff_auth_fallback_enabled is True
    assert settings.bff_oidc_issuer is None
    assert settings.bff_oidc_audience is None
    assert settings.bff_oidc_jwks_url is None


def test_auth_provider_settings_parse_oidc_urls() -> None:
    settings = Settings(
        database_url="sqlite:///./test.db",
        bff_secret_key="test-secret",
        deerflow_gateway_base_url="http://127.0.0.1:8001",
        bff_auth_provider="local",
        bff_oidc_issuer="https://issuer.example.com/realms/demo",
        bff_oidc_audience="deerflow",
        bff_oidc_jwks_url="https://issuer.example.com/realms/demo/protocol/openid-connect/certs",
    )

    assert settings.bff_auth_provider == "local"
    assert settings.bff_oidc_audience == "deerflow"
    assert settings.bff_oidc_issuer is not None
    assert settings.bff_oidc_issuer.scheme == "https"
    assert settings.bff_oidc_issuer.host == "issuer.example.com"
    assert settings.bff_oidc_jwks_url is not None
    assert settings.bff_oidc_jwks_url.scheme == "https"
    assert settings.bff_oidc_jwks_url.host == "issuer.example.com"


def test_auth_provider_settings_rejects_invalid_oidc_url() -> None:
    with pytest.raises(ValueError):
        Settings(
            database_url="sqlite:///./test.db",
            bff_secret_key="test-secret",
            deerflow_gateway_base_url="http://127.0.0.1:8001",
            bff_oidc_jwks_url="not-a-url",
        )


def test_local_provider_treats_blank_oidc_values_as_unset() -> None:
    settings = Settings(
        database_url="sqlite:///./test.db",
        bff_secret_key="test-secret",
        deerflow_gateway_base_url="http://127.0.0.1:8001",
        bff_auth_provider="local",
        bff_oidc_issuer="",
        bff_oidc_audience="",
        bff_oidc_jwks_url="",
    )

    assert settings.bff_oidc_issuer is None
    assert settings.bff_oidc_audience is None
    assert settings.bff_oidc_jwks_url is None


def test_oidc_provider_requires_issuer_audience_and_jwks_url() -> None:
    with pytest.raises(ValidationError):
        Settings(
            database_url="sqlite:///./test.db",
            bff_secret_key="test-secret",
            deerflow_gateway_base_url="http://127.0.0.1:8001",
            bff_auth_provider="oidc",
        )


def test_oidc_provider_accepts_complete_configuration() -> None:
    settings = Settings(
        database_url="sqlite:///./test.db",
        bff_secret_key="test-secret",
        deerflow_gateway_base_url="http://127.0.0.1:8001",
        bff_auth_provider="oidc",
        bff_oidc_issuer="https://issuer.example.com",
        bff_oidc_audience="deerflow-bff",
        bff_oidc_jwks_url="https://issuer.example.com/.well-known/jwks.json",
    )

    assert settings.bff_auth_provider == "oidc"


def test_settings_accept_default_lead_agent_name() -> None:
    settings = Settings(
        database_url="sqlite:///./test.db",
        bff_secret_key="test-secret",
        deerflow_gateway_base_url="http://127.0.0.1:8001",
        deerflow_lead_agent_name="captain-deer",
    )

    assert settings.model_dump()["deerflow_lead_agent_name"] == "captain-deer"
