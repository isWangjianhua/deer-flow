from types import SimpleNamespace
from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.gateway.routers import memory


def _sample_memory(facts: list[dict] | None = None) -> dict:
    return {
        "version": "1.0",
        "lastUpdated": "2026-03-26T12:00:00Z",
        "user": {
            "workContext": {"summary": "", "updatedAt": ""},
            "personalContext": {"summary": "", "updatedAt": ""},
            "topOfMind": {"summary": "", "updatedAt": ""},
        },
        "history": {
            "recentMonths": {"summary": "", "updatedAt": ""},
            "earlierContext": {"summary": "", "updatedAt": ""},
            "longTermBackground": {"summary": "", "updatedAt": ""},
        },
        "facts": facts or [],
    }


def _memory_config(provider: str = "file") -> SimpleNamespace:
    return SimpleNamespace(
        provider=provider,
        enabled=True,
        storage_path="memory.json",
        debounce_seconds=30,
        max_facts=100,
        fact_confidence_threshold=0.7,
        injection_enabled=True,
        max_injection_tokens=2000,
    )


@pytest.fixture(autouse=True)
def default_file_memory_config():
    with patch("app.gateway.routers.memory.get_memory_config", return_value=_memory_config(provider="file")):
        yield


def test_export_memory_route_returns_current_memory() -> None:
    app = FastAPI()
    app.include_router(memory.router)
    exported_memory = _sample_memory(
        facts=[
            {
                "id": "fact_export",
                "content": "User prefers concise responses.",
                "category": "preference",
                "confidence": 0.9,
                "createdAt": "2026-03-20T00:00:00Z",
                "source": "thread-1",
            }
        ]
    )

    with patch("app.gateway.routers.memory.get_memory_data", return_value=exported_memory):
        with TestClient(app) as client:
            response = client.get("/api/memory/export")

    assert response.status_code == 200
    assert response.json()["facts"] == exported_memory["facts"]


def test_import_memory_route_returns_imported_memory() -> None:
    app = FastAPI()
    app.include_router(memory.router)
    imported_memory = _sample_memory(
        facts=[
            {
                "id": "fact_import",
                "content": "User works on DeerFlow.",
                "category": "context",
                "confidence": 0.87,
                "createdAt": "2026-03-20T00:00:00Z",
                "source": "manual",
            }
        ]
    )

    with patch("app.gateway.routers.memory.import_memory_data", return_value=imported_memory):
        with TestClient(app) as client:
            response = client.post("/api/memory/import", json=imported_memory)

    assert response.status_code == 200
    assert response.json()["facts"] == imported_memory["facts"]


def test_export_memory_route_preserves_source_error() -> None:
    app = FastAPI()
    app.include_router(memory.router)
    exported_memory = _sample_memory(
        facts=[
            {
                "id": "fact_correction",
                "content": "Use make dev for local development.",
                "category": "correction",
                "confidence": 0.95,
                "createdAt": "2026-03-20T00:00:00Z",
                "source": "thread-1",
                "sourceError": "The agent previously suggested npm start.",
            }
        ]
    )

    with patch("app.gateway.routers.memory.get_memory_data", return_value=exported_memory):
        with TestClient(app) as client:
            response = client.get("/api/memory/export")

    assert response.status_code == 200
    assert response.json()["facts"][0]["sourceError"] == "The agent previously suggested npm start."


def test_import_memory_route_preserves_source_error() -> None:
    app = FastAPI()
    app.include_router(memory.router)
    imported_memory = _sample_memory(
        facts=[
            {
                "id": "fact_correction",
                "content": "Use make dev for local development.",
                "category": "correction",
                "confidence": 0.95,
                "createdAt": "2026-03-20T00:00:00Z",
                "source": "thread-1",
                "sourceError": "The agent previously suggested npm start.",
            }
        ]
    )

    with patch("app.gateway.routers.memory.import_memory_data", return_value=imported_memory):
        with TestClient(app) as client:
            response = client.post("/api/memory/import", json=imported_memory)

    assert response.status_code == 200
    assert response.json()["facts"][0]["sourceError"] == "The agent previously suggested npm start."


