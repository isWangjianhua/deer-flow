"""Inject user-scoped mem0 memories into the current model call."""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from typing import Any, override

from langchain.agents import AgentState
from langchain.agents.middleware import AgentMiddleware
from langchain.agents.middleware.types import ModelCallResult, ModelRequest, ModelResponse
from langchain_core.messages import SystemMessage
from langgraph.config import get_config

from deerflow.agents.memory.mem0_service import get_mem0_service
from deerflow.agents.memory.prompt import format_memory_for_injection
from deerflow.config.memory_config import get_memory_config

logger = logging.getLogger(__name__)


def _last_user_message_text(messages: list[Any]) -> str:
    for message in reversed(messages):
        msg_type = getattr(message, "type", None)
        if msg_type not in {"human", "user"}:
            continue
        content = getattr(message, "content", "")
        if isinstance(content, str) and content.strip():
            return content.strip()
        if isinstance(content, list):
            parts: list[str] = []
            for block in content:
                if isinstance(block, str):
                    parts.append(block)
                elif isinstance(block, dict):
                    text = block.get("text")
                    if isinstance(text, str):
                        parts.append(text)
            text = "\n".join(part.strip() for part in parts if part and part.strip()).strip()
            if text:
                return text
    return ""


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

        query = _last_user_message_text(request.messages)
        if not query:
            return None

        compat_memory = get_mem0_service().build_compat_memory_from_search(
            user_id=user_id,
            query=query,
            limit=config.search_limit,
        )
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
