from orchestrator.core.outputs.output_fetcher import OutputFetcher


def test_output_fetcher_extracts_images() -> None:
    fetcher = OutputFetcher()
    payload = {
        "prompt_id": {
            "outputs": {
                "1": {
                    "images": [
                        {"filename": "a.png", "subfolder": "", "type": "output"}
                    ]
                }
            }
        }
    }
    images = fetcher.extract_images(payload)
    assert images == [{"filename": "a.png", "subfolder": "", "type": "output"}]
    print("PASS: test_output_fetcher_extracts_images")
