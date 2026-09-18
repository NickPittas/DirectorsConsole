"""Contract checks for the bundled ComfyUI prompt API."""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
import re

import pytest
import pytest_asyncio
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

import ComfyCinemaPrompting.api_routes as api_routes
from cinema_rules.presets.live_action import LIVE_ACTION_PRESETS
from cinema_rules.schemas.animation import AnimationConfig
from cinema_rules.schemas.live_action import LiveActionConfig


BASE = "/cinema_prompt/api"
EDITOR_BASE = "/cinema_prompt/app"
pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def comfy_client(monkeypatch: pytest.MonkeyPatch):
    """Run the node routes against an in-process stand-in for ComfyUI."""
    app = web.Application()
    monkeypatch.setattr(api_routes.PromptServer, "instance", SimpleNamespace(app=app))
    api_routes.register_routes()

    server = TestServer(app)
    client = TestClient(server)
    await client.start_server()
    try:
        yield client
    finally:
        await client.close()


def _config_json() -> dict:
    return LiveActionConfig().model_dump(mode="json")


async def _apply(client: TestClient, preset_id: str) -> dict:
    response = await client.post(
        f"{BASE}/apply-preset/live-action",
        json={"preset_id": preset_id},
    )
    assert response.status == 200
    return await response.json()


async def _options(client: TestClient, config: dict, field_path: str) -> dict:
    response = await client.post(
        f"{BASE}/options",
        json={
            "project_type": "live_action",
            "field_path": field_path,
            "current_config": config,
        },
    )
    assert response.status == 200
    data = await response.json()
    assert set(data) == {
        "field_path",
        "options",
        "disabled_options",
        "disabled_reasons",
    }
    return data


async def test_editor_bundle_routes_serve_index_assets_and_image(comfy_client: TestClient) -> None:
    index = await comfy_client.get(f"{EDITOR_BASE}/")
    assert index.status == 200
    html = await index.text()
    assert '<div id="root"></div>' in html

    references = re.findall(r'(?:src|href)="([^"]+)"', html)
    for reference in references:
        if reference.startswith("./"):
            asset = await comfy_client.get(f"{EDITOR_BASE}/{reference[2:]}")
            assert asset.status == 200, reference

    image = await comfy_client.get(f"{EDITOR_BASE}/movie-frames/citizen-kane.jpg")
    assert image.status == 200
    assert image.headers["Content-Type"].startswith("image/jpeg")


async def test_editor_bundle_missing_returns_actionable_error(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    app = web.Application()
    missing_dir = tmp_path / "missing-editor-bundle"
    monkeypatch.setattr(api_routes, "EDITOR_APP_DIR", missing_dir)
    monkeypatch.setattr(api_routes, "EDITOR_INDEX_PATH", missing_dir / "index.html")
    monkeypatch.setattr(api_routes.PromptServer, "instance", SimpleNamespace(app=app))
    api_routes.register_routes()

    server = TestServer(app)
    client = TestClient(server)
    await client.start_server()
    try:
        response = await client.get(f"{EDITOR_BASE}/")
        assert response.status == 503
        assert "npm run build:comfyui" in await response.text()
    finally:
        await client.close()


async def test_options_route_uses_canonical_values_and_node_prefix(comfy_client: TestClient) -> None:
    data = await _options(comfy_client, _config_json(), "visual_grammar.composition")

    assert data["field_path"] == "visual_grammar.composition"
    assert {"Depth_Layering", "Deep_Focus"}.issubset(data["options"])

    source = await _options(comfy_client, _config_json(), "lighting.source")
    style = await _options(comfy_client, _config_json(), "lighting.style")
    assert {"Practical", "Practical_Lights"}.issubset(source["options"])
    assert {"Soft", "Soft_Lighting"}.issubset(style["options"])


async def test_every_live_action_preset_applies_to_valid_option_values(comfy_client: TestClient) -> None:
    fields = (
        "visual_grammar.composition",
        "lighting.source",
        "lighting.style",
    )
    for preset_id in LIVE_ACTION_PRESETS:
        result = await _apply(comfy_client, preset_id)
        config = result["config"]
        LiveActionConfig.model_validate(config)
        for field_path in fields:
            section, field = field_path.split(".")
            value = config[section][field]
            options = await _options(comfy_client, config, field_path)
            assert value in options["options"] or value in options["disabled_options"]


@pytest.mark.parametrize(
    ("project_type", "config"),
    [
        ("live_action", LiveActionConfig().model_dump(mode="json")),
        ("animation", AnimationConfig().model_dump(mode="json")),
    ],
)
async def test_generate_prompt_includes_canonical_validation_contract(
    comfy_client: TestClient,
    project_type: str,
    config: dict,
) -> None:
    response = await comfy_client.post(
        f"{BASE}/generate-prompt",
        json={
            "project_type": project_type,
            "config": config,
            "target_model": "generic",
        },
    )
    assert response.status == 200
    generated = await response.json()
    assert generated["prompt"]
    assert generated["validation"]["status"] in {"valid", "warning", "invalid"}
    assert isinstance(generated["validation"]["messages"], list)
    model = LiveActionConfig if project_type == "live_action" else AnimationConfig
    expected = (
        api_routes.engine.validate_live_action(model.model_validate(config))
        if project_type == "live_action"
        else api_routes.engine.validate_animation(model.model_validate(config))
    )
    assert generated["validation"] == expected.model_dump(mode="json")


async def test_generate_prompt_preserves_invalid_config_response(comfy_client: TestClient) -> None:
    response = await comfy_client.post(
        f"{BASE}/generate-prompt",
        json={
            "project_type": "live_action",
            "config": {"camera": {"manufacturer": "not-a-camera"}},
        },
    )
    assert response.status == 400


async def test_canonical_preset_prompt_wording_and_negative_prompt(comfy_client: TestClient) -> None:
    citizen_kane = (await _apply(comfy_client, "citizen_kane"))["config"]
    in_mood_for_love = (await _apply(comfy_client, "in_the_mood_for_love"))["config"]

    assert citizen_kane["visual_grammar"]["composition"] == "Deep_Focus"
    assert in_mood_for_love["lighting"]["source"] == "Practical_Lights"
    assert in_mood_for_love["lighting"]["style"] == "Soft_Lighting"

    legacy = await comfy_client.post(
        f"{BASE}/apply-preset/live-action",
        json={
            "preset_id": "in_the_mood_for_love",
            "overrides": {
                "visual_grammar.composition": "Depth_Layering",
                "lighting.source": "Practical",
                "lighting.style": "Soft",
            },
        },
    )
    assert legacy.status == 200
    legacy_config = (await legacy.json())["config"]
    assert legacy_config["visual_grammar"]["composition"] == "Depth_Layering"
    assert legacy_config["lighting"]["source"] == "Practical"
    assert legacy_config["lighting"]["style"] == "Soft"

    for config, phrases in (
        (
            citizen_kane,
            ("Deep Focus composition",),
        ),
        (
            in_mood_for_love,
            ("Practical Lights light source", "Soft Lighting lighting style"),
        ),
    ):
        response = await comfy_client.post(
            f"{BASE}/generate-prompt",
            json={
                "project_type": "live_action",
                "config": config,
                "target_model": "generic",
            },
        )
        assert response.status == 200
        generated = await response.json()
        assert all(phrase in generated["prompt"] for phrase in phrases)
        assert generated["negative_prompt"] == (
            "blurry, low quality, distorted, deformed, ugly, bad anatomy, "
            "watermark, signature, text, logo, amateur, poorly lit"
        )
