from __future__ import annotations

from typing import Any, Literal, TypedDict


class TextPart(TypedDict):
    type: Literal["text"]
    text: str


class ReasoningPart(TypedDict):
    type: Literal["reasoning"]
    text: str


class ToolCallPart(TypedDict):
    type: Literal["tool-call"]
    toolCallId: str
    toolName: str
    args: dict[str, Any]


class ToolResultPart(TypedDict):
    type: Literal["tool-result"]
    toolCallId: str
    toolName: str
    content: str


AssistantUiPart = TextPart | ReasoningPart | ToolCallPart | ToolResultPart


class AssistantUiMessage(TypedDict):
    id: str
    role: Literal["user", "assistant"]
    parts: list[AssistantUiPart]


def _extract_text_content(message: dict[str, Any]) -> str:
    content = message.get("content", "")
    if isinstance(content, str):
        return content.strip()

    if isinstance(content, list):
        lines: list[str] = []
        for part in content:
            if not isinstance(part, dict):
                continue
            if part.get("type") == "text" and isinstance(part.get("text"), str):
                lines.append(part["text"])
        return "\n".join(line for line in lines if line).strip()

    return ""


def _extract_reasoning_content(message: dict[str, Any]) -> str | None:
    additional_kwargs = message.get("additional_kwargs")
    if isinstance(additional_kwargs, dict):
        explicit_reasoning = additional_kwargs.get("reasoning_content")
        if isinstance(explicit_reasoning, str) and explicit_reasoning.strip():
            return explicit_reasoning.strip()

    content = message.get("content")
    if isinstance(content, list):
        for part in content:
            if not isinstance(part, dict):
                continue
            if (
                part.get("type") == "text"
                and isinstance(part.get("thinking"), str)
                and part["thinking"].strip()
            ):
                return part["thinking"].strip()

    return None


def _is_internal_control_message(message: dict[str, Any]) -> bool:
    return _extract_text_content(message).startswith("[LOOP DETECTED]")


def _normalize_id(message: dict[str, Any], fallback: str) -> str:
    message_id = message.get("id")
    return message_id if isinstance(message_id, str) and message_id else fallback


def _extract_assistant_parts(message: dict[str, Any], fallback_id: str) -> list[AssistantUiPart]:
    if message.get("type") == "tool":
        return [
            {
                "type": "tool-result",
                "toolCallId": message.get("tool_call_id") or fallback_id,
                "toolName": message.get("name") or "tool",
                "content": _extract_text_content(message),
            }
        ]

    parts: list[AssistantUiPart] = []
    reasoning = _extract_reasoning_content(message)
    if reasoning:
        parts.append({"type": "reasoning", "text": reasoning})

    tool_calls = message.get("tool_calls")
    if isinstance(tool_calls, list):
        for tool_call in tool_calls:
            if not isinstance(tool_call, dict):
                continue
            tool_call_id = tool_call.get("id")
            tool_name = tool_call.get("name")
            if not isinstance(tool_call_id, str) or not isinstance(tool_name, str):
                continue
            args = tool_call.get("args")
            parts.append(
                {
                    "type": "tool-call",
                    "toolCallId": tool_call_id,
                    "toolName": tool_name,
                    "args": args if isinstance(args, dict) else {},
                }
            )

    text = _extract_text_content(message)
    if text:
        parts.append({"type": "text", "text": text})

    return parts


def convert_deerflow_messages_to_assistant_ui(messages: list[dict[str, Any]]) -> list[AssistantUiMessage]:
    converted: list[AssistantUiMessage] = []
    current_assistant: AssistantUiMessage | None = None

    for index, message in enumerate(messages):
        if _is_internal_control_message(message):
            continue

        message_type = message.get("type")
        message_id = _normalize_id(message, f"message_{index}")

        if message_type == "human":
            current_assistant = None
            converted.append(
                {
                    "id": message_id,
                    "role": "user",
                    "parts": [{"type": "text", "text": _extract_text_content(message)}],
                }
            )
            continue

        parts = _extract_assistant_parts(message, message_id)
        if not parts:
            continue

        if current_assistant is None:
            current_assistant = {
                "id": message_id,
                "role": "assistant",
                "parts": list(parts),
            }
            converted.append(current_assistant)
            continue

        current_assistant["parts"].extend(parts)

    return converted
