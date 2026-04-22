"""Memory updater for reading, writing, and updating memory data."""

import asyncio
import atexit
import concurrent.futures
import json
import logging
import math
import re
import uuid
from collections.abc import Awaitable
from typing import Any

from deerflow.agents.memory.mem0_service import get_mem0_service
from deerflow.agents.memory.prompt import (
    MEMORY_UPDATE_PROMPT,
    _count_tokens,
    format_conversation_for_update,
)
from deerflow.agents.memory.scope import resolve_memory_agent_id
from deerflow.agents.memory.storage import (
    create_empty_memory,
    get_memory_storage,
    utc_now_iso_z,
)
from deerflow.config.memory_config import get_memory_config
from deerflow.models import create_chat_model
from deerflow.tracing import memory_trace, trace_messages, trace_thread_data

logger = logging.getLogger(__name__)

_MEM0_WRITE_TOKEN_BUDGET = 3000

_SYNC_MEMORY_UPDATER_EXECUTOR = concurrent.futures.ThreadPoolExecutor(
    max_workers=4,
    thread_name_prefix="memory-updater-sync",
)
atexit.register(lambda: _SYNC_MEMORY_UPDATER_EXECUTOR.shutdown(wait=False))


def _create_empty_memory() -> dict[str, Any]:
    """Backward-compatible wrapper around the storage-layer empty-memory factory."""
    return create_empty_memory()


def _save_memory_to_file(memory_data: dict[str, Any], agent_name: str | None = None) -> bool:
    """Backward-compatible wrapper around the configured memory storage save path."""
    return get_memory_storage().save(memory_data, agent_name)


def get_memory_data(
    agent_name: str | None = None,
    user_id: str | None = None,
    agent_id: str | None = None,
) -> dict[str, Any]:
    """Get the current memory data via storage provider."""
    if get_memory_config().provider == "mem0":
        if not user_id:
            return create_empty_memory()
        resolved_agent_id = resolve_memory_agent_id(agent_name=agent_name, agent_id=agent_id)
        return get_mem0_service().build_compat_memory(user_id=user_id, agent_id=resolved_agent_id)
    return get_memory_storage().load(agent_name)


def reload_memory_data(
    agent_name: str | None = None,
    user_id: str | None = None,
    agent_id: str | None = None,
) -> dict[str, Any]:
    """Reload memory data via storage provider."""
    if get_memory_config().provider == "mem0":
        if not user_id:
            return create_empty_memory()
        resolved_agent_id = resolve_memory_agent_id(agent_name=agent_name, agent_id=agent_id)
        return get_mem0_service().build_compat_memory(user_id=user_id, agent_id=resolved_agent_id)
    return get_memory_storage().reload(agent_name)


def import_memory_data(
    memory_data: dict[str, Any],
    agent_name: str | None = None,
    user_id: str | None = None,
    agent_id: str | None = None,
) -> dict[str, Any]:
    """Persist imported memory data via storage provider.

    Args:
        memory_data: Full memory payload to persist.
        agent_name: If provided, imports into per-agent memory.

    Returns:
        The saved memory data after storage normalization.

    Raises:
        OSError: If persisting the imported memory fails.
    """
    if get_memory_config().provider == "mem0":
        if not user_id:
            raise OSError("Missing user_id for mem0 import")
        service = get_mem0_service()
        resolved_agent_id = resolve_memory_agent_id(agent_name=agent_name, agent_id=agent_id)
        service.delete_all(user_id=user_id, agent_id=resolved_agent_id)
        service.import_facts(user_id=user_id, facts=memory_data.get("facts", []))
        return service.build_compat_memory(user_id=user_id, agent_id=resolved_agent_id)

    storage = get_memory_storage()
    if not storage.save(memory_data, agent_name):
        raise OSError("Failed to save imported memory data")
    return storage.load(agent_name)


