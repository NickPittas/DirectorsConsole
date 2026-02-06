"""Tests for workflow conversion and inspection using ComfyUI object_info."""
from __future__ import annotations

from orchestrator.core.workflow.converter import workflow_to_api
from orchestrator.core.workflow.inspector import (
    inspect_parameters,
    build_widget_map_from_object_info,
)
from orchestrator.core.models.workflow import ParamType


# Sample object_info response from ComfyUI /object_info endpoint
SAMPLE_OBJECT_INFO = {
    "KSampler": {
        "input": {
            "required": {
                "model": ["MODEL"],
                "seed": ["INT", {"default": 0, "min": 0, "max": 18446744073709551615}],
                "steps": ["INT", {"default": 20, "min": 1, "max": 10000}],
                "cfg": ["FLOAT", {"default": 8.0, "min": 0.0, "max": 100.0, "step": 0.1}],
                "sampler_name": [["euler", "euler_ancestral", "heun", "dpm_2"]],
                "scheduler": [["normal", "karras", "exponential"]],
                "denoise": ["FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.01}],
                "positive": ["CONDITIONING"],
                "negative": ["CONDITIONING"],
                "latent_image": ["LATENT"],
            },
            "optional": {},
        },
        "output": ["LATENT"],
        "output_name": ["LATENT"],
        "name": "KSampler",
        "category": "sampling",
    },
    "CLIPTextEncode": {
        "input": {
            "required": {
                "clip": ["CLIP"],
                "text": ["STRING", {"multiline": True, "default": ""}],
            },
        },
        "output": ["CONDITIONING"],
        "output_name": ["CONDITIONING"],
        "name": "CLIPTextEncode",
        "category": "conditioning",
    },
    "CheckpointLoaderSimple": {
        "input": {
            "required": {
                "ckpt_name": [["v1-5-pruned.safetensors", "sd_xl_base.safetensors"]],
            },
        },
        "output": ["MODEL", "CLIP", "VAE"],
        "output_name": ["MODEL", "CLIP", "VAE"],
        "name": "CheckpointLoaderSimple",
        "category": "loaders",
    },
    "EmptyLatentImage": {
        "input": {
            "required": {
                "width": ["INT", {"default": 512, "min": 16, "max": 8192, "step": 8}],
                "height": ["INT", {"default": 512, "min": 16, "max": 8192, "step": 8}],
                "batch_size": ["INT", {"default": 1, "min": 1, "max": 64}],
            },
        },
        "output": ["LATENT"],
        "output_name": ["LATENT"],
        "name": "EmptyLatentImage",
        "category": "latent",
    },
}


def test_build_widget_map_from_object_info() -> None:
    """Test building widget map from object_info extracts widget input names in order."""
    widget_map = build_widget_map_from_object_info(SAMPLE_OBJECT_INFO)

    # KSampler should have widget inputs (non-connection types)
    assert "KSampler" in widget_map
    ksampler_widgets = widget_map["KSampler"]
    # Widget order: seed, steps, cfg, sampler_name, scheduler, denoise
    # (excludes model, positive, negative, latent_image which are connection types)
    assert ksampler_widgets == [
        "seed",
        "steps",
        "cfg",
        "sampler_name",
        "scheduler",
        "denoise",
    ]

    # CLIPTextEncode should have 'text' as widget
    assert "CLIPTextEncode" in widget_map
    assert widget_map["CLIPTextEncode"] == ["text"]

    # CheckpointLoaderSimple should have 'ckpt_name' as widget (combo)
    assert "CheckpointLoaderSimple" in widget_map
    assert widget_map["CheckpointLoaderSimple"] == ["ckpt_name"]

    # EmptyLatentImage should have width, height, batch_size as widgets
    assert "EmptyLatentImage" in widget_map
    assert widget_map["EmptyLatentImage"] == ["width", "height", "batch_size"]


def test_converter_uses_object_info_map() -> None:
    """Test workflow_to_api correctly maps widget values using object_info-derived map."""
    workflow = {
        "nodes": [
            {"id": 1, "type": "KSampler", "widgets_values": [42, 30, 7.5, "euler", "normal", 1.0]},
        ],
        "links": [],
    }
    widget_map = build_widget_map_from_object_info(SAMPLE_OBJECT_INFO)
    api = workflow_to_api(workflow, widget_map)

    assert api["1"]["inputs"]["seed"] == 42
    assert api["1"]["inputs"]["steps"] == 30
    assert api["1"]["inputs"]["cfg"] == 7.5
    assert api["1"]["inputs"]["sampler_name"] == "euler"
    assert api["1"]["inputs"]["scheduler"] == "normal"
    assert api["1"]["inputs"]["denoise"] == 1.0


def test_converter_handles_links() -> None:
    """Test converter properly handles linked inputs from object_info workflow."""
    workflow = {
        "nodes": [
            {"id": 1, "type": "CheckpointLoaderSimple", "widgets_values": ["v1-5-pruned.safetensors"]},
            {
                "id": 2,
                "type": "KSampler",
                "widgets_values": [42, 20, 8, "euler", "normal", 1],
                "inputs": [
                    {"name": "model", "type": "MODEL", "link": 1},
                ],
            },
        ],
        "links": [
            [1, 1, 0, 2, 0, "MODEL"],  # link_id, src_node, src_slot, dst_node, dst_slot, type
        ],
    }
    widget_map = build_widget_map_from_object_info(SAMPLE_OBJECT_INFO)
    api = workflow_to_api(workflow, widget_map)

    # KSampler's model input should reference CheckpointLoaderSimple
    assert api["2"]["inputs"]["model"] == ["1", 0]
    # Widget values should still be mapped
    assert api["2"]["inputs"]["seed"] == 42


def test_inspector_with_object_info_finds_exposable_params() -> None:
    """Test inspector finds exposable parameters using object_info metadata."""
    workflow = {
        "nodes": [
            {"id": 1, "type": "KSampler", "widgets_values": [42, 20, 8, "euler", "normal", 1]},
            {"id": 2, "type": "CLIPTextEncode", "widgets_values": ["a beautiful sunset"]},
        ],
        "links": [],
    }
    params = inspect_parameters(workflow, object_info=SAMPLE_OBJECT_INFO)

    # Should find parameters from KSampler
    ksampler_params = [p for p in params if p.node_id == "1"]
    assert len(ksampler_params) == 6

    # Check seed parameter has correct constraints from object_info
    seed_param = next(p for p in ksampler_params if p.field_name == "seed")
    assert seed_param.param_type == ParamType.INT
    assert seed_param.default_value == 42
    assert seed_param.constraints is not None
    assert seed_param.constraints.min_value == 0
    # Large int gets converted to float, so compare approximately
    assert seed_param.constraints.max_value >= 18446744073709551615 * 0.99

    # Check cfg has float constraints
    cfg_param = next(p for p in ksampler_params if p.field_name == "cfg")
    assert cfg_param.param_type == ParamType.FLOAT
    assert cfg_param.constraints is not None
    assert cfg_param.constraints.min_value == 0.0
    assert cfg_param.constraints.max_value == 100.0
    assert cfg_param.constraints.step == 0.1

    # Check sampler_name is CHOICE type with choices
    sampler_param = next(p for p in ksampler_params if p.field_name == "sampler_name")
    assert sampler_param.param_type == ParamType.CHOICE
    assert sampler_param.constraints is not None
    assert sampler_param.constraints.choices == ["euler", "euler_ancestral", "heun", "dpm_2"]

    # Should find text parameter from CLIPTextEncode
    clip_params = [p for p in params if p.node_id == "2"]
    assert len(clip_params) == 1
    text_param = clip_params[0]
    assert text_param.field_name == "text"
    assert text_param.param_type == ParamType.MULTILINE_STRING


def test_inspector_without_object_info_uses_defaults() -> None:
    """Test inspector falls back to inference when no object_info provided."""
    workflow = {
        "nodes": [
            {"id": 1, "type": "KSampler", "widgets_values": [42]},
        ],
        "links": [],
    }
    # No object_info provided - should use default behavior
    params = inspect_parameters(workflow)

    assert len(params) >= 1
    seed_param = params[0]
    assert seed_param.field_name == "seed"
    assert seed_param.param_type == ParamType.INT


def test_inspector_extracts_constraints_from_object_info() -> None:
    """Test inspector properly extracts constraints for various param types."""
    workflow = {
        "nodes": [
            {"id": 1, "type": "EmptyLatentImage", "widgets_values": [768, 768, 4]},
        ],
        "links": [],
    }
    params = inspect_parameters(workflow, object_info=SAMPLE_OBJECT_INFO)

    width_param = next(p for p in params if p.field_name == "width")
    assert width_param.constraints is not None
    assert width_param.constraints.min_value == 16
    assert width_param.constraints.max_value == 8192
    assert width_param.constraints.step == 8

    batch_param = next(p for p in params if p.field_name == "batch_size")
    assert batch_param.default_value == 4  # From workflow, not object_info default
    assert batch_param.constraints is not None
    assert batch_param.constraints.min_value == 1
    assert batch_param.constraints.max_value == 64


def test_inspector_handles_unknown_node_types() -> None:
    """Test inspector handles node types not in object_info gracefully."""
    workflow = {
        "nodes": [
            {"id": 1, "type": "UnknownCustomNode", "widgets_values": [100, "test"]},
        ],
        "links": [],
    }
    params = inspect_parameters(workflow, object_info=SAMPLE_OBJECT_INFO)

    # Should still create parameters via inference
    assert len(params) == 2
    assert params[0].field_name == "widget_0"  # Falls back to generic names
    assert params[0].param_type == ParamType.INT
    assert params[1].field_name == "widget_1"
    assert params[1].param_type == ParamType.STRING
