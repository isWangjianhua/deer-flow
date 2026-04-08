"""Shared Gateway helpers for request normalization and SSE formatting."""

from __future__ import annotations

import json
from typing import Any

from langchain_core.messages import HumanMessage


def format_sse(event: str, data: Any, *, event_id: str | None = None) -> str:
    payload = json.dumps(data, default=str, ensure_ascii=False)
    parts = [f"event: {event}", f"data: {payload}"]
    if event_id:
        parts.append(f"id: {event_id}")
    parts.append("")
    parts.append("")
    return "\n".join(parts)


def normalize_stream_modes(raw: list[str] | str | None) -> list[str]:
    if raw is None:
        return ["values"]
    if isinstance(raw, str):
        return [raw]
    return raw if raw else ["values"]


def normalize_input(raw_input: dict[str, Any] | None) -> dict[str, Any]:
    if raw_input is None:
        return {}
    messages = raw_input.get("messages")
    if messages and isinstance(messages, list):
        converted = []
        for msg in messages:
            if isinstance(msg, dict):
                content = msg.get("content", "")
                converted.append(HumanMessage(content=content))
            else:
                converted.append(msg)
        return {**raw_input, "messages": converted}
    return raw_input


def build_run_config(thread_id: str, request_config: dict[str, Any] | None, metadata: dict[str, Any] | None) -> dict[str, Any]:
    configurable = {"thread_id": thread_id}
    if request_config:
        configurable.update(request_config.get("configurable", {}))
    config: dict[str, Any] = {"configurable": configurable, "recursion_limit": 100}
    if request_config:
        for key, value in request_config.items():
            if key != "configurable":
                config[key] = value
    if metadata:
        config.setdefault("metadata", {}).update(metadata)
    return config
