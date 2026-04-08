"""Gateway dependencies and lifespan-managed clients."""

from __future__ import annotations

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException, Request

from app.gateway.auth.session import (
    SESSION_COOKIE_NAME,
    SESSION_HEADER_NAME,
    get_session_by_token,
    get_user_by_id,
)
from app.gateway.config import get_gateway_config
from app.gateway.runtime_client import LangGraphRuntimeClient
from app.gateway.thread_ownership import ensure_thread_belongs_to_user


@asynccontextmanager
async def runtime_client_lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Create the shared HTTP client used to talk to LangGraph runtime."""
    config = get_gateway_config()
    timeout = httpx.Timeout(connect=5.0, read=None, write=30.0, pool=30.0)
    async with httpx.AsyncClient(base_url=config.langgraph_url.rstrip("/"), timeout=timeout) as http_client:
        app.state.runtime_client = LangGraphRuntimeClient(http_client)
        yield


def get_runtime_client(request: Request) -> LangGraphRuntimeClient:
    client = getattr(request.app.state, "runtime_client", None)
    if client is None:
        raise HTTPException(status_code=503, detail="LangGraph runtime client not available")
    return client


def get_current_user_optional(request: Request):
    """Return the current authenticated user, or ``None`` when unauthenticated."""
    session_token = request.cookies.get(SESSION_COOKIE_NAME)
    if not session_token:
        session_token = request.headers.get(SESSION_HEADER_NAME)
    if not session_token:
        return None

    session = get_session_by_token(session_token)
    if session is None:
        return None

    return get_user_by_id(session.user_id)


def get_current_user(request: Request):
    """Return the current authenticated user, or raise 401."""
    user = get_current_user_optional(request)
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user


def require_owned_thread(thread_id: str, user_id: str):
    """Return the owned thread record or raise a stable 404."""
    try:
        return ensure_thread_belongs_to_user(biz_thread_id=thread_id, user_id=user_id)
    except PermissionError as exc:
        raise HTTPException(status_code=404, detail=f"Thread {thread_id} not found") from exc
