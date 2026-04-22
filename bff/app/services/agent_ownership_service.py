from fastapi import status
from sqlalchemy.orm import Session

from app.api.errors import error_response
from app.clients.deerflow import DeerFlowClient
from app.models.agent_ownership import AgentOwnership
from app.repositories.agent_ownership_repo import AgentOwnershipRepository


class AgentOwnershipService:
    def __init__(self, db: Session) -> None:
        self.repo = AgentOwnershipRepository(db)

    async def list_agents(self, user_id: str) -> dict:
        payload = await DeerFlowClient().list_agents()
        owned_names = set(self.repo.list_agent_names_by_owner(user_id))
        payload["agents"] = [
            agent for agent in payload.get("agents", []) if agent.get("name") in owned_names
        ]
        return payload

    async def check_agent_name(self, name: str) -> dict:
        return await DeerFlowClient().check_agent_name(name)

    async def require_owned_agent(self, user_id: str, agent_name: str) -> AgentOwnership:
        ownership = self.repo.get_by_agent_name(agent_name)
        if ownership is None or ownership.owner_user_id != user_id:
            raise error_response(
                status.HTTP_404_NOT_FOUND,
                "agent_not_found",
                "Agent not found",
            )
        return ownership

    async def get_agent(self, user_id: str, agent_name: str) -> dict:
        await self.require_owned_agent(user_id, agent_name)
        return await DeerFlowClient().get_agent(agent_name)

    async def create_agent(self, user_id: str, payload: dict) -> dict:
        created = await DeerFlowClient().create_agent(payload)
        self.repo.create(
            AgentOwnership(
                agent_name=created["name"],
                owner_user_id=user_id,
            )
        )
        return created

    async def update_agent(self, user_id: str, agent_name: str, payload: dict) -> dict:
        await self.require_owned_agent(user_id, agent_name)
        return await DeerFlowClient().update_agent(agent_name, payload)

    async def delete_agent(self, user_id: str, agent_name: str) -> dict:
        ownership = await self.require_owned_agent(user_id, agent_name)
        result = await DeerFlowClient().delete_agent(agent_name)
        self.repo.delete(ownership)
        return result

    async def create_agent_conversation(self, user_id: str, agent_name: str) -> str:
        await self.require_owned_agent(user_id, agent_name)
        return await DeerFlowClient().create_thread()
