from orchestrator.backends.client import ComfyUIClient, ImageOutput


def test_build_view_url() -> None:
    client = ComfyUIClient("127.0.0.1", 8188)
    assert client._view_url("img.png", "", "output").endswith("/view")


def test_download_outputs_flattens_history() -> None:
    client = ComfyUIClient("127.0.0.1", 8188)
    history = {
        "outputs": {
            "1": {
                "images": [
                    {"filename": "img.png", "subfolder": "", "type": "output"}
                ]
            }
        }
    }

    # download_outputs is synchronous, not async
    outputs = client.download_outputs(history)

    assert outputs == [
        ImageOutput(filename="img.png", subfolder="", image_type="output")
    ]


def test_progress_update_maps_percent() -> None:
    client = ComfyUIClient("127.0.0.1", 8188)
    update = client._progress_update("progress", {"value": 2, "max": 4, "node": "7"})

    assert update is not None
    assert update.percent == 50.0
    assert update.current_step == "2/4"
    assert update.node_id == "7"
