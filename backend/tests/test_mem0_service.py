from deerflow.agents.memory.mem0_service import Mem0Service


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
