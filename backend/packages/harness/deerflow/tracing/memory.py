from __future__ import annotations

import hashlib
import re
from contextlib import ExitStack, nullcontext
from typing import Any

from langsmith.run_helpers import trace

from deerflow.config import get_enabled_tracing_providers, get_tracing_config


_LANGFUSE_TRACE_ID_RE = re.compile(r"^[0-9a-f]{32}$")
_LANGFUSE_SPAN_ID_RE = re.compile(r"^[0-9a-f]{16}$")


def _get_langfuse_client():
    from langfuse import get_client

    public_key = get_tracing_config().langfuse.public_key
    return get_client(public_key=public_key)


def _normalize_langfuse_id(value: Any, *, pattern: re.Pattern[str]) -> str | None:
    if not isinstance(value, str):
        return None

    normalized = value.strip().lower()
    if pattern.fullmatch(normalized):
        return normalized
    return None


def _normalize_langfuse_trace_context(value: Any) -> dict[str, str] | None:
    if not isinstance(value, dict):
        return None

    trace_id = _normalize_langfuse_id(value.get("trace_id"), pattern=_LANGFUSE_TRACE_ID_RE)
    if trace_id is None:
        return None

    context = {"trace_id": trace_id}
    parent_span_id = _normalize_langfuse_id(value.get("parent_span_id"), pattern=_LANGFUSE_SPAN_ID_RE)
    if parent_span_id is not None:
        context["parent_span_id"] = parent_span_id
    return context


def _langfuse_trace_context(parent: Any | None) -> dict[str, str] | None:
    if parent is None:
        return None

    trace_context = _normalize_langfuse_trace_context(getattr(parent, "trace_context", None))
    if trace_context is not None:
        return trace_context

    trace_id = _normalize_langfuse_id(getattr(parent, "trace_id", None), pattern=_LANGFUSE_TRACE_ID_RE)
    if trace_id is None:
        return None

    context = {"trace_id": trace_id}
    parent_span_id = _normalize_langfuse_id(getattr(parent, "id", None), pattern=_LANGFUSE_SPAN_ID_RE)
    if parent_span_id is not None:
        context["parent_span_id"] = parent_span_id
    return context


class _MemoryTraceSpan:
    def __init__(
        self,
        *,
        metadata: dict[str, Any],
        langsmith_span: Any | None = None,
        langfuse_span: Any | None = None,
    ) -> None:
        self.metadata = metadata
        self._langsmith_span = langsmith_span
        self._langfuse_span = langfuse_span
        self._ended = False

    @property
    def trace_context(self) -> dict[str, str] | None:
        trace_id = _normalize_langfuse_id(getattr(self._langfuse_span, "trace_id", None), pattern=_LANGFUSE_TRACE_ID_RE)
        if trace_id is None:
            return None

        context = {"trace_id": trace_id}
        parent_span_id = _normalize_langfuse_id(getattr(self._langfuse_span, "id", None), pattern=_LANGFUSE_SPAN_ID_RE)
        if parent_span_id is not None:
            context["parent_span_id"] = parent_span_id
        return context

    def _sync_langsmith_metadata(self) -> None:
        if self._langsmith_span is None or not hasattr(self._langsmith_span, "metadata"):
            return

        current_metadata = getattr(self._langsmith_span, "metadata", None)
        if isinstance(current_metadata, dict):
            current_metadata.clear()
            current_metadata.update(self.metadata)
        else:
            setattr(self._langsmith_span, "metadata", dict(self.metadata))

    def end(self, *, outputs: dict[str, Any] | None = None) -> None:
        if self._ended:
            return

        self._sync_langsmith_metadata()

        if self._langfuse_span is not None:
            update_kwargs: dict[str, Any] = {"metadata": self.metadata}
            if outputs is not None:
                update_kwargs["output"] = outputs
            self._langfuse_span.update(**update_kwargs)
            self._langfuse_span.end()

        if self._langsmith_span is not None and hasattr(self._langsmith_span, "end"):
            self._langsmith_span.end(outputs=outputs)

        self._ended = True


class _MemoryTraceContext:
    def __init__(
        self,
        *,
        enabled_providers: list[str],
        name: str,
        tags: list[str],
        metadata: dict[str, Any],
        inputs: dict[str, Any] | None,
        parent: Any | None,
    ) -> None:
        self._enabled_providers = enabled_providers
        self._name = name
        self._tags = tags
        self._metadata = metadata
        self._inputs = inputs
        self._parent = parent
        self._stack: ExitStack | None = None
        self._span: _MemoryTraceSpan | None = None

    def __enter__(self) -> _MemoryTraceSpan:
        stack = ExitStack()

        langsmith_span = None
        if "langsmith" in self._enabled_providers:
            langsmith_span = stack.enter_context(
                trace(
                    name=self._name,
                    run_type="chain",
                    tags=self._tags,
                    metadata=dict(self._metadata),
                    inputs=self._inputs,
                    parent=self._parent,
                )
            )

        langfuse_span = None
        if "langfuse" in self._enabled_providers:
            langfuse_kwargs: dict[str, Any] = {
                "name": self._name,
                "as_type": "chain",
                "input": self._inputs,
                "metadata": dict(self._metadata),
                "end_on_exit": False,
            }
            trace_context = _langfuse_trace_context(self._parent)
            if trace_context is not None:
                langfuse_kwargs["trace_context"] = trace_context
            langfuse_span = stack.enter_context(_get_langfuse_client().start_as_current_observation(**langfuse_kwargs))

        self._stack = stack
        self._span = _MemoryTraceSpan(
            metadata=self._metadata,
            langsmith_span=langsmith_span,
            langfuse_span=langfuse_span,
        )
        return self._span

    def __exit__(self, exc_type, exc, tb) -> bool:
        if self._span is not None and not self._span._ended:
            self._span._sync_langsmith_metadata()
            if self._span._langfuse_span is not None:
                update_kwargs: dict[str, Any] = {"metadata": self._span.metadata}
                if exc is not None:
                    update_kwargs["level"] = "ERROR"
                    update_kwargs["status_message"] = str(exc)
                self._span._langfuse_span.update(**update_kwargs)
                self._span._langfuse_span.end()
                self._span._ended = True

        if self._stack is None:
            return False
        return self._stack.__exit__(exc_type, exc, tb)


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
    enabled_providers = get_enabled_tracing_providers()
    if not enabled_providers:
        return nullcontext()

    merged_metadata: dict[str, Any] = {"memory_provider": "mem0", **(metadata or {})}
    if thread_id:
        merged_metadata["thread_id"] = thread_id

    user_scope_key = build_user_scope_key(user_id)
    if user_scope_key:
        merged_metadata["memory_scope"] = "user"
        merged_metadata["user_scope_key"] = user_scope_key

    return _MemoryTraceContext(
        enabled_providers=enabled_providers,
        name=name,
        tags=tags or ["memory", "mem0"],
        metadata=merged_metadata,
        inputs=inputs,
        parent=parent,
    )
