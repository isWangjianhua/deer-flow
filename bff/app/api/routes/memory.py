from fastapi import APIRouter, Depends, status

from app.api.deps import get_current_user_id
from app.api.errors import error_response
from app.clients.deerflow import DeerFlowClient


router = APIRouter(tags=["memory"])


@router.get("/memory")
async def get_memory(
    user_id: str = Depends(get_current_user_id),
) -> dict:
    try:
        return await DeerFlowClient().get_memory(user_id=user_id)
    except Exception as exc:
        raise error_response(
            status.HTTP_502_BAD_GATEWAY,
            "memory_unavailable",
            "Failed to load memory",
        ) from exc
