"""Gateway-owned thread endpoints proxied to LangGraph runtime."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.gateway.deps import get_current_user, get_runtime_client
from app.gateway.thread_ownership import (
    create_owned_thread,
    delete_owned_thread,
    ensure_thread_belongs_to_user,
    get_thread_owner_record,
    get_thread_owner_record_by_langgraph_id,
    list_owned_threads,
    update_owned_thread_title,
)
from deerflow.config.paths import Paths, get_paths

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/threads", tags=["threads"])


class ThreadDeleteResponse(BaseModel):
    success: bool
    message: str


class ThreadResponse(BaseModel):
    thread_id: str = Field(description="Unique thread identifier")
    status: str = Field(default="idle", description="Thread status: idle, busy, interrupted, error")
    created_at: str = Field(default="", description="ISO timestamp")
    updated_at: str = Field(default="", description="ISO timestamp")
    metadata: dict[str, Any] = Field(default_factory=dict, description="Thread metadata")
    values: dict[str, Any] = Field(default_factory=dict, description="Current state channel values")
    interrupts: dict[str, Any] = Field(default_factory=dict, description="Pending interrupts")


class ThreadCreateRequest(BaseModel):
    thread_id: str | None = Field(default=None, description="Optional thread ID (auto-generated if omitted)")
    metadata: dict[str, Any] = Field(default_factory=dict, description="Initial metadata")


class ThreadSearchRequest(BaseModel):
    metadata: dict[str, Any] = Field(default_factory=dict, description="Metadata filter (exact match)")
    limit: int = Field(default=100, ge=1, le=1000, description="Maximum results")
    offset: int = Field(default=0, ge=0, description="Pagination offset")
    status: str | None = Field(default=None, description="Filter by thread status")


class ThreadStateResponse(BaseModel):
    values: dict[str, Any] = Field(default_factory=dict, description="Current channel values")
    next: list[str] = Field(default_factory=list, description="Next tasks to execute")
    metadata: dict[str, Any] = Field(default_factory=dict, description="Checkpoint metadata")
    checkpoint: dict[str, Any] = Field(default_factory=dict, description="Checkpoint info")
    checkpoint_id: str | None = Field(default=None, description="Current checkpoint ID")
    parent_checkpoint_id: str | None = Field(default=None, description="Parent checkpoint ID")
    created_at: str | None = Field(default=None, description="Checkpoint timestamp")
    tasks: list[dict[str, Any]] = Field(default_factory=list, description="Interrupted task details")


class ThreadPatchRequest(BaseModel):
    metadata: dict[str, Any] = Field(default_factory=dict, description="Metadata to merge")


class ThreadStateUpdateRequest(BaseModel):
    values: dict[str, Any] | None = Field(default=None, description="Channel values to merge")
    checkpoint_id: str | None = Field(default=None, description="Checkpoint to branch from")
    checkpoint: dict[str, Any] | None = Field(default=None, description="Full checkpoint object")
    as_node: str | None = Field(default=None, description="Node identity for the update")


class HistoryEntry(BaseModel):
    checkpoint_id: str
    parent_checkpoint_id: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    values: dict[str, Any] = Field(default_factory=dict)
    created_at: str | None = None
    next: list[str] = Field(default_factory=list)


class ThreadHistoryRequest(BaseModel):
    limit: int = Field(default=10, ge=1, le=100, description="Maximum entries")
    before: str | None = Field(default=None, description="Cursor for pagination")


def _delete_thread_data(thread_id: str, paths: Paths | None = None) -> ThreadDeleteResponse:
    path_manager = paths or get_paths()
    try:
        path_manager.delete_thread_dir(thread_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except FileNotFoundError:
        logger.debug("No local thread data to delete for %s", thread_id)
        return ThreadDeleteResponse(success=True, message=f"No local data for {thread_id}")
    except Exception as exc:
        logger.exception("Failed to delete thread data for %s", thread_id)
        raise HTTPException(status_code=500, detail="Failed to delete local thread data.") from exc

    logger.info("Deleted local thread data for %s", thread_id)
    return ThreadDeleteResponse(success=True, message=f"Deleted local thread data for {thread_id}")


def _filter_owned_threads(items: list[dict[str, Any]], user_id: str) -> list[dict[str, Any]]:
    owned_by_langgraph = {item.langgraph_thread_id: item for item in list_owned_threads(user_id)}
    filtered: list[dict[str, Any]] = []
    for item in items:
        owner_record = owned_by_langgraph.get(item.get("thread_id"))
        if owner_record is None:
            continue
        payload = dict(item)
        payload["thread_id"] = owner_record.id
        filtered.append(payload)
    return filtered


def _thread_response_payload(item: dict[str, Any]) -> dict[str, Any]:
    payload = dict(item)
    if payload.get("status") is None:
        payload["status"] = "idle"
    for key in ("created_at", "updated_at"):
        value = payload.get(key)
        if value is not None and not isinstance(value, str):
            payload[key] = str(value)
    for key in ("metadata", "values", "interrupts"):
        if payload.get(key) is None:
            payload[key] = {}
    return payload


@router.delete("/{thread_id}", response_model=ThreadDeleteResponse)
async def delete_thread_data(thread_id: str, request: Request, user=Depends(get_current_user)) -> ThreadDeleteResponse:
    try:
        owner_record = ensure_thread_belongs_to_user(biz_thread_id=thread_id, user_id=user.id)
    except PermissionError as exc:
        raise HTTPException(status_code=404, detail=f"Thread {thread_id} not found") from exc

    client = get_runtime_client(request)
    try:
        await client.delete_thread(owner_record.langgraph_thread_id)
    except HTTPException as exc:
        if exc.status_code != 404:
            raise

    response = _delete_thread_data(thread_id)
    delete_owned_thread(biz_thread_id=thread_id, user_id=user.id)
    return response


@router.post("", response_model=ThreadResponse)
async def create_thread(body: ThreadCreateRequest, request: Request, user=Depends(get_current_user)) -> ThreadResponse:
    try:
        owner_record = create_owned_thread(user_id=user.id, biz_thread_id=body.thread_id)
    except PermissionError as exc:
        raise HTTPException(status_code=409, detail="Thread ID already exists") from exc
    payload = {"thread_id": owner_record.langgraph_thread_id, "metadata": body.metadata}
    client = get_runtime_client(request)

    try:
        result = await client.create_thread(payload)
    except HTTPException as exc:
        if exc.status_code != 409:
            raise
        result = await client.get_thread(owner_record.langgraph_thread_id)

    result["thread_id"] = owner_record.id
    return ThreadResponse.model_validate(_thread_response_payload(result))


@router.post("/search", response_model=list[ThreadResponse])
async def search_threads(body: ThreadSearchRequest, request: Request, user=Depends(get_current_user)) -> list[ThreadResponse]:
    client = get_runtime_client(request)
    search_payload = body.model_dump(exclude_none=True)
    search_payload["limit"] = max(body.limit + body.offset, 1000)
    search_payload["offset"] = 0
    items = _filter_owned_threads(await client.search_threads(search_payload), user.id)
    if body.metadata:
        items = [item for item in items if all(item.get("metadata", {}).get(k) == v for k, v in body.metadata.items())]
    if body.status:
        items = [item for item in items if item.get("status") == body.status]
    return [ThreadResponse.model_validate(_thread_response_payload(item)) for item in items[body.offset : body.offset + body.limit]]


@router.patch("/{thread_id}", response_model=ThreadResponse)
async def patch_thread(thread_id: str, body: ThreadPatchRequest, request: Request, user=Depends(get_current_user)) -> ThreadResponse:
    try:
        owner_record = ensure_thread_belongs_to_user(biz_thread_id=thread_id, user_id=user.id)
    except PermissionError as exc:
        raise HTTPException(status_code=404, detail=f"Thread {thread_id} not found") from exc

    client = get_runtime_client(request)
    result = await client.patch_thread(owner_record.langgraph_thread_id, body.model_dump())
    result["thread_id"] = owner_record.id
    return ThreadResponse.model_validate(_thread_response_payload(result))


@router.get("/{thread_id}", response_model=ThreadResponse)
async def get_thread(thread_id: str, request: Request, user=Depends(get_current_user)) -> ThreadResponse:
    try:
        owner_record = ensure_thread_belongs_to_user(biz_thread_id=thread_id, user_id=user.id)
    except PermissionError as exc:
        raise HTTPException(status_code=404, detail=f"Thread {thread_id} not found") from exc

    client = get_runtime_client(request)
    result = await client.get_thread(owner_record.langgraph_thread_id)
    result["thread_id"] = owner_record.id
    return ThreadResponse.model_validate(_thread_response_payload(result))


@router.get("/{thread_id}/state", response_model=ThreadStateResponse)
async def get_thread_state(thread_id: str, request: Request, user=Depends(get_current_user)) -> ThreadStateResponse:
    try:
        owner_record = ensure_thread_belongs_to_user(biz_thread_id=thread_id, user_id=user.id)
    except PermissionError as exc:
        raise HTTPException(status_code=404, detail=f"Thread {thread_id} not found") from exc

    return await load_thread_state(thread_id=thread_id, request=request, owner_record=owner_record)


async def load_thread_state(thread_id: str, request: Request, owner_record=None) -> ThreadStateResponse:
    client = get_runtime_client(request)
    record = owner_record or get_thread_owner_record(thread_id) or get_thread_owner_record_by_langgraph_id(thread_id)
    runtime_thread_id = record.langgraph_thread_id if record is not None else thread_id
    try:
        payload = dict(await client.get_thread_state(runtime_thread_id))
    except HTTPException as exc:
        if exc.status_code != 404 or record is None:
            raise
        await ensure_runtime_thread(record=record, request=request)
        payload = dict(await client.get_thread_state(runtime_thread_id))
    for key, default in (("values", {}), ("metadata", {}), ("checkpoint", {}), ("next", []), ("tasks", [])):
        if payload.get(key) is None:
            payload[key] = default
    return ThreadStateResponse.model_validate(payload)


async def ensure_runtime_thread(*, record, request: Request, metadata: dict[str, Any] | None = None) -> None:
    client = get_runtime_client(request)
    try:
        await client.get_thread(record.langgraph_thread_id)
        return
    except HTTPException as exc:
        if exc.status_code != 404:
            raise

    try:
        await client.create_thread(
            {
                "thread_id": record.langgraph_thread_id,
                "metadata": metadata or {},
            }
        )
    except HTTPException as exc:
        if exc.status_code != 409:
            raise


@router.post("/{thread_id}/state", response_model=ThreadStateResponse)
async def update_thread_state(
    thread_id: str, body: ThreadStateUpdateRequest, request: Request, user=Depends(get_current_user)
) -> ThreadStateResponse:
    try:
        owner_record = ensure_thread_belongs_to_user(biz_thread_id=thread_id, user_id=user.id)
    except PermissionError as exc:
        raise HTTPException(status_code=404, detail=f"Thread {thread_id} not found") from exc

    client = get_runtime_client(request)
    result = ThreadStateResponse.model_validate(await client.update_thread_state(owner_record.langgraph_thread_id, body.model_dump(exclude_none=True)))
    title = result.values.get("title")
    if isinstance(title, str) and title.strip():
        update_owned_thread_title(biz_thread_id=thread_id, user_id=user.id, title=title)
    return result


@router.post("/{thread_id}/history", response_model=list[HistoryEntry])
async def get_thread_history(
    thread_id: str, body: ThreadHistoryRequest, request: Request, user=Depends(get_current_user)
) -> list[HistoryEntry]:
    try:
        owner_record = ensure_thread_belongs_to_user(biz_thread_id=thread_id, user_id=user.id)
    except PermissionError as exc:
        raise HTTPException(status_code=404, detail=f"Thread {thread_id} not found") from exc

    client = get_runtime_client(request)
    return [HistoryEntry.model_validate(item) for item in await client.get_thread_history(owner_record.langgraph_thread_id, body.model_dump(exclude_none=True))]
