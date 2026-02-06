from __future__ import annotations

import pytest

from orchestrator.backends.client import ComfyUIClient
from orchestrator.backends.health_monitor import HealthMonitor
from orchestrator.backends.manager import BackendManager
from orchestrator.core.models.backend import BackendConfig


class StubClient(ComfyUIClient):
    async def health_check(self) -> bool:
        return True

    async def close(self) -> None:
        return None


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.anyio
async def test_backend_flow_updates_status() -> None:
    manager = BackendManager()
    manager.register(BackendConfig(id="b1", name="PC1", host="127.0.0.1"))
    monitor = HealthMonitor(manager, lambda cfg: StubClient(cfg.base_url))

    await monitor.poll_once()

    status = manager.get_status("b1")
    assert status is not None
    assert status.online is True
