from collections.abc import AsyncIterator
import json
import re

import httpx

THINK_TAG_RE = re.compile(r"<think>\s*([\s\S]*?)\s*</think>")


def normalize_stream_event(event: dict) -> dict:
    mapping = {
        "message_start": "message.started",
        "message_delta": "message.delta",
        "reasoning_delta": "reasoning.delta",
        "message_complete": "message.completed",
        "tool_start": "tool.started",
        "tool_progress": "tool.progress",
        "tool_complete": "tool.completed",
        "tool_error": "tool.failed",
        "run_error": "run.failed",
    }

    return {
        "event": mapping.get(event["event"], event["event"]),
        "data": event["data"],
    }


def _extract_text_content(content: object) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                text = item.get("text")
                if isinstance(text, str):
                    parts.append(text)
        return "".join(parts)
    return ""


def _extract_reasoning_content(message_payload: dict) -> str:
    additional_kwargs = message_payload.get("additional_kwargs")
    if isinstance(additional_kwargs, dict):
        reasoning_content = additional_kwargs.get("reasoning_content")
        if isinstance(reasoning_content, str):
            return reasoning_content

    content = message_payload.get("content")
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if not isinstance(item, dict):
                continue
            thinking = item.get("thinking")
            if isinstance(thinking, str):
                parts.append(thinking)
                continue
            if item.get("type") == "thinking":
                text = item.get("text")
                if isinstance(text, str):
                    parts.append(text)
        return "".join(parts)

    if isinstance(content, str):
        matches = THINK_TAG_RE.findall(content)
        if matches:
            return "\n\n".join(match.strip() for match in matches if match.strip())

    return ""


def _messages_for_current_turn(messages: list[dict]) -> list[dict]:
    last_human_index = -1
    for index, message in enumerate(messages):
        message_type = message.get("type")
        if message_type in {"human", "HumanMessage"}:
            last_human_index = index

    if last_human_index >= 0:
        return [
            message
            for message in messages[last_human_index + 1 :]
            if isinstance(message, dict)
        ]

    return [message for message in messages if isinstance(message, dict)]


def _is_title_generation_metadata(metadata: object) -> bool:
    if not isinstance(metadata, dict):
        return False

    langgraph_node = metadata.get("langgraph_node")
    return isinstance(langgraph_node, str) and langgraph_node.startswith(
        "TitleMiddleware"
    )


def _is_valid_tool_call_id(tool_call_id: object) -> bool:
    return isinstance(tool_call_id, str) and bool(tool_call_id.strip())


def _tool_started_event(tool_call: dict) -> dict | None:
    tool_call_id = tool_call.get("id")
    if not _is_valid_tool_call_id(tool_call_id):
        return None

    name = tool_call.get("name")
    if not isinstance(name, str) or not name:
        name = "tool"

    args = tool_call.get("args")
    if not isinstance(args, dict):
        args = {}

    label = name
    description = args.get("description")
    if isinstance(description, str) and description:
        label = description

    return {
        "event": "tool.started",
        "data": {
            "tool_call_id": tool_call_id,
            "label": label,
            "name": name,
            "args": args,
        },
    }


