from app.core.config import Settings


def test_settings_smoke() -> None:
    settings = Settings(
        database_url="sqlite:///./test.db",
        bff_secret_key="test-secret",
        deerflow_gateway_base_url="http://127.0.0.1:8001",
    )

    assert settings.database_url == "sqlite:///./test.db"
