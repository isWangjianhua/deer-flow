from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


class ConversationCreateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    status: str
    created_at: datetime


class ConversationListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    status: str
    created_at: datetime
    updated_at: datetime


class ConversationStateValues(BaseModel):
    title: str = ""
    messages: list[dict] = []
    artifacts: list[str] = []
    todos: list[dict] = []


class ConversationDetailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    status: str
    created_at: datetime
    updated_at: datetime
    values: ConversationStateValues


class StreamMessageRequest(BaseModel):
    message: str
    model_name: str | None = None
    thinking_enabled: bool | None = None
    is_plan_mode: bool | None = None
    subagent_enabled: bool | None = None
    reasoning_effort: Literal["minimal", "low", "medium", "high"] | None = None
