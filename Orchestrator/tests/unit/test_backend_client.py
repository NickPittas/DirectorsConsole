import asyncio

import httpx

from orchestrator.backends.client import ComfyUIClient


def test_health_check_success() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"system": {}})

    transport = httpx.MockTransport(handler)
    client = ComfyUIClient("http://127.0.0.1:8188", transport=transport)
    assert asyncio.run(client.health_check()) is True
    print("PASS: test_health_check_success")
