"""HTTP client for the external LangGraph runtime service."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

import httpx
from fastapi import HTTPException


def _response_detail(response: httpx.Response, default: str) -> str:
    try:
        payload = response.json()
    except json.JSONDecodeError:
        payload = None

    if isinstance(payload, dict):
        detail = payload.get("detail")
        if isinstance(detail, str) and detail.strip():
            return detail
    text = response.text.strip()
    return text or default


class LangGraphRuntimeClient:
    """Small HTTP wrapper around the LangGraph runtime API."""

    def __init__(self, http_client: httpx.AsyncClient) -> None:
        self._http = http_client

    async def _request_json(
        self,
        method: str,
        path: str,
        *,
        json_body: Any = None,
        params: dict[str, Any] | None = None,
        default_error: str = "LangGraph runtime request failed",
    ) -> Any:
        try:
            response = await self._http.request(method, path, json=json_body, params=params)
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail="LangGraph runtime unavailable") from exc

        if response.status_code >= 400:
            raise HTTPException(status_code=response.status_code, detail=_response_detail(response, default_error))

        if response.status_code == 204 or not response.content:
            return None

        return response.json()

    async def start_stream(
        self,
        method: str,
        path: str,
        *,
        json_body: Any = None,
        params: dict[str, Any] | None = None,
        default_error: str = "LangGraph runtime stream failed",
    ) -> httpx.Response:
        request = self._http.build_request(method, path, json=json_body, params=params)
        try:
            response = await self._http.send(request, stream=True)
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail="LangGraph runtime unavailable") from exc

        if response.status_code >= 400:
            try:
                body = await response.aread()
                detail = body.decode("utf-8", errors="ignore").strip() or default_error
                try:
                    payload = json.loads(detail)
                except json.JSONDecodeError:
                    payload = None
                if isinstance(payload, dict):
                    upstream_detail = payload.get("detail")
                    if isinstance(upstream_detail, str) and upstream_detail.strip():
                        detail = upstream_detail
                raise HTTPException(status_code=response.status_code, detail=detail)
            finally:
                await response.aclose()
        return response

    async def create_thread(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._request_json("POST", "/threads", json_body=payload, default_error="Failed to create thread")

    async def search_threads(self, payload: dict[str, Any]) -> list[dict[str, Any]]:
        result = await self._request_json("POST", "/threads/search", json_body=payload, default_error="Failed to search threads")
        return result if isinstance(result, list) else []

    async def get_thread(self, thread_id: str) -> dict[str, Any]:
        return await self._request_json("GET", f"/threads/{thread_id}", default_error="Failed to get thread")

    async def patch_thread(self, thread_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._request_json("PATCH", f"/threads/{thread_id}", json_body=payload, default_error="Failed to patch thread")

    async def delete_thread(self, thread_id: str) -> None:
        await self._request_json("DELETE", f"/threads/{thread_id}", default_error="Failed to delete thread")

    async def get_thread_state(self, thread_id: str) -> dict[str, Any]:
        return await self._request_json("GET", f"/threads/{thread_id}/state", default_error="Failed to get thread state")

    async def update_thread_state(self, thread_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._request_json(
            "POST",
            f"/threads/{thread_id}/state",
            json_body=payload,
            default_error="Failed to update thread state",
        )

    async def get_thread_history(self, thread_id: str, payload: dict[str, Any]) -> list[dict[str, Any]]:
        result = await self._request_json(
            "POST",
            f"/threads/{thread_id}/history",
            json_body=payload,
            default_error="Failed to get thread history",
        )
        return result if isinstance(result, list) else []

    async def create_thread_run(self, thread_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._request_json(
            "POST",
            f"/threads/{thread_id}/runs",
            json_body=payload,
            default_error="Failed to create run",
        )

    async def wait_thread_run(self, thread_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        result = await self._request_json(
            "POST",
            f"/threads/{thread_id}/runs/wait",
            json_body=payload,
            default_error="Failed to wait for run",
        )
        return result if isinstance(result, dict) else {}

    async def list_thread_runs(self, thread_id: str) -> list[dict[str, Any]]:
        result = await self._request_json("GET", f"/threads/{thread_id}/runs", default_error="Failed to list runs")
        return result if isinstance(result, list) else []

    async def get_thread_run(self, thread_id: str, run_id: str) -> dict[str, Any]:
        return await self._request_json("GET", f"/threads/{thread_id}/runs/{run_id}", default_error="Failed to get run")

    async def cancel_thread_run(self, thread_id: str, run_id: str, *, wait: bool, action: str) -> int:
        try:
            response = await self._http.post(
                f"/threads/{thread_id}/runs/{run_id}/cancel",
                params={"wait": wait, "action": action},
            )
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail="LangGraph runtime unavailable") from exc

        if response.status_code >= 400:
            raise HTTPException(status_code=response.status_code, detail=_response_detail(response, "Failed to cancel run"))
        return response.status_code

    async def wait_stateless_run(self, payload: dict[str, Any]) -> dict[str, Any]:
        result = await self._request_json("POST", "/runs/wait", json_body=payload, default_error="Failed to wait for run")
        return result if isinstance(result, dict) else {}


async def iter_sse_text(response: httpx.Response) -> AsyncIterator[str]:
    try:
        async for chunk in response.aiter_text():
            if chunk:
                yield chunk
    finally:
        await response.aclose()
