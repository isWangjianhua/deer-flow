import asyncio

from app.models.user import User
from app.repositories.conversation_repo import ConversationRepository
from app.clients.deerflow import DeerFlowClient
from app.services.conversation_service import ConversationService


def test_create_conversation_persists_mapping(db_session) -> None:
    user = User(username="alice", password_hash="hashed")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    result = ConversationService(db_session).create_conversation(
        user_id=user.id,
        deerflow_thread_id="thread-123",
    )
    persisted = ConversationRepository(db_session).get_by_id(result.id)

    assert result.title == "New conversation"
    assert result.status == "active"
    assert persisted is not None
    assert persisted.user_id == user.id
    assert persisted.deerflow_thread_id == "thread-123"


def test_rename_conversation_updates_owned_title(db_session) -> None:
    user = User(username="alice", password_hash="hashed")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    service = ConversationService(db_session)
    created = service.create_conversation(
        user_id=user.id,
        deerflow_thread_id="thread-123",
    )

    renamed = service.rename_conversation(user.id, created.id, "  Renamed conversation  ")
    persisted = ConversationRepository(db_session).get_by_id(created.id)

    assert renamed.title == "Renamed conversation"
    assert persisted is not None
    assert persisted.title == "Renamed conversation"


def test_delete_conversation_removes_record_after_thread_cleanup(db_session, monkeypatch) -> None:
    user = User(username="alice", password_hash="hashed")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    service = ConversationService(db_session)
    created = service.create_conversation(
        user_id=user.id,
        deerflow_thread_id="thread-123",
    )

    calls: list[str] = []

    async def mock_delete_thread(self, thread_id: str) -> dict:
        calls.append(thread_id)
        return {"success": True}

    monkeypatch.setattr(DeerFlowClient, "delete_thread", mock_delete_thread)

    deleted = asyncio.run(service.delete_conversation(user.id, created.id))
    persisted = ConversationRepository(db_session).get_by_id(created.id)

    assert deleted == {"success": True, "id": created.id}
    assert calls == ["thread-123"]
    assert persisted is None


def test_pin_and_unpin_conversation_update_owned_state(db_session) -> None:
    user = User(username="alice", password_hash="hashed")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    service = ConversationService(db_session)
    created = service.create_conversation(
        user_id=user.id,
        deerflow_thread_id="thread-123",
    )

    pinned = service.patch_conversation(user.id, created.id, is_pinned=True)
    assert pinned.is_pinned is True
    assert pinned.pinned_at is not None

    unpinned = service.patch_conversation(user.id, created.id, is_pinned=False)

    assert unpinned.is_pinned is False
    assert unpinned.pinned_at is None
