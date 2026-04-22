import httpx

from app.core.config import get_settings


class DeerFlowClient:
    def __init__(self) -> None:
        settings = get_settings()
        self.base_url = settings.deerflow_gateway_base_url.rstrip("/")
        self.timeout = settings.deerflow_timeout_seconds

    @staticmethod
    def _memory_headers(user_id: str, agent_id: str | None = None) -> dict[str, str]:
        headers = {"X-User-Id": user_id}
        if agent_id is not None:
            headers["X-Agent-Id"] = agent_id
        return headers

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

    async def list_agents(self) -> dict:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(f"{self.base_url}/api/agents")
            response.raise_for_status()
            return response.json()

    async def check_agent_name(self, name: str) -> dict:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(
                f"{self.base_url}/api/agents/check",
                params={"name": name},
            )
            response.raise_for_status()
            return response.json()

    async def get_agent(self, name: str) -> dict:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(f"{self.base_url}/api/agents/{name}")
            response.raise_for_status()
            return response.json()

    async def create_agent(self, payload: dict) -> dict:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                f"{self.base_url}/api/agents",
                json=payload,
            )
            response.raise_for_status()
            return response.json()

    async def update_agent(self, name: str, payload: dict) -> dict:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.put(
                f"{self.base_url}/api/agents/{name}",
                json=payload,
            )
            response.raise_for_status()
            return response.json()

    async def delete_agent(self, name: str) -> dict:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.delete(f"{self.base_url}/api/agents/{name}")
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
        body: bytes,
        content_type: str,
    ) -> dict:
        async with httpx.AsyncClient(timeout=None) as client:
            response = await client.post(
                f"{self.base_url}/api/threads/{thread_id}/uploads",
                content=body,
                headers={"content-type": content_type},
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

    async def delete_thread(self, thread_id: str) -> dict:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.delete(f"{self.base_url}/api/threads/{thread_id}")
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

    async def get_memory(self, *, user_id: str, agent_id: str | None = None) -> dict:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(
                f"{self.base_url}/api/memory",
                headers=self._memory_headers(user_id, agent_id),
            )
            response.raise_for_status()
            return response.json()

    async def get_memory_status(self, *, user_id: str) -> dict:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(
                f"{self.base_url}/api/memory/status",
                headers=self._memory_headers(user_id),
            )
            response.raise_for_status()
            return response.json()

    async def import_memory(self, *, user_id: str, memory_data: dict) -> dict:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                f"{self.base_url}/api/memory/import",
                json=memory_data,
                headers=self._memory_headers(user_id),
            )
            response.raise_for_status()
            return response.json()

    async def create_memory_fact(
        self,
        *,
        user_id: str,
        content: str,
        category: str = "context",
        confidence: float = 0.5,
    ) -> dict:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                f"{self.base_url}/api/memory/facts",
                json={
                    "content": content,
                    "category": category,
                    "confidence": confidence,
                },
                headers=self._memory_headers(user_id),
            )
            response.raise_for_status()
            return response.json()

    async def update_memory_fact(
        self,
        *,
        user_id: str,
        fact_id: str,
        content: str | None = None,
        category: str | None = None,
        confidence: float | None = None,
    ) -> dict:
        payload = {key: value for key, value in {"content": content, "category": category, "confidence": confidence}.items() if value is not None}
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.patch(
                f"{self.base_url}/api/memory/facts/{fact_id}",
                json=payload,
                headers=self._memory_headers(user_id),
            )
            response.raise_for_status()
            return response.json()

    async def delete_memory_fact(self, *, user_id: str, fact_id: str) -> dict:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.delete(
                f"{self.base_url}/api/memory/facts/{fact_id}",
                headers=self._memory_headers(user_id),
            )
            response.raise_for_status()
            return response.json()

    async def clear_memory(self, *, user_id: str) -> dict:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.delete(
                f"{self.base_url}/api/memory",
                headers=self._memory_headers(user_id),
            )
            response.raise_for_status()
            return response.json()
