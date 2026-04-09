from collections.abc import AsyncIterator

import httpx


async def iter_sse_lines(
    client: httpx.AsyncClient,
    response: httpx.Response,
) -> AsyncIterator[str]:
    try:
        async for line in response.aiter_lines():
            if line:
                yield f"{line}\n\n"
    finally:
        await response.aclose()
        await client.aclose()
