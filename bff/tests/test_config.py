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
