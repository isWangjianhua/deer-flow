"""Run lifecycle endpoints proxied to the LangGraph runtime."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any, Literal

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field

from app.gateway.deps import get_current_user, get_runtime_client, require_owned_thread
from app.gateway.runtime_client import iter_sse_text

router = APIRouter(prefix="/api/threads", tags=["runs"])


class RunCreateRequest(BaseModel):
    assistant_id: str | None = Field(default=None, description="Agent / assistant to use")
    input: dict[str, Any] | None = Field(default=None, description="Graph input (e.g. {messages: [...]})")
    command: dict[str, Any] | None = Field(default=None, description="LangGraph Command")
    metadata: dict[str, Any] | None = Field(default=None, description="Run metadata")
    config: dict[str, Any] | None = Field(default=None, description="RunnableConfig overrides")
    webhook: str | None = Field(default=None, description="Completion callback URL")
    checkpoint_id: str | None = Field(default=None, description="Resume from checkpoint")
    checkpoint: dict[str, Any] | None = Field(default=None, description="Full checkpoint object")
    interrupt_before: list[str] | Literal["*"] | None = Field(default=None, description="Nodes to interrupt before")
    interrupt_after: list[str] | Literal["*"] | None = Field(default=None, description="Nodes to interrupt after")
    stream_mode: list[str] | str | None = Field(default=None, description="Stream mode(s)")
    stream_subgraphs: bool = Field(default=False, description="Include subgraph events")
    stream_resumable: bool | None = Field(default=None, description="SSE resumable mode")
    on_disconnect: Literal["cancel", "continue"] = Field(default="cancel", description="Behaviour on SSE disconnect")
    on_completion: Literal["delete", "keep"] = Field(default="keep", description="Delete temp thread on completion")
    multitask_strategy: Literal["reject", "rollback", "interrupt", "enqueue"] = Field(default="reject", description="Concurrency strategy")
    after_seconds: float | None = Field(default=None, description="Delayed execution")
    if_not_exists: Literal["reject", "create"] = Field(default="create", description="Thread creation policy")
    feedback_keys: list[str] | None = Field(default=None, description="LangSmith feedback keys")


class RunResponse(BaseModel):
    run_id: str
    thread_id: str
    assistant_id: str | None = None
    status: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    kwargs: dict[str, Any] = Field(default_factory=dict)
    multitask_strategy: str = "reject"
    created_at: str = ""
    updated_at: str = ""


def _normalize_owned_run_request(body: RunCreateRequest, *, thread_id: str, user_id: str) -> RunCreateRequest:
    config = dict(body.config or {})
    configurable = dict(config.get("configurable", {}))
    configurable["thread_id"] = thread_id
    configurable["user_id"] = user_id
    config["configurable"] = configurable
    return body.model_copy(update={"config": config})


async def create_thread_run(*, thread_id: str, payload: dict[str, Any], request: Request) -> dict[str, Any]:
    client = get_runtime_client(request)
    return await client.create_thread_run(thread_id, payload)


async def _stream_from_runtime(upstream) -> AsyncIterator[str]:
    async for chunk in iter_sse_text(upstream):
        yield chunk


def _stream_headers(thread_id: str, run_id: str | None = None) -> dict[str, str]:
    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }
    if run_id:
        headers["Content-Location"] = f"/api/threads/{thread_id}/runs/{run_id}/stream?thread_id={thread_id}&run_id={run_id}"
    return headers


@router.post("/{thread_id}/runs", response_model=RunResponse)
async def create_run(thread_id: str, body: RunCreateRequest, request: Request, user=Depends(get_current_user)) -> RunResponse:
    owner_record = require_owned_thread(thread_id, user.id)
    body = _normalize_owned_run_request(body, thread_id=owner_record.langgraph_thread_id, user_id=user.id)
    payload = body.model_dump(exclude_none=True, exclude_defaults=True)
    result = await create_thread_run(thread_id=owner_record.langgraph_thread_id, payload=payload, request=request)
    result["thread_id"] = owner_record.id
    return RunResponse.model_validate(result)


@router.post("/{thread_id}/runs/stream")
async def stream_run(thread_id: str, body: RunCreateRequest, request: Request, user=Depends(get_current_user)) -> StreamingResponse:
    owner_record = require_owned_thread(thread_id, user.id)
    body = _normalize_owned_run_request(body, thread_id=owner_record.langgraph_thread_id, user_id=user.id)
    client = get_runtime_client(request)
    upstream = await client.start_stream(
        "POST",
        f"/threads/{owner_record.langgraph_thread_id}/runs/stream",
        json_body=body.model_dump(exclude_none=True, exclude_defaults=True),
        default_error="Failed to stream run",
    )
    content_location = upstream.headers.get("Content-Location", "")
    run_id = content_location.split("/runs/", 1)[1].split("/", 1)[0] if "/runs/" in content_location else None
    return StreamingResponse(
        _stream_from_runtime(upstream),
        media_type="text/event-stream",
        headers=_stream_headers(thread_id, run_id),
    )


@router.post("/{thread_id}/runs/wait", response_model=dict)
async def wait_run(thread_id: str, body: RunCreateRequest, request: Request, user=Depends(get_current_user)) -> dict:
    owner_record = require_owned_thread(thread_id, user.id)
    body = _normalize_owned_run_request(body, thread_id=owner_record.langgraph_thread_id, user_id=user.id)
    client = get_runtime_client(request)
    return await client.wait_thread_run(owner_record.langgraph_thread_id, body.model_dump(exclude_none=True, exclude_defaults=True))


@router.get("/{thread_id}/runs", response_model=list[RunResponse])
async def list_runs(thread_id: str, request: Request, user=Depends(get_current_user)) -> list[RunResponse]:
    owner_record = require_owned_thread(thread_id, user.id)
    client = get_runtime_client(request)
    items = await client.list_thread_runs(owner_record.langgraph_thread_id)
    for item in items:
        item["thread_id"] = owner_record.id
    return [RunResponse.model_validate(item) for item in items]


@router.get("/{thread_id}/runs/{run_id}", response_model=RunResponse)
async def get_run(thread_id: str, run_id: str, request: Request, user=Depends(get_current_user)) -> RunResponse:
    owner_record = require_owned_thread(thread_id, user.id)
    client = get_runtime_client(request)
    result = await client.get_thread_run(owner_record.langgraph_thread_id, run_id)
    result["thread_id"] = owner_record.id
    return RunResponse.model_validate(result)


@router.post("/{thread_id}/runs/{run_id}/cancel")
async def cancel_run(
    thread_id: str,
    run_id: str,
    request: Request,
    user=Depends(get_current_user),
    wait: bool = Query(default=False, description="Block until run completes after cancel"),
    action: Literal["interrupt", "rollback"] = Query(default="interrupt", description="Cancel action"),
) -> Response:
    owner_record = require_owned_thread(thread_id, user.id)
    client = get_runtime_client(request)
    return Response(status_code=await client.cancel_thread_run(owner_record.langgraph_thread_id, run_id, wait=wait, action=action))


@router.get("/{thread_id}/runs/{run_id}/join")
async def join_run(thread_id: str, run_id: str, request: Request, user=Depends(get_current_user)) -> StreamingResponse:
    owner_record = require_owned_thread(thread_id, user.id)
    client = get_runtime_client(request)
    upstream = await client.start_stream("GET", f"/threads/{owner_record.langgraph_thread_id}/runs/{run_id}/stream", default_error="Failed to join run stream")
    return StreamingResponse(_stream_from_runtime(upstream), media_type="text/event-stream", headers=_stream_headers(thread_id))


@router.api_route("/{thread_id}/runs/{run_id}/stream", methods=["GET", "POST"], response_model=None)
async def stream_existing_run(
    thread_id: str,
    run_id: str,
    request: Request,
    user=Depends(get_current_user),
    action: Literal["interrupt", "rollback"] | None = Query(default=None, description="Cancel action"),
    wait: int = Query(default=0, description="Block until cancelled (1) or return immediately (0)"),
):
    owner_record = require_owned_thread(thread_id, user.id)
    client = get_runtime_client(request)
    params = {k: v for k, v in {"action": action, "wait": wait}.items() if v is not None}
    upstream = await client.start_stream(
        request.method,
        f"/threads/{owner_record.langgraph_thread_id}/runs/{run_id}/stream",
        params=params,
        default_error="Failed to stream existing run",
    )
    return StreamingResponse(_stream_from_runtime(upstream), media_type="text/event-stream", headers=_stream_headers(thread_id))
