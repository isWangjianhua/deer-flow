from pydantic import BaseModel


class ModelItem(BaseModel):
    name: str
    model: str
    display_name: str | None = None
    description: str | None = None
    supports_thinking: bool = False
    supports_reasoning_effort: bool = False


class ModelsResponse(BaseModel):
    models: list[ModelItem]
