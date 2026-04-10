import logging
from datetime import UTC, datetime

from fastapi import status
from sqlalchemy.orm import Session

from app.api.errors import error_response
from app.clients.deerflow import DeerFlowClient
from app.db.session import SessionLocal
from app.models.conversation import Conversation
from app.repositories.conversation_repo import ConversationRepository
from app.schemas.conversation import (
    ConversationCreateResponse,
    ConversationDetailResponse,
    ConversationListItem,
)

logger = logging.getLogger(__name__)


class ConversationService:
    def __init__(self, db: Session) -> None:
        self.repo = ConversationRepository(db)

    def create_conversation(
        self,
        user_id: str,
        deerflow_thread_id: str,
        title: str = "New conversation",
    ) -> ConversationCreateResponse:
        conversation = Conversation(
            user_id=user_id,
            deerflow_thread_id=deerflow_thread_id,
            title=title,
        )
        created = self.repo.create(conversation)
        return ConversationCreateResponse.model_validate(created)

    def list_conversations(self, user_id: str) -> list[ConversationListItem]:
        items = self.repo.list_by_user_id(user_id)
        return [ConversationListItem.model_validate(item) for item in items]

    def _sync_conversation_snapshot(
        self,
        conversation: Conversation,
        latest_values: dict,
        *,
        touch_updated_at: bool = False,
    ) -> Conversation:
        changed = False

        title = latest_values.get("title")
        if isinstance(title, str):
            normalized_title = title.strip()
            if normalized_title and normalized_title != conversation.title:
                conversation.title = normalized_title
                changed = True

        if touch_updated_at:
            conversation.updated_at = datetime.now(UTC)
            changed = True

        if changed:
            return self.repo.save(conversation)
        return conversation

    def require_owned_conversation(self, user_id: str, conversation_id: str) -> Conversation:
        conversation = self.repo.get_by_id(conversation_id)
        if conversation is None:
            raise error_response(status.HTTP_404_NOT_FOUND, "conversation_not_found", "Conversation not found")
        if conversation.user_id != user_id:
            raise error_response(status.HTTP_403_FORBIDDEN, "forbidden", "Forbidden")
        return conversation

    async def get_conversation_detail(
        self,
        user_id: str,
        conversation_id: str,
    ) -> ConversationDetailResponse:
        conversation = self.require_owned_conversation(user_id, conversation_id)
        history = await DeerFlowClient().get_thread_history(
            conversation.deerflow_thread_id,
            limit=1,
        )
        latest_values = history[0].get("values", {}) if history else {}
        conversation = self._sync_conversation_snapshot(conversation, latest_values)
        return ConversationDetailResponse(
            id=conversation.id,
            title=conversation.title,
            status=conversation.status,
            created_at=conversation.created_at,
            updated_at=conversation.updated_at,
            values=latest_values,
        )

    async def sync_conversation_after_stream(self, conversation: Conversation) -> Conversation:
        history = await DeerFlowClient().get_thread_history(
            conversation.deerflow_thread_id,
            limit=1,
        )
        latest_values = history[0].get("values", {}) if history else {}
        return self._sync_conversation_snapshot(
            conversation,
            latest_values,
            touch_updated_at=True,
        )


async def sync_conversation_after_stream_safe(conversation_id: str) -> None:
    db = SessionLocal()
    try:
        service = ConversationService(db)
        conversation = service.repo.get_by_id(conversation_id)
        if conversation is None:
            return
        try:
            await service.sync_conversation_after_stream(conversation)
        except Exception:
            logger.warning(
                "Post-stream conversation sync failed for conversation_id=%s",
                conversation_id,
                exc_info=True,
            )
    finally:
        db.close()
