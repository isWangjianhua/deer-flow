"""Configuration for memory mechanism."""

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class MemoryConfig(BaseModel):
    """Configuration for global memory mechanism."""

    model_config = ConfigDict(populate_by_name=True)

    enabled: bool = Field(
        default=True,
        description="Whether to enable memory mechanism",
    )
    write_enabled: bool = Field(
        default=True,
        description="Whether post-run memory writes are enabled.",
    )
    provider: Literal["file", "mem0"] = Field(
        default="file",
        description="Memory backend provider: `file` or `mem0`.",
    )
    storage_path: str = Field(
        default="",
        description=(
            "Path to store memory data. "
            "If empty, defaults to `{base_dir}/memory.json` (see Paths.memory_file). "
            "Absolute paths are used as-is. "
            "Relative paths are resolved against `Paths.base_dir` "
            "(not the backend working directory). "
            "Note: if you previously set this to `.deer-flow/memory.json`, "
            "the file will now be resolved as `{base_dir}/.deer-flow/memory.json`; "
            "migrate existing data or use an absolute path to preserve the old location."
        ),
    )
    storage_class: str = Field(
        default="deerflow.agents.memory.storage.FileMemoryStorage",
        description="The class path for memory storage provider",
    )
    search_limit: int = Field(
        default=8,
        alias="mem0_search_limit",
        ge=1,
        le=20,
        description="Maximum number of mem0 memories to retrieve per request.",
    )
    mem0: dict[str, Any] = Field(
        default_factory=dict,
        alias="mem0_config",
        description="Mem0 OSS Python SDK configuration passed to `Memory.from_config(...)`.",
    )
    profile_limit: int = Field(
        default=4,
        ge=1,
        le=20,
        description="Maximum number of profile memories considered before formatting.",
    )
    query_window_turns: int = Field(
        default=3,
        ge=1,
        le=10,
        description="Maximum number of recent human turns used to build the retrieval query.",
    )
    profile_budget_ratio: float = Field(
        default=0.3,
        ge=0.0,
        le=1.0,
        description="Fraction of the memory injection budget reserved for profile memories.",
    )
    profile_categories: list[str] = Field(
        default_factory=lambda: ["preference", "context", "knowledge"],
        description="Memory categories eligible for profile retrieval.",
    )
    debounce_seconds: int = Field(
        default=30,
        ge=1,
        le=300,
        description="Seconds to wait before processing queued updates (debounce)",
    )
    model_name: str | None = Field(
        default=None,
        description="Model name to use for memory updates (None = use default model)",
    )
    max_facts: int = Field(
        default=100,
        ge=10,
        le=500,
        description="Maximum number of facts to store",
    )
    fact_confidence_threshold: float = Field(
        default=0.7,
        ge=0.0,
        le=1.0,
        description="Minimum confidence threshold for storing facts",
    )
    injection_enabled: bool = Field(
        default=True,
        description="Whether to inject memory into system prompt",
    )
    max_injection_tokens: int = Field(
        default=2000,
        ge=100,
        le=8000,
        description="Maximum tokens to use for memory injection",
    )


# Global configuration instance
_memory_config: MemoryConfig = MemoryConfig()


def get_memory_config() -> MemoryConfig:
    """Get the current memory configuration."""
    return _memory_config


def set_memory_config(config: MemoryConfig) -> None:
    """Set the memory configuration."""
    global _memory_config
    _memory_config = config


def load_memory_config_from_dict(config_dict: dict) -> None:
    """Load memory configuration from a dictionary."""
    global _memory_config
    _memory_config = MemoryConfig(**config_dict)
