import httpx

from app.clients.deerflow import DeerFlowClient
from app.services.conversation_service import ConversationService


def test_conversation_suggestions_route_proxies_to_gateway_thread(
    client,
    db_session,
    monkeypatch,
) -> None:
    async def mock_generate_suggestions(self, thread_id: str, payload: dict):
        assert thread_id == "thread-owned"
        assert payload == {
            "messages": [{"role": "user", "content": "How is the weather?"}],
            "n": 3,
            "model_name": "deepseek-chat",
        }
        return {"suggestions": ["How about tomorrow?"]}

    monkeypatch.setattr(
        DeerFlowClient,
        "generate_suggestions",
        mock_generate_suggestions,
        raising=False,
    )

    login = client.post("/auth/login", json={"username": "demo", "password": "demo123"})
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    me = client.get("/me", headers=headers)
    conversation = ConversationService(db_session).create_conversation(
        user_id=me.json()["id"],
        deerflow_thread_id="thread-owned",
    )

    response = client.post(
        f"/conversations/{conversation.id}/suggestions",
        json={
            "messages": [{"role": "user", "content": "How is the weather?"}],
            "n": 3,
            "model_name": "deepseek-chat",
        },
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json() == {"suggestions": ["How about tomorrow?"]}


def test_conversation_artifact_route_proxies_owned_access(
    client,
    db_session,
    monkeypatch,
) -> None:
    async def mock_get_artifact(
        self,
        thread_id: str,
        path: str,
        *,
        download: bool = False,
    ):
        assert thread_id == "thread-owned"
        assert path == "mnt/user-data/outputs/report.md"
        assert download is True
        request = httpx.Request("GET", "http://gateway/api/threads/thread-owned/artifacts")
        return httpx.Response(
            200,
            content=b"# report",
            headers={
                "content-type": "text/markdown; charset=utf-8",
                "content-disposition": "attachment; filename*=UTF-8''report.md",
            },
            request=request,
        )

    monkeypatch.setattr(DeerFlowClient, "get_artifact", mock_get_artifact, raising=False)

    login = client.post("/auth/login", json={"username": "demo", "password": "demo123"})
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    me = client.get("/me", headers=headers)
    conversation = ConversationService(db_session).create_conversation(
        user_id=me.json()["id"],
        deerflow_thread_id="thread-owned",
    )

    response = client.get(
        f"/conversations/{conversation.id}/artifacts/mnt/user-data/outputs/report.md?download=true",
        headers=headers,
    )

    assert response.status_code == 200
    assert response.text == "# report"
    assert response.headers["content-type"].startswith("text/markdown")
    assert "attachment" in response.headers["content-disposition"]


def test_conversation_upload_route_proxies_files_to_gateway_thread(
    client,
    db_session,
    monkeypatch,
) -> None:
    async def mock_upload_files(self, thread_id: str, files):
        assert thread_id == "thread-owned"
        assert len(files) == 1
        name, content, content_type = files[0]
        assert name == "notes.txt"
        assert content == b"hello from bff"
        assert content_type == "text/plain"
        return {
            "success": True,
            "files": [
                {
                    "filename": "notes.txt",
                    "size": "14",
                    "path": "/mnt/user-data/uploads/notes.txt",
                    "virtual_path": "/mnt/user-data/uploads/notes.txt",
                    "artifact_url": "/api/threads/thread-owned/artifacts/mnt/user-data/uploads/notes.txt",
                }
            ],
            "message": "Successfully uploaded 1 file(s)",
        }

    monkeypatch.setattr(DeerFlowClient, "upload_files", mock_upload_files, raising=False)

    login = client.post("/auth/login", json={"username": "demo", "password": "demo123"})
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    me = client.get("/me", headers=headers)
    conversation = ConversationService(db_session).create_conversation(
        user_id=me.json()["id"],
        deerflow_thread_id="thread-owned",
    )

    response = client.post(
        f"/conversations/{conversation.id}/uploads",
        files=[("files", ("notes.txt", b"hello from bff", "text/plain"))],
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json()["success"] is True
    assert response.json()["files"][0]["filename"] == "notes.txt"
