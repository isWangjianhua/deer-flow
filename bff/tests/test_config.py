from pathlib import Path
import textwrap

import pytest
from pydantic import ValidationError

from app.core.config import Settings


def _write_yaml(path: Path, content: str) -> None:
    path.write_text(textwrap.dedent(content).strip() + "\n", encoding="utf-8")


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


def test_settings_load_non_sensitive_values_from_root_config(tmp_path, monkeypatch) -> None:
    config_path = tmp_path / "config.yaml"
    _write_yaml(
        config_path,
        """
        config_version: 6
        bff:
          env: staging
          host: 127.0.0.1
          port: 9100
          auth:
            access_token_expire_minutes: 1440
            provider: local
          deerflow:
            gateway_base_url: http://127.0.0.1:8100
            timeout_seconds: 120
        """,
    )
    monkeypatch.setenv("DEER_FLOW_CONFIG_PATH", str(config_path))

    settings = Settings(
        database_url="sqlite:///./test.db",
        bff_secret_key="test-secret",
    )

    assert settings.config_version == 6
    assert settings.bff_env == "staging"
    assert settings.bff_host == "127.0.0.1"
    assert settings.bff_port == 9100
    assert settings.bff_access_token_expire_minutes == 1440
    assert settings.bff_auth_provider == "local"
    assert settings.deerflow_gateway_base_url == "http://127.0.0.1:8100"
    assert settings.deerflow_timeout_seconds == 120


def test_environment_variables_override_root_config_values(tmp_path, monkeypatch) -> None:
    config_path = tmp_path / "config.yaml"
    _write_yaml(
        config_path,
        """
        config_version: 6
        bff:
          auth:
            provider: local        """,
    )
    monkeypatch.setenv("DEER_FLOW_CONFIG_PATH", str(config_path))
    monkeypatch.setenv("BFF_AUTH_PROVIDER", "oidc")
    monkeypatch.setenv("BFF_OIDC_ISSUER", "https://issuer.example.com")
    monkeypatch.setenv("BFF_OIDC_AUDIENCE", "deerflow-bff")
    monkeypatch.setenv("BFF_OIDC_JWKS_URL", "https://issuer.example.com/.well-known/jwks.json")
    settings = Settings(
        database_url="sqlite:///./test.db",
        bff_secret_key="test-secret",
    )

    assert settings.bff_auth_provider == "oidc"
