from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


from app.models.agent_ownership import AgentOwnership  # noqa: F401
from app.models.conversation import Conversation  # noqa: F401
from app.models.user import User  # noqa: F401
