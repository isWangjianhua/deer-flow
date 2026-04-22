import asyncio
import json

import httpx

from app.clients.deerflow import DeerFlowClient


def test_create_thread_returns_thread_id(monkeypatch) -> None:
    async def mock_post(self, url: str, *args, **kwargs):
        request = httpx.Request("POST", url)
        return httpx.Response(200, json={"thread_id": "thread-123"}, request=request)

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    result = asyncio.run(DeerFlowClient().create_thread())

    assert result == "thread-123"


def test_get_models_returns_payload(monkeypatch) -> None:
    async def mock_get(self, url: str, *args, **kwargs):
        request = httpx.Request("GET", url)
        return httpx.Response(
            200,
            json={
                "models": [
                    {
                        "name": "deepseek-chat",
                        "model": "deepseek-chat",
                        "display_name": "DeepSeek Chat",
                    }
                ]
            },
            request=request,
        )

    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

    result = asyncio.run(DeerFlowClient().get_models())

    assert result["models"][0]["name"] == "deepseek-chat"


def test_list_agents_calls_gateway_agents_root(monkeypatch) -> None:
    async def mock_get(self, url: str, *args, **kwargs):
        request = httpx.Request("GET", url)
        assert url.endswith("/api/agents")
        return httpx.Response(
            200,
            json={
                "agents": [
                    {
                        "name": "demo-agent",
                        "description": "",
                        "model": None,
                        "tool_groups": None,
                        "soul": "",
                    }
                ]
            },
            request=request,
        )

    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

    result = asyncio.run(DeerFlowClient().list_agents())

    assert result["agents"][0]["name"] == "demo-agent"


def test_check_agent_name_calls_gateway_check_endpoint(monkeypatch) -> None:
    async def mock_get(self, url: str, *args, **kwargs):
        request = httpx.Request("GET", url)
        assert url.endswith("/api/agents/check")
        assert kwargs["params"] == {"name": "demo-agent"}
        return httpx.Response(
            200,
            json={"available": True, "name": "demo-agent"},
            request=request,
        )

    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

    result = asyncio.run(DeerFlowClient().check_agent_name("demo-agent"))

    assert result["available"] is True


def test_get_agent_calls_gateway_detail_endpoint(monkeypatch) -> None:
    async def mock_get(self, url: str, *args, **kwargs):
        request = httpx.Request("GET", url)
        assert url.endswith("/api/agents/demo-agent")
        return httpx.Response(
            200,
            json={
                "name": "demo-agent",
                "description": "Demo",
                "model": None,
                "tool_groups": None,
                "soul": "Hello",
            },
            request=request,
        )

    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

    result = asyncio.run(DeerFlowClient().get_agent("demo-agent"))

    assert result["name"] == "demo-agent"


def test_create_agent_calls_gateway_agents_root(monkeypatch) -> None:
    payload = {
        "name": "demo-agent",
        "description": "Demo",
        "model": None,
        "tool_groups": None,
        "soul": "Hello",
    }

    async def mock_post(self, url: str, *args, **kwargs):
        request = httpx.Request("POST", url)
        assert url.endswith("/api/agents")
        assert kwargs["json"] == payload
        return httpx.Response(201, json=payload, request=request)

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    result = asyncio.run(DeerFlowClient().create_agent(payload))

    assert result["name"] == "demo-agent"


def test_update_agent_calls_gateway_detail_endpoint(monkeypatch) -> None:
    payload = {"description": "Updated"}

    async def mock_put(self, url: str, *args, **kwargs):
        request = httpx.Request("PUT", url)
        assert url.endswith("/api/agents/demo-agent")
        assert kwargs["json"] == payload
        return httpx.Response(
            200,
            json={
                "name": "demo-agent",
                "description": "Updated",
                "model": None,
                "tool_groups": None,
                "soul": "Hello",
            },
            request=request,
        )

    monkeypatch.setattr(httpx.AsyncClient, "put", mock_put)

    result = asyncio.run(DeerFlowClient().update_agent("demo-agent", payload))

    assert result["description"] == "Updated"


