"""Inject user-scoped mem0 memories into the current model call."""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from typing import override

from langchain.agents import AgentState
from langchain.agents.middleware import AgentMiddleware
from langchain.agents.middleware.types import ModelCallResult, ModelRequest, ModelResponse
from langchain_core.messages import SystemMessage
from langgraph.config import get_config
from langgraph.runtime import Runtime
from langsmith.run_helpers import get_current_run_tree

from deerflow.agents.memory.memory_retrieval import build_mem0_injection_memory
from deerflow.agents.memory.prompt import _count_tokens, format_memory_for_injection
from deerflow.config.memory_config import get_memory_config
from deerflow.tracing import memory_trace, trace_messages, trace_thread_data

logger = logging.getLogger(__name__)


class Mem0InjectionMiddleware(AgentMiddleware[AgentState]):
    def __init__(self) -> None:
        super().__init__()
        self._pending_parents: dict[str, object | None] = {}

    def _span_key(self, *, thread_id: str | None, user_id: str | None) -> str:
        return thread_id or f"user:{user_id or 'anonymous'}"

    @override
    def before_model(self, state: AgentState, runtime: Runtime) -> dict | None:
        context = runtime.context or {}
        thread_id = context.get("thread_id")
        user_id = context.get("user_id")
        if user_id is None:
            config = get_config()
            user_id = config.get("configurable", {}).get("user_id")
        if thread_id is None:
            config = get_config()
            thread_id = config.get("configurable", {}).get("thread_id")
        self._pending_parents[self._span_key(thread_id=thread_id, user_id=user_id)] = get_current_run_tree()
        return None

    @override
    async def abefore_model(self, state: AgentState, runtime: Runtime) -> dict | None:
        return self.before_model(state, runtime)

    def _take_before_model_parent(self, *, thread_id: str | None, user_id: str | None) -> object | None:
        return self._pending_parents.pop(self._span_key(thread_id=thread_id, user_id=user_id), None)

    def _build_injection_message(self, request: ModelRequest) -> SystemMessage | None:
        config = get_memory_config()
        config_data = get_config()
        configurable = config_data.get("configurable", {})
        user_id = configurable.get("user_id")
        thread_id = configurable.get("thread_id")
        trace_parent = self._take_before_model_parent(thread_id=thread_id, user_id=user_id)

        with memory_trace(
            "Mem0InjectionMiddleware.inject_memory",
            thread_id=thread_id,
            user_id=user_id,
            tags=["memory", "mem0", "injection", "middleware"],
            metadata={"input_message_count": len(request.messages)},
            inputs={
                "messages": trace_messages(request.messages),
                "thread_data": trace_thread_data(thread_id=thread_id, user_id=user_id, input_message_count=len(request.messages)),
            },
            parent=trace_parent,
        ) as span:
            if not config.enabled:
                if span is not None and hasattr(span, "end"):
                    span.end(outputs={"messages": [], "thread_data": trace_thread_data(thread_id=thread_id, user_id=user_id, injected=False, skip_reason="memory_disabled")})
                return None
            if not config.injection_enabled:
                if span is not None and hasattr(span, "end"):
                    span.end(outputs={"messages": [], "thread_data": trace_thread_data(thread_id=thread_id, user_id=user_id, injected=False, skip_reason="injection_disabled")})
                return None
            if config.provider != "mem0":
                if span is not None and hasattr(span, "end"):
                    span.end(outputs={"messages": [], "thread_data": trace_thread_data(thread_id=thread_id, user_id=user_id, injected=False, skip_reason="provider_not_mem0")})
                return None
            if not user_id:
                if span is not None and hasattr(span, "end"):
                    span.end(outputs={"messages": [], "thread_data": trace_thread_data(thread_id=thread_id, user_id=user_id, injected=False, skip_reason="missing_user_id")})
                return None

            compat_memory = build_mem0_injection_memory(
                user_id=user_id,
                messages=request.messages,
                thread_id=thread_id,
                trace_parent=span,
            )
            if compat_memory is None:
                if span is not None and hasattr(span, "end"):
                    span.end(outputs={"messages": [], "thread_data": trace_thread_data(thread_id=thread_id, user_id=user_id, injected=False, facts_count=0, formatted_tokens_estimate=0, skip_reason="no_memory")})
                return None

            memory_content = format_memory_for_injection(compat_memory, max_tokens=config.max_injection_tokens)
            if not memory_content.strip():
                if span is not None and hasattr(span, "end"):
                    span.end(outputs={
                        "messages": [{"type": "system", "content": f"<memory>\n{memory_content}\n</memory>"}],
                        "thread_data": trace_thread_data(thread_id=thread_id, user_id=user_id, injected=False, facts_count=len(compat_memory.get("facts", [])), formatted_tokens_estimate=_count_tokens(memory_content), skip_reason="empty_injection_content"),
                    })
                return None

            if span is not None and hasattr(span, "end"):
                span.end(outputs={
                    "messages": [{"type": "system", "content": f"<memory>\n{memory_content}\n</memory>"}],
                    "thread_data": trace_thread_data(thread_id=thread_id, user_id=user_id, injected=True, facts_count=len(compat_memory.get("facts", [])), formatted_tokens_estimate=_count_tokens(memory_content)),
                })
            return SystemMessage(content=f"<memory>\n{memory_content}\n</memory>")

    @override
    def wrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], ModelResponse],
    ) -> ModelCallResult:
        injection = self._build_injection_message(request)
        if injection is not None:
            request = request.override(messages=[injection, *request.messages])
        return handler(request)

    @override
    async def awrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], Awaitable[ModelResponse]],
    ) -> ModelCallResult:
        injection = self._build_injection_message(request)
        if injection is not None:
            request = request.override(messages=[injection, *request.messages])
        return await handler(request)
