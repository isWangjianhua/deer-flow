from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.gateway.chat_proxy import business_sse_stream, resolve_or_create_conversation
from app.gateway.deps import get_current_user, get_run_manager, get_stream_bridge
from app.gateway.routers.thread_runs import RunCreateRequest
from app.gateway.services import sse_consumer, start_run

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatStreamRequest(BaseModel):
    conversation_id: str | None = None
    message: str = Field(min_length=1)
    context: dict[str, Any] = Field(default_factory=dict)


@router.post("/stream")
async def chat_stream(body: ChatStreamRequest, request: Request, user=Depends(get_current_user)) -> StreamingResponse:
    try:
        record, created = resolve_or_create_conversation(
            conversation_id=body.conversation_id,
            user_id=user.id,
            title="",
        )
    except PermissionError as exc:
        raise HTTPException(status_code=404, detail="Conversation not found") from exc

    run_body = RunCreateRequest(
        assistant_id="lead_agent",
        input={"messages": [{"role": "user", "content": body.message}]},
        metadata={"source": "chat-proxy"},
        config={"configurable": {"thread_id": record.id, **body.context}},
        stream_mode=["values", "messages-tuple"],
    )
    run_record = await start_run(run_body, record.id, request)
    bridge = get_stream_bridge(request)
    run_mgr = get_run_manager(request)
    upstream = sse_consumer(bridge, run_record, request, run_mgr)

    return StreamingResponse(
        business_sse_stream(
            conversation_id=record.id,
            created=created,
            upstream=upstream,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