def test_clear_memory_route_returns_cleared_memory() -> None:
    app = FastAPI()
    app.include_router(memory.router)

    with patch("app.gateway.routers.memory.clear_memory_data", return_value=_sample_memory()):
        with TestClient(app) as client:
            response = client.delete("/api/memory")

    assert response.status_code == 200
    assert response.json()["facts"] == []


def test_create_memory_fact_route_returns_updated_memory() -> None:
    app = FastAPI()
    app.include_router(memory.router)
    updated_memory = _sample_memory(
        facts=[
            {
                "id": "fact_new",
                "content": "User prefers concise code reviews.",
                "category": "preference",
                "confidence": 0.88,
                "createdAt": "2026-03-20T00:00:00Z",
                "source": "manual",
            }
        ]
    )

    with patch("app.gateway.routers.memory.create_memory_fact", return_value=updated_memory):
        with TestClient(app) as client:
            response = client.post(
                "/api/memory/facts",
                json={
                    "content": "User prefers concise code reviews.",
                    "category": "preference",
                    "confidence": 0.88,
                },
            )

    assert response.status_code == 200
    assert response.json()["facts"] == updated_memory["facts"]


def test_delete_memory_fact_route_returns_updated_memory() -> None:
    app = FastAPI()
    app.include_router(memory.router)
    updated_memory = _sample_memory(
        facts=[
            {
                "id": "fact_keep",
                "content": "User likes Python",
                "category": "preference",
                "confidence": 0.9,
                "createdAt": "2026-03-20T00:00:00Z",
                "source": "thread-1",
            }
        ]
    )

    with patch("app.gateway.routers.memory.delete_memory_fact", return_value=updated_memory):
        with TestClient(app) as client:
            response = client.delete("/api/memory/facts/fact_delete")

    assert response.status_code == 200
    assert response.json()["facts"] == updated_memory["facts"]


def test_delete_memory_fact_route_returns_404_for_missing_fact() -> None:
    app = FastAPI()
    app.include_router(memory.router)

    with patch("app.gateway.routers.memory.delete_memory_fact", side_effect=KeyError("fact_missing")):
        with TestClient(app) as client:
            response = client.delete("/api/memory/facts/fact_missing")

    assert response.status_code == 404
    assert response.json()["detail"] == "Memory fact 'fact_missing' not found."


def test_update_memory_fact_route_returns_updated_memory() -> None:
    app = FastAPI()
    app.include_router(memory.router)
    updated_memory = _sample_memory(
        facts=[
            {
                "id": "fact_edit",
                "content": "User prefers spaces",
                "category": "workflow",
                "confidence": 0.91,
                "createdAt": "2026-03-20T00:00:00Z",
                "source": "manual",
            }
        ]
    )

    with patch("app.gateway.routers.memory.update_memory_fact", return_value=updated_memory):
        with TestClient(app) as client:
            response = client.patch(
                "/api/memory/facts/fact_edit",
                json={
                    "content": "User prefers spaces",
                    "category": "workflow",
                    "confidence": 0.91,
                },
            )

    assert response.status_code == 200
    assert response.json()["facts"] == updated_memory["facts"]


def test_update_memory_fact_route_preserves_omitted_fields() -> None:
    app = FastAPI()
    app.include_router(memory.router)
    updated_memory = _sample_memory(
        facts=[
            {
                "id": "fact_edit",
                "content": "User prefers spaces",
                "category": "preference",
                "confidence": 0.8,
                "createdAt": "2026-03-20T00:00:00Z",
                "source": "manual",
            }
        ]
    )

    with patch("app.gateway.routers.memory.update_memory_fact", return_value=updated_memory) as update_fact:
        with TestClient(app) as client:
            response = client.patch(
                "/api/memory/facts/fact_edit",
                json={
                    "content": "User prefers spaces",
                },
            )

    assert response.status_code == 200
    update_fact.assert_called_once_with(
        fact_id="fact_edit",
        content="User prefers spaces",
        category=None,
        confidence=None,
    )
    assert response.json()["facts"] == updated_memory["facts"]


