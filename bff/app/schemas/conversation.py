from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


class ConversationCreateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    status: str
    agent_name: str | None = None
    is_pinned: bool = False
    pinned_at: datetime | None = None
    created_at: datetime


class ConversationListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    status: str
    agent_name: str | None = None
    is_pinned: bool = False
    pinned_at: datetime | None = None
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
    agent_name: str | None = None
    is_pinned: bool = False
    pinned_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    values: ConversationStateValues


class ConversationPatchRequest(BaseModel):
    title: str | None = None
    is_pinned: bool | None = None


class ConversationDeleteResponse(BaseModel):
    success: bool
    id: str


class StreamMessageRequest(BaseModel):
    message: str
    model_name: str | None = None
    thinking_enabled: bool | None = None
    is_plan_mode: bool | None = None
    subagent_enabled: bool | None = None
    reasoning_effort: Literal["minimal", "low", "medium", "high"] | None = None


class SuggestionMessage(BaseModel):
    role: str
    content: str


class SuggestionsRequest(BaseModel):
    messages: list[SuggestionMessage]
    n: int = 3
    model_name: str | None = None


class SuggestionsResponse(BaseModel):
    suggestions: list[str] = []


class UploadFileInfo(BaseModel):
    filename: str
    size: str
    path: str
    virtual_path: str
    artifact_url: str
    extension: str | None = None
    modified: int | None = None
    markdown_file: str | None = None
    markdown_path: str | None = None
    markdown_virtual_path: str | None = None
    markdown_artifact_url: str | None = None


class UploadResponse(BaseModel):
    success: bool
    files: list[UploadFileInfo]
    message: str
