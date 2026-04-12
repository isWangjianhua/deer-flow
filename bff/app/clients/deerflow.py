import httpx

from app.core.config import get_settings


class DeerFlowClient:
    def __init__(self) -> None:
        settings = get_settings()
        self.base_url = settings.deerflow_gateway_base_url.rstrip("/")
        self.timeout = settings.deerflow_timeout_seconds

    async def create_thread(self) -> str:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(f"{self.base_url}/api/threads", json={"metadata": {}})
            response.raise_for_status()
            payload = response.json()
            return payload["thread_id"]

    async def get_models(self) -> dict:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(f"{self.base_url}/api/models")
            response.raise_for_status()
            return response.json()

    async def stream_message(
        self,
        thread_id: str,
        message: str,
        context: dict | None = None,
    ) -> tuple[httpx.AsyncClient, httpx.Response]:
        client = httpx.AsyncClient(timeout=None)
        payload = {
            "input": {"messages": [{"role": "user", "content": message}]},
            "stream_mode": ["messages-tuple", "values"],
        }
        if context:
            payload["context"] = context
        request = client.build_request(
            "POST",
            f"{self.base_url}/api/threads/{thread_id}/runs/stream",
            json=payload,
        )
        response = await client.send(request, stream=True)
        response.raise_for_status()
        return client, response

    async def get_thread_history(self, thread_id: str, limit: int = 1) -> list[dict]:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
          response = await client.post(
              f"{self.base_url}/api/threads/{thread_id}/history",
              json={"limit": limit},
          )
          response.raise_for_status()
          return response.json()
