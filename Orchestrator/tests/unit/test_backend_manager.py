from orchestrator.backends.manager import BackendManager
from orchestrator.core.models.backend import BackendConfig


def test_manager_register() -> None:
    manager = BackendManager()
    manager.register(BackendConfig(id="b1", name="PC1", host="127.0.0.1"))
    assert manager.list()
    print("PASS: test_manager_register")
