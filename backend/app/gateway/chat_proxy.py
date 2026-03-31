"""Business-facing helpers for the chat BFF layer."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

from app.gateway.services import format_sse
from app.gateway.thread_ownership import create_owned_thread, ensure_thread_belongs_to_user


def resolve_or_create_conversation(*, conversation_id: str | None, user_id: str, title: str):
    """Resolve an owned conversation or create a new one for the current user."""
    if conversation_id:
        return ensure_thread_belongs_to_user(biz_thread_id=conversation_id, user_id=user_id), False
    return create_owned_thread(user_id=user_id, title=title), True


def build_business_sse_event(event: str, data: dict[str, Any]) -> str:
    """Format a business-facing SSE frame."""
    return format_sse(event, data)


async def business_sse_stream(
    *,
    conversation_id: str,
    created: bool,
    upstream: AsyncIterator[str],
) -> AsyncIterator[str]:
    """Translate internal LangGraph-compatible SSE frames into business events."""
    if created:
        yield build_business_sse_event(
            "conversation.created",
            {"conversation_id": conversation_id},
        )

    async for chunk in upstream:
        if "event: messages/partial" in chunk:
            yield build_business_sse_event(
                "message.delta",
                {"conversation_id": conversation_id, "raw": chunk},
            )
            continue

        if "event: messages/complete" in chunk:
            yield build_business_sse_event(
                "message.completed",
                {"conversation_id": conversation_id, "raw": chunk},
            )
            continue

        if "event: error" in chunk:
            yield build_business_sse_event(
                "error",
                {"conversation_id": conversation_id, "raw": chunk},
            )
            continue

    yield build_business_sse_event(
        "run.completed",
        {"conversation_id": conversation_id},
    )
