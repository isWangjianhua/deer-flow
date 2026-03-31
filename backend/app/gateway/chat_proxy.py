"""Helpers for the AI SDK-compatible chat BFF layer."""

from __future__ import annotations

import json
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


def encode_usechat_text_delta(text: str) -> str:
    """Encode a minimal AI SDK-compatible text delta payload."""
    return _encode_data({"type": "text-delta", "textDelta": text})


async def usechat_stream_from_langgraph(upstream: AsyncIterator[str]) -> AsyncIterator[str]:
    """Translate internal LangGraph-compatible SSE chunks into AI SDK data frames."""
    async for chunk in upstream:
        if "event: messages/partial" in chunk:
            yield encode_usechat_text_delta(chunk)
            continue
        if "event: error" in chunk:
            yield _encode_data({"type": "error", "errorText": chunk})
            continue

    yield _encode_data({"type": "finish"})
