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
from deerflow.agents.memory.prompt import format_memory_for_injection
from deerflow.config.memory_config import get_memory_config

logger = logging.getLogger(__name__)

class Mem0InjectionMiddleware(AgentMiddleware[AgentState]):
    def _build_injection_message(self, request: ModelRequest) -> SystemMessage | None:
        config = get_memory_config()
        if not config.enabled or not config.injection_enabled or config.provider != "mem0":
            return None

        config_data = get_config()
        configurable = config_data.get("configurable", {})
        user_id = configurable.get("user_id")
        if not user_id:
            return None

        compat_memory = build_mem0_injection_memory(
            user_id=user_id,
            messages=request.messages,
        )
        if compat_memory is None:
            return None
        memory_content = format_memory_for_injection(compat_memory, max_tokens=config.max_injection_tokens)
        if not memory_content.strip():
            return None

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
