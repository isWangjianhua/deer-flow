from functools import lru_cache

from pydantic import AnyHttpUrl, Field, model_validator
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
    bff_oidc_issuer: AnyHttpUrl | None = Field(default=None)
    bff_oidc_audience: str | None = Field(default=None)
    bff_oidc_jwks_url: AnyHttpUrl | None = Field(default=None)
    deerflow_gateway_base_url: str = Field(default="http://127.0.0.1:8001")
    deerflow_timeout_seconds: int = Field(default=300)

    @model_validator(mode="after")
    def validate_oidc_settings(self) -> "Settings":
        if self.bff_auth_provider != "oidc":
            return self

        missing_fields = []
        if self.bff_oidc_issuer is None:
            missing_fields.append("bff_oidc_issuer")
        if not self.bff_oidc_audience:
            missing_fields.append("bff_oidc_audience")
        if self.bff_oidc_jwks_url is None:
            missing_fields.append("bff_oidc_jwks_url")

        if missing_fields:
            missing = ", ".join(missing_fields)
            raise ValueError(f"OIDC auth provider requires {missing}")

        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
