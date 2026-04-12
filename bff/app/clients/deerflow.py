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

    async def generate_suggestions(self, thread_id: str, payload: dict) -> dict:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                f"{self.base_url}/api/threads/{thread_id}/suggestions",
                json=payload,
            )
            response.raise_for_status()
            return response.json()

    async def get_artifact(
        self,
        thread_id: str,
        path: str,
        *,
        download: bool = False,
    ) -> httpx.Response:
        async with httpx.AsyncClient(timeout=None) as client:
            response = await client.get(
                f"{self.base_url}/api/threads/{thread_id}/artifacts/{path}",
                params={"download": "true"} if download else None,
            )
            response.raise_for_status()
            await response.aread()
            return response

    async def upload_files(
        self,
        thread_id: str,
        files: list[tuple[str, bytes, str | None]],
    ) -> dict:
        payload = [
            ("files", (filename, content, content_type or "application/octet-stream"))
            for filename, content, content_type in files
        ]
        async with httpx.AsyncClient(timeout=None) as client:
            response = await client.post(
                f"{self.base_url}/api/threads/{thread_id}/uploads",
                files=payload,
            )
            response.raise_for_status()
            return response.json()

    async def list_uploaded_files(self, thread_id: str) -> dict:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(f"{self.base_url}/api/threads/{thread_id}/uploads/list")
            response.raise_for_status()
            return response.json()

    async def delete_uploaded_file(self, thread_id: str, filename: str) -> dict:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.delete(
                f"{self.base_url}/api/threads/{thread_id}/uploads/{filename}",
            )
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
