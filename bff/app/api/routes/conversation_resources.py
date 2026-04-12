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


def _extract_boundary(content_type: str | None) -> bytes:
    if not content_type:
        raise error_response(
            status.HTTP_400_BAD_REQUEST,
            "invalid_multipart",
            "Missing multipart content-type",
        )

    for part in content_type.split(";"):
        token = part.strip()
        if token.startswith("boundary="):
            boundary = token.split("=", 1)[1].strip().strip('"')
            if boundary:
                return boundary.encode("utf-8")

    raise error_response(
        status.HTTP_400_BAD_REQUEST,
        "invalid_multipart",
        "Missing multipart boundary",
    )


def _parse_content_disposition(value: str) -> tuple[str | None, str | None]:
    field_name = None
    filename = None
    for part in value.split(";"):
        token = part.strip()
        if token.startswith("name="):
            field_name = token.split("=", 1)[1].strip().strip('"')
        elif token.startswith("filename="):
            filename = token.split("=", 1)[1].strip().strip('"')
    return field_name, filename


def _parse_multipart_files(body: bytes, boundary: bytes) -> list[tuple[str, bytes, str | None]]:
    delimiter = b"--" + boundary
    uploaded: list[tuple[str, bytes, str | None]] = []

    for chunk in body.split(delimiter):
        part = chunk.strip()
        if not part or part == b"--":
            continue

        part = part.lstrip(b"\r\n")
        if part.endswith(b"--"):
            part = part[:-2]

        header_blob, separator, content = part.partition(b"\r\n\r\n")
        if not separator:
            continue

        headers: dict[str, str] = {}
        for line in header_blob.split(b"\r\n"):
            name, split, value = line.decode("utf-8").partition(":")
            if split:
                headers[name.strip().lower()] = value.strip()

        field_name, filename = _parse_content_disposition(
            headers.get("content-disposition", ""),
        )
        if field_name != "files" or not filename:
            continue

        if content.endswith(b"\r\n"):
            content = content[:-2]

        uploaded.append((filename, content, headers.get("content-type")))

    return uploaded


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
    boundary = _extract_boundary(request.headers.get("content-type"))
    serialized_files = _parse_multipart_files(await request.body(), boundary)
    if not serialized_files:
        raise error_response(
            status.HTTP_400_BAD_REQUEST,
            "no_files",
            "No files provided",
        )
    response = await DeerFlowClient().upload_files(
        conversation.deerflow_thread_id,
        serialized_files,
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
