from datetime import datetime

from pydantic import BaseModel, ConfigDict


class UserIdentityResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    provider: str
    subject: str
    email: str | None
    created_at: datetime
    updated_at: datetime
