"""Middleware for memory mechanism."""

import logging
from contextlib import nullcontext
from typing import override

from langchain.agents import AgentState
from langchain.agents.middleware import AgentMiddleware
from langgraph.config import get_config
from langgraph.runtime import Runtime
from langsmith.run_helpers import get_current_run_tree

from deerflow.agents.memory.message_processing import detect_correction, detect_reinforcement, filter_messages_for_memory
from deerflow.agents.memory.queue import get_memory_queue
from deerflow.config.memory_config import get_memory_config
from deerflow.tracing import memory_trace, trace_messages, trace_thread_data

logger = logging.getLogger(__name__)


class MemoryMiddlewareState(AgentState):
    """Compatible with the `ThreadState` schema."""

    pass


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

        def _trace_skip(skip_reason: str, *, inputs: dict | None = None) -> None:
            if config.provider != "mem0":
                return
            with memory_trace(
                "MemoryMiddleware.after_agent",
                thread_id=(runtime.context or {}).get("thread_id") if runtime.context else None,
                user_id=(runtime.context or {}).get("user_id") if runtime.context else None,
                tags=["memory", "mem0", "write", "middleware"],
                metadata={"queued": False, "skip_reason": skip_reason},
                inputs={"messages": [], "thread_data": trace_thread_data(thread_id=(runtime.context or {}).get("thread_id") if runtime.context else None, user_id=(runtime.context or {}).get("user_id") if runtime.context else None, **(inputs or {}))},
            ) as span:
                if span is not None and hasattr(span, "end"):
                    span.end(outputs={"messages": [], "thread_data": trace_thread_data(thread_id=(runtime.context or {}).get("thread_id") if runtime.context else None, user_id=(runtime.context or {}).get("user_id") if runtime.context else None, queued=False, skip_reason=skip_reason)})
        if not config.enabled or not getattr(config, "write_enabled", True):
            _trace_skip("memory_disabled")
            return None

        user_id = runtime.context.get("user_id") if runtime.context else None
        if user_id is None:
            config_data = get_config()
            user_id = config_data.get("configurable", {}).get("user_id")

        # Legacy file-backed memory is still global/per-agent only. Authenticated
        # users should not write into the shared file store.
        if config.provider == "file" and user_id:
            logger.debug("Skipping legacy file-backed memory update for authenticated user_id=%s", user_id)
            return None

        # Get thread ID from runtime context first, then fall back to LangGraph's configurable metadata
        thread_id = runtime.context.get("thread_id") if runtime.context else None
        if thread_id is None:
            config_data = get_config()
            thread_id = config_data.get("configurable", {}).get("thread_id")
        if not thread_id:
            logger.debug("No thread_id in context, skipping memory update")
            _trace_skip("missing_thread_id", inputs={"message_count": len(state.get("messages", []))})
            return None

        # Get messages from state
        messages = state.get("messages", [])
        if not messages:
            logger.debug("No messages in state, skipping memory update")
            _trace_skip("no_messages", inputs={"message_count": 0})
            return None

        # Filter to only keep user inputs and final assistant responses
        filtered_messages = filter_messages_for_memory(messages)

        # Only queue if there's meaningful conversation
        # At minimum need one user message and one assistant response
        user_messages = [m for m in filtered_messages if getattr(m, "type", None) == "human"]
        assistant_messages = [m for m in filtered_messages if getattr(m, "type", None) == "ai"]

        if not user_messages or not assistant_messages:
            _trace_skip(
                "no_meaningful_conversation",
                inputs={"messages": trace_messages(filtered_messages), "thread_data": trace_thread_data(thread_id=thread_id, user_id=user_id, message_count=len(messages), filtered_message_count=len(filtered_messages))},
            )
            return None

        # Queue the filtered conversation for memory update
        correction_detected = detect_correction(filtered_messages)
        reinforcement_detected = not correction_detected and detect_reinforcement(filtered_messages)
        queue = get_memory_queue()
        trace_parent = get_current_run_tree()
        trace_ctx = (
            memory_trace(
                "MemoryMiddleware.after_agent",
                thread_id=thread_id,
                user_id=user_id,
                tags=["memory", "mem0", "write", "middleware"],
                metadata={
                    "message_count": len(messages),
                    "filtered_message_count": len(filtered_messages),
                    "correction_detected": correction_detected,
                    "reinforcement_detected": reinforcement_detected,
                    "queued": True,
                },
                inputs={"messages": trace_messages(filtered_messages), "thread_data": trace_thread_data(thread_id=thread_id, user_id=user_id, message_count=len(messages), filtered_message_count=len(filtered_messages))},
            )
            if config.provider == "mem0"
            else nullcontext()
        )
        with trace_ctx as span:
            queue.add(
                thread_id=thread_id,
                user_id=user_id,
                messages=filtered_messages,
                agent_name=self._agent_name,
                correction_detected=correction_detected,
                reinforcement_detected=reinforcement_detected,
                trace_parent=trace_parent,
            )
            if span is not None and hasattr(span, "end"):
                span.end(
                    outputs={
                        "messages": trace_messages(filtered_messages),
                        "thread_data": trace_thread_data(thread_id=thread_id, user_id=user_id, queued=True, correction_detected=correction_detected, reinforcement_detected=reinforcement_detected),
                    }
                )

        return None
