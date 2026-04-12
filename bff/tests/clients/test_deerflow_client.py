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


def test_upload_files_sends_multipart_payload(monkeypatch) -> None:
    async def mock_post(self, url: str, *args, **kwargs):
        request = httpx.Request("POST", url)
        files = kwargs["files"]
        assert files == [
            (
                "files",
                ("notes.txt", b"hello from bff", "text/plain"),
            )
        ]
        return httpx.Response(
            200,
            json={"success": True, "files": [], "message": "ok"},
            request=request,
        )

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    result = asyncio.run(
        DeerFlowClient().upload_files(
            "thread-123",
            [("notes.txt", b"hello from bff", "text/plain")],
        ),
    )

    assert result["success"] is True
