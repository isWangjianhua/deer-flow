from unittest.mock import MagicMock

from langchain_core.messages import HumanMessage

from deerflow.config.memory_config import MemoryConfig


def test_memory_config_exposes_mem0_retrieval_policy_defaults():
    config = MemoryConfig(provider="mem0")

    assert config.profile_limit == 4
    assert config.query_window_turns == 3
    assert config.profile_budget_ratio == 0.3
    assert config.profile_categories == ["preference", "context", "knowledge"]


def test_build_mem0_injection_memory_returns_none_for_cold_start(monkeypatch):
    from deerflow.agents.memory.memory_retrieval import build_mem0_injection_memory

    service = MagicMock()
    service.get_all.return_value = []
    service.search.return_value = []

    monkeypatch.setattr(
        "deerflow.agents.memory.memory_retrieval.get_mem0_service",
        lambda: service,
    )
    monkeypatch.setattr(
        "deerflow.agents.memory.memory_retrieval.get_memory_config",
        lambda: MemoryConfig(provider="mem0"),
    )

    result = build_mem0_injection_memory(
        user_id="user-123",
        messages=[HumanMessage(content="hello")],
    )

    assert result is None


def test_build_mem0_injection_memory_merges_profile_and_first_turn_results(monkeypatch):
    from deerflow.agents.memory.memory_retrieval import build_mem0_injection_memory

    service = MagicMock()
    service.get_all.return_value = [
        {
            "id": "p1",
            "memory": "User works in semiconductor sourcing",
            "score": 0.91,
            "metadata": {"category": "context"},
            "created_at": "2026-04-01T10:00:00Z",
        },
    ]
    service.search.return_value = [
        {
            "id": "q1",
            "memory": "User is looking for Tianjin machining suppliers",
            "score": 0.95,
            "metadata": {"category": "goal"},
            "created_at": "2026-04-01T11:00:00Z",
        },
    ]

    monkeypatch.setattr(
        "deerflow.agents.memory.memory_retrieval.get_mem0_service",
        lambda: service,
    )
    monkeypatch.setattr(
        "deerflow.agents.memory.memory_retrieval.get_memory_config",
        lambda: MemoryConfig(provider="mem0"),
    )

    result = build_mem0_injection_memory(
        user_id="user-123",
        messages=[HumanMessage(content="Need Tianjin machining suppliers")],
    )

    facts = result["facts"]
    assert {fact["content"] for fact in facts} == {
        "User works in semiconductor sourcing",
        "User is looking for Tianjin machining suppliers",
    }


def test_build_mem0_injection_memory_uses_recent_window_for_multiturn(monkeypatch):
    from deerflow.agents.memory.memory_retrieval import build_mem0_injection_memory

    service = MagicMock()
    service.get_all.return_value = []
    service.search.return_value = []

    monkeypatch.setattr(
        "deerflow.agents.memory.memory_retrieval.get_mem0_service",
        lambda: service,
    )
    monkeypatch.setattr(
        "deerflow.agents.memory.memory_retrieval.get_memory_config",
        lambda: MemoryConfig(provider="mem0", query_window_turns=2),
    )

    build_mem0_injection_memory(
        user_id="user-123",
        messages=[
            HumanMessage(content="First turn"),
            HumanMessage(content="Second turn"),
            HumanMessage(content="Third turn"),
        ],
    )

    service.search.assert_called_once_with(
        query="Second turn\n\nThird turn",
        user_id="user-123",
        limit=8,
    )


def test_memory_package_exports_mem0_retrieval_policy():
    from deerflow.agents import memory as memory_pkg

    assert hasattr(memory_pkg, "build_mem0_injection_memory")
