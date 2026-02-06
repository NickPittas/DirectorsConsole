from __future__ import annotations


class OutputFetcher:
    def extract_images(self, history_payload: dict) -> list[dict]:
        images: list[dict] = []
        for entry in history_payload.values():
            outputs = entry.get("outputs", {}) if isinstance(entry, dict) else {}
            for output in outputs.values():
                if not isinstance(output, dict):
                    continue
                images.extend(output.get("images", []))
        return images
