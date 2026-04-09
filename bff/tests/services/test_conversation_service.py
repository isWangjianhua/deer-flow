from app.models.user import User
from app.repositories.conversation_repo import ConversationRepository
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
