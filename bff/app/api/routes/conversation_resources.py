from fastapi import APIRouter, Depends, Request, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_id, get_db_session
from app.api.errors import error_response
from app.clients.deerflow import DeerFlowClient
from app.schemas.conversation import (
    SuggestionsRequest,
    SuggestionsResponse,
    UploadResponse,
)
from app.services.conversation_service import ConversationService


router = APIRouter(prefix="/conversations", tags=["conversations"])


def _validate_multipart_content_type(content_type: str | None) -> str:
    if not content_type:
        raise error_response(
            status.HTTP_400_BAD_REQUEST,
            "invalid_multipart",
            "Missing multipart content-type",
        )
    if "multipart/form-data" not in content_type.lower():
        raise error_response(
            status.HTTP_400_BAD_REQUEST,
            "invalid_multipart",
            "Expected multipart/form-data content-type",
        )
    return content_type


@router.post("/{conversation_id}/suggestions", response_model=SuggestionsResponse)
async def generate_suggestions(
    conversation_id: str,
    payload: SuggestionsRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db_session),
) -> SuggestionsResponse:
    conversation = ConversationService(db).require_owned_conversation(
        user_id,
        conversation_id,
    )
    response = await DeerFlowClient().generate_suggestions(
        conversation.deerflow_thread_id,
        payload.model_dump(exclude_none=True),
    )
    return SuggestionsResponse.model_validate(response)


@router.get("/{conversation_id}/artifacts/{path:path}")
async def get_artifact(
    conversation_id: str,
    path: str,
    download: bool = False,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db_session),
) -> Response:
    conversation = ConversationService(db).require_owned_conversation(
        user_id,
        conversation_id,
    )
    upstream = await DeerFlowClient().get_artifact(
        conversation.deerflow_thread_id,
        path,
        download=download,
    )
    headers = {}
    for name in ("content-disposition", "cache-control"):
        value = upstream.headers.get(name)
        if value:
            headers[name] = value
    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        media_type=upstream.headers.get("content-type"),
        headers=headers,
    )


@router.post("/{conversation_id}/uploads", response_model=UploadResponse)
async def upload_files(
    conversation_id: str,
    request: Request,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db_session),
) -> UploadResponse:
    conversation = ConversationService(db).require_owned_conversation(
        user_id,
        conversation_id,
    )
    content_type = _validate_multipart_content_type(request.headers.get("content-type"))
    raw_body = await request.body()
    response = await DeerFlowClient().upload_files(
        conversation.deerflow_thread_id,
        raw_body,
        content_type,
    )
    return UploadResponse.model_validate(response)


@router.get("/{conversation_id}/uploads", response_model=dict)
async def list_uploaded_files(
    conversation_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db_session),
) -> dict:
    conversation = ConversationService(db).require_owned_conversation(
        user_id,
        conversation_id,
    )
    return await DeerFlowClient().list_uploaded_files(conversation.deerflow_thread_id)


@router.delete("/{conversation_id}/uploads/{filename}", response_model=dict)
async def delete_uploaded_file(
    conversation_id: str,
    filename: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db_session),
) -> dict:
    conversation = ConversationService(db).require_owned_conversation(
        user_id,
        conversation_id,
    )
    return await DeerFlowClient().delete_uploaded_file(
        conversation.deerflow_thread_id,
        filename,
    )
