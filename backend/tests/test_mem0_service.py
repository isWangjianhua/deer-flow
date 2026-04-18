import sys
from types import SimpleNamespace

from deerflow.agents.memory.mem0_service import Mem0Service
from deerflow.agents.memory.prompt import MEM0_CUSTOM_INSTRUCTIONS
from deerflow.config.memory_config import MemoryConfig, get_memory_config, set_memory_config


class _FakeMem0Client:
    def __init__(self):
        self.add_calls = []
        self.search_calls = []
        self.get_all_calls = []

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

    def get_all(self, **kwargs):
        self.get_all_calls.append(kwargs)
        return {
            "results": [
                {
                    "id": "mem_profile",
                    "memory": "User prefers concise reviews",
                    "score": 0.87,
                    "metadata": {"category": "preference", "source": "thread_profile"},
                    "created_at": "2026-04-02T10:00:00Z",
                }
            ]
        }


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


def test_add_conversation_traces_mem0_sdk_boundary(monkeypatch):
    service = Mem0Service()
    fake = _FakeMem0Client()
    service._client = fake
    traced = []
    outputs = []

    class _Span:
        def __enter__(self):
            traced.append(True)
            return self

        def end(self, *, outputs=None):
            outputs_list.append(outputs)

        def __exit__(self, exc_type, exc, tb):
            return False

    outputs_list = outputs
    monkeypatch.setattr("deerflow.agents.memory.mem0_service.memory_trace", lambda *args, **kwargs: _Span())

    class _Message:
        type = "human"
        content = "remember this"

    service.add_conversation(messages=[_Message()], user_id="user_a", run_id="thread_a", metadata={"source": "thread_a"})

    assert traced == [True]
    assert outputs[0]["thread_data"]["accepted"] is True
    assert outputs[0]["thread_data"]["payload_count"] == 1
    assert outputs[0]["thread_data"]["persisted_count"] == 0
    assert outputs[0]["thread_data"]["result_source"] == "provider_ack_only"
    assert outputs[0]["messages"][0]["content"] == "Mem0 accepted the conversation write, but did not return extracted memory items."


def test_search_uses_user_filter_and_top_k():
    service = Mem0Service()
    fake = _FakeMem0Client()
    service._client = fake

    service.search(query="python", user_id="user_a", limit=3)

    assert fake.search_calls[0]["query"] == "python"
    assert fake.search_calls[0]["top_k"] == 3
    assert fake.search_calls[0]["filters"] == {"user_id": "user_a"}


def test_get_all_uses_user_filter_and_max_facts_limit():
    service = Mem0Service()
    fake = _FakeMem0Client()
    service._client = fake

    memories = service.get_all(user_id="user_a")

    assert fake.get_all_calls[0]["filters"] == {"user_id": "user_a"}
    assert fake.get_all_calls[0]["top_k"] == get_memory_config().max_facts
    assert memories[0]["memory"] == "User prefers concise reviews"


def test_ensure_client_injects_supported_custom_instructions(monkeypatch):
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

    custom_instructions = captured["config"]["custom_instructions"]
    assert custom_instructions == MEM0_CUSTOM_INSTRUCTIONS
