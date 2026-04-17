import sys
from types import SimpleNamespace

from deerflow.agents.memory.mem0_service import Mem0Service
from deerflow.agents.memory.prompt import (
    MEM0_FACT_EXTRACTION_PROMPT,
    MEM0_UPDATE_MEMORY_PROMPT,
)
from deerflow.config.memory_config import MemoryConfig, get_memory_config, set_memory_config


class _FakeMem0Client:
    def __init__(self):
        self.add_calls = []
        self.search_calls = []

    def add(self, **kwargs):
        self.add_calls.append(kwargs)
        return {"ok": True}

    def search(self, **kwargs):
        self.search_calls.append(kwargs)
        return [
            {
                "id": "mem_a",
                "memory": "User likes Python",
                "score": 0.92,
                "metadata": {"category": "preference", "thread_id": "thread_a"},
                "created_at": "2026-04-01T10:00:00Z",
            }
        ]


def test_build_compat_memory_from_search_maps_memories_to_facts():
    service = Mem0Service()
    service._client = _FakeMem0Client()

    memory = service.build_compat_memory_from_search(user_id="user_a", query="python")

    assert memory["facts"][0]["id"] == "mem_a"
    assert memory["facts"][0]["content"] == "User likes Python"
    assert memory["facts"][0]["category"] == "preference"
    assert memory["facts"][0]["source"] == "thread_a"


def test_add_conversation_sends_user_id_and_run_id():
    service = Mem0Service()
    fake = _FakeMem0Client()
    service._client = fake

    class _Message:
        type = "human"
        content = "remember this"

    service.add_conversation(messages=[_Message()], user_id="user_a", run_id="thread_a", metadata={"source": "thread_a"})

    assert fake.add_calls[0]["user_id"] == "user_a"
    assert fake.add_calls[0]["run_id"] == "thread_a"
    assert fake.add_calls[0]["messages"] == [{"role": "user", "content": "remember this"}]


def test_search_uses_user_filter_and_limit():
    service = Mem0Service()
    fake = _FakeMem0Client()
    service._client = fake

    service.search(query="python", user_id="user_a", limit=3)

    assert fake.search_calls[0]["query"] == "python"
    assert fake.search_calls[0]["limit"] == 3
    assert fake.search_calls[0]["filters"] == {"user_id": "user_a"}


def test_ensure_client_injects_default_mem0_prompts(monkeypatch):
    captured = {}

    class _FakeMemory:
        @classmethod
        def from_config(cls, config):
            captured["config"] = config
            return _FakeMem0Client()

    original_config = get_memory_config()
    set_memory_config(
        MemoryConfig(
            provider="mem0",
            mem0={
                "vector_store": {"provider": "qdrant", "config": {}},
                "llm": {"provider": "openai", "config": {}},
                "embedder": {"provider": "openai", "config": {}},
            },
        )
    )
    monkeypatch.setitem(sys.modules, "mem0", SimpleNamespace(Memory=_FakeMemory))

    try:
        service = Mem0Service()
        service._ensure_client()
    finally:
        set_memory_config(original_config)

    assert captured["config"]["custom_fact_extraction_prompt"] == MEM0_FACT_EXTRACTION_PROMPT
    assert captured["config"]["custom_update_memory_prompt"] == MEM0_UPDATE_MEMORY_PROMPT
