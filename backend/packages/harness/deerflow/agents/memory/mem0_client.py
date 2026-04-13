"""Mem0 SDK wrapper used by DeerFlow runtime memory."""

from __future__ import annotations

from typing import Any

from deerflow.config.memory_config import MemoryConfig

try:
    from mem0 import AsyncMemory, Memory
    from mem0.configs.base import MemoryConfig as Mem0SDKConfig
except ImportError:  # pragma: no cover - exercised via runtime config, not unit tests
    AsyncMemory = None
    Memory = None
    Mem0SDKConfig = None


class Mem0MemoryClient:
    """Thin wrapper around the Mem0 OSS Python SDK."""

    def __init__(self, config: MemoryConfig) -> None:
        if Memory is None or AsyncMemory is None:
            raise RuntimeError("mem0ai is not installed. Add the dependency before enabling provider=mem0.")

        self._config = config
        sdk_config = Mem0SDKConfig(**config.mem0_config) if config.mem0_config and Mem0SDKConfig is not None else None
        self._sync_client = Memory.from_config(config.mem0_config) if config.mem0_config else Memory()
        self._async_client = AsyncMemory(config=sdk_config) if sdk_config is not None else AsyncMemory()

    @staticmethod
    def _normalize_results(payload: Any) -> list[dict[str, Any]]:
        if isinstance(payload, dict):
            results = payload.get("results")
            if isinstance(results, list):
                return [item for item in results if isinstance(item, dict)]
            memories = payload.get("memories")
            if isinstance(memories, list):
                return [item for item in memories if isinstance(item, dict)]
            return []
        if isinstance(payload, list):
            return [item for item in payload if isinstance(item, dict)]
        return []

    def search(self, *, query: str, user_id: str, limit: int) -> list[dict[str, Any]]:
        payload = self._sync_client.search(query=query, user_id=user_id, limit=limit)
        return self._normalize_results(payload)

    async def asearch(self, *, query: str, user_id: str, limit: int) -> list[dict[str, Any]]:
        payload = await self._async_client.search(query=query, user_id=user_id, limit=limit)
        return self._normalize_results(payload)

    def add_messages(
        self,
        *,
        user_id: str,
        messages: list[dict[str, str]],
        metadata: dict[str, Any] | None = None,
    ) -> bool:
        self._sync_client.add(messages=messages, user_id=user_id, metadata=metadata or {})
        return True
