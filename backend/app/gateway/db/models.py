"""Minimal auth and thread persistence models for the Gateway.

This layer intentionally stays lightweight. We use dataclasses as transport
objects and keep persistence logic in ``db.session``.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True)
class UserAccount:
    id: str
    username: str
    password_hash: str
    created_at: str


@dataclass(slots=True)
class UserSession:
    id: str
    user_id: str
    session_token: str
    expires_at: str
    created_at: str


@dataclass(slots=True)
class ChatThread:
    id: str
    langgraph_thread_id: str
    user_id: str
    title: str
    created_at: str
    updated_at: str
