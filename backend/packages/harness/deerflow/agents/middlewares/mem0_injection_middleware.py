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

from deerflow.agents.memory.memory_retrieval import build_mem0_injection_memory
from deerflow.agents.memory.prompt import _count_tokens, format_memory_for_injection
from deerflow.config.memory_config import get_memory_config
from deerflow.tracing import memory_trace

logger = logging.getLogger(__name__)

class Mem0InjectionMiddleware(AgentMiddleware[AgentState]):
    def _build_injection_message(self, request: ModelRequest) -> SystemMessage | None:
        config = get_memory_config()
        config_data = get_config()
        configurable = config_data.get("configurable", {})
        user_id = configurable.get("user_id")
        thread_id = configurable.get("thread_id")

        with memory_trace(
            "memory.mem0.middleware.injection",
            thread_id=thread_id,
            user_id=user_id,
            tags=["memory", "mem0", "injection", "middleware"],
            metadata={"input_message_count": len(request.messages)},
            inputs={"input_message_count": len(request.messages)},
        ) as span:
            if not config.enabled:
                if span is not None and hasattr(span, "end"):
                    span.end(outputs={"injected": False, "skip_reason": "memory_disabled"})
                return None
            if not config.injection_enabled:
                if span is not None and hasattr(span, "end"):
                    span.end(outputs={"injected": False, "skip_reason": "injection_disabled"})
                return None
            if config.provider != "mem0":
                if span is not None and hasattr(span, "end"):
                    span.end(outputs={"injected": False, "skip_reason": "provider_not_mem0"})
                return None
            if not user_id:
                if span is not None and hasattr(span, "end"):
                    span.end(outputs={"injected": False, "skip_reason": "missing_user_id"})
                return None

            compat_memory = build_mem0_injection_memory(
                user_id=user_id,
                messages=request.messages,
                thread_id=thread_id,
            )
            if compat_memory is None:
                if span is not None and hasattr(span, "metadata"):
                    span.metadata["facts_count"] = 0
                    span.metadata["injected"] = False
                    span.metadata["skip_reason"] = "no_memory"
                if span is not None and hasattr(span, "end"):
                    span.end(outputs={"injected": False, "facts_count": 0, "formatted_tokens_estimate": 0, "skip_reason": "no_memory", "full_memory_message": ""})
                return None
            memory_content = format_memory_for_injection(compat_memory, max_tokens=config.max_injection_tokens)
            if span is not None and hasattr(span, "metadata"):
                span.metadata["facts_count"] = len(compat_memory.get("facts", []))
                span.metadata["formatted_tokens_estimate"] = _count_tokens(memory_content)
            if not memory_content.strip():
                if span is not None and hasattr(span, "metadata"):
                    span.metadata["injected"] = False
                if span is not None and hasattr(span, "end"):
                    span.end(outputs={"injected": False, "facts_count": len(compat_memory.get("facts", [])), "formatted_tokens_estimate": _count_tokens(memory_content), "skip_reason": "empty_injection_content", "full_memory_message": f"<memory>\n{memory_content}\n</memory>", "full_request_messages_before_injection": [getattr(m, "content", "") for m in request.messages]})
                return None

            if span is not None and hasattr(span, "metadata"):
                span.metadata["injected"] = True
            if span is not None and hasattr(span, "end"):
                span.end(outputs={"injected": True, "facts_count": len(compat_memory.get("facts", [])), "formatted_tokens_estimate": _count_tokens(memory_content), "full_memory_message": f"<memory>\n{memory_content}\n</memory>", "full_request_messages_before_injection": [getattr(m, "content", "") for m in request.messages]})
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