class StreamEventNormalizer:
    def __init__(self) -> None:
        self.frontend_message_id: str | None = None
        self.message_text = ""
        self.reasoning_text = ""
        self.message_completed = False
        self.run_failed = False
        self.started_tool_ids: set[str] = set()
        self.completed_tool_ids: set[str] = set()

    def _ensure_message_started(self, raw_id: str | None) -> list[dict]:
        if self.frontend_message_id is not None:
            return []

        self.frontend_message_id = raw_id or "assistant-stream"
        return [
            {
                "event": "message.started",
                "data": {"message_id": self.frontend_message_id},
            }
        ]

    def normalize(self, event_name: str, data: dict) -> list[dict]:
        if event_name in {
            "message_start",
            "message_delta",
            "reasoning_delta",
            "message_complete",
            "tool_start",
            "tool_progress",
            "tool_complete",
            "tool_error",
            "run_error",
        }:
            return [normalize_stream_event({"event": event_name, "data": data})]

        events: list[dict] = []

        if event_name == "error":
            self.run_failed = True
            return [{"event": "run.failed", "data": data}]

        if event_name in {"messages", "messages-tuple"}:
            message_payload: object = data
            metadata: object = None
            if event_name == "messages" and isinstance(data, list) and data:
                message_payload = data[0]
                if len(data) > 1:
                    metadata = data[1]

            if _is_title_generation_metadata(metadata):
                return events

            if not isinstance(message_payload, dict):
                return events

            event_type = message_payload.get("type")
            if event_type in {"ai", "AIMessageChunk"}:
                raw_id = message_payload.get("id")
                events.extend(self._ensure_message_started(raw_id if isinstance(raw_id, str) else None))

                reasoning = _extract_reasoning_content(message_payload)
                if reasoning and self.frontend_message_id is not None:
                    if reasoning == self.reasoning_text:
                        reasoning_delta = ""
                    elif reasoning.startswith(self.reasoning_text):
                        reasoning_delta = reasoning[len(self.reasoning_text) :]
                    else:
                        reasoning_delta = reasoning
                    if reasoning_delta:
                        events.append(
                            {
                                "event": "reasoning.delta",
                                "data": {
                                    "message_id": self.frontend_message_id,
                                    "delta": reasoning_delta,
                                },
                            }
                        )
                        self.reasoning_text += reasoning_delta

                for tool_call in message_payload.get("tool_calls") or []:
                    if not isinstance(tool_call, dict):
                        continue
                    tool_call_id = tool_call.get("id")
                    if not _is_valid_tool_call_id(tool_call_id) or tool_call_id in self.started_tool_ids:
                        continue
                    event = _tool_started_event(tool_call)
                    if event is not None:
                        events.append(event)
                    self.started_tool_ids.add(tool_call_id)

                content = _extract_text_content(message_payload.get("content"))
                if content:
                    if event_name == "messages":
                        delta = content
                    else:
                        if content == self.message_text:
                            delta = ""
                        elif content.startswith(self.message_text):
                            delta = content[len(self.message_text) :]
                        else:
                            delta = content
                    if delta and self.frontend_message_id is not None:
                        events.append(
                            {
                                "event": "message.delta",
                                "data": {
                                    "message_id": self.frontend_message_id,
                                    "delta": delta,
                                },
                            }
                        )
                        self.message_text += delta

            elif event_type in {"tool", "ToolMessageChunk"}:
                tool_call_id = message_payload.get("tool_call_id")
                if _is_valid_tool_call_id(tool_call_id):
                    content = _extract_text_content(message_payload.get("content"))
                    if content:
                        events.append(
                            {
                                "event": "tool.progress",
                                "data": {
                                    "tool_call_id": tool_call_id,
                                    "message": content,
                                },
                            }
                        )

            return events

        if event_name == "values" and isinstance(data, dict):
            messages = data.get("messages")
            if not isinstance(messages, list):
                return events

            for message in _messages_for_current_turn(messages):
                message_type = message.get("type")
                if message_type == "ai":
                    raw_id = message.get("id")
                    events.extend(
                        self._ensure_message_started(
                            raw_id if isinstance(raw_id, str) else None
                        )
                    )

                    reasoning = _extract_reasoning_content(message)
                    if (
                        reasoning
                        and self.frontend_message_id is not None
                        and reasoning != self.reasoning_text
                    ):
                        if reasoning.startswith(self.reasoning_text):
                            reasoning_delta = reasoning[len(self.reasoning_text) :]
                        else:
                            reasoning_delta = reasoning
                        if reasoning_delta:
                            events.append(
                                {
                                    "event": "reasoning.delta",
                                    "data": {
                                        "message_id": self.frontend_message_id,
                                        "delta": reasoning_delta,
                                    },
                                }
                            )
                            self.reasoning_text = reasoning

                    for tool_call in message.get("tool_calls") or []:
                        if not isinstance(tool_call, dict):
                            continue
                        tool_call_id = tool_call.get("id")
                        if (
                            not _is_valid_tool_call_id(tool_call_id)
                            or tool_call_id in self.started_tool_ids
                        ):
                            continue
                        event = _tool_started_event(tool_call)
                        if event is not None:
                            events.append(event)
                        self.started_tool_ids.add(tool_call_id)

                    content = _extract_text_content(message.get("content"))
                    if (
                        content
                        and self.frontend_message_id is not None
                        and content != self.message_text
                    ):
                        if content.startswith(self.message_text):
                            delta = content[len(self.message_text) :]
                        else:
                            delta = content
                        if delta:
                            events.append(
                                {
                                    "event": "message.delta",
                                    "data": {
                                        "message_id": self.frontend_message_id,
                                        "delta": delta,
                                    },
                                }
                            )
                            self.message_text = content

                elif message_type == "tool":
                    tool_call_id = message.get("tool_call_id")
                    if (
                        not _is_valid_tool_call_id(tool_call_id)
                        or tool_call_id in self.completed_tool_ids
                    ):
                        continue

                    content = _extract_text_content(message.get("content"))
                    if content:
                        events.append(
                            {
                                "event": "tool.progress",
                                "data": {
                                    "tool_call_id": tool_call_id,
                                    "message": content,
                                },
                            }
                        )
                    events.append(
                        {
                            "event": "tool.completed",
                            "data": {"tool_call_id": tool_call_id},
                        }
                    )
                    self.completed_tool_ids.add(tool_call_id)

            return events

        if event_name == "end":
            if self.run_failed:
                return []
            if self.frontend_message_id is not None and not self.message_completed:
                self.message_completed = True
                return [
                    {
                        "event": "message.completed",
                        "data": {"message_id": self.frontend_message_id},
                    }
                ]
            return []

        return []


async def iter_sse_lines(
    client: httpx.AsyncClient,
    response: httpx.Response,
) -> AsyncIterator[str]:
    event_name: str | None = None
    data_lines: list[str] = []
    normalizer = StreamEventNormalizer()

    async def flush_event() -> AsyncIterator[str]:
        nonlocal event_name, data_lines
        if not event_name:
            return

        raw_data = {} if not data_lines else json.loads("\n".join(data_lines))
        for payload in normalizer.normalize(event_name, raw_data):
            yield f"event: {payload['event']}\n"
            yield f"data: {json.dumps(payload['data'])}\n\n"
        event_name = None
        data_lines = []

    try:
        async for line in response.aiter_lines():
            if not line:
                async for item in flush_event():
                    yield item
                continue

            if line.startswith("event: "):
                event_name = line.removeprefix("event: ").strip()
                continue

            if line.startswith("data: "):
                data_lines.append(line.removeprefix("data: "))
                continue

        async for item in flush_event():
            yield item
    finally:
        await response.aclose()
        await client.aclose()
