from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, model_validator

from app.gateway.chat_proxy import (
    build_usechat_headers,
    resolve_or_create_conversation,
    usechat_stream_from_langgraph,
)
from app.gateway.deps import get_current_user, get_run_manager, get_stream_bridge
from app.gateway.routers.thread_runs import RunCreateRequest
from app.gateway.services import sse_consumer, start_run

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatMessage(BaseModel):
    role: str
    content: str | None = None
    parts: list[dict[str, Any]] = Field(default_factory=list)

    @model_validator(mode="after")
    def populate_content_from_parts(self) -> "ChatMessage":
        if self.content is not None:
            return self
        text_parts = [
            part.get("text", "")
            for part in self.parts
            if part.get("type") == "text" and isinstance(part.get("text"), str)
        ]
        self.content = "\n".join(part for part in text_parts if part).strip()
        return self


class UseChatRequest(BaseModel):
    id: str | None = None
    messages: list[ChatMessage] = Field(default_factory=list)
    body: dict[str, Any] = Field(default_factory=dict)


def _build_run_messages(messages: list[ChatMessage]) -> list[dict[str, str]]:
    latest_user_message: ChatMessage | None = None
    for message in messages:
        if message.role == "user" and message.content:
            latest_user_message = message

    if latest_user_message is not None:
        return [{"role": "user", "content": latest_user_message.content}]

    return [
        {"role": message.role, "content": message.content}
        for message in messages
        if message.content
    ]


@router.post("")
async def chat(body: UseChatRequest, request: Request, user=Depends(get_current_user)) -> StreamingResponse:
    conversation_id = body.body.get("conversation_id")
    requested_model_name = body.body.get("model_name")
    try:
        record, created = resolve_or_create_conversation(
            conversation_id=conversation_id,
            user_id=user.id,
            title="",
        )
    except PermissionError as exc:
        raise HTTPException(status_code=404, detail="Conversation not found") from exc

    run_body = RunCreateRequest(
        assistant_id="lead_agent",
        input={"messages": _build_run_messages(body.messages)},
        metadata={"source": "usechat-proxy"},
        config={
            "configurable": {
                "thread_id": record.id,
                "user_id": user.id,
                **(
                    {"model_name": requested_model_name.strip()}
                    if isinstance(requested_model_name, str) and requested_model_name.strip()
                    else {}
                ),
            }
        },
        stream_mode=["messages-tuple", "values"],
    )
    run_record = await start_run(run_body, record.id, request)
    bridge = get_stream_bridge(request)
    run_mgr = get_run_manager(request)
    upstream = sse_consumer(bridge, run_record, request, run_mgr)

    return StreamingResponse(
        usechat_stream_from_langgraph(upstream, conversation_id=record.id),
        media_type="text/event-stream",
        headers=build_usechat_headers(),
    )
