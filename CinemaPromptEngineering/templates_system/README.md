# Templates System

Complete template management system ported from StoryboardUI2 for the Director's Console.

## Overview

This module provides comprehensive template functionality for ComfyUI workflow management:
- Template discovery and loading
- Parameter extraction and validation
- LoRA management
- Camera angle library (96 presets)
- Workflow building
- Export capabilities

## Directory Structure

```
templates_system/
├── __init__.py              # Module exports
├── models/                  # Data models
│   ├── template.py         # Template & TemplateMeta
│   ├── parameter.py        # Parameter & ParameterConstraints
│   ├── lora.py            # LoraSlot
│   └── image_input.py     # ImageInput
├── core/                   # Core modules
│   ├── template_loader.py  # Template discovery
│   ├── workflow_builder.py # Workflow construction
│   ├── prompt_builder.py   # Prompt assembly
│   ├── angle_library.py    # Camera angles
│   ├── export_manager.py   # Export functionality
│   ├── session_manager.py  # Session save/load
│   ├── comfyui_client.py   # ComfyUI HTTP client
│   ├── batch_generation.py # Batch processing
│   └── comfyui_websocket.py # WebSocket client
├── data/                   # Data files
│   ├── angles.txt         # 96 camera angle definitions
│   ├── template_schema.json # JSON schema
│   └── comfyui_nodes_reference.md # Node docs
├── templates/             # Built-in templates (10 files)
└── user_templates/        # User-created templates
```

## Quick Start

### Load Templates

```python
from templates_system import TemplateLoader

loader = TemplateLoader()
templates = loader.load_all()

# Filter by category
t2i_templates = [t for t in templates if "text_to_image" in t.categories]

# Get specific template
flux_template = loader.load_by_name("flux_schnell")
```

### Build Workflow

```python
from templates_system import WorkflowBuilder

builder = WorkflowBuilder(template)

workflow = builder.build(
    parameter_values={
        "seed": 42,
        "steps": 20,
        "cfg_scale": 7.5
    },
    lora_settings={
        "style_lora": {
            "enabled": True,
            "strength": 0.8
        }
    },
    prompt_values={
        "positive_prompt": "a cinematic photograph of a hero"
    }
)

# Send to ComfyUI
from templates_system import ComfyUIClient
client = ComfyUIClient("http://127.0.0.1:8188")
prompt_id = client.queue_prompt(workflow)
```

### Camera Angles

```python
from templates_system import AngleLibrary

library = AngleLibrary()

# Get all angles
all_angles = library.get_all_angles()  # 96 angles

# Filter
close_ups = library.get_angles_by_shot_size("close_up")
eye_level = library.get_angles_by_height("eye_level")
front_view = library.get_angles_by_direction("front")

# Get token
angle = library.get_angle("close_up", "eye_level", "front")
print(angle['token'])  # "<sks> front view eye-level shot close-up"
```

## API Integration

The templates system is exposed via FastAPI router at `/api/templates/*`:

```bash
# List templates
GET /api/templates/list?category=text_to_image

# Get template details
GET /api/templates/detail/flux_schnell

# Get camera angles
GET /api/templates/angles?shot_size=close_up

# Build workflow
POST /api/templates/build_workflow
{
  "template_name": "flux_schnell",
  "parameter_values": {"seed": 42, "steps": 20},
  "camera_angle": "<sks> front view eye-level shot close-up"
}

# Import workflow
POST /api/templates/import_workflow
# (multipart/form-data with workflow JSON file)
```

## Template Format

Templates are JSON files with this structure:

```json
{
  "meta": {
    "name": "My Template",
    "version": "1.0.0",
    "engine": "flux",
    "categories": ["text_to_image"],
    "supports_angles": true,
    "supports_next_scene": false,
    "requires_images": false
  },
  "parameters": [
    {
      "name": "steps",
      "display_name": "Steps",
      "type": "integer",
      "node_id": "3",
      "input_name": "steps",
      "default": 20,
      "constraints": {"min": 1, "max": 150, "step": 1}
    }
  ],
  "loras": [
    {
      "name": "style_lora",
      "display_name": "Style LoRA",
      "node_id": "10",
      "strength_inputs": {
        "model": "strength_model",
        "clip": "strength_clip"
      },
      "default_enabled": false,
      "default_strength": 0.75
    }
  ],
  "inputs": [
    {
      "name": "reference_image",
      "display_name": "Reference Image",
      "node_id": "12",
      "input_name": "image",
      "type": "image",
      "required": false
    }
  ],
  "workflow": {
    // ComfyUI workflow JSON (API format)
  }
}
```

## Features

### Node Types Supported
- **Text to Image:** SD 1.5, SDXL, Flux, Qwen
- **Image to Image:** All engines
- **Inpainting:** VAE, Qwen, Flux
- **Upscaling:** ESRGAN, SwinIR (via templates)
- **ControlNet:** Depth, Canny, OpenPose
- **Video:** LTXVideo, AnimateDiff

### Parameters
- Camera Angles (96 presets)
- LoRAs (model/CLIP strength)
- Seeds
- CFG Scale
- Steps
- Samplers
- Resolution
- Aspect Ratios

### Categories
- `text_to_image`
- `img2img`
- `inpainting`
- `upscaling`
- `video`
- `controlnet`

## Dependencies

Required Python packages:
- `pydantic` - Data validation
- `jsonschema` - Template validation
- `requests` - ComfyUI HTTP client
- `websockets` - ComfyUI WebSocket client
- `Pillow` - Image handling
- `reportlab` - PDF export (optional)

## Testing

Run verification:
```bash
cd /mnt/nas/Python/DirectorsConsole/CinemaPromptEngineering
python3 verify_phase2.py
```

## License

Same as parent project (Director's Console / Project Eliot)

## Credits

Ported from StoryboardUI2 for the Director's Console (Phase 2: Brain Transplant)