def test_delete_agent_calls_gateway_detail_endpoint(monkeypatch) -> None:
    async def mock_delete(self, url: str, *args, **kwargs):
        request = httpx.Request("DELETE", url)
        assert url.endswith("/api/agents/demo-agent")
        return httpx.Response(200, json={"success": True}, request=request)

    monkeypatch.setattr(httpx.AsyncClient, "delete", mock_delete)

    result = asyncio.run(DeerFlowClient().delete_agent("demo-agent"))

    assert result["success"] is True


def test_generate_suggestions_posts_payload(monkeypatch) -> None:
    async def mock_post(self, url: str, *args, **kwargs):
        request = httpx.Request("POST", url)
        assert kwargs["json"] == {
            "messages": [{"role": "user", "content": "hello"}],
            "n": 3,
        }
        return httpx.Response(
            200,
            json={"suggestions": ["How about tomorrow?"]},
            request=request,
        )

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    result = asyncio.run(
        DeerFlowClient().generate_suggestions(
            "thread-123",
            {"messages": [{"role": "user", "content": "hello"}], "n": 3},
        ),
    )

    assert result["suggestions"][0] == "How about tomorrow?"


def test_get_artifact_preserves_download_query(monkeypatch) -> None:
    async def mock_get(self, url: str, *args, **kwargs):
        request = httpx.Request("GET", url)
        assert kwargs["params"] == {"download": "true"}
        return httpx.Response(
            200,
            content=b"# report",
            headers={"content-type": "text/markdown"},
            request=request,
        )

    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

    result = asyncio.run(
        DeerFlowClient().get_artifact(
            "thread-123",
            "mnt/user-data/outputs/report.md",
            download=True,
        ),
    )

    assert result.content == b"# report"


def test_upload_files_sends_raw_body_and_content_type(monkeypatch) -> None:
    async def mock_post(self, url: str, *args, **kwargs):
        request = httpx.Request("POST", url)
        assert kwargs["content"] == b"--boundary\r\npayload\r\n--boundary--\r\n"
        assert kwargs["headers"] == {"content-type": "multipart/form-data; boundary=boundary"}
        return httpx.Response(
            200,
            json={"success": True, "files": [], "message": "ok"},
            request=request,
        )

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    result = asyncio.run(
        DeerFlowClient().upload_files(
            "thread-123",
            b"--boundary\r\npayload\r\n--boundary--\r\n",
            "multipart/form-data; boundary=boundary",
        ),
    )

    assert result["success"] is True


def test_stream_message_sends_context_payload(monkeypatch) -> None:
    captured = {}

    async def mock_send(self, request: httpx.Request, *, stream: bool = False, **kwargs):
        captured["url"] = str(request.url)
        captured["stream"] = stream
        captured["payload"] = json.loads(request.content.decode("utf-8"))
        return httpx.Response(200, request=request)

    monkeypatch.setattr(httpx.AsyncClient, "send", mock_send)

    client, response = asyncio.run(
        DeerFlowClient().stream_message(
            "thread-123",
            "hello",
            context={"user_id": "u-1"},
        ),
    )

    assert response.status_code == 200
    assert captured["url"].endswith("/api/threads/thread-123/runs/stream")
    assert captured["stream"] is True
    assert captured["payload"] == {
        "input": {"messages": [{"role": "user", "content": "hello"}]},
        "stream_mode": ["messages-tuple", "values"],
        "context": {"user_id": "u-1"},
    }

    asyncio.run(response.aclose())
    asyncio.run(client.aclose())


def test_get_memory_forwards_user_id_header(monkeypatch) -> None:
    async def mock_get(self, url: str, *args, **kwargs):
        request = httpx.Request("GET", url)
        assert kwargs["headers"] == {"X-User-Id": "u-1"}
        return httpx.Response(
            200,
            json={"version": "1.0", "facts": []},
            request=request,
        )

    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

    result = asyncio.run(DeerFlowClient().get_memory(user_id="u-1"))

    assert result["version"] == "1.0"


def test_get_memory_forwards_user_and_agent_headers(monkeypatch) -> None:
    async def mock_get(self, url: str, *args, **kwargs):
        request = httpx.Request("GET", url)
        assert url.endswith("/api/memory")
        assert kwargs["headers"] == {
            "X-User-Id": "u-1",
            "X-Agent-Id": "__lead__",
        }
        return httpx.Response(
            200,
            json={"version": "1.0", "facts": []},
            request=request,
        )

    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

    result = asyncio.run(DeerFlowClient().get_memory(user_id="u-1", agent_id="__lead__"))

    assert result["version"] == "1.0"


