from __future__ import annotations

import hashlib
from contextlib import nullcontext
from typing import Any

from langsmith.run_helpers import trace

from deerflow.config import get_enabled_tracing_providers


def build_user_scope_key(user_id: str | None) -> str | None:
    if not user_id:
        return None
    digest = hashlib.sha256(user_id.encode("utf-8")).hexdigest()[:12]
    return f"usr_{digest}"


def _message_content(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        parts: list[str] = []
        for item in value:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict) and isinstance(item.get("text"), str):
                parts.append(item["text"])
        return "\n".join(part for part in parts if part)
    if isinstance(value, dict):
        for key in ("memory", "content", "text"):
            raw = value.get(key)
            if isinstance(raw, str):
                return raw
        return str(value)
    return str(value)


def trace_messages(items: list[Any]) -> list[dict[str, Any]]:
    messages: list[dict[str, Any]] = []
    for item in items:
        if isinstance(item, dict):
            msg_type = item.get("type") or item.get("role") or "text"
            content = _message_content(item)
        else:
            msg_type = getattr(item, "type", None) or getattr(item, "role", None) or "text"
            content = _message_content(getattr(item, "content", item))
        messages.append({"type": msg_type, "content": content})
    return messages


def trace_thread_data(
    *,
    thread_id: str | None,
    user_id: str | None,
    **extra: Any,
) -> dict[str, Any]:
    data: dict[str, Any] = {"memory_provider": "mem0"}
    if thread_id is not None:
        data["thread_id"] = thread_id
    user_scope_key = build_user_scope_key(user_id)
    if user_scope_key is not None:
        data["user_scope_key"] = user_scope_key
    data.update(extra)
    return data


def memory_trace(
    name: str,
    *,
    thread_id: str | None = None,
    user_id: str | None = None,
    tags: list[str] | None = None,
    metadata: dict[str, Any] | None = None,
    inputs: dict[str, Any] | None = None,
    parent: Any | None = None,
):
    if "langsmith" not in get_enabled_tracing_providers():
        return nullcontext()

    merged_metadata: dict[str, Any] = {"memory_provider": "mem0", **(metadata or {})}
    if thread_id:
        merged_metadata["thread_id"] = thread_id

    user_scope_key = build_user_scope_key(user_id)
    if user_scope_key:
        merged_metadata["memory_scope"] = "user"
        merged_metadata["user_scope_key"] = user_scope_key

    return trace(
        name=name,
        run_type="chain",
        tags=tags or ["memory", "mem0"],
        metadata=merged_metadata,
        inputs=inputs,
        parent=parent,
    )
