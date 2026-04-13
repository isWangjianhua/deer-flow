"""Middleware for memory mechanism."""

import logging
import re
from typing import Any, override

from langchain.agents import AgentState
from langchain.agents.middleware import AgentMiddleware
from langchain_core.messages import HumanMessage
from langgraph.config import get_config
from langgraph.runtime import Runtime

from deerflow.agents.lead_agent.prompt import format_mem0_memories_for_injection
from deerflow.agents.memory.queue import get_memory_queue
from deerflow.agents.memory.storage import get_memory_storage
from deerflow.config.memory_config import get_memory_config

logger = logging.getLogger(__name__)

_UPLOAD_BLOCK_RE = re.compile(r"<uploaded_files>[\s\S]*?</uploaded_files>\n*", re.IGNORECASE)
_CORRECTION_PATTERNS = (
    re.compile(r"\bthat(?:'s| is) (?:wrong|incorrect)\b", re.IGNORECASE),
    re.compile(r"\byou misunderstood\b", re.IGNORECASE),
    re.compile(r"\btry again\b", re.IGNORECASE),
    re.compile(r"\bredo\b", re.IGNORECASE),
    re.compile(r"不对"),
    re.compile(r"你理解错了"),
    re.compile(r"你理解有误"),
    re.compile(r"重试"),
    re.compile(r"重新来"),
    re.compile(r"换一种"),
    re.compile(r"改用"),
)

_REINFORCEMENT_PATTERNS = (
    re.compile(r"\byes[,.]?\s+(?:exactly|perfect|that(?:'s| is) (?:right|correct|it))\b", re.IGNORECASE),
    re.compile(r"\bperfect(?:[.!?]|$)", re.IGNORECASE),
    re.compile(r"\bexactly\s+(?:right|correct)\b", re.IGNORECASE),
    re.compile(r"\bthat(?:'s| is)\s+(?:exactly\s+)?(?:right|correct|what i (?:wanted|needed|meant))\b", re.IGNORECASE),
    re.compile(r"\bkeep\s+(?:doing\s+)?that\b", re.IGNORECASE),
    re.compile(r"\bjust\s+(?:like\s+)?(?:that|this)\b", re.IGNORECASE),
    re.compile(r"\bthis is (?:great|helpful)\b(?:[.!?]|$)", re.IGNORECASE),
    re.compile(r"\bthis is what i wanted\b(?:[.!?]|$)", re.IGNORECASE),
    re.compile(r"对[，,]?\s*就是这样(?:[。！？!?.]|$)"),
    re.compile(r"完全正确(?:[。！？!?.]|$)"),
    re.compile(r"(?:对[，,]?\s*)?就是这个意思(?:[。！？!?.]|$)"),
    re.compile(r"正是我想要的(?:[。！？!?.]|$)"),
    re.compile(r"继续保持(?:[。！？!?.]|$)"),
)


class MemoryMiddlewareState(AgentState):
    """Compatible with the `ThreadState` schema."""

    pass


def _extract_message_text(message: Any) -> str:
    """Extract plain text from message content for filtering and signal detection."""
    content = getattr(message, "content", "")
    if isinstance(content, list):
        text_parts: list[str] = []
        for part in content:
            if isinstance(part, str):
                text_parts.append(part)
            elif isinstance(part, dict):
                text_val = part.get("text")
                if isinstance(text_val, str):
                    text_parts.append(text_val)
        return " ".join(text_parts)
    return str(content)


