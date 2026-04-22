from deerflow.agents.memory.scope import LEAD_MEMORY_AGENT_ID, resolve_memory_agent_id


def test_resolve_memory_agent_id_defaults_to_lead_scope() -> None:
    assert resolve_memory_agent_id(agent_name=None) == LEAD_MEMORY_AGENT_ID
    assert resolve_memory_agent_id(agent_name="") == LEAD_MEMORY_AGENT_ID


def test_resolve_memory_agent_id_normalizes_custom_agent_names() -> None:
    assert resolve_memory_agent_id(agent_name="Code-Test") == "code-test"
