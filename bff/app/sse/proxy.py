from collections.abc import AsyncIterator
import json

import httpx


def normalize_stream_event(event: dict) -> dict:
    mapping = {
        "message_start": "message.started",
        "message_delta": "message.delta",
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


async def iter_sse_lines(
    client: httpx.AsyncClient,
    response: httpx.Response,
) -> AsyncIterator[str]:
    event_name: str | None = None
    data_lines: list[str] = []

    async def flush_event() -> AsyncIterator[str]:
        nonlocal event_name, data_lines
        if not event_name:
            return

        payload = normalize_stream_event(
            {
                "event": event_name,
                "data": {} if not data_lines else json.loads("\n".join(data_lines)),
            }
        )
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