def test_update_memory_fact_route_returns_404_for_missing_fact() -> None:
    app = FastAPI()
    app.include_router(memory.router)

    with patch("app.gateway.routers.memory.update_memory_fact", side_effect=KeyError("fact_missing")):
        with TestClient(app) as client:
            response = client.patch(
                "/api/memory/facts/fact_missing",
                json={
                    "content": "User prefers spaces",
                    "category": "workflow",
                    "confidence": 0.91,
                },
            )

    assert response.status_code == 404
    assert response.json()["detail"] == "Memory fact 'fact_missing' not found."


def test_update_memory_fact_route_returns_specific_error_for_invalid_confidence() -> None:
    app = FastAPI()
    app.include_router(memory.router)

    with patch("app.gateway.routers.memory.update_memory_fact", side_effect=ValueError("confidence")):
        with TestClient(app) as client:
            response = client.patch(
                "/api/memory/facts/fact_edit",
                json={
                    "content": "User prefers spaces",
                    "confidence": 0.91,
                },
            )

    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid confidence value; must be between 0 and 1."


@pytest.mark.parametrize(
    ("method", "path", "target"),
    [
        ("get", "/api/memory", "app.gateway.routers.memory.get_memory_data"),
        ("post", "/api/memory/reload", "app.gateway.routers.memory.reload_memory_data"),
        ("get", "/api/memory/export", "app.gateway.routers.memory.get_memory_data"),
    ],
)
def test_mem0_read_routes_forward_user_id_header(method: str, path: str, target: str) -> None:
    app = FastAPI()
    app.include_router(memory.router)
    exported_memory = _sample_memory(
        facts=[
            {
                "id": "fact_export",
                "content": "User prefers concise responses.",
                "category": "preference",
                "confidence": 0.9,
                "createdAt": "2026-03-20T00:00:00Z",
                "source": "thread-1",
            }
        ]
    )

    with (
        patch("app.gateway.routers.memory.get_memory_config", return_value=_memory_config(provider="mem0")),
        patch(target, return_value=exported_memory) as get_memory,
    ):
        with TestClient(app) as client:
            response = getattr(client, method)(path, headers={"X-User-Id": "user-123"})

    assert response.status_code == 200
    assert response.json()["facts"] == exported_memory["facts"]
    get_memory.assert_called_once_with(user_id="user-123")


def test_mem0_status_route_forwards_user_id_header() -> None:
    app = FastAPI()
    app.include_router(memory.router)
    exported_memory = _sample_memory(
        facts=[
            {
                "id": "fact_status",
                "content": "User works on DeerFlow.",
                "category": "context",
                "confidence": 0.87,
                "createdAt": "2026-03-20T00:00:00Z",
                "source": "thread-1",
            }
        ]
    )

    with (
        patch("app.gateway.routers.memory.get_memory_config", return_value=_memory_config(provider="mem0")),
        patch("app.gateway.routers.memory.get_memory_data", return_value=exported_memory) as get_memory,
    ):
        with TestClient(app) as client:
            response = client.get("/api/memory/status", headers={"X-User-Id": "user-123"})

    assert response.status_code == 200
    assert response.json()["data"]["facts"] == exported_memory["facts"]
    get_memory.assert_called_once_with(user_id="user-123")


def test_mem0_get_memory_requires_user_id_header() -> None:
    app = FastAPI()
    app.include_router(memory.router)

    with patch("app.gateway.routers.memory.get_memory_config", return_value=_memory_config(provider="mem0")):
        with TestClient(app) as client:
            response = client.get("/api/memory")

    assert response.status_code == 400
    assert response.json()["detail"] == "X-User-Id header is required when memory.provider=mem0."