def clear_memory_data(
    agent_name: str | None = None,
    user_id: str | None = None,
    agent_id: str | None = None,
) -> dict[str, Any]:
    """Clear all stored memory data and persist an empty structure."""
    if get_memory_config().provider == "mem0":
        if not user_id:
            raise OSError("Missing user_id for mem0 clear")
        resolved_agent_id = resolve_memory_agent_id(agent_name=agent_name, agent_id=agent_id)
        get_mem0_service().delete_all(user_id=user_id, agent_id=resolved_agent_id)
        return create_empty_memory()
    cleared_memory = create_empty_memory()
    if not _save_memory_to_file(cleared_memory, agent_name):
        raise OSError("Failed to save cleared memory data")
    return cleared_memory


def _validate_confidence(confidence: float) -> float:
    """Validate persisted fact confidence so stored JSON stays standards-compliant."""
    if not math.isfinite(confidence) or confidence < 0 or confidence > 1:
        raise ValueError("confidence")
    return confidence


def _coerce_mem0_text(content: Any) -> str:
    if isinstance(content, str):
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
        return "\n".join(part.strip() for part in parts if part and part.strip()).strip()
    return str(content).strip()


def _message_to_mem0_dict(message: Any) -> dict[str, str] | None:
    source_type: str | None = None
    if isinstance(message, str):
        role = "user"
        content = message.strip()
        name = None
    elif isinstance(message, dict):
        role = message.get("role")
        source_type = message.get("type") or message.get("role")
        content = _coerce_mem0_text(message.get("content", ""))
        name = message.get("name")
    else:
        role = getattr(message, "type", None)
        source_type = getattr(message, "type", None) or getattr(message, "role", None)
        content = _coerce_mem0_text(getattr(message, "content", ""))
        name = getattr(message, "name", None)

    if role == "human":
        role = "user"
    elif role == "ai":
        role = "assistant"
    elif role not in {"user", "assistant", "system"}:
        role = None

    if role is None or not content:
        return None

    payload = {"role": role, "content": content}
    if isinstance(source_type, str) and source_type.strip():
        payload["type"] = source_type.strip()
    if isinstance(name, str) and name.strip():
        payload["name"] = name.strip()
    return payload


def _mem0_message_tokens(message: dict[str, str]) -> int:
    return _count_tokens(f"{message['role']}: {message['content']}")


