from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    bff_env: str = Field(default="development")
    bff_host: str = Field(default="0.0.0.0")
    bff_port: int = Field(default=9000)
    database_url: str = Field(default="sqlite:///./bff.db")
    bff_secret_key: str = Field(default="change-me")
    bff_access_token_expire_minutes: int = Field(default=10080)
    bff_auth_provider: str = Field(default="local")
    bff_auth_fallback_enabled: bool = Field(default=True)
    bff_oidc_issuer: str | None = Field(default=None)
    bff_oidc_audience: str | None = Field(default=None)
    bff_oidc_jwks_url: str | None = Field(default=None)
    deerflow_gateway_base_url: str = Field(default="http://127.0.0.1:8001")
    deerflow_timeout_seconds: int = Field(default=300)


@lru_cache
def get_settings() -> Settings:
    return Settings()
