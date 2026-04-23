import os
from collections.abc import Mapping
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml
from pydantic import AnyHttpUrl, Field, field_validator, model_validator
from pydantic_settings import BaseSettings, PydanticBaseSettingsSource, SettingsConfigDict


class RootBffConfigSettingsSource(PydanticBaseSettingsSource):
    def __init__(self, settings_cls: type[BaseSettings], config_path: str | None = None):
        super().__init__(settings_cls)
        resolved_path = settings_cls.resolve_config_path(config_path)
        self.config_path = resolved_path
        self.config_data = self._load_config_data(resolved_path)

    @classmethod
    def _load_config_data(cls, config_path: Path | None) -> dict[str, Any]:
        if config_path is None:
            return {}

        root_data = cls._read_root_mapping(config_path)
        bff_data = cls._require_mapping(root_data, "bff", config_path, "BFF config file must contain a 'bff' mapping")
        auth_data = cls._require_mapping(bff_data, "auth", config_path, "BFF config file must contain a 'bff.auth' mapping")
        deerflow_data = cls._require_mapping(
            bff_data,
            "deerflow",
            config_path,
            "BFF config file must contain a 'bff.deerflow' mapping",
        )
        return cls._flatten_config(root_data, bff_data, auth_data, deerflow_data)

    @staticmethod
    def _read_root_mapping(config_path: Path) -> Mapping[str, Any]:
        with open(config_path, encoding="utf-8") as handle:
            raw = yaml.safe_load(handle) or {}

        if not isinstance(raw, Mapping):
            raise ValueError(f"BFF config file must contain a YAML mapping at the root: {config_path}")
        return raw

    @staticmethod
    def _require_mapping(
        data: Mapping[str, Any],
        key: str,
        config_path: Path,
        error_message: str,
    ) -> Mapping[str, Any]:
        value = data.get(key) or {}
        if not isinstance(value, Mapping):
            raise ValueError(f"{error_message}: {config_path}")
        return value

    @staticmethod
    def _flatten_config(
        root_data: Mapping[str, Any],
        bff_data: Mapping[str, Any],
        auth_data: Mapping[str, Any],
        deerflow_data: Mapping[str, Any],
    ) -> dict[str, Any]:
        flattened = {
            "config_version": root_data.get("config_version"),
            "bff_env": bff_data.get("env"),
            "bff_host": bff_data.get("host"),
            "bff_port": bff_data.get("port"),
            "bff_access_token_expire_minutes": auth_data.get("access_token_expire_minutes"),
            "bff_auth_provider": auth_data.get("provider"),
            "bff_oidc_issuer": auth_data.get("oidc_issuer"),
            "bff_oidc_audience": auth_data.get("oidc_audience"),
            "bff_oidc_jwks_url": auth_data.get("oidc_jwks_url"),
            "deerflow_gateway_base_url": deerflow_data.get("gateway_base_url"),
            "deerflow_timeout_seconds": deerflow_data.get("timeout_seconds"),
        }
        return {key: value for key, value in flattened.items() if value is not None}

    def get_field_value(self, field, field_name: str) -> tuple[Any, str, bool]:
        value = self.config_data.get(field_name)
        return value, field_name, False

    def __call__(self) -> dict[str, Any]:
        return dict(self.config_data)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[2] / ".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    config_version: int = Field(default=1)
    bff_env: str = Field(default="development")
    bff_host: str = Field(default="0.0.0.0")
    bff_port: int = Field(default=9000)
    database_url: str = Field(default="sqlite:///./.data/bff.db")
    bff_secret_key: str = Field(default="change-me")
    bff_access_token_expire_minutes: int = Field(default=10080)
    bff_auth_provider: str = Field(default="local")
    bff_oidc_issuer: AnyHttpUrl | None = Field(default=None)
    bff_oidc_audience: str | None = Field(default=None)
    bff_oidc_jwks_url: AnyHttpUrl | None = Field(default=None)
    deerflow_gateway_base_url: str = Field(default="http://127.0.0.1:8001")
    deerflow_timeout_seconds: int = Field(default=300)

    @classmethod
    def default_config_candidates(cls) -> tuple[Path, ...]:
        repo_root = Path(__file__).resolve().parents[3]
        return (repo_root / "config.yaml",)

    @classmethod
    def _resolve_explicit_config_path(cls, config_path: str | None = None) -> Path | None:
        if not config_path:
            return None

        path = Path(config_path).expanduser()
        if not path.exists():
            raise FileNotFoundError(f"BFF config file specified by param `config_path` not found at {path}")
        return path

    @classmethod
    def _resolve_env_config_path(cls, env_var: str) -> Path | None:
        value = os.getenv(env_var)
        if not value:
            return None

        path = Path(value).expanduser()
        if not path.exists():
            raise FileNotFoundError(f"BFF config file specified by environment variable `{env_var}` not found at {path}")
        return path

    @classmethod
    def resolve_config_path(cls, config_path: str | None = None) -> Path | None:
        explicit_path = cls._resolve_explicit_config_path(config_path)
        if explicit_path is not None:
            return explicit_path

        for env_var in ("BFF_CONFIG_PATH", "DEER_FLOW_CONFIG_PATH"):
            env_path = cls._resolve_env_config_path(env_var)
            if env_path is not None:
                return env_path

        for path in cls.default_config_candidates():
            if path.exists():
                return path

        return None

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls,
        init_settings,
        env_settings,
        dotenv_settings,
        file_secret_settings,
    ):
        return (
            init_settings,
            env_settings,
            RootBffConfigSettingsSource(settings_cls),
            dotenv_settings,
            file_secret_settings,
        )

    @field_validator("bff_oidc_issuer", "bff_oidc_audience", "bff_oidc_jwks_url", mode="before")
    @classmethod
    def blank_oidc_values_become_none(cls, value: object) -> object:
        if isinstance(value, str) and value.strip() == "":
            return None
        return value

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
