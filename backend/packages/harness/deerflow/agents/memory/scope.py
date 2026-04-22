from deerflow.config.agents_config import AGENT_NAME_PATTERN


LEAD_MEMORY_AGENT_ID = "__lead__"


def resolve_memory_agent_id(*, agent_name: str | None = None, agent_id: str | None = None) -> str:
    raw = agent_id if agent_id is not None else agent_name
    if raw is None or not str(raw).strip():
        return LEAD_MEMORY_AGENT_ID

    normalized = str(raw).strip().lower()
    if normalized != LEAD_MEMORY_AGENT_ID and not AGENT_NAME_PATTERN.match(normalized):
        raise ValueError(f"Invalid memory agent identifier: {raw!r}")
    return normalized