def _truncate_text_to_token_budget(text: str, token_budget: int) -> str:
    if token_budget <= 0:
        return ""

    token_count = _count_tokens(text)
    if token_count <= token_budget:
        return text

    estimated_chars = max(1, int(len(text) * (token_budget / max(token_count, 1))))
    truncated = text[:estimated_chars].rstrip()
    while truncated and _count_tokens(truncated) > token_budget:
        truncated = truncated[: max(1, len(truncated) - max(1, len(truncated) // 8))].rstrip()
    return truncated


def _select_latest_mem0_increment(payload: list[dict[str, str]]) -> list[dict[str, str]]:
    if not payload:
        return []

    assistant_indices = [index for index, item in enumerate(payload) if item["role"] == "assistant"]
    if len(assistant_indices) < 2:
        return payload

    return payload[assistant_indices[-2] + 1 :]


def _prepare_mem0_messages(messages: list[Any], token_budget: int | None = None) -> list[dict[str, str]]:
    if token_budget is None:
        token_budget = _MEM0_WRITE_TOKEN_BUDGET

    payload = [item for item in (_message_to_mem0_dict(message) for message in messages) if item is not None]
    if not payload:
        return []
    payload = _select_latest_mem0_increment(payload)

    selected: list[dict[str, str]] = []
    used_tokens = 0
    for item in reversed(payload):
        remaining = token_budget - used_tokens
        if remaining <= 0:
            break

        item_tokens = _mem0_message_tokens(item)
        if item_tokens <= remaining:
            selected.append(dict(item))
            used_tokens += item_tokens
            continue

        prefix_tokens = _count_tokens(f"{item['role']}: ")
        truncated_content = _truncate_text_to_token_budget(item["content"], remaining - prefix_tokens)
        if truncated_content:
            trimmed = dict(item)
            trimmed["content"] = truncated_content
            selected.append(trimmed)
        break

    selected.reverse()
    if selected != payload:
        logger.info(
            "Prepared mem0 payload with %d/%d messages under token budget %d",
            len(selected),
            len(payload),
            token_budget,
        )
    return selected


def create_memory_fact(
    content: str,
    category: str = "context",
    confidence: float = 0.5,
    agent_name: str | None = None,
    user_id: str | None = None,
    agent_id: str | None = None,
) -> dict[str, Any]:
    """Create a new fact and persist the updated memory data."""
    normalized_content = content.strip()
    if not normalized_content:
        raise ValueError("content")

    normalized_category = category.strip() or "context"
    validated_confidence = _validate_confidence(confidence)
    if get_memory_config().provider == "mem0":
        if not user_id:
            raise OSError("Missing user_id for mem0 fact creation")
        resolved_agent_id = resolve_memory_agent_id(agent_name=agent_name, agent_id=agent_id)
        get_mem0_service().create_fact(
            user_id=user_id,
            content=normalized_content,
            category=normalized_category,
            confidence=validated_confidence,
        )
        return get_mem0_service().build_compat_memory(user_id=user_id, agent_id=resolved_agent_id)
    now = utc_now_iso_z()
    memory_data = get_memory_data(agent_name)
    updated_memory = dict(memory_data)
    facts = list(memory_data.get("facts", []))
    facts.append(
        {
            "id": f"fact_{uuid.uuid4().hex[:8]}",
            "content": normalized_content,
            "category": normalized_category,
            "confidence": validated_confidence,
            "createdAt": now,
            "source": "manual",
        }
    )
    updated_memory["facts"] = facts

    if not _save_memory_to_file(updated_memory, agent_name):
        raise OSError("Failed to save memory data after creating fact")

    return updated_memory


def delete_memory_fact(
    fact_id: str,
    agent_name: str | None = None,
    user_id: str | None = None,
    agent_id: str | None = None,
) -> dict[str, Any]:
    """Delete a fact by its id and persist the updated memory data."""
    if get_memory_config().provider == "mem0":
        if not user_id:
            raise OSError("Missing user_id for mem0 fact deletion")
        service = get_mem0_service()
        resolved_agent_id = resolve_memory_agent_id(agent_name=agent_name, agent_id=agent_id)
        existing_ids = {
            fact["id"] for fact in service.build_compat_memory(user_id=user_id, agent_id=resolved_agent_id)["facts"]
        }
        if fact_id not in existing_ids:
            raise KeyError(fact_id)
        service.delete(memory_id=fact_id)
        return service.build_compat_memory(user_id=user_id, agent_id=resolved_agent_id)
    memory_data = get_memory_data(agent_name)
    facts = memory_data.get("facts", [])
    updated_facts = [fact for fact in facts if fact.get("id") != fact_id]
    if len(updated_facts) == len(facts):
        raise KeyError(fact_id)

    updated_memory = dict(memory_data)
    updated_memory["facts"] = updated_facts

    if not _save_memory_to_file(updated_memory, agent_name):
        raise OSError(f"Failed to save memory data after deleting fact '{fact_id}'")

    return updated_memory


def update_memory_fact(
    fact_id: str,
    content: str | None = None,
    category: str | None = None,
    confidence: float | None = None,
    agent_name: str | None = None,
    user_id: str | None = None,
    agent_id: str | None = None,
) -> dict[str, Any]:
    """Update an existing fact and persist the updated memory data."""
    if get_memory_config().provider == "mem0":
        if not user_id:
            raise OSError("Missing user_id for mem0 fact update")
        service = get_mem0_service()
        resolved_agent_id = resolve_memory_agent_id(agent_name=agent_name, agent_id=agent_id)
        current = service.build_compat_memory(user_id=user_id, agent_id=resolved_agent_id)
        existing = next((fact for fact in current.get("facts", []) if fact.get("id") == fact_id), None)
        if existing is None:
            raise KeyError(fact_id)
        merged_content = content if content is not None else existing.get("content", "")
        if not str(merged_content).strip():
            raise ValueError("content")
        merged_category = category if category is not None else existing.get("category", "context")
        merged_confidence = confidence if confidence is not None else existing.get("confidence", 0.5)
        _validate_confidence(float(merged_confidence))
        service.delete(memory_id=fact_id)
        service.create_fact(
            user_id=user_id,
            content=str(merged_content),
            category=str(merged_category),
            confidence=float(merged_confidence),
        )
        return service.build_compat_memory(user_id=user_id, agent_id=resolved_agent_id)
    memory_data = get_memory_data(agent_name)
    updated_memory = dict(memory_data)
    updated_facts: list[dict[str, Any]] = []
    found = False

    for fact in memory_data.get("facts", []):
        if fact.get("id") == fact_id:
            found = True
            updated_fact = dict(fact)
            if content is not None:
                normalized_content = content.strip()
                if not normalized_content:
                    raise ValueError("content")
                updated_fact["content"] = normalized_content
            if category is not None:
                updated_fact["category"] = category.strip() or "context"
            if confidence is not None:
                updated_fact["confidence"] = _validate_confidence(confidence)
            updated_facts.append(updated_fact)
        else:
            updated_facts.append(fact)

    if not found:
        raise KeyError(fact_id)

    updated_memory["facts"] = updated_facts

    if not _save_memory_to_file(updated_memory, agent_name):
        raise OSError(f"Failed to save memory data after updating fact '{fact_id}'")

    return updated_memory


def _extract_text(content: Any) -> str:
    """Extract plain text from LLM response content (str or list of content blocks).

    Modern LLMs may return structured content as a list of blocks instead of a
    plain string, e.g. [{"type": "text", "text": "..."}]. Using str() on such
    content produces Python repr instead of the actual text, breaking JSON
    parsing downstream.

    String chunks are concatenated without separators to avoid corrupting
    chunked JSON/text payloads. Dict-based text blocks are treated as full text
    blocks and joined with newlines for readability.
    """
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        pieces: list[str] = []
        pending_str_parts: list[str] = []

        def flush_pending_str_parts() -> None:
            if pending_str_parts:
                pieces.append("".join(pending_str_parts))
                pending_str_parts.clear()

        for block in content:
            if isinstance(block, str):
                pending_str_parts.append(block)
            elif isinstance(block, dict):
                flush_pending_str_parts()
                text_val = block.get("text")
                if isinstance(text_val, str):
                    pieces.append(text_val)

        flush_pending_str_parts()
        return "\n".join(pieces)
    return str(content)


def _run_async_update_sync(coro: Awaitable[bool]) -> bool:
    """Run an async memory update from sync code, including nested-loop contexts."""
    handed_off = False

    try:
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None

        if loop is not None and loop.is_running():
            future = _SYNC_MEMORY_UPDATER_EXECUTOR.submit(asyncio.run, coro)
            handed_off = True
            return future.result()

        handed_off = True
        return asyncio.run(coro)
    except Exception:
        if not handed_off:
            close = getattr(coro, "close", None)
            if callable(close):
                try:
                    close()
                except Exception:
                    logger.debug(
                        "Failed to close un-awaited memory update coroutine",
                        exc_info=True,
                    )

        logger.exception("Failed to run async memory update from sync context")
        return False


# Matches sentences that describe a file-upload *event* rather than general
# file-related work.  Deliberately narrow to avoid removing legitimate facts
# such as "User works with CSV files" or "prefers PDF export".
_UPLOAD_SENTENCE_RE = re.compile(
    r"[^.!?]*\b(?:"
    r"upload(?:ed|ing)?(?:\s+\w+){0,3}\s+(?:file|files?|document|documents?|attachment|attachments?)"
    r"|file\s+upload"
    r"|/mnt/user-data/uploads/"
    r"|<uploaded_files>"
    r")[^.!?]*[.!?]?\s*",
    re.IGNORECASE,
)


def _strip_upload_mentions_from_memory(memory_data: dict[str, Any]) -> dict[str, Any]:
    """Remove sentences about file uploads from all memory summaries and facts.

    Uploaded files are session-scoped; persisting upload events in long-term
    memory causes the agent to search for non-existent files in future sessions.
    """
    # Scrub summaries in user/history sections
    for section in ("user", "history"):
        section_data = memory_data.get(section, {})
        for _key, val in section_data.items():
            if isinstance(val, dict) and "summary" in val:
                cleaned = _UPLOAD_SENTENCE_RE.sub("", val["summary"]).strip()
                cleaned = re.sub(r"  +", " ", cleaned)
                val["summary"] = cleaned

    # Also remove any facts that describe upload events
    facts = memory_data.get("facts", [])
    if facts:
        memory_data["facts"] = [f for f in facts if not _UPLOAD_SENTENCE_RE.search(f.get("content", ""))]

    return memory_data


def _fact_content_key(content: Any) -> str | None:
    if not isinstance(content, str):
        return None
    stripped = content.strip()
    if not stripped:
        return None
    return stripped.casefold()


class MemoryUpdater:
    """Updates memory using LLM based on conversation context."""

    def __init__(self, model_name: str | None = None):
        """Initialize the memory updater.

        Args:
            model_name: Optional model name to use. If None, uses config or default.
        """
        self._model_name = model_name

    def _get_model(self):
        """Get the model for memory updates."""
        config = get_memory_config()
        model_name = self._model_name or config.model_name
        return create_chat_model(name=model_name, thinking_enabled=False)

    def _build_correction_hint(
        self,
        correction_detected: bool,
        reinforcement_detected: bool,
    ) -> str:
        """Build optional prompt hints for correction and reinforcement signals."""
        correction_hint = ""
        if correction_detected:
            correction_hint = (
                "IMPORTANT: Explicit correction signals were detected in this conversation. "
                "Pay special attention to what the agent got wrong, what the user corrected, "
                "and record the correct approach as a fact with category "
                '"correction" and confidence >= 0.95 when appropriate.'
            )
        if reinforcement_detected:
            reinforcement_hint = (
                "IMPORTANT: Positive reinforcement signals were detected in this conversation. "
                "The user explicitly confirmed the agent's approach was correct or helpful. "
                "Record the confirmed approach, style, or preference as a fact with category "
                '"preference" or "behavior" and confidence >= 0.9 when appropriate.'
            )
            correction_hint = (correction_hint + "\n" + reinforcement_hint).strip() if correction_hint else reinforcement_hint

        return correction_hint

    def _prepare_update_prompt(
        self,
        messages: list[Any],
        agent_name: str | None,
        user_id: str | None,
        correction_detected: bool,
        reinforcement_detected: bool,
    ) -> tuple[dict[str, Any], str] | None:
        """Load memory and build the update prompt for a conversation."""
        config = get_memory_config()
        if not config.enabled or not messages:
            return None

        current_memory = get_memory_data(agent_name, user_id=user_id)
        conversation_text = format_conversation_for_update(messages)
        if not conversation_text.strip():
            return None

        correction_hint = self._build_correction_hint(
            correction_detected=correction_detected,
            reinforcement_detected=reinforcement_detected,
        )
        prompt = MEMORY_UPDATE_PROMPT.format(
            current_memory=json.dumps(current_memory, indent=2),
            conversation=conversation_text,
            correction_hint=correction_hint,
        )
        return current_memory, prompt

    def _finalize_update(
        self,
        current_memory: dict[str, Any],
        response_content: Any,
        thread_id: str | None,
        agent_name: str | None,
    ) -> bool:
        """Parse the model response, apply updates, and persist memory."""
        response_text = _extract_text(response_content).strip()

        if response_text.startswith("```"):
            lines = response_text.split("\n")
            response_text = "\n".join(lines[1:-1] if lines[-1] == "```" else lines[1:])

        update_data = json.loads(response_text)
        updated_memory = self._apply_updates(current_memory, update_data, thread_id)
        updated_memory = _strip_upload_mentions_from_memory(updated_memory)
        return get_memory_storage().save(updated_memory, agent_name)

    async def aupdate_memory(
        self,
        messages: list[Any],
        thread_id: str | None = None,
        user_id: str | None = None,
        agent_name: str | None = None,
        correction_detected: bool = False,
        reinforcement_detected: bool = False,
        trace_parent: Any | None = None,
    ) -> bool:
        """Update memory asynchronously based on conversation messages."""
        try:
            config = get_memory_config()
            if config.provider == "mem0":
                if not user_id:
                    logger.debug("No user_id provided for mem0 memory update; skipping")
                    return False
                mem0_messages = _prepare_mem0_messages(messages, token_budget=config.mem0_write_token_budget)
                if not mem0_messages:
                    logger.debug("No mem0-compatible messages after payload preparation; skipping")
                    return False
                # Trace both layers explicitly:
                # - raw_messages captures the full updater input for orchestration/debugging.
                # - messages captures the prepared incremental payload actually sent to Mem0.
                with memory_trace(
                    "MemoryUpdater.update_memory",
                    thread_id=thread_id,
                    user_id=user_id,
                    tags=["memory", "mem0", "write"],
                    metadata={
                        "input_message_count": len(messages),
                        "prepared_message_count": len(mem0_messages),
                        "mode": "conversation_add",
                        "write_token_budget": config.mem0_write_token_budget,
                    },
                    inputs={
                        "messages": trace_messages(mem0_messages),
                        "raw_messages": trace_messages(messages),
                        "thread_data": trace_thread_data(
                            thread_id=thread_id,
                            user_id=user_id,
                            input_message_count=len(messages),
                            prepared_message_count=len(mem0_messages),
                            mode="conversation_add",
                        ),
                    },
                    parent=trace_parent,
                ) as span:
                    agent_id = resolve_memory_agent_id(agent_name=agent_name)
                    result = get_mem0_service().add_conversation(
                        messages=mem0_messages,
                        user_id=user_id,
                        agent_id=agent_id,
                        run_id=thread_id,
                        metadata={
                            "thread_id": thread_id or "",
                            "source": thread_id or "unknown",
                            "agent_id": agent_id,
                        },
                    )
                    if span is not None and hasattr(span, "end"):
                        span.end(
                            outputs={
                                "messages": trace_messages(mem0_messages),
                                "thread_data": trace_thread_data(
                                    thread_id=thread_id,
                                    user_id=user_id,
                                    accepted=result is not None,
                                    input_message_count=len(messages),
                                    prepared_message_count=len(mem0_messages),
                                    mode="conversation_add",
                                ),
                            }
                        )
                return True

            prepared = await asyncio.to_thread(
                self._prepare_update_prompt,
                messages=messages,
                agent_name=agent_name,
                user_id=user_id,
                correction_detected=correction_detected,
                reinforcement_detected=reinforcement_detected,
            )
            if prepared is None:
                return False

            current_memory, prompt = prepared
            model = self._get_model()
            response = await model.ainvoke(prompt)
            return await asyncio.to_thread(
                self._finalize_update,
                current_memory=current_memory,
                response_content=response.content,
                thread_id=thread_id,
                agent_name=agent_name,
            )
        except json.JSONDecodeError as e:
            logger.warning("Failed to parse LLM response for memory update: %s", e)
            return False
        except Exception as e:
            logger.exception("Memory update failed: %s", e)
            return False

    def update_memory(
        self,
        messages: list[Any],
        thread_id: str | None = None,
        user_id: str | None = None,
        agent_name: str | None = None,
        correction_detected: bool = False,
        reinforcement_detected: bool = False,
        trace_parent: Any | None = None,
    ) -> bool:
        """Synchronously update memory via the async updater path.

        Args:
            messages: List of conversation messages.
            thread_id: Optional thread ID for tracking source.
            agent_name: If provided, updates per-agent memory. If None, updates global memory.
            correction_detected: Whether recent turns include an explicit correction signal.
            reinforcement_detected: Whether recent turns include a positive reinforcement signal.

        Returns:
            True if update was successful, False otherwise.
        """
        return _run_async_update_sync(
            self.aupdate_memory(
                messages=messages,
                thread_id=thread_id,
                user_id=user_id,
                agent_name=agent_name,
                correction_detected=correction_detected,
                reinforcement_detected=reinforcement_detected,
            )
        )

    def _apply_updates(
        self,
        current_memory: dict[str, Any],
        update_data: dict[str, Any],
        thread_id: str | None = None,
    ) -> dict[str, Any]:
        """Apply LLM-generated updates to memory.

        Args:
            current_memory: Current memory data.
            update_data: Updates from LLM.
            thread_id: Optional thread ID for tracking.

        Returns:
            Updated memory data.
        """
        config = get_memory_config()
        now = utc_now_iso_z()

        # Update user sections
        user_updates = update_data.get("user", {})
        for section in ["workContext", "personalContext", "topOfMind"]:
            section_data = user_updates.get(section, {})
            if section_data.get("shouldUpdate") and section_data.get("summary"):
                current_memory["user"][section] = {
                    "summary": section_data["summary"],
                    "updatedAt": now,
                }

        # Update history sections
        history_updates = update_data.get("history", {})
        for section in ["recentMonths", "earlierContext", "longTermBackground"]:
            section_data = history_updates.get(section, {})
            if section_data.get("shouldUpdate") and section_data.get("summary"):
                current_memory["history"][section] = {
                    "summary": section_data["summary"],
                    "updatedAt": now,
                }

        # Remove facts
        facts_to_remove = set(update_data.get("factsToRemove", []))
        if facts_to_remove:
            current_memory["facts"] = [f for f in current_memory.get("facts", []) if f.get("id") not in facts_to_remove]

        # Add new facts
        existing_fact_keys = {fact_key for fact_key in (_fact_content_key(fact.get("content")) for fact in current_memory.get("facts", [])) if fact_key is not None}
        new_facts = update_data.get("newFacts", [])
        for fact in new_facts:
            confidence = fact.get("confidence", 0.5)
            if confidence >= config.fact_confidence_threshold:
                raw_content = fact.get("content", "")
                if not isinstance(raw_content, str):
                    continue
                normalized_content = raw_content.strip()
                fact_key = _fact_content_key(normalized_content)
                if fact_key is not None and fact_key in existing_fact_keys:
                    continue

                fact_entry = {
                    "id": f"fact_{uuid.uuid4().hex[:8]}",
                    "content": normalized_content,
                    "category": fact.get("category", "context"),
                    "confidence": confidence,
                    "createdAt": now,
                    "source": thread_id or "unknown",
                }
                source_error = fact.get("sourceError")
                if isinstance(source_error, str):
                    normalized_source_error = source_error.strip()
                    if normalized_source_error:
                        fact_entry["sourceError"] = normalized_source_error
                current_memory["facts"].append(fact_entry)
                if fact_key is not None:
                    existing_fact_keys.add(fact_key)

        # Enforce max facts limit
        if len(current_memory["facts"]) > config.max_facts:
            # Sort by confidence and keep top ones
            current_memory["facts"] = sorted(
                current_memory["facts"],
                key=lambda f: f.get("confidence", 0),
                reverse=True,
            )[: config.max_facts]

        return current_memory


def update_memory_from_conversation(
    messages: list[Any],
    thread_id: str | None = None,
    user_id: str | None = None,
    agent_name: str | None = None,
    correction_detected: bool = False,
    reinforcement_detected: bool = False,
    trace_parent: Any | None = None,
) -> bool:
    """Convenience function to update memory from a conversation.

    Args:
        messages: List of conversation messages.
        thread_id: Optional thread ID.
        agent_name: If provided, updates per-agent memory. If None, updates global memory.
        correction_detected: Whether recent turns include an explicit correction signal.
        reinforcement_detected: Whether recent turns include a positive reinforcement signal.

    Returns:
        True if successful, False otherwise.
    """
    updater = MemoryUpdater()
    return updater.update_memory(messages, thread_id, user_id, agent_name, correction_detected, reinforcement_detected, trace_parent)
