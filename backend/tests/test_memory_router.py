from types import SimpleNamespace
from unittest.mock import patch

import pytest
from fastapi import HTTPException

import app.gateway.routers.memory as memory


def _sample_memory(facts: list[dict] | None = None) -> dict:
    return {
        "version": "1.0",
        "lastUpdated": "2026-04-01T12:00:00Z",
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


@pytest.mark.anyio
async def test_get_memory_uses_current_user_scope() -> None:
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

    with patch("app.gateway.routers.memory.get_memory_data", return_value=exported_memory) as get_memory_data:
        response = await memory.get_memory(user=SimpleNamespace(id="user_a"))

    get_memory_data.assert_called_once_with(user_id="user_a")
    assert response.facts[0].id == "fact_export"


@pytest.mark.anyio
async def test_import_memory_passes_current_user_id() -> None:
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

    request = memory.MemoryResponse(**imported_memory)
    with patch("app.gateway.routers.memory.import_memory_data", return_value=imported_memory) as import_memory_data:
        response = await memory.import_memory(request, user=SimpleNamespace(id="user_a"))

    import_memory_data.assert_called_once_with(imported_memory, user_id="user_a")
    assert response.facts[0].id == "fact_import"


@pytest.mark.anyio
async def test_clear_memory_passes_current_user_id() -> None:
    with patch("app.gateway.routers.memory.clear_memory_data", return_value=_sample_memory()) as clear_memory_data:
        response = await memory.clear_memory(user=SimpleNamespace(id="user_a"))

    clear_memory_data.assert_called_once_with(user_id="user_a")
    assert response.facts == []


@pytest.mark.anyio
async def test_create_memory_fact_route_returns_updated_memory() -> None:
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

    request = memory.FactCreateRequest(
        content="User prefers concise code reviews.",
        category="preference",
        confidence=0.88,
    )
    with patch("app.gateway.routers.memory.create_memory_fact", return_value=updated_memory) as create_memory_fact:
        response = await memory.create_memory_fact_endpoint(request, user=SimpleNamespace(id="user_a"))

    create_memory_fact.assert_called_once_with(
        content="User prefers concise code reviews.",
        category="preference",
        confidence=0.88,
        user_id="user_a",
    )
    assert response.facts[0].id == "fact_new"


@pytest.mark.anyio
async def test_delete_memory_fact_route_returns_404_for_missing_fact() -> None:
    with patch("app.gateway.routers.memory.delete_memory_fact", side_effect=KeyError("fact_missing")):
        with pytest.raises(HTTPException) as exc_info:
            await memory.delete_memory_fact_endpoint("fact_missing", user=SimpleNamespace(id="user_a"))

    assert exc_info.value.status_code == 404
    assert exc_info.value.detail == "Memory fact 'fact_missing' not found."


@pytest.mark.anyio
async def test_update_memory_fact_route_preserves_omitted_fields() -> None:
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

    request = memory.FactPatchRequest(content="User prefers spaces")
    with patch("app.gateway.routers.memory.update_memory_fact", return_value=updated_memory) as update_fact:
        response = await memory.update_memory_fact_endpoint("fact_edit", request, user=SimpleNamespace(id="user_a"))

    update_fact.assert_called_once_with(
        fact_id="fact_edit",
        content="User prefers spaces",
        category=None,
        confidence=None,
        user_id="user_a",
    )
    assert response.facts[0].id == "fact_edit"
