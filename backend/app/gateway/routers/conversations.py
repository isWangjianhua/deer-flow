from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field

from app.gateway.deps import get_current_user
from app.gateway.thread_ownership import (
    create_owned_thread,
    delete_owned_thread,
    ensure_thread_belongs_to_user,
    list_owned_threads,
)

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


class ConversationResponse(BaseModel):
    conversation_id: str
    title: str = ""
    created_at: str
    updated_at: str


class ConversationCreateRequest(BaseModel):
    title: str = Field(default="")


@router.get("", response_model=list[ConversationResponse])
async def list_conversations(user=Depends(get_current_user)) -> list[ConversationResponse]:
    return [
        ConversationResponse(
            conversation_id=record.id,
            title=record.title,
            created_at=record.created_at,
            updated_at=record.updated_at,
        )
        for record in list_owned_threads(user.id)
    ]


@router.post("", response_model=ConversationResponse, status_code=status.HTTP_201_CREATED)
async def create_conversation(body: ConversationCreateRequest, user=Depends(get_current_user)) -> ConversationResponse:
    record = create_owned_thread(user_id=user.id, title=body.title)
    return ConversationResponse(
        conversation_id=record.id,
        title=record.title,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


@router.get("/{conversation_id}", response_model=ConversationResponse)
async def get_conversation(conversation_id: str, user=Depends(get_current_user)) -> ConversationResponse:
    try:
        record = ensure_thread_belongs_to_user(biz_thread_id=conversation_id, user_id=user.id)
    except PermissionError as exc:
        raise HTTPException(status_code=404, detail="Conversation not found") from exc

    return ConversationResponse(
        conversation_id=record.id,
        title=record.title,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(conversation_id: str, user=Depends(get_current_user)) -> Response:
    try:
        ensure_thread_belongs_to_user(biz_thread_id=conversation_id, user_id=user.id)
    except PermissionError as exc:
        raise HTTPException(status_code=404, detail="Conversation not found") from exc

    delete_owned_thread(biz_thread_id=conversation_id, user_id=user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
