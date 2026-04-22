import json

import httpx
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_id, get_db_session
from app.api.errors import error_response
from app.clients.deerflow import DeerFlowClient
from app.schemas.conversation import ConversationCreateResponse
from app.services.conversation_service import ConversationService


router = APIRouter(tags=["agents"])


def _error_detail(exc: httpx.HTTPStatusError) -> str | None:
    if not exc.response.content:
        return None

    try:
        payload = exc.response.json()
    except (json.JSONDecodeError, ValueError):
        return exc.response.text or None

    if not isinstance(payload, dict):
        return None

    detail = payload.get("detail")
    if isinstance(detail, str):
        return detail
    if detail is None:
        return None
    return str(detail)


def _normalize_agents_error(exc: httpx.HTTPStatusError):
    status_code = exc.response.status_code
    detail = _error_detail(exc)

    if status_code == 404:
        raise error_response(
            status.HTTP_404_NOT_FOUND,
            "agent_not_found",
            detail or "Agent not found",
        ) from exc
    if status_code == 409:
        raise error_response(
            status.HTTP_409_CONFLICT,
            "agent_exists",
            detail or "Agent already exists",
        ) from exc
    if status_code == 422:
        raise error_response(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "invalid_agent_input",
            detail or "Invalid agent input",
        ) from exc
    if status_code in {502, 503, 504}:
        raise error_response(
            status.HTTP_502_BAD_GATEWAY,
            "agents_backend_unreachable",
            "Could not reach the DeerFlow backend",
        ) from exc

    raise error_response(
        status.HTTP_502_BAD_GATEWAY,
        "agents_unavailable",
        detail or "Failed to load agents",
    ) from exc


@router.get("/agents")
async def list_agents(
    user_id: str = Depends(get_current_user_id),
) -> dict:
    del user_id
    try:
        return await DeerFlowClient().list_agents()
    except httpx.HTTPStatusError as exc:
        _normalize_agents_error(exc)


@router.get("/agents/check")
async def check_agent_name(
    name: str = Query(...),
    user_id: str = Depends(get_current_user_id),
) -> dict:
    del user_id
    try:
        return await DeerFlowClient().check_agent_name(name)
    except httpx.HTTPStatusError as exc:
        _normalize_agents_error(exc)


@router.get("/agents/{agent_name}")
async def get_agent(
    agent_name: str,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    del user_id
    try:
        return await DeerFlowClient().get_agent(agent_name)
    except httpx.HTTPStatusError as exc:
        _normalize_agents_error(exc)


@router.post("/agents")
async def create_agent(
    payload: dict,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    del user_id
    try:
        return await DeerFlowClient().create_agent(payload)
    except httpx.HTTPStatusError as exc:
        _normalize_agents_error(exc)


@router.put("/agents/{agent_name}")
async def update_agent(
    agent_name: str,
    payload: dict,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    del user_id
    try:
        return await DeerFlowClient().update_agent(agent_name, payload)
    except httpx.HTTPStatusError as exc:
        _normalize_agents_error(exc)


@router.delete("/agents/{agent_name}")
async def delete_agent(
    agent_name: str,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    del user_id
    try:
        return await DeerFlowClient().delete_agent(agent_name)
    except httpx.HTTPStatusError as exc:
        _normalize_agents_error(exc)


@router.post(
    "/agents/{agent_name}/conversations",
    response_model=ConversationCreateResponse,
)
async def create_agent_conversation(
    agent_name: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db_session),
) -> ConversationCreateResponse:
    try:
        deerflow_thread_id = await DeerFlowClient().create_thread()
    except httpx.HTTPStatusError as exc:
        _normalize_agents_error(exc)

    return ConversationService(db).create_conversation(
        user_id=user_id,
        deerflow_thread_id=deerflow_thread_id,
        agent_name=agent_name,
    )
