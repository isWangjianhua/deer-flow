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
        self.deleted = []

    def add(self, **kwargs):
        self.add_calls.append(kwargs)
        return {"ok": True}

    def search(self, **kwargs):
        return [
            {
                "id": "mem_a",
                "memory": "User likes Python",
                "score": 0.92,
                "metadata": {"category": "preference", "thread_id": "thread_a"},
                "created_at": "2026-04-01T10:00:00Z",
            }
        ]

    def get_all(self, **kwargs):
        return [
            {
                "id": "mem_b",
                "memory": "User works on DeerFlow",
                "score": 0.88,
                "metadata": {"category": "context", "thread_id": "thread_b"},
                "created_at": "2026-04-01T11:00:00Z",
            }
        ]

    def delete(self, **kwargs):
        self.deleted.append(kwargs)

    def delete_all(self, **kwargs):
        self.deleted.append(kwargs)


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


def test_ensure_client_keeps_explicit_mem0_prompt_overrides(monkeypatch):
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
                "custom_fact_extraction_prompt": "fact override",
                "custom_update_memory_prompt": "update override",
            },
        )
    )
    monkeypatch.setitem(sys.modules, "mem0", SimpleNamespace(Memory=_FakeMemory))

    try:
        service = Mem0Service()
        service._ensure_client()
    finally:
        set_memory_config(original_config)

    assert captured["config"]["custom_fact_extraction_prompt"] == "fact override"
    assert captured["config"]["custom_update_memory_prompt"] == "update override"


def test_mem0_fact_extraction_prompt_keeps_original_fact_extraction_guidance():
    assert "Categories:" in MEM0_FACT_EXTRACTION_PROMPT
    assert "preference|knowledge|context|behavior|goal" in MEM0_FACT_EXTRACTION_PROMPT
    assert "confidence" in MEM0_FACT_EXTRACTION_PROMPT.lower()


def test_mem0_update_prompt_keeps_original_memory_update_guidance():
    assert "specific metrics, version numbers, and proper nouns" in MEM0_UPDATE_MEMORY_PROMPT
    assert "future interactions" in MEM0_UPDATE_MEMORY_PROMPT
    assert "Do NOT record file upload events" in MEM0_UPDATE_MEMORY_PROMPT
