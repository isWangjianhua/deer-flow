from fastapi import APIRouter

from app.clients.deerflow import DeerFlowClient
from app.schemas.models import ModelsResponse


router = APIRouter(tags=["models"])


@router.get("/models", response_model=ModelsResponse)
async def list_models() -> ModelsResponse:
    payload = await DeerFlowClient().get_models()
    return ModelsResponse.model_validate(payload)
