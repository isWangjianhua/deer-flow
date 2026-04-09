from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_id, get_db_session
from app.clients.deerflow import DeerFlowClient
from app.schemas.conversation import (
    ConversationCreateResponse,
    ConversationListItem,
    StreamMessageRequest,
)
from app.services.conversation_service import ConversationService
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
def list_conversations(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db_session),
) -> list[ConversationListItem]:
    return ConversationService(db).list_conversations(user_id)


@router.post("/{conversation_id}/messages/stream")
async def stream_message(
    conversation_id: str,
    payload: StreamMessageRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db_session),
) -> StreamingResponse:
    conversation = ConversationService(db).require_owned_conversation(user_id, conversation_id)
    client, response = await DeerFlowClient().stream_message(
        thread_id=conversation.deerflow_thread_id,
        message=payload.message,
    )
    return StreamingResponse(
        iter_sse_lines(client, response),
        media_type="text/event-stream",
    )
