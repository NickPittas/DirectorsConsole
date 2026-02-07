# UI REQUIREMENTS DOCUMENT
## Cinema Prompt Engineering - UI Redesign Specifications

---

## 1. PROMPT GENERATION SECTION (Bottom Area)

### Layout Structure
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Scene Description:                                                          │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ [User input textbox - multi-line]                                       │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ LLM Provider: [Dropdown]  Model: [Dropdown]  Target AI: [Dropdown]         │
│                                                                             │
│ [Generate Simple]  [Generate Enhanced]                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Simple Prompt:                    │  Enhanced Prompt:                      │
│  ┌────────────────────────────┐    │  ┌────────────────────────────┐       │
│  │ [Read-only output]         │    │  │ [Read-only output]         │       │
│  │                            │    │  │                            │       │
│  └────────────────────────────┘    │  └────────────────────────────┘       │
│  [Copy]                            │  [Copy]                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Button Requirements
- **Generate Simple**: Generates prompt from cinematography settings only (no LLM)
- **Generate Enhanced**: Sends to LLM for enhancement using selected provider/model/target
- **Copy buttons**: Copy respective prompt to clipboard
- **Button styling**: Must match app theme (grey/golden-yellow palette, NOT blue/white)

---

## 2. TARGET AI MODEL DROPDOWN

### Models to Include (with proper casing)
- Generic
- Midjourney
- FLUX.1
- FLUX.1 Pro
- Stable Diffusion XL
- Stable Diffusion 3
- DALL-E 3
- GPT-Image (4o)
- Ideogram 2.0
- Leonardo AI
- Runway Gen-3
- Runway Gen-4
- Sora
- Kling 1.6
- Pika 2.0
- Luma Dream Machine
- Veo 2
- Veo 3
- CogVideoX
- Hunyuan Video
- Wan 2.1
- Minimax Video
- Qwen-Image

---

## 3. FILM PRESET PANEL (Right Side)

### Current Problem
- Film Preset area is extremely huge
- Becomes "monstrous yellow-green dead area" when results appear
- Takes too much screen space

### Required Changes
1. **Dock to right side** as collapsible panel
2. **Make panel resizable** (drag to resize width)
3. **Thumbnail size**: Keep current size (they're fine)
4. **Two-page/tab structure inside panel**:
   - Page 1: Preset Browser (thumbnails + search)
   - Page 2: Selection Info (Cinematography details, lens, lighting signature, etc.)
5. **Collapsible**: Can be collapsed/expanded
6. **Maintain interactivity**: Rest of page elements must remain interactive when panel is open

---

## 4. STYLING FIXES

### Text Boxes vs Dropdowns Differentiation
- **Problem**: Everything looks the same, borders don't help enough
- **Solution**: Use small tonal changes
  - Input text boxes: Slightly lighter grey background
  - Dropdowns: Slightly darker grey background
  - OR vice versa - just need visible differentiation
  - Consider subtle inner shadow on inputs vs flat on dropdowns

### Button Styling
- **Problem**: Generate and Copy buttons are blue/white, completely off-theme
- **Required**: Match existing app palette
  - Primary buttons: Golden-yellow accent
  - Secondary buttons: Grey tones
  - NO blue, NO pure white backgrounds

### Color Palette Reference (from existing app)
- Background: Dark greys (#1a1a1a, #2a2a2a, #3a3a3a)
- Accent: Golden-yellow (#d4a84b or similar)
- Text: Light grey/white
- Borders: Subtle grey (#4a4a4a)

---

## 5. IMPLEMENTATION PRIORITY

1. **System Prompts**: Add all missing generative AI models to prompt files in `api/providers/system_prompts/model_prompts/` and keep shared rules in `api/providers/system_prompts/general.md`
2. **Target Model Dropdown**: Add all models with correct casing
3. **Prompt Section Redesign**: Implement new layout with side-by-side outputs
4. **Button Styling**: Fix to match theme
5. **Input Differentiation**: Add tonal differences
6. **Film Preset Panel**: Convert to right-docked collapsible resizable panel

---

## 6. FILES TO MODIFY

- `api/providers/system_prompts/` - Model prompt files (`model_prompts/`) + shared rules (`general.md`)
- `frontend/src/App.tsx` - Main UI restructure
- `frontend/src/components/` - May need new components for:
  - Collapsible panel
  - Resizable panel
  - Prompt output section
- `frontend/src/index.css` or component styles - Styling fixes

---

## 7. NOTES

- This document preserved for context continuity across sessions
- Last updated: January 18, 2026
- Status: Requirements defined, implementation pending
