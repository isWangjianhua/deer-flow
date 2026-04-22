import asyncio

from app.clients.deerflow import DeerFlowClient
from app.models.agent_ownership import AgentOwnership
from app.models.user import User
from app.services.agent_ownership_service import AgentOwnershipService


def test_list_agents_filters_to_owned_names(db_session, monkeypatch) -> None:
    user = User(username="alice", password_hash="hashed")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    db_session.add(
        AgentOwnership(agent_name="owned-agent", owner_user_id=user.id),
    )
    db_session.commit()

    async def fake_list_agents(self) -> dict:
        return {
            "agents": [
                {
                    "name": "owned-agent",
                    "description": "",
                    "model": None,
                    "tool_groups": None,
                    "soul": "",
                },
                {
                    "name": "other-agent",
                    "description": "",
                    "model": None,
                    "tool_groups": None,
                    "soul": "",
                },
            ]
        }

    monkeypatch.setattr(DeerFlowClient, "list_agents", fake_list_agents)

    payload = asyncio.run(AgentOwnershipService(db_session).list_agents(user.id))

    assert [agent["name"] for agent in payload["agents"]] == ["owned-agent"]


def test_require_owned_agent_rejects_unowned_agent(db_session) -> None:
    user = User(username="alice", password_hash="hashed")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    service = AgentOwnershipService(db_session)

    try:
        asyncio.run(service.require_owned_agent(user.id, "other-agent"))
    except Exception as exc:
        assert exc.status_code == 404
        assert exc.detail["code"] == "agent_not_found"
    else:
        raise AssertionError("expected require_owned_agent to fail")