def _filter_messages_for_memory(messages: list[Any]) -> list[Any]:
    """Filter messages to keep only user inputs and final assistant responses.

    This filters out:
    - Tool messages (intermediate tool call results)
    - AI messages with tool_calls (intermediate steps, not final responses)
    - The <uploaded_files> block injected by UploadsMiddleware into human messages
      (file paths are session-scoped and must not persist in long-term memory).
      The user's actual question is preserved; only turns whose content is entirely
      the upload block (nothing remains after stripping) are dropped along with
      their paired assistant response.

    Only keeps:
    - Human messages (with the ephemeral upload block removed)
    - AI messages without tool_calls (final assistant responses), unless the
      paired human turn was upload-only and had no real user text.

    Args:
        messages: List of all conversation messages.

    Returns:
        Filtered list containing only user inputs and final assistant responses.
    """
    filtered = []
    skip_next_ai = False
    for msg in messages:
        msg_type = getattr(msg, "type", None)

        if msg_type == "human":
            content_str = _extract_message_text(msg)
            if "<uploaded_files>" in content_str:
                # Strip the ephemeral upload block; keep the user's real question.
                stripped = _UPLOAD_BLOCK_RE.sub("", content_str).strip()
                if not stripped:
                    # Nothing left — the entire turn was upload bookkeeping;
                    # skip it and the paired assistant response.
                    skip_next_ai = True
                    continue
                # Rebuild the message with cleaned content so the user's question
                # is still available for memory summarisation.
                from copy import copy

                clean_msg = copy(msg)
                clean_msg.content = stripped
                filtered.append(clean_msg)
                skip_next_ai = False
            else:
                filtered.append(msg)
                skip_next_ai = False
        elif msg_type == "ai":
            tool_calls = getattr(msg, "tool_calls", None)
            if not tool_calls:
                if skip_next_ai:
                    skip_next_ai = False
                    continue
                filtered.append(msg)
        # Skip tool messages and AI messages with tool_calls

    return filtered


def _last_message_is_memory_context(messages: list[Any]) -> bool:
    if not messages:
        return False
    last = messages[-1]
    return getattr(last, "type", None) == "human" and getattr(last, "name", None) == "memory_context"


def _build_memory_query(messages: list[Any]) -> str:
    """Build a retrieval query from the latest user-authored message."""
    for msg in reversed(messages):
        if getattr(msg, "type", None) != "human":
            continue
        if getattr(msg, "name", None) == "memory_context":
            continue
        content = _UPLOAD_BLOCK_RE.sub("", _extract_message_text(msg)).strip()
        if content:
            return content
    return ""


def _build_memory_injection_message(memory_block: str) -> HumanMessage:
    return HumanMessage(
        name="memory_context",
        content=(
            "<system_reminder>\n"
            "Relevant long-term memory for this user:\n"
            "<memory>\n"
            f"{memory_block}\n"
            "</memory>\n"
            "Use this context only when it is relevant to the current request.\n"
            "</system_reminder>"
        ),
    )


def detect_correction(messages: list[Any]) -> bool:
    """Detect explicit user corrections in recent conversation turns.

    The queue keeps only one pending context per thread, so callers pass the
    latest filtered message list. Checking only recent user turns keeps signal
    detection conservative while avoiding stale corrections from long histories.
    """
    recent_user_msgs = [msg for msg in messages[-6:] if getattr(msg, "type", None) == "human"]

    for msg in recent_user_msgs:
        content = _extract_message_text(msg).strip()
        if not content:
            continue
        if any(pattern.search(content) for pattern in _CORRECTION_PATTERNS):
            return True

    return False


def detect_reinforcement(messages: list[Any]) -> bool:
    """Detect explicit positive reinforcement signals in recent conversation turns.

    Complements detect_correction() by identifying when the user confirms the
    agent's approach was correct. This allows the memory system to record what
    worked well, not just what went wrong.

    The queue keeps only one pending context per thread, so callers pass the
    latest filtered message list. Checking only recent user turns keeps signal
    detection conservative while avoiding stale signals from long histories.
    """
    recent_user_msgs = [msg for msg in messages[-6:] if getattr(msg, "type", None) == "human"]

    for msg in recent_user_msgs:
        content = _extract_message_text(msg).strip()
        if not content:
            continue
        if any(pattern.search(content) for pattern in _REINFORCEMENT_PATTERNS):
            return True

    return False


