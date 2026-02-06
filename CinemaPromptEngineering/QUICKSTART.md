# Cinema Prompt Engineering - Quick Start Guide

## Project Structure

```
CinemaPromptEngineering/
├── cinema_rules/           # Core Python library (shared)
│   ├── schemas/           # Pydantic models
│   │   ├── common.py      # Shared types (mood, shot size, etc.)
│   │   ├── live_action.py # Camera, lens, lighting schemas
│   │   └── animation.py   # Animation style schemas
│   ├── rules/
│   │   └── engine.py      # Rule validation engine
│   └── prompts/
│       └── generator.py   # Prompt generation for AI models
│
├── api/                    # FastAPI backend
│   └── main.py            # REST API endpoints
│
├── frontend/              # React web application
│   ├── src/
│   │   ├── App.tsx        # Main UI component
│   │   ├── store/         # Zustand state management
│   │   ├── api/           # API client
│   │   └── types/         # TypeScript types
│   └── package.json
│
├── comfyui_node/          # ComfyUI integration
│   └── __init__.py        # Node definitions
│
├── pyproject.toml         # Python dependencies (Poetry)
└── Documentation/         # Existing cinematography docs
```

## Getting Started

### 1. Install Python Dependencies

```bash
cd CinemaPromptEngineering
poetry install
```

### 2. Run the API Server

```bash
poetry run uvicorn api.main:app --reload --port 8000
```

The API will be available at http://localhost:8000

API Docs: http://localhost:8000/docs

### 3. Run the Frontend

```bash
cd frontend
npm install
npm run dev
```

The UI will be available at http://localhost:3000

### 4. ComfyUI Installation

The ComfyUI integration is a fully-featured plugin that bridges ComfyUI with the Cinema Prompt Engineering visual editor.

1. **Copy the Plugin Folder**
   Copy the `ComfyCinemaPrompting` folder to your ComfyUI `custom_nodes` directory:

   ```bash
   cp -r ComfyCinemaPrompting /path/to/ComfyUI/custom_nodes/
   ```

2. **Install Node Dependencies**
   Navigate to the node folder in ComfyUI and install requirements:
   ```bash
   cd /path/to/ComfyUI/custom_nodes/ComfyCinemaPrompting
   pip install -r requirements.txt
   ```
   *Note: Ensure you are using the Python environment associated with your ComfyUI installation.*

3. **Start External Services**
   For the plugin to work, you MUST have the backend API and Frontend running (steps 2 & 3 above). The node communicates with:
   - Frontend at `http://localhost:3000` (for the Visual Editor modal)
   - Backend at `http://localhost:8000` (for LLM enhancement)
   *Note: ComfyUI defaults to backend `http://localhost:8000` and apply‑preset returns validation + preset metadata.*

3. **Restart ComfyUI**
   Restart your ComfyUI server. You will see two new nodes under the "Cinema Prompt Engineering" category.

## ComfyUI Integration Features

The plugin provides a seamless bridge between node-based workflows and the interactive visual editor.

### 1. Two Specialized Nodes
- **Cinema Prompt (Live-Action)**: For photorealistic cinematography (cameras, lenses, lighting).
- **Cinema Prompt (Animation)**: For stylized content (anime, 3D, illustration, western animation, graphic novel, painterly, concept art).

### 2. Interactive Visual Editor
Each node features an **"Open Visual Editor"** button. Clicking this opens the full React-based UI in a modal overlay, allowing you to:
- Visually select camera angles, lighting, and styles
- Browse and apply film presets (e.g., "Blade Runner", "Grand Budapest Hotel")
- See real-time validation warnings
- See disabled options with reasons via `/options` filtering
- **Synchronize Changes**: Any change in the editor immediately updates the ComfyUI node widgets, and vice-versa.

### 3. AI Prompt Enhancement
Within the Visual Editor, you can use the "Enhance Prompt" feature to have an LLM (Claude, GPT-4, etc.) rewrite your prompt with cinematic details while strictly adhering to your constraints.
- The enhanced prompt is returned to the node's `enhanced_prompt` output.
- Requires the backend API to be running and LLM keys configured in the Web UI settings.

### 4. Node Outputs
- `prompt`: The constructed prompt string (e.g., "A wide shot of... shot on Alexa 65...").
- `enhanced_prompt`: The LLM-enriched version (if generated).
- `negative_prompt`: Automatically generated negative prompt based on constraints.
- `validation_status`: Status string (VALID/WARNING/INVALID) for workflow logic gates.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Health check |
| `/enums` | GET | List all available enums |
| `/enums/{name}` | GET | Get values for a specific enum |
| `/validate` | POST | Validate a configuration |
| `/generate-prompt` | POST | Generate AI prompt from config |
| `/presets/live-action` | GET | Get film style presets |
| `/presets/animation` | GET | Get animation style presets |
| `/options` | POST | Get filtered options + disabled reasons |
| `/presets/{name}` | POST | Apply preset (returns validation + preset metadata) |

