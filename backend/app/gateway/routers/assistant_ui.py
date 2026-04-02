from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.gateway.assistant_ui_adapter import convert_deerflow_messages_to_assistant_ui
from app.gateway.deps import get_current_user
from app.gateway.routers import conversations, threads

router = APIRouter(prefix="/api/assistant-ui", tags=["assistant-ui"])


class AssistantUiThreadListItem(BaseModel):
    thread_id: str
    title: str = ""
    created_at: str
    updated_at: str


class AssistantUiThreadResponse(BaseModel):
    thread_id: str
    title: str = ""
    messages: list[dict[str, Any]] = Field(default_factory=list)
    artifacts: list[str] = Field(default_factory=list)
    todos: list[Any] = Field(default_factory=list)


def _extract_message_text(message: dict[str, Any]) -> str:
    content = message.get("content", "")
    if isinstance(content, str):
        return content.strip()

    if isinstance(content, list):
        lines: list[str] = []
        for part in content:
            if isinstance(part, dict) and part.get("type") == "text" and isinstance(part.get("text"), str):
                lines.append(part["text"])
        return "\n".join(line for line in lines if line).strip()

    return ""


def _derive_title_from_messages(messages: list[dict[str, Any]]) -> str:
    for message in messages:
        if message.get("type") != "human":
            continue
        text = _extract_message_text(message)
        if text:
            return text[:48]
    return ""


async def _resolve_thread_title(thread_id: str, request: Request, current_title: str) -> str:
    if current_title.strip():
        return current_title

    try:
        state = await threads.load_thread_state(thread_id=thread_id, request=request)
    except HTTPException:
        return current_title

    values = state.values
    title = values.get("title")
    if isinstance(title, str) and title.strip():
        return title

    raw_messages = values.get("messages")
    if isinstance(raw_messages, list):
        derived = _derive_title_from_messages([message for message in raw_messages if isinstance(message, dict)])
        if derived:
            return derived

    return current_title


@router.get("/threads", response_model=list[AssistantUiThreadListItem])
async def list_threads(request: Request, user=Depends(get_current_user)) -> list[AssistantUiThreadListItem]:
    items = await conversations.list_conversations(user=user)
    resolved_titles = await asyncio.gather(
        *[_resolve_thread_title(item.conversation_id, request, item.title) for item in items]
    )

    return [
        AssistantUiThreadListItem(
            thread_id=item.conversation_id,
            title=resolved_titles[index],
            created_at=item.created_at,
            updated_at=item.updated_at,
        )
        for index, item in enumerate(items)
    ]


@router.get("/threads/{thread_id}", response_model=AssistantUiThreadResponse)
async def get_thread(thread_id: str, request: Request, user=Depends(get_current_user)) -> AssistantUiThreadResponse:
    try:
        threads.ensure_thread_belongs_to_user(biz_thread_id=thread_id, user_id=user.id)
    except PermissionError as exc:
        raise HTTPException(status_code=404, detail=f"Thread {thread_id} not found") from exc

    state = await threads.load_thread_state(thread_id=thread_id, request=request)
    values = state.values
    raw_messages = values.get("messages", [])
    messages = (
        convert_deerflow_messages_to_assistant_ui(raw_messages)
        if isinstance(raw_messages, list)
        else []
    )

    return AssistantUiThreadResponse(
        thread_id=thread_id,
        title=values.get("title", "") if isinstance(values.get("title"), str) else "",
        messages=messages,
        artifacts=values.get("artifacts", []) if isinstance(values.get("artifacts"), list) else [],
        todos=values.get("todos", []) if isinstance(values.get("todos"), list) else [],
    )
