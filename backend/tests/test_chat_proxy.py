from __future__ import annotations

import pytest

from app.gateway.chat_proxy import (
    build_usechat_headers,
    encode_usechat_text_delta,
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


def test_resolve_or_create_conversation_rejects_foreign_owner(tmp_path, monkeypatch):
    monkeypatch.setenv("DEER_FLOW_AUTH_DB_PATH", str(tmp_path / "auth.db"))
    create_owned_thread(user_id="user_a", biz_thread_id="conv_a")

    with pytest.raises(PermissionError):
        resolve_or_create_conversation(conversation_id="conv_a", user_id="user_b", title="")


def test_build_usechat_headers_sets_required_stream_header():
    headers = build_usechat_headers()

    assert headers["x-vercel-ai-ui-message-stream"] == "v1"
    assert headers["Content-Type"] == "text/event-stream"


def test_encode_usechat_text_delta_includes_text_payload():
    frame = encode_usechat_text_delta("Hello")

    assert frame.startswith("data: ")
    assert "Hello" in frame