## Example API Usage

### Get Filtered Options

```bash
curl -X POST http://localhost:8000/options \
  -H "Content-Type: application/json" \
  -d '{
    "project_type": "live_action",
    "config": {
      "camera": {"manufacturer": "ARRI", "body": "Alexa_65"},
      "movement": {"equipment": "Handheld"}
    }
  }'
```

### Validate a Configuration

```bash
curl -X POST http://localhost:8000/validate \
  -H "Content-Type: application/json" \
  -d '{
    "project_type": "live_action",
    "config": {
      "camera": {"manufacturer": "ARRI", "body": "Alexa_65"},
      "movement": {"equipment": "Handheld"},
      "lighting": {"time_of_day": "Night", "source": "Sun"}
    }
  }'
```

Response:
```json
{
  "status": "invalid",
  "messages": [
    {
      "rule_id": "LA_NIGHT_NO_SUN",
      "severity": "hard",
      "message": "Sunlight is not available at night.",
      "field_path": "lighting.source"
    },
    {
      "rule_id": "LA_HEAVY_NO_HANDHELD",
      "severity": "hard",
      "message": "Heavy cameras (>4kg) cannot be operated handheld safely.",
      "field_path": "movement.equipment"
    }
  ]
}
```

### Generate a Prompt

```bash
curl -X POST http://localhost:8000/generate-prompt \
  -H "Content-Type: application/json" \
  -d '{
    "project_type": "live_action",
    "target_model": "flux",
    "config": {
      "camera": {"manufacturer": "ARRI", "body": "Alexa_35"},
      "lens": {"focal_length_mm": 35},
      "movement": {"equipment": "Steadicam"},
      "lighting": {"time_of_day": "Golden_Hour", "source": "Sun", "style": "Naturalistic"},
      "visual_grammar": {
        "shot_size": "MS",
        "composition": "Rule_of_Thirds",
        "mood": "Contemplative",
        "color_tone": "Warm_Saturated"
      }
    }
  }'
```

## ComfyUI Nodes

Two nodes are available:

1. **Cinema Prompt (Live-Action)** - For real-world cinematography
   - Camera, lens, lighting, movement options
   - Era constraints for historical accuracy
   - Film preset support

2. **Cinema Prompt (Animation)** - For animated content
   - Medium (2D, 3D, Hybrid, Stop-Motion)
   - Style domain (Anime, Manga, 3D, Illustration, Western Animation, Graphic Novel, Painterly, Concept Art)
   - Rendering and motion settings

Both nodes output:
- `prompt` - The generated AI prompt
- `negative_prompt` - Negative prompt (if applicable for target model)
- `validation_status` - VALID, WARNING, or INVALID with details (including preset fallback warnings when applicable)

## Validation Rules

### Hard Rules (Block)
- Night + Sun lighting source
- Heavy cameras (>4kg) + Handheld/Gimbal/Drone
- Pre-1972 era + HMI lighting
- Pre-1987 era + Kino Flo
- Pre-2002 era + LED lighting
- Manga + Color (must be monochrome)
- Illustration + Motion (must be static)
- 2D animation + Free 3D camera

### Soft Warnings
- Medium cameras + Handheld (operator fatigue)
- Cheerful mood + Low-Key lighting (atypical subversion)
- Photoreal surfaces + Limited animation (motion artifacts visible)
- Preset fallback mappings (enum mismatch warnings)

## Supported Target Models

- `generic` - Comma-separated keywords
- `midjourney` - With --v 6 --q 2 params
- `flux` - Natural language, no negatives
- `sdxl` - Keyword-based
- `wan2.2` - 80-120 words, detailed
- `runway` - Natural descriptions
- `pika` - Natural descriptions
- `cogvideo` - Concise, 224 token limit
- `hunyuan` - Detailed, has prompt rewrite
- `mochi` - Standard format
- `ltx` - 200 word limit

## Next Steps

1. **Add more rules** - See `COMPREHENSIVE_RULES_DOCUMENT.md` for full rule definitions
2. **Add film presets** - Load from `Documentation/Film Presets 1-3.md`
3. **Implement cascading dropdowns** - Filter options based on current state
4. **Add LLM enhancement** - Use LLM to refine prompts contextually
