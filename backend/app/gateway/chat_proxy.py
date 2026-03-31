"""Helpers for the AI SDK-compatible chat BFF layer."""

from __future__ import annotations

import json
import uuid
from collections.abc import AsyncIterator

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


def _extract_text_from_langgraph_chunk(chunk: str) -> str:
    for line in chunk.splitlines():
        if not line.startswith("data: "):
            continue
        try:
            payload = json.loads(line[6:])
        except json.JSONDecodeError:
            continue
        text = payload.get("text")
        if isinstance(text, str):
            return text
    return chunk


async def usechat_stream_from_langgraph(
    upstream: AsyncIterator[str],
    *,
    conversation_id: str,
) -> AsyncIterator[str]:
    """Translate internal LangGraph-compatible SSE chunks into AI SDK data frames."""
    message_id = f"msg_{uuid.uuid4().hex}"
    text_id = f"text_{uuid.uuid4().hex}"
    text_started = False

    yield encode_usechat_data_part(
        "data-conversation",
        {"conversationId": conversation_id},
        transient=True,
    )
    yield _encode_data({"type": "start", "messageId": message_id})

    async for chunk in upstream:
        if "event: messages/partial" in chunk:
            if not text_started:
                yield _encode_data({"type": "text-start", "id": text_id})
                text_started = True
            yield encode_usechat_text_delta(text_id, _extract_text_from_langgraph_chunk(chunk))
            continue
        if "event: error" in chunk:
            yield _encode_data({"type": "error", "errorText": chunk})
            continue

    if text_started:
        yield _encode_data({"type": "text-end", "id": text_id})
    yield _encode_data({"type": "finish"})
    yield "data: [DONE]\n\n"
