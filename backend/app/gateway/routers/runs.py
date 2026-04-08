"""Stateless run endpoints proxied to LangGraph runtime."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.gateway.deps import get_current_user_optional, get_runtime_client, require_owned_thread
from app.gateway.runtime_client import iter_sse_text
from app.gateway.routers.thread_runs import RunCreateRequest
from app.gateway.thread_ownership import create_owned_thread

router = APIRouter(prefix="/api/runs", tags=["runs"])


def _resolve_thread_id(body: RunCreateRequest) -> str:
    thread_id = (body.config or {}).get("configurable", {}).get("thread_id")
    if thread_id:
        return str(thread_id)
    return str(uuid.uuid4())


def _resolve_thread_context(body: RunCreateRequest, user) -> tuple[str, str | None]:
    requested_thread_id = (body.config or {}).get("configurable", {}).get("thread_id")
    if requested_thread_id:
        if user is None:
            raise HTTPException(status_code=401, detail="Authentication required")
        owner_record = require_owned_thread(str(requested_thread_id), user.id)
        return owner_record.langgraph_thread_id, user.id

    if user is None:
        return _resolve_thread_id(body), None

    record = create_owned_thread(user_id=user.id)
    return record.langgraph_thread_id, user.id


def _normalize_run_request(body: RunCreateRequest, *, thread_id: str, user_id: str | None) -> RunCreateRequest:
    config = dict(body.config or {})
    configurable = dict(config.get("configurable", {}))
    configurable["thread_id"] = thread_id
    if user_id is not None:
        configurable["user_id"] = user_id
    else:
        configurable.pop("user_id", None)
    config["configurable"] = configurable
    return body.model_copy(update={"config": config})


async def stream_stateless_run(*, payload: dict, request: Request) -> AsyncIterator[str]:
    client = get_runtime_client(request)
    upstream = await client.start_stream("POST", "/runs/stream", json_body=payload, default_error="Failed to stream run")
    async for chunk in iter_sse_text(upstream):
        yield chunk


@router.post("/stream")
async def stateless_stream(body: RunCreateRequest, request: Request, user=Depends(get_current_user_optional)) -> StreamingResponse:
    thread_id, user_id = _resolve_thread_context(body, user)
    body = _normalize_run_request(body, thread_id=thread_id, user_id=user_id)

    return StreamingResponse(
        stream_stateless_run(payload=body.model_dump(exclude_none=True, exclude_defaults=True), request=request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/wait", response_model=dict)
async def stateless_wait(body: RunCreateRequest, request: Request, user=Depends(get_current_user_optional)) -> dict:
    thread_id, user_id = _resolve_thread_context(body, user)
    body = _normalize_run_request(body, thread_id=thread_id, user_id=user_id)
    client = get_runtime_client(request)
    return await client.wait_stateless_run(body.model_dump(exclude_none=True, exclude_defaults=True))
