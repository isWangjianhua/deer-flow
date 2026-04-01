"""mem0-backed user-scoped long-term memory service."""

from __future__ import annotations

import threading
from collections.abc import Iterable
from datetime import UTC, datetime
from typing import Any

from deerflow.config.memory_config import get_memory_config


def _utc_now_iso() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def _coerce_text(content: Any) -> str:
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict):
                text = block.get("text")
                if isinstance(text, str):
                    parts.append(text)
        return "\n".join(part.strip() for part in parts if part and part.strip()).strip()
    return str(content).strip()


def _message_to_dict(message: Any) -> dict[str, str] | None:
    role = getattr(message, "type", None)
    if role == "human":
        role = "user"
    elif role == "ai":
        role = "assistant"
    elif role not in {"user", "assistant", "system"}:
        role = None

    content = _coerce_text(getattr(message, "content", ""))
    if role is None or not content:
        return None
    return {"role": role, "content": content}


def _result_to_fact(result: dict[str, Any]) -> dict[str, Any]:
    metadata = result.get("metadata") or {}
    created_at = (
        result.get("created_at")
        or result.get("createdAt")
        or metadata.get("created_at")
        or metadata.get("createdAt")
        or _utc_now_iso()
    )
    score = result.get("score")
    try:
        confidence = float(score) if score is not None else 0.8
    except (TypeError, ValueError):
        confidence = 0.8

    memory_id = result.get("id") or result.get("memory_id") or metadata.get("id") or f"mem0_{abs(hash(result.get('memory', '')))}"
    content = result.get("memory") or result.get("text") or result.get("content") or ""
    category = metadata.get("category") or "context"
    source = metadata.get("source") or metadata.get("thread_id") or metadata.get("run_id") or "mem0"
    return {
        "id": str(memory_id),
        "content": str(content),
        "category": str(category),
        "confidence": max(0.0, min(1.0, confidence)),
        "createdAt": str(created_at),
        "source": str(source),
    }


def _empty_compat_memory(*, facts: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    facts = facts or []
    last_updated = max((fact.get("createdAt") or "" for fact in facts), default="")
    return {
        "version": "1.0",
        "lastUpdated": last_updated,
        "user": {
            "workContext": {"summary": "", "updatedAt": ""},
            "personalContext": {"summary": "", "updatedAt": ""},
            "topOfMind": {"summary": "", "updatedAt": ""},
        },
        "history": {
            "recentMonths": {"summary": "", "updatedAt": ""},
            "earlierContext": {"summary": "", "updatedAt": ""},
            "longTermBackground": {"summary": "", "updatedAt": ""},
        },
        "facts": facts,
    }


class Mem0Service:
    def __init__(self) -> None:
        self._client = None

    def _ensure_client(self):
        if self._client is not None:
            return self._client

        config = get_memory_config()
        try:
            from mem0 import Memory
        except ImportError as exc:
            raise RuntimeError("mem0ai is not installed. Add the dependency before enabling provider=mem0.") from exc

        if not config.mem0:
            raise RuntimeError("memory.mem0 config is empty. Configure mem0 before enabling provider=mem0.")

        self._client = Memory.from_config(config.mem0)
        return self._client

    def add_conversation(
        self,
        *,
        messages: list[Any],
        user_id: str,
        run_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> Any:
        payload = [item for item in (_message_to_dict(message) for message in messages) if item is not None]
        if not payload:
            return None

        kwargs: dict[str, Any] = {
            "messages": payload,
            "user_id": user_id,
        }
        if run_id:
            kwargs["run_id"] = run_id
        if metadata:
            kwargs["metadata"] = metadata
        return self._ensure_client().add(**kwargs)

    def search(self, *, query: str, user_id: str, limit: int | None = None) -> list[dict[str, Any]]:
        if not query.strip():
            return []
        effective_limit = limit or get_memory_config().search_limit
        result = self._ensure_client().search(query=query, user_id=user_id, limit=effective_limit)
        if isinstance(result, dict):
            memories = result.get("results") or result.get("memories") or []
        else:
            memories = result or []
        return [item for item in memories if isinstance(item, dict)]

    def get_all(self, *, user_id: str) -> list[dict[str, Any]]:
        result = self._ensure_client().get_all(user_id=user_id)
        if isinstance(result, dict):
            memories = result.get("results") or result.get("memories") or []
        else:
            memories = result or []
        return [item for item in memories if isinstance(item, dict)]

    def delete(self, *, memory_id: str) -> Any:
        return self._ensure_client().delete(memory_id=memory_id)

    def delete_all(self, *, user_id: str) -> Any:
        return self._ensure_client().delete_all(user_id=user_id)

    def create_fact(
        self,
        *,
        user_id: str,
        content: str,
        category: str = "context",
        confidence: float = 0.5,
    ) -> None:
        normalized = content.strip()
        if not normalized:
            raise ValueError("content")
        self._ensure_client().add(
            messages=[{"role": "system", "content": normalized}],
            user_id=user_id,
            metadata={
                "category": category.strip() or "context",
                "confidence": confidence,
                "createdAt": _utc_now_iso(),
                "source": "manual",
            },
        )

    def import_facts(self, *, user_id: str, facts: Iterable[dict[str, Any]]) -> None:
        for fact in facts:
            content = str(fact.get("content", "")).strip()
            if not content:
                continue
            self._ensure_client().add(
                messages=[{"role": "system", "content": content}],
                user_id=user_id,
                metadata={
                    "category": fact.get("category", "context"),
                    "confidence": fact.get("confidence", 0.5),
                    "createdAt": fact.get("createdAt", _utc_now_iso()),
                    "source": fact.get("source", "import"),
                },
            )

    def build_compat_memory(self, *, user_id: str) -> dict[str, Any]:
        facts = [_result_to_fact(item) for item in self.get_all(user_id=user_id)]
        facts.sort(key=lambda item: item.get("createdAt", ""), reverse=True)
        return _empty_compat_memory(facts=facts)

    def build_compat_memory_from_search(self, *, user_id: str, query: str, limit: int | None = None) -> dict[str, Any]:
        facts = [_result_to_fact(item) for item in self.search(query=query, user_id=user_id, limit=limit)]
        return _empty_compat_memory(facts=facts)


_service: Mem0Service | None = None
_lock = threading.Lock()


def get_mem0_service() -> Mem0Service:
    global _service
    if _service is not None:
        return _service
    with _lock:
        if _service is None:
            _service = Mem0Service()
    return _service


def reset_mem0_service() -> None:
    global _service
    with _lock:
        _service = None
