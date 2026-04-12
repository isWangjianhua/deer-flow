import asyncio

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
