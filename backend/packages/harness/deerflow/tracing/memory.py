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
