from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.agent_ownership import AgentOwnership


class AgentOwnershipRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create(self, ownership: AgentOwnership) -> AgentOwnership:
        self.db.add(ownership)
        self.db.commit()
        self.db.refresh(ownership)
        return ownership

    def get_by_agent_name(self, agent_name: str) -> AgentOwnership | None:
        statement = select(AgentOwnership).where(AgentOwnership.agent_name == agent_name)
        return self.db.scalar(statement)

    def list_agent_names_by_owner(self, owner_user_id: str) -> list[str]:
        statement = select(AgentOwnership.agent_name).where(
            AgentOwnership.owner_user_id == owner_user_id
        )
        return list(self.db.scalars(statement))

    def delete(self, ownership: AgentOwnership) -> None:
        self.db.delete(ownership)
        self.db.commit()
