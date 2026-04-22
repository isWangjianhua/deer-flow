import httpx

from app.clients.deerflow import DeerFlowClient
from app.core.security import create_access_token
from app.models.agent_ownership import AgentOwnership


def auth_headers() -> dict[str, str]:
    token = create_access_token("user-123")
    return {"Authorization": f"Bearer {token}"}


def login_headers_and_user_id(client) -> tuple[dict[str, str], str]:
    login = client.post("/auth/login", json={"username": "demo", "password": "demo1234"})
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    me = client.get("/me", headers=headers)
    return headers, me.json()["id"]


def test_agents_routes_require_auth(client) -> None:
    assert client.get("/agents").status_code == 401
    assert client.post("/agents", json={}).status_code == 401
    assert client.get("/agents/check?name=demo-agent").status_code == 401
    assert client.get("/agents/demo-agent").status_code == 401
    assert client.request("PUT", "/agents/demo-agent", json={}).status_code == 401
    assert client.request("DELETE", "/agents/demo-agent").status_code == 401


def test_list_agents_returns_only_current_users_agents(client, db_session, monkeypatch) -> None:
    async def fake_list_agents(self) -> dict:
        return {
            "agents": [
                {
                    "name": "demo-agent",
                    "description": "",
                    "model": None,
                    "tool_groups": None,
                    "soul": "",
                }
            ]
        }

    monkeypatch.setattr(DeerFlowClient, "list_agents", fake_list_agents)

    headers, user_id = login_headers_and_user_id(client)
    db_session.add(AgentOwnership(agent_name="demo-agent", owner_user_id=user_id))
    db_session.commit()

    response = client.get("/agents", headers=headers)

    assert response.status_code == 200
    assert response.json()["agents"][0]["name"] == "demo-agent"
    assert len(response.json()["agents"]) == 1


def test_check_agent_name_forwards_query(client, monkeypatch) -> None:
    async def fake_check_agent_name(self, name: str) -> dict:
        assert name == "demo-agent"
        return {"available": True, "name": name}

    monkeypatch.setattr(DeerFlowClient, "check_agent_name", fake_check_agent_name)

    response = client.get(
        "/agents/check",
        headers=auth_headers(),
        params={"name": "demo-agent"},
    )

    assert response.status_code == 200
    assert response.json() == {"available": True, "name": "demo-agent"}


def test_get_agent_forwards_owned_agent_to_deerflow(client, db_session, monkeypatch) -> None:
    async def fake_get_agent(self, name: str) -> dict:
        assert name == "demo-agent"
        return {
            "name": name,
            "description": "Demo",
            "model": None,
            "tool_groups": None,
            "soul": "Hello",
        }

    monkeypatch.setattr(DeerFlowClient, "get_agent", fake_get_agent)

    headers, user_id = login_headers_and_user_id(client)
    db_session.add(AgentOwnership(agent_name="demo-agent", owner_user_id=user_id))
    db_session.commit()

    response = client.get("/agents/demo-agent", headers=headers)

    assert response.status_code == 200
    assert response.json()["name"] == "demo-agent"


def test_get_agent_rejects_unowned_agent(client) -> None:
    headers, _ = login_headers_and_user_id(client)

    response = client.get("/agents/demo-agent", headers=headers)

    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "agent_not_found"


def test_get_agent_normalizes_not_found_errors(client, db_session, monkeypatch) -> None:
    async def fake_get_agent(self, name: str) -> dict:
        raise httpx.HTTPStatusError(
            "not found",
            request=httpx.Request("GET", f"http://testserver/api/agents/{name}"),
            response=httpx.Response(404, json={"detail": "Agent not found"}),
        )

    monkeypatch.setattr(DeerFlowClient, "get_agent", fake_get_agent)

    headers, user_id = login_headers_and_user_id(client)
    db_session.add(AgentOwnership(agent_name="demo-agent", owner_user_id=user_id))
    db_session.commit()

    response = client.get("/agents/demo-agent", headers=headers)

    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "agent_not_found"


def test_create_agent_normalizes_gateway_errors(client, monkeypatch) -> None:
    async def fake_create_agent(self, payload: dict) -> dict:
        raise httpx.HTTPStatusError(
            "conflict",
            request=httpx.Request("POST", "http://testserver/api/agents"),
            response=httpx.Response(409, json={"detail": "Agent already exists"}),
        )

    monkeypatch.setattr(DeerFlowClient, "create_agent", fake_create_agent)

    response = client.post(
        "/agents",
        headers=auth_headers(),
        json={
            "name": "demo-agent",
            "description": "",
            "model": None,
            "tool_groups": None,
            "soul": "",
        },
    )

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "agent_exists"


def test_create_agent_binds_new_ownership_record(client, db_session, monkeypatch) -> None:
    async def fake_create_agent(self, payload: dict) -> dict:
        return payload

    monkeypatch.setattr(DeerFlowClient, "create_agent", fake_create_agent)

    headers, user_id = login_headers_and_user_id(client)

    response = client.post(
        "/agents",
        headers=headers,
        json={
            "name": "owned-agent",
            "description": "",
            "model": None,
            "tool_groups": None,
            "soul": "",
        },
    )

    assert response.status_code == 200
    ownership = db_session.query(AgentOwnership).filter_by(agent_name="owned-agent").one()
    assert ownership.owner_user_id == user_id


def test_update_agent_forwards_owned_payload(client, db_session, monkeypatch) -> None:
    async def fake_update_agent(self, name: str, payload: dict) -> dict:
        assert name == "demo-agent"
        assert payload == {"description": "Updated"}
        return {
            "name": name,
            "description": "Updated",
            "model": None,
            "tool_groups": None,
            "soul": "Hello",
        }

    monkeypatch.setattr(DeerFlowClient, "update_agent", fake_update_agent)

    headers, user_id = login_headers_and_user_id(client)
    db_session.add(AgentOwnership(agent_name="demo-agent", owner_user_id=user_id))
    db_session.commit()

    response = client.request(
        "PUT",
        "/agents/demo-agent",
        headers=headers,
        json={"description": "Updated"},
    )

    assert response.status_code == 200
    assert response.json()["description"] == "Updated"


def test_delete_agent_forwards_owned_agent_to_deerflow(client, db_session, monkeypatch) -> None:
    async def fake_delete_agent(self, name: str) -> dict:
        assert name == "demo-agent"
        return {"success": True}

    monkeypatch.setattr(DeerFlowClient, "delete_agent", fake_delete_agent)

    headers, user_id = login_headers_and_user_id(client)
    db_session.add(AgentOwnership(agent_name="demo-agent", owner_user_id=user_id))
    db_session.commit()

    response = client.request(
        "DELETE",
        "/agents/demo-agent",
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json() == {"success": True}


def test_create_agent_conversation_rejects_unowned_agent(client) -> None:
    headers, _ = login_headers_and_user_id(client)

    response = client.post(
        "/agents/demo-agent/conversations",
        headers=headers,
    )

    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "agent_not_found"