def test_get_memory_status_forwards_user_id_header(monkeypatch) -> None:
    async def mock_get(self, url: str, *args, **kwargs):
        request = httpx.Request("GET", url)
        assert url.endswith("/api/memory/status")
        assert kwargs["headers"] == {"X-User-Id": "u-1"}
        return httpx.Response(
            200,
            json={"config": {"enabled": True}, "data": {"version": "1.0", "facts": []}},
            request=request,
        )

    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

    result = asyncio.run(DeerFlowClient().get_memory_status(user_id="u-1"))

    assert result["config"]["enabled"] is True


def test_import_memory_forwards_user_id_header(monkeypatch) -> None:
    imported = {"version": "1.0", "facts": []}

    async def mock_post(self, url: str, *args, **kwargs):
        request = httpx.Request("POST", url)
        assert url.endswith("/api/memory/import")
        assert kwargs["headers"] == {"X-User-Id": "u-1"}
        assert kwargs["json"] == imported
        return httpx.Response(200, json=imported, request=request)

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    result = asyncio.run(DeerFlowClient().import_memory(user_id="u-1", memory_data=imported))

    assert result == imported


def test_create_memory_fact_forwards_user_id_header(monkeypatch) -> None:
    async def mock_post(self, url: str, *args, **kwargs):
        request = httpx.Request("POST", url)
        assert url.endswith("/api/memory/facts")
        assert kwargs["headers"] == {"X-User-Id": "u-1"}
        assert kwargs["json"] == {
            "content": "User prefers concise responses.",
            "category": "preference",
            "confidence": 0.9,
        }
        return httpx.Response(200, json={"version": "1.0", "facts": []}, request=request)

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    result = asyncio.run(
        DeerFlowClient().create_memory_fact(
            user_id="u-1",
            content="User prefers concise responses.",
            category="preference",
            confidence=0.9,
        )
    )

    assert result["version"] == "1.0"


def test_update_memory_fact_forwards_user_id_header(monkeypatch) -> None:
    async def mock_patch(self, url: str, *args, **kwargs):
        request = httpx.Request("PATCH", url)
        assert url.endswith("/api/memory/facts/fact-1")
        assert kwargs["headers"] == {"X-User-Id": "u-1"}
        assert kwargs["json"] == {"content": "Updated"}
        return httpx.Response(200, json={"version": "1.0", "facts": []}, request=request)

    monkeypatch.setattr(httpx.AsyncClient, "patch", mock_patch)

    result = asyncio.run(
        DeerFlowClient().update_memory_fact(
            user_id="u-1",
            fact_id="fact-1",
            content="Updated",
        )
    )

    assert result["version"] == "1.0"


def test_delete_memory_fact_forwards_user_id_header(monkeypatch) -> None:
    async def mock_delete(self, url: str, *args, **kwargs):
        request = httpx.Request("DELETE", url)
        assert url.endswith("/api/memory/facts/fact-1")
        assert kwargs["headers"] == {"X-User-Id": "u-1"}
        return httpx.Response(200, json={"version": "1.0", "facts": []}, request=request)

    monkeypatch.setattr(httpx.AsyncClient, "delete", mock_delete)

    result = asyncio.run(DeerFlowClient().delete_memory_fact(user_id="u-1", fact_id="fact-1"))

    assert result["version"] == "1.0"


def test_clear_memory_forwards_user_id_header(monkeypatch) -> None:
    async def mock_delete(self, url: str, *args, **kwargs):
        request = httpx.Request("DELETE", url)
        assert url.endswith("/api/memory")
        assert kwargs["headers"] == {"X-User-Id": "u-1"}
        return httpx.Response(200, json={"version": "1.0", "facts": []}, request=request)

    monkeypatch.setattr(httpx.AsyncClient, "delete", mock_delete)

    result = asyncio.run(DeerFlowClient().clear_memory(user_id="u-1"))

    assert result["version"] == "1.0"
