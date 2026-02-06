from orchestrator.core.models.backend import BackendConfig


def test_backend_config_urls() -> None:
    cfg = BackendConfig(
        id="b1",
        name="PC1",
        host="127.0.0.1",
    )
    assert cfg.base_url == "http://127.0.0.1:8188"
    assert cfg.ws_url == "ws://127.0.0.1:8188/ws"
    print("PASS: test_backend_config_urls")