def test_mem0_clear_memory_route_forwards_user_id_header() -> None:
    app = FastAPI()
    app.include_router(memory.router)

    with (
        patch("app.gateway.routers.memory.get_memory_config", return_value=_memory_config(provider="mem0")),
        patch("app.gateway.routers.memory.clear_memory_data", return_value=_sample_memory()) as clear_memory,
    ):
        with TestClient(app) as client:
            response = client.delete("/api/memory", headers={"X-User-Id": "user-123"})

    assert response.status_code == 200
    clear_memory.assert_called_once_with(user_id="user-123")


def test_mem0_create_memory_fact_route_forwards_user_id_header() -> None:
    app = FastAPI()
    app.include_router(memory.router)

    with (
        patch("app.gateway.routers.memory.get_memory_config", return_value=_memory_config(provider="mem0")),
        patch("app.gateway.routers.memory.create_memory_fact", return_value=_sample_memory()) as create_fact,
    ):
        with TestClient(app) as client:
            response = client.post(
                "/api/memory/facts",
                headers={"X-User-Id": "user-123"},
                json={
                    "content": "User prefers concise code reviews.",
                    "category": "preference",
                    "confidence": 0.88,
                },
            )

    assert response.status_code == 200
    create_fact.assert_called_once_with(
        content="User prefers concise code reviews.",
        category="preference",
        confidence=0.88,
        user_id="user-123",
    )


def test_mem0_delete_memory_fact_route_forwards_user_id_header() -> None:
    app = FastAPI()
    app.include_router(memory.router)

    with (
        patch("app.gateway.routers.memory.get_memory_config", return_value=_memory_config(provider="mem0")),
        patch("app.gateway.routers.memory.delete_memory_fact", return_value=_sample_memory()) as delete_fact,
    ):
        with TestClient(app) as client:
            response = client.delete("/api/memory/facts/fact_delete", headers={"X-User-Id": "user-123"})

    assert response.status_code == 200
    delete_fact.assert_called_once_with("fact_delete", user_id="user-123")


def test_mem0_update_memory_fact_route_forwards_user_id_header() -> None:
    app = FastAPI()
    app.include_router(memory.router)

    with (
        patch("app.gateway.routers.memory.get_memory_config", return_value=_memory_config(provider="mem0")),
        patch("app.gateway.routers.memory.update_memory_fact", return_value=_sample_memory()) as update_fact,
    ):
        with TestClient(app) as client:
            response = client.patch(
                "/api/memory/facts/fact_edit",
                headers={"X-User-Id": "user-123"},
                json={
                    "content": "User prefers spaces",
                    "category": "workflow",
                    "confidence": 0.91,
                },
            )

    assert response.status_code == 200
    update_fact.assert_called_once_with(
        fact_id="fact_edit",
        content="User prefers spaces",
        category="workflow",
        confidence=0.91,
        user_id="user-123",
    )


def test_mem0_import_memory_route_forwards_user_id_header() -> None:
    app = FastAPI()
    app.include_router(memory.router)
    imported_memory = _sample_memory(
        facts=[
            {
                "id": "fact_import",
                "content": "User works on DeerFlow.",
                "category": "context",
                "confidence": 0.87,
                "createdAt": "2026-03-20T00:00:00Z",
                "source": "manual",
            }
        ]
    )
    expected_payload = memory.MemoryResponse(**imported_memory).model_dump()

    with (
        patch("app.gateway.routers.memory.get_memory_config", return_value=_memory_config(provider="mem0")),
        patch("app.gateway.routers.memory.import_memory_data", return_value=imported_memory) as import_memory,
    ):
        with TestClient(app) as client:
            response = client.post("/api/memory/import", headers={"X-User-Id": "user-123"}, json=imported_memory)

    assert response.status_code == 200
    import_memory.assert_called_once_with(expected_payload, user_id="user-123")