class MemoryMiddleware(AgentMiddleware[MemoryMiddlewareState]):
    """Middleware that queues conversation for memory update after agent execution.

    This middleware:
    1. After each agent execution, queues the conversation for memory update
    2. Only includes user inputs and final assistant responses (ignores tool calls)
    3. The queue uses debouncing to batch multiple updates together
    4. Memory is updated asynchronously via LLM summarization
    """

    state_schema = MemoryMiddlewareState

    def __init__(self, agent_name: str | None = None):
        """Initialize the MemoryMiddleware.

        Args:
            agent_name: If provided, memory is stored per-agent. If None, uses global memory.
        """
        super().__init__()
        self._agent_name = agent_name

    def _resolve_user_id(self, runtime: Runtime) -> str | None:
        user_id = runtime.context.get("user_id") if runtime.context else None
        if user_id:
            return user_id
        config_data = get_config()
        return config_data.get("configurable", {}).get("user_id")

    def _should_inject_mem0(self) -> bool:
        config = get_memory_config()
        return config.enabled and config.injection_enabled and config.provider == "mem0"

    def _inject_mem0_context(self, messages: list[Any], user_id: str) -> dict[str, Any] | None:
        if _last_message_is_memory_context(messages):
            return None

        query = _build_memory_query(messages)
        if not query:
            return None

        storage = get_memory_storage()
        if not hasattr(storage, "search"):
            return None

        config = get_memory_config()
        results = storage.search(query=query, user_id=user_id, limit=config.mem0_search_limit)
        memory_block = format_mem0_memories_for_injection(results, max_tokens=config.max_injection_tokens)
        if not memory_block:
            return None
        return {"messages": [_build_memory_injection_message(memory_block)]}

    async def _ainject_mem0_context(self, messages: list[Any], user_id: str) -> dict[str, Any] | None:
        if _last_message_is_memory_context(messages):
            return None

        query = _build_memory_query(messages)
        if not query:
            return None

        storage = get_memory_storage()
        if not hasattr(storage, "asearch"):
            return self._inject_mem0_context(messages, user_id)

        config = get_memory_config()
        results = await storage.asearch(query=query, user_id=user_id, limit=config.mem0_search_limit)
        memory_block = format_mem0_memories_for_injection(results, max_tokens=config.max_injection_tokens)
        if not memory_block:
            return None
        return {"messages": [_build_memory_injection_message(memory_block)]}

    @override
    def before_model(self, state: MemoryMiddlewareState, runtime: Runtime) -> dict | None:
        if not self._should_inject_mem0():
            return None

        user_id = self._resolve_user_id(runtime)
        if not user_id:
            return None

        messages = state.get("messages", [])
        if not messages:
            return None

        return self._inject_mem0_context(messages, user_id)

    @override
    async def abefore_model(self, state: MemoryMiddlewareState, runtime: Runtime) -> dict | None:
        if not self._should_inject_mem0():
            return None

        user_id = self._resolve_user_id(runtime)
        if not user_id:
            return None

        messages = state.get("messages", [])
        if not messages:
            return None

        return await self._ainject_mem0_context(messages, user_id)

    @override
    def after_agent(self, state: MemoryMiddlewareState, runtime: Runtime) -> dict | None:
        """Queue conversation for memory update after agent completes.

        Args:
            state: The current agent state.
            runtime: The runtime context.

        Returns:
            None (no state changes needed from this middleware).
        """
        config = get_memory_config()
        if not config.enabled:
            return None

        # Get thread ID from runtime context first, then fall back to LangGraph's configurable metadata
        thread_id = runtime.context.get("thread_id") if runtime.context else None
        user_id = runtime.context.get("user_id") if runtime.context else None
        if thread_id is None:
            config_data = get_config()
            thread_id = config_data.get("configurable", {}).get("thread_id")
            user_id = user_id or config_data.get("configurable", {}).get("user_id")
        if not thread_id:
            logger.debug("No thread_id in context, skipping memory update")
            return None

        # Get messages from state
        messages = state.get("messages", [])
        if not messages:
            logger.debug("No messages in state, skipping memory update")
            return None

        # Filter to only keep user inputs and final assistant responses
        filtered_messages = _filter_messages_for_memory(messages)

        # Only queue if there's meaningful conversation
        # At minimum need one user message and one assistant response
        user_messages = [m for m in filtered_messages if getattr(m, "type", None) == "human"]
        assistant_messages = [m for m in filtered_messages if getattr(m, "type", None) == "ai"]

        if not user_messages or not assistant_messages:
            return None

        # Queue the filtered conversation for memory update
        correction_detected = detect_correction(filtered_messages)
        reinforcement_detected = not correction_detected and detect_reinforcement(filtered_messages)
        queue = get_memory_queue()
        queue.add(
            thread_id=thread_id,
            user_id=user_id,
            messages=filtered_messages,
            agent_name=self._agent_name,
            correction_detected=correction_detected,
            reinforcement_detected=reinforcement_detected,
        )

        return None
