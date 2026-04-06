"""Centralized accessors for singleton objects stored on ``app.state``.

**Getters** (used by routers): raise 503 when a required dependency is
missing, except ``get_store`` which returns ``None``.

Initialization is handled directly in ``app.py`` via :class:`AsyncExitStack`.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from contextlib import AsyncExitStack, asynccontextmanager

from fastapi import FastAPI, HTTPException, Request

from app.gateway.auth.session import (
    SESSION_COOKIE_NAME,
    SESSION_HEADER_NAME,
    get_session_by_token,
    get_user_by_id,
)
from app.gateway.thread_ownership import ensure_thread_belongs_to_user
from deerflow.runtime import RunManager, StreamBridge


@asynccontextmanager
async def langgraph_runtime(app: FastAPI) -> AsyncGenerator[None, None]:
    """Bootstrap and tear down all LangGraph runtime singletons.

    Usage in ``app.py``::

        async with langgraph_runtime(app):
            yield
    """
    from deerflow.agents.checkpointer.async_provider import make_checkpointer
    from deerflow.runtime import make_store, make_stream_bridge

    async with AsyncExitStack() as stack:
        app.state.stream_bridge = await stack.enter_async_context(make_stream_bridge())
        app.state.checkpointer = await stack.enter_async_context(make_checkpointer())
        app.state.store = await stack.enter_async_context(make_store())
        app.state.run_manager = RunManager()
        yield


# ---------------------------------------------------------------------------
# Getters – called by routers per-request
# ---------------------------------------------------------------------------


def get_stream_bridge(request: Request) -> StreamBridge:
    """Return the global :class:`StreamBridge`, or 503."""
    bridge = getattr(request.app.state, "stream_bridge", None)
    if bridge is None:
        raise HTTPException(status_code=503, detail="Stream bridge not available")
    return bridge


def get_run_manager(request: Request) -> RunManager:
    """Return the global :class:`RunManager`, or 503."""
    mgr = getattr(request.app.state, "run_manager", None)
    if mgr is None:
        raise HTTPException(status_code=503, detail="Run manager not available")
    return mgr


def get_checkpointer(request: Request):
    """Return the global checkpointer, or 503."""
    cp = getattr(request.app.state, "checkpointer", None)
    if cp is None:
        raise HTTPException(status_code=503, detail="Checkpointer not available")
    return cp


def get_store(request: Request):
    """Return the global store (may be ``None`` if not configured)."""
    return getattr(request.app.state, "store", None)


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
