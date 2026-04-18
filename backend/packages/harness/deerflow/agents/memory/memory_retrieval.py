"""Retrieval policy for authenticated mem0 memory injection."""

from __future__ import annotations

from typing import Any

from deerflow.agents.memory.mem0_service import get_mem0_service
from deerflow.agents.memory.prompt import _count_tokens
from deerflow.config.memory_config import get_memory_config
from deerflow.tracing import memory_trace, trace_messages, trace_thread_data


def _human_message_text(message: Any) -> str:
    content = getattr(message, "content", "")
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
    return ""


def _human_messages(messages: list[Any]) -> list[Any]:
    return [message for message in messages if getattr(message, "type", None) in {"human", "user"} and _human_message_text(message)]


def _is_first_turn(messages: list[Any]) -> bool:
    return len(_human_messages(messages)) <= 1


def _build_query(messages: list[Any], window_turns: int) -> str:
    human_messages = _human_messages(messages)
    if not human_messages:
        return ""
    if len(human_messages) == 1:
        return _human_message_text(human_messages[0])

    selected = human_messages[-window_turns:]
    return "\n\n".join(_human_message_text(message) for message in selected if _human_message_text(message)).strip()


def _result_created_at(result: dict[str, Any]) -> str:
    metadata = result.get("metadata") or {}
    return str(
        result.get("created_at")
        or result.get("createdAt")
        or metadata.get("created_at")
        or metadata.get("createdAt")
        or ""
    )


def _result_confidence(result: dict[str, Any]) -> float:
    score = result.get("score")
    try:
        return float(score) if score is not None else 0.0
    except (TypeError, ValueError):
        return 0.0


def _normalize_result_content(result: dict[str, Any]) -> str:
    return str(result.get("memory") or result.get("text") or result.get("content") or "").strip()


