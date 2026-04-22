import logging
from datetime import UTC, datetime

from fastapi import status
from sqlalchemy.orm import Session

from app.api.errors import error_response
from app.clients.deerflow import DeerFlowClient
from app.db.session import SessionLocal
from app.models.conversation import Conversation
from app.repositories.agent_ownership_repo import AgentOwnershipRepository
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
        self.agent_repo = AgentOwnershipRepository(db)

    def create_conversation(
        self,
        user_id: str,
        deerflow_thread_id: str,
        title: str = "New conversation",
        agent_name: str | None = None,
    ) -> ConversationCreateResponse:
        conversation = Conversation(
            user_id=user_id,
            deerflow_thread_id=deerflow_thread_id,
            title=title,
            agent_name=agent_name,
        )
        created = self.repo.create(conversation)
        return ConversationCreateResponse.model_validate(created)

    def list_conversations(self, user_id: str) -> list[ConversationListItem]:
        items = self.repo.list_by_user_id(user_id)
        return [ConversationListItem.model_validate(item) for item in items]

    def rename_conversation(self, user_id: str, conversation_id: str, title: str) -> Conversation:
        return self.patch_conversation(user_id, conversation_id, title=title)

    def patch_conversation(
        self,
        user_id: str,
        conversation_id: str,
        *,
        title: str | None = None,
        is_pinned: bool | None = None,
    ) -> Conversation:
        conversation = self.require_owned_conversation(user_id, conversation_id)
        changed = False

        if title is None and is_pinned is None:
            raise error_response(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "invalid_patch",
                "At least one conversation field must be provided",
            )

        if title is not None:
            normalized_title = title.strip()
            if not normalized_title:
                raise error_response(
                    status.HTTP_422_UNPROCESSABLE_ENTITY,
                    "invalid_title",
                    "Conversation title is required",
                )
            if normalized_title != conversation.title:
                conversation.title = normalized_title
                changed = True

        if is_pinned is not None and is_pinned != conversation.is_pinned:
            conversation.is_pinned = is_pinned
            conversation.pinned_at = datetime.now(UTC) if is_pinned else None
            changed = True

        if not changed:
            return conversation

        conversation.updated_at = datetime.now(UTC)
        return self.repo.save(conversation)

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

    def _require_visible_agent_name(self, user_id: str, agent_name: str) -> None:
        ownership = self.agent_repo.get_by_agent_name(agent_name)
        if ownership is None or ownership.owner_user_id != user_id:
            raise error_response(
                status.HTTP_404_NOT_FOUND,
                "agent_not_found",
                "Agent not found",
            )

    def require_owned_conversation(self, user_id: str, conversation_id: str) -> Conversation:
        conversation = self.repo.get_by_id(conversation_id)
        if conversation is None:
            raise error_response(status.HTTP_404_NOT_FOUND, "conversation_not_found", "Conversation not found")
        if conversation.user_id != user_id:
            raise error_response(status.HTTP_403_FORBIDDEN, "forbidden", "Forbidden")
        if conversation.agent_name:
            self._require_visible_agent_name(user_id, conversation.agent_name)
        return conversation

    async def delete_conversation(self, user_id: str, conversation_id: str) -> dict[str, str | bool]:
        conversation = self.require_owned_conversation(user_id, conversation_id)
        await DeerFlowClient().delete_thread(conversation.deerflow_thread_id)
        self.repo.delete(conversation)
        return {"success": True, "id": conversation_id}

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
            agent_name=conversation.agent_name,
            is_pinned=conversation.is_pinned,
            pinned_at=conversation.pinned_at,
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
