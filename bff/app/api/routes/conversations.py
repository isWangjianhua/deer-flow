import asyncio

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_id, get_db_session
from app.clients.deerflow import DeerFlowClient
from app.schemas.conversation import (
    ConversationCreateResponse,
    ConversationDetailResponse,
    ConversationListItem,
    StreamMessageRequest,
)
from app.services.conversation_service import (
    ConversationService,
    sync_conversation_after_stream_safe,
)
from app.sse.proxy import iter_sse_lines


router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.post("", response_model=ConversationCreateResponse)
async def create_conversation(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db_session),
) -> ConversationCreateResponse:
    deerflow_thread_id = await DeerFlowClient().create_thread()
    return ConversationService(db).create_conversation(
        user_id=user_id,
        deerflow_thread_id=deerflow_thread_id,
    )


@router.get("", response_model=list[ConversationListItem])
async def list_conversations(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db_session),
) -> list[ConversationListItem]:
    return ConversationService(db).list_conversations(user_id)


@router.get("/{conversation_id}", response_model=ConversationDetailResponse)
async def get_conversation(
    conversation_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db_session),
) -> ConversationDetailResponse:
    return await ConversationService(db).get_conversation_detail(
        user_id,
        conversation_id,
    )


@router.post("/{conversation_id}/messages/stream")
async def stream_message(
    conversation_id: str,
    payload: StreamMessageRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db_session),
) -> StreamingResponse:
    service = ConversationService(db)
    conversation = service.require_owned_conversation(user_id, conversation_id)
    context = {
        "user_id": user_id,
        "model_name": payload.model_name,
        "thinking_enabled": payload.thinking_enabled,
        "is_plan_mode": payload.is_plan_mode,
        "subagent_enabled": payload.subagent_enabled,
        "reasoning_effort": payload.reasoning_effort,
    }
    normalized_context = {key: value for key, value in context.items() if value is not None}
    client, response = await DeerFlowClient().stream_message(
        thread_id=conversation.deerflow_thread_id,
        message=payload.message,
        context=normalized_context or None,
    )

    async def stream_only():
        try:
            async for line in iter_sse_lines(client, response):
                yield line
        finally:
            asyncio.create_task(sync_conversation_after_stream_safe(conversation.id))

    return StreamingResponse(
        stream_only(),
        media_type="text/event-stream",
    )
