from __future__ import annotations

import pytest

from app.gateway.chat_proxy import (
    build_business_sse_event,
    resolve_or_create_conversation,
)
from app.gateway.thread_ownership import create_owned_thread


def test_resolve_or_create_conversation_creates_new_owned_record(tmp_path, monkeypatch):
    monkeypatch.setenv("DEER_FLOW_AUTH_DB_PATH", str(tmp_path / "auth.db"))

    record, created = resolve_or_create_conversation(
        conversation_id=None,
        user_id="user_a",
        title="",
    )

    assert created is True
    assert record.user_id == "user_a"
    assert record.id.startswith("thread_")


def test_resolve_or_create_conversation_rejects_foreign_owner(tmp_path, monkeypatch):
    monkeypatch.setenv("DEER_FLOW_AUTH_DB_PATH", str(tmp_path / "auth.db"))
    create_owned_thread(user_id="user_a", biz_thread_id="conv_a")

    with pytest.raises(PermissionError):
        resolve_or_create_conversation(conversation_id="conv_a", user_id="user_b", title="")


def test_build_business_sse_event_formats_message_delta():
    payload = build_business_sse_event(
        "message.delta",
        {"conversation_id": "conv_a", "delta": "Hello"},
    )

    assert payload.startswith("event: message.delta")
    assert 'data: {"conversation_id": "conv_a", "delta": "Hello"}' in payload