def _profile_candidates(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    config = get_memory_config()
    allowed_categories = set(config.profile_categories)
    filtered = [
        result
        for result in results
        if str((result.get("metadata") or {}).get("category") or "context") in allowed_categories and _normalize_result_content(result)
    ]
    filtered.sort(key=lambda result: (_result_confidence(result), _result_created_at(result)), reverse=True)
    return filtered[: config.profile_limit]


def _budgeted_results(results: list[dict[str, Any]], token_budget: int) -> list[dict[str, Any]]:
    if token_budget <= 0:
        return []
    kept: list[dict[str, Any]] = []
    used = 0
    for result in results:
        content = _normalize_result_content(result)
        if not content:
            continue
        estimate = _count_tokens(content)
        if kept and used + estimate > token_budget:
            continue
        if not kept and estimate > token_budget:
            kept.append(result)
            break
        used += estimate
        kept.append(result)
    return kept


def _dedupe_results(query_results: list[dict[str, Any]], profile_results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    deduped: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    seen_content: set[str] = set()
    for result in [*query_results, *profile_results]:
        result_id = str(result.get("id") or result.get("memory_id") or "")
        content_key = _normalize_result_content(result).casefold()
        if result_id and result_id in seen_ids:
            continue
        if content_key and content_key in seen_content:
            continue
        if result_id:
            seen_ids.add(result_id)
        if content_key:
            seen_content.add(content_key)
        deduped.append(result)
    return deduped


def _result_to_fact(result: dict[str, Any]) -> dict[str, Any]:
    metadata = result.get("metadata") or {}
    created_at = _result_created_at(result)
    category = metadata.get("category") or "context"
    return {
        "id": str(result.get("id") or result.get("memory_id") or f"mem0_{abs(hash(_normalize_result_content(result)))}"),
        "content": _normalize_result_content(result),
        "category": str(category),
        "confidence": max(0.0, min(1.0, _result_confidence(result) or 0.8)),
        "createdAt": created_at,
        "source": str(metadata.get("source") or metadata.get("thread_id") or metadata.get("run_id") or "mem0"),
    }


def _compat_memory(results: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not results:
        return None
    facts = [_result_to_fact(result) for result in results if _normalize_result_content(result)]
    if not facts:
        return None
    last_updated = max((fact.get("createdAt") or "" for fact in facts), default="")
    return {
        "version": "1.0",
        "lastUpdated": last_updated,
        "user": {
            "workContext": {"summary": "", "updatedAt": ""},
            "personalContext": {"summary": "", "updatedAt": ""},
            "topOfMind": {"summary": "", "updatedAt": ""},
        },
        "history": {
            "recentMonths": {"summary": "", "updatedAt": ""},
            "earlierContext": {"summary": "", "updatedAt": ""},
            "longTermBackground": {"summary": "", "updatedAt": ""},
        },
        "facts": facts,
    }


def build_mem0_injection_memory(*, user_id: str, messages: list[Any], thread_id: str | None = None, trace_parent: Any | None = None) -> dict[str, Any] | None:
    config = get_memory_config()
    service = get_mem0_service()

    total_budget = config.max_injection_tokens
    profile_budget = int(total_budget * config.profile_budget_ratio)
    query_budget = max(total_budget - profile_budget, 0)

    with memory_trace(
        "Mem0InjectionMiddleware.before_model.profile_retrieval",
        thread_id=thread_id,
        user_id=user_id,
        tags=["memory", "mem0", "retrieval", "profile"],
        metadata={"profile_limit": config.profile_limit, "profile_categories": list(config.profile_categories)},
        inputs={"messages": [{"type": "system", "content": "Using user-scoped profile memory (no current request text)."}], "thread_data": trace_thread_data(thread_id=thread_id, user_id=user_id, profile_limit=config.profile_limit, profile_categories=list(config.profile_categories))},
        parent=trace_parent,
    ) as span:
        profile_results = _profile_candidates(service.get_all(user_id=user_id))
        if span is not None and hasattr(span, "metadata"):
            span.metadata["profile_candidates"] = len(profile_results)
            span.metadata["profile_kept"] = len(profile_results)
        if span is not None and hasattr(span, "end"):
            span.end(outputs={"messages": trace_messages(profile_results), "thread_data": trace_thread_data(thread_id=thread_id, user_id=user_id, profile_kept=len(profile_results), uses_current_messages=False, retrieval_source="profile_memory")})

    query = _build_query(messages, config.query_window_turns)
    with memory_trace(
        "Mem0InjectionMiddleware.before_model.query_retrieval",
        thread_id=thread_id,
        user_id=user_id,
        tags=["memory", "mem0", "retrieval", "query"],
        metadata={
            "query_window_turns": config.query_window_turns,
            "query_length": len(query),
            "query_preview": query[:120],
        },
        inputs={"messages": [{"type": "human", "content": query}], "thread_data": trace_thread_data(thread_id=thread_id, user_id=user_id, query_window_turns=config.query_window_turns, query_length=len(query))},
        parent=trace_parent,
    ) as span:
        query_results = service.search(query=query, user_id=user_id, limit=config.search_limit) if query else []
        bounded_query_preview = _budgeted_results(query_results, query_budget)
        if span is not None and hasattr(span, "metadata"):
            span.metadata["query_results"] = len(query_results)
            span.metadata["query_kept"] = len(bounded_query_preview)
        if span is not None and hasattr(span, "end"):
            span.end(outputs={"messages": trace_messages(bounded_query_preview), "thread_data": trace_thread_data(thread_id=thread_id, user_id=user_id, query_results=len(query_results), query_kept=len(bounded_query_preview))})

    bounded_query = _budgeted_results(query_results, query_budget)
    bounded_profile = _budgeted_results(profile_results, profile_budget)
    with memory_trace(
        "Mem0InjectionMiddleware.before_model.merge",
        thread_id=thread_id,
        user_id=user_id,
        tags=["memory", "mem0", "merge"],
        metadata={
            "profile_input_count": len(bounded_profile),
            "query_input_count": len(bounded_query),
            "profile_budget_tokens": profile_budget,
            "query_budget_tokens": query_budget,
        },
        inputs={"messages": trace_messages([*bounded_profile, *bounded_query]), "thread_data": trace_thread_data(thread_id=thread_id, user_id=user_id, profile_input_count=len(bounded_profile), query_input_count=len(bounded_query))},
        parent=trace_parent,
    ) as span:
        merged = _dedupe_results(bounded_query, bounded_profile)
        deduped_count = len(bounded_profile) + len(bounded_query) - len(merged)
        if span is not None and hasattr(span, "metadata"):
            span.metadata["merged_count"] = len(merged)
            span.metadata["deduped_count"] = deduped_count
        if span is not None and hasattr(span, "end"):
            span.end(outputs={"messages": trace_messages(merged), "thread_data": trace_thread_data(thread_id=thread_id, user_id=user_id, merged_count=len(merged), deduped_count=deduped_count)})
        return _compat_memory(merged)
