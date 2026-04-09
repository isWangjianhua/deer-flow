from datetime import datetime

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


class StreamMessageRequest(BaseModel):
    message: str
