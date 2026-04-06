"""Helpers for the AI SDK-compatible chat BFF layer."""

from __future__ import annotations

import json
import uuid
from collections.abc import AsyncIterator
from typing import Any

from app.gateway.thread_ownership import create_owned_thread, ensure_thread_belongs_to_user


def resolve_or_create_conversation(*, conversation_id: str | None, user_id: str, title: str):
    """Resolve an owned conversation or create a new one for the current user."""
    if conversation_id:
        return ensure_thread_belongs_to_user(biz_thread_id=conversation_id, user_id=user_id), False
    return create_owned_thread(user_id=user_id, title=title), True


def build_usechat_headers() -> dict[str, str]:
    """Return response headers expected by AI SDK chat streaming."""
    return {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
        "x-vercel-ai-ui-message-stream": "v1",
    }


def _encode_data(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def encode_usechat_text_delta(text_id: str, text: str) -> str:
    """Encode an AI SDK-compatible text delta payload."""
    return _encode_data({"type": "text-delta", "id": text_id, "delta": text})


def encode_usechat_data_part(part_type: str, data: dict, *, transient: bool = False, part_id: str | None = None) -> str:
    payload = {
        "type": part_type,
        "data": data,
    }
    if part_id is not None:
        payload["id"] = part_id
    if transient:
        payload["transient"] = True
    return _encode_data(payload)


def _iter_langgraph_payloads(chunk: str) -> list[Any]:
    payloads: list[Any] = []
    for line in chunk.splitlines():
        if not line.startswith("data: "):
            continue
        try:
            payloads.append(json.loads(line[6:]))
        except json.JSONDecodeError:
            continue
    return payloads


def _extract_text_event_from_langgraph_chunk(chunk: str) -> tuple[str, str | None]:
    for payload in _iter_langgraph_payloads(chunk):
        if isinstance(payload, list) and payload:
            first = payload[0]
            if isinstance(first, dict):
                payload_type = first.get("type")
                if str(payload_type).lower() not in ("aimessagechunk", "ai"):
                    continue
                content = first.get("content")
                if isinstance(content, str) and content:
                    message_id = first.get("id")
                    return content, message_id if isinstance(message_id, str) else None
            continue
        if not isinstance(payload, dict):
            continue
        if str(payload.get("type", "")).lower() in ("ai", "aimessagechunk"):
            content = payload.get("content")
            if isinstance(content, str) and content:
                message_id = payload.get("id")
                return content, message_id if isinstance(message_id, str) else None
        if str(payload.get("type", "")).lower() != "tool":
            text = payload.get("text")
        else:
            text = None
        if isinstance(text, str):
            message_id = payload.get("id")
            return text, message_id if isinstance(message_id, str) else None
    return "", None


def _extract_reasoning_content(payload: dict[str, Any]) -> str | None:
    additional_kwargs = payload.get("additional_kwargs")
    if isinstance(additional_kwargs, dict):
        reasoning = additional_kwargs.get("reasoning_content")
        if isinstance(reasoning, str) and reasoning.strip():
            return reasoning.strip()

    content = payload.get("content")
    if isinstance(content, list):
        for part in content:
            if not isinstance(part, dict):
                continue
            thinking = part.get("thinking")
            if isinstance(thinking, str) and thinking.strip():
                return thinking.strip()

    return None


def _extract_reasoning_events_from_langgraph_chunk(chunk: str) -> list[dict[str, str]]:
    events: list[dict[str, str]] = []

    def append_reasoning(payload: dict[str, Any]) -> None:
        payload_type = str(payload.get("type", "")).lower()
        if payload_type == "tool":
            return
        reasoning = _extract_reasoning_content(payload)
        message_id = payload.get("id")
        if reasoning and isinstance(message_id, str) and message_id:
            events.append({"message_id": message_id, "content": reasoning})

    for payload in _iter_langgraph_payloads(chunk):
        if isinstance(payload, list) and payload:
            first = payload[0]
            if isinstance(first, dict):
                append_reasoning(first)
            continue

        if not isinstance(payload, dict):
            continue

        messages = payload.get("messages")
        if isinstance(messages, list):
            for message in messages:
                if isinstance(message, dict):
                    append_reasoning(message)
            continue

        append_reasoning(payload)

    return events


def _extract_tool_events_from_langgraph_chunk(chunk: str) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []

    def normalize_tool_content(value: Any) -> str:
        if isinstance(value, str):
            return value
        if value is None:
            return ""
        if isinstance(value, (dict, list)):
            try:
                return json.dumps(value, ensure_ascii=False)
            except TypeError:
                return str(value)
        return str(value)

    for payload in _iter_langgraph_payloads(chunk):
        if isinstance(payload, list) and payload:
            first = payload[0]
            if isinstance(first, dict):
                payload = first
            else:
                continue
        if not isinstance(payload, dict):
            continue

        payload_type = str(payload.get("type", "")).lower()
        if payload_type in ("ai", "aimessagechunk"):
            for tool_call in payload.get("tool_calls") or []:
                if not isinstance(tool_call, dict):
                    continue
                tool_call_id = tool_call.get("id")
                name = tool_call.get("name")
                args = tool_call.get("args")
                if not isinstance(tool_call_id, str) or not isinstance(name, str):
                    continue
                events.append(
                    {
                        "kind": "tool-call",
                        "message_id": payload.get("id"),
                        "tool_call_id": tool_call_id,
                        "name": name,
                        "args": args if isinstance(args, dict) else {},
                    }
                )
        elif payload_type == "tool":
            tool_call_id = payload.get("tool_call_id")
            if not isinstance(tool_call_id, str):
                continue
            events.append(
                {
                    "kind": "tool-result",
                    "message_id": payload.get("id"),
                    "tool_call_id": tool_call_id,
                    "name": payload.get("name"),
                    "content": normalize_tool_content(payload.get("content")),
                }
            )
    return events


async def usechat_stream_from_langgraph(
    upstream: AsyncIterator[str],
    *,
    conversation_id: str,
) -> AsyncIterator[str]:
    """Translate internal LangGraph-compatible SSE chunks into AI SDK data frames."""
    message_id = f"msg_{uuid.uuid4().hex}"
    text_id = f"text_{uuid.uuid4().hex}"
    text_started = False
    latest_reasoning_by_message: dict[str, str] = {}
    latest_text_by_message: dict[str, str] = {}

    yield encode_usechat_data_part(
        "data-conversation",
        {"conversationId": conversation_id},
        transient=True,
    )
    yield _encode_data({"type": "start", "messageId": message_id})

    async for chunk in upstream:
        for reasoning in _extract_reasoning_events_from_langgraph_chunk(chunk):
            previous = latest_reasoning_by_message.get(reasoning["message_id"])
            if previous == reasoning["content"]:
                continue

            latest_reasoning_by_message[reasoning["message_id"]] = reasoning["content"]
            yield encode_usechat_data_part(
                "data-reasoning",
                {
                    "messageId": reasoning["message_id"],
                    "content": reasoning["content"],
                },
                transient=True,
                part_id=f"reasoning_{reasoning['message_id']}",
            )

        if (
            "event: messages/partial" in chunk
            or "event: messages-tuple" in chunk
            or "event: messages" in chunk
        ):
            for event in _extract_tool_events_from_langgraph_chunk(chunk):
                if event["kind"] == "tool-call":
                    yield encode_usechat_data_part(
                        "data-tool-call",
                        {
                            "messageId": event["message_id"],
                            "toolCallId": event["tool_call_id"],
                            "name": event["name"],
                            "args": event["args"],
                        },
                        transient=True,
                        part_id=event["tool_call_id"],
                    )
                elif event["kind"] == "tool-result":
                    yield encode_usechat_data_part(
                        "data-tool-result",
                        {
                            "messageId": event["message_id"],
                            "toolCallId": event["tool_call_id"],
                            "name": event["name"],
                            "content": event["content"],
                        },
                        transient=True,
                        part_id=event["tool_call_id"],
                    )
            text, upstream_message_id = _extract_text_event_from_langgraph_chunk(chunk)
            if not text:
                continue
            if upstream_message_id and latest_text_by_message.get(upstream_message_id) == text:
                continue
            if upstream_message_id:
                latest_text_by_message[upstream_message_id] = text
            if not text_started:
                yield _encode_data({"type": "text-start", "id": text_id})
                text_started = True
            yield encode_usechat_text_delta(text_id, text)
            continue
        if "event: error" in chunk:
            yield _encode_data({"type": "error", "errorText": chunk})
            continue

    if text_started:
        yield _encode_data({"type": "text-end", "id": text_id})
    yield _encode_data({"type": "finish"})
    yield "data: [DONE]\n\n"
