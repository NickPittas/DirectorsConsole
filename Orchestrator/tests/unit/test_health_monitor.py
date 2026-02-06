import asyncio

from orchestrator.backends.client import ComfyUIClient
from orchestrator.backends.health_monitor import HealthMonitor
from orchestrator.backends.manager import BackendManager
from orchestrator.core.models.backend import BackendConfig


def test_health_monitor_run() -> None:
    manager = BackendManager()
    manager.register(BackendConfig(id="b1", name="PC1", host="127.0.0.1"))

    class StubClient(ComfyUIClient):
        async def health_check(self) -> bool:
            return True

        async def close(self) -> None:
            return None

    def factory(config: BackendConfig) -> ComfyUIClient:
        return StubClient("http://127.0.0.1:8188")

    monitor = HealthMonitor(manager=manager, client_factory=factory)
    asyncio.run(monitor.run())
    print("PASS: test_health_monitor_run")
