# AGENT ONBOARDING DOCUMENT1
## Cinema Prompt Engineering System

---

## OVERVIEW

This document serves as the **onboarding guide** for agents/developers working with the Cinema Prompt Engineering codebase.

The system generates AI prompts for stunning image and video generation by encoding professional cinematic and animation knowledge into structured rules and constraints.

The system supports **TWO PARALLEL MODES:**

1. **Live-Action Cinema** — Physical cameras, lenses, lighting, real-world constraints
2. **Animation** — Virtual cameras, stylized rendering, artistic expression

---

## CRITICAL FILES: DUAL SYSTEM ARCHITECTURE

### Live-Action Cinema System

**Location:** `z:\Python\CinemaPromptEngineering\COMPREHENSIVE_RULES_DOCUMENT.md`

This is the **single source of truth** for all cinematic rules, constraints, and relationships. All dropdown logic, validation rules, and preset mappings derive from this document.

**Contains:** 150+ rules, 25+ cameras, 15+ lens families, 50+ film presets

### Animation System

**Location:** `z:\Python\CinemaPromptEngineering\COMPREHENSIVE_ANIMATION_RULES_DOCUMENT.md`

This is the **single source of truth** for all animation rules, constraints, and UI logic. Works **in parallel** to the cinema system.

**Contains:** 87 rules, 4 animation domains (Anime, Manga, 3D, Illustration), 12 style presets

### Shared Systems

Both systems share these identical subsystems:

- **Shot Size** — Wide, medium, close-up, extreme, etc.
- **Composition** — Rule of thirds, symmetry, leading lines, etc.
- **Mood** — 50+ emotional states
- **Color Tone** — 13+ color temperature/saturation combinations

---

## ANIMATION SYSTEM OVERVIEW

The Animation System is **completely parallel** to Live-Action Cinema. It shares Shot/Composition/Mood/Color but diverges on all rendering and "camera" logic.

### When to Use Each System

**Live-Action Cinema:**
- Physical camera selection (ARRI, RED, Sony, etc.)
- Lens focal length constraints
- Real-world lighting physics (time of day, light sources)
- Physical movement equipment (cranes, dollies, gimbals)

**Animation:**
- Style domain selection (Anime, Manga, 3D, Illustration)
- Rendering models (cel shading, flat color, photorealistic)
- Virtual camera behavior (locked frame, digital pan, 3D camera)
- Stylized motion (limited animation, full animation, exaggerated)

### Key Animation Domains

| Domain | Medium | Presets | Motion | Camera |
|--------|--------|---------|--------|--------|
| **Anime** | 2D/Hybrid | Studio Ghibli, Akira, GitS | Limited to Full | Digital Pan |
| **Manga** | 2D | Shonen, Dark Seinen | Static | Locked Frame |
| **3D Animation** | 3D | Pixar, Arcane, Unreal | Smooth/Full | Free 3D |
| **Illustration** | 2D | Concept Art, Editorial | None | Locked Frame |
| **Western Animation** | 2D/Hybrid | Disney, DreamWorks | Limited to Full | Digital Pan |
| **Graphic Novel** | 2D | Noir, Stylized | Static | Locked Frame |
| **Painterly** | 2D | Gouache, Oil | Limited | Locked Frame |
| **Concept Art** | 2D/3D | Keyframe, Matte | None | Free 3D |


### Animation Validation Rules

Like cinema, animation has **hard rules (block)** and **soft warnings (warn)**.

**Hard Rules (Block):**
- Manga cannot have color (must be Monochrome_Ink)
- Manga cannot have camera motion (must be Locked_Frame)
- Illustration cannot have motion (must be static)
- 2D medium cannot use 3D camera

**Soft Warnings (Warn):**
- Cheerful mood + Rim Lighting (atypical)
- Full Animation + 60+ minutes (high production cost)
- Photoreal surfaces + Limited Animation (motion imperfections visible)

See [COMPREHENSIVE_ANIMATION_RULES_DOCUMENT.md](COMPREHENSIVE_ANIMATION_RULES_DOCUMENT.md) SECTION 5 for complete validation logic.

---

## SYSTEM ARCHITECTURE OVERVIEW (CINEMA)

### Layer 1: Selection Dropdowns (User Input)
```
Camera Manufacturer → Camera Body → Lens → Movement Equipment → 
Timing → Time of Day → Lighting Source → Lighting Style → 
Shot Size → Composition → Mood → Color Tone
```

### Layer 2: Validation Engine (Hard Rules)
- Blocks impossible combinations
- Examples: "Night + Sun", "Cheerful + Low-Key"

### Layer 3: Constraint Engine (Soft Warnings)
- Warns about inefficient or unlikely combinations
- Examples: "Medium camera + Extended Handheld" (operator fatigue)

### Layer 4: Preset System (Macro Override)
- Film presets auto-populate fields and lock critical values
- Example: Blade Runner preset locks mood ≠ "Cheerful"

### Layer 5: Output Generation
- Valid config → AI prompt

---

## KEY RULES BY CATEGORY

### CAMERAS & WEIGHT CONSTRAINTS

**Hard Rule:** Heavy cameras (> 4.0 kg) cannot use:
- Handheld
- Gimbal
- Drone

**Soft Warning:** Medium cameras (3.0-4.0 kg) + Extended Handheld = operator fatigue

**Source:** [Camera Weights Section](COMPREHENSIVE_RULES_DOCUMENT.md#section-2-lens-systems)

### LENSES & FOCAL LENGTHS

**Hard Rule:** Alexa 65 (65mm sensor) **cannot** use:
- S35-only lenses
- Full Frame lenses

**Soft Warning:** Wide lenses (14mm) + Close framing = distortion

**Source:** [Lens Systems Section](COMPREHENSIVE_RULES_DOCUMENT.md#section-2-lens-systems)

### LIGHTING & TIME OF DAY

**Hard Rules:**
- Night time **cannot** have Sun as lighting source
- Midday lighting **cannot** use Low-Key (physically impossible)
- Pre-1950 era **cannot** use LED lighting (anachronistic)

**Soft Warning:** Cheerful mood + Low-Key lighting = tonally incoherent

**Source:** [Lighting Systems Section](COMPREHENSIVE_RULES_DOCUMENT.md#section-4-lighting-systems)

### CAMERA MOVEMENT

**Hard Rule:** Certain equipment restricts movements:
- Jib → only [Crane_Up, Crane_Down, Arc]
- Drone → only [Track_In, Track_Out, Crane_Up, Crane_Down, Arc]

**Soft Warning:** Dolly_Zoom requires Slow or Moderate timing (Fast = disorienting)

**Source:** [Camera Movement Section](COMPREHENSIVE_RULES_DOCUMENT.md#section-3-camera-movement-systems)

### SHOT COMPOSITION RELATIONSHIPS

**Hard Rule:** Focal length must match shot size:
- ECU (Extreme Close-Up) → requires 100-135mm lens
- EWS (Extreme Wide) → requires 14-24mm lens

**Soft Warning:** ECU + 14mm lens = extreme distortion, rarely intentional

**Source:** [Shot & Composition Section](COMPREHENSIVE_RULES_DOCUMENT.md#section-5-shot-size--composition)

### FILM PRESETS & MOOD MAPPING

**Blade Runner Preset Constraints:**
- Allowed moods: Gloomy, Menacing, Paranoid, etc.
- **Forbidden moods:** Cheerful, Hopeful, Whimsical
- Locked lighting: Low-Key, Neon sources
- Locked color: Cool, Desaturated

**Casablanca Preset Constraints:**
- Forbidden sources: LED, Modern Neon (anachronistic)
- Locked style: Monochrome, Tungsten, Practical lights

**Source:** [Film Presets Section](COMPREHENSIVE_RULES_DOCUMENT.md#section-7-film-style-presets)

---

## HOW TO USE THE RULES DOCUMENT

### For Implementing Dropdowns

1. User selects **Camera Manufacturer**
   - Query SECTION 1.1 → Get available bodies

2. User selects **Camera Body** (e.g., Alexa 65)
   - Query SECTION 1.5 → Get weight constraints
   - Disable incompatible movement equipment
   - Query SECTION 2.1 → Filter compatible lenses

3. User selects **Mood** (e.g., Cheerful)
   - Query SECTION 8.4 → Disable Low-Key lighting
   - Auto-suggest High-Key + Soft lighting

### For Validation Rules

Before allowing export, validate against SECTION 8 (Validation Rules):

```
IF time_of_day == "Night" && lighting_source == "Sun"
  → BLOCK (Hard Rule: Invalid)

IF mood == "Cheerful" && lighting_style == "Low_Key"
  → WARN (Soft Constraint: Tonally incoherent)

IF camera_weight_class == "Heavy" && movement_equipment == "Handheld"
  → BLOCK (Hard Rule: Physically impossible)
```

### For Film Presets

When user selects a preset (e.g., Blade Runner):
1. Auto-populate from preset definition
2. Lock `disallowed_moods` and `disallowed_sources`
3. Allow user overrides for safe fields (shot_size, composition)

---

## DOCUMENT STRUCTURE SUMMARY

| Section | Purpose | Use Case |
|---------|---------|----------|
| 1. CAMERA SYSTEMS | Camera bodies and weight classes | Camera dropdown logic |
| 2. LENS SYSTEMS | Lens families and focal lengths | Lens dropdown and validation |
| 3. CAMERA MOVEMENT | Equipment, types, timing | Movement dropdown logic |
| 4. LIGHTING SYSTEMS | Sources, styles, time-of-day | Lighting dropdown and hard rules |
| 5. SHOT SIZE & COMPOSITION | Shot types and framing | Visual grammar logic |
| 6. MOOD & COLOR SYSTEMS | Moods and color tones | Mood/color dropdowns and constraints |
| 7. FILM PRESETS | 40+ film style presets | Preset auto-population |
| 8. VALIDATION RULES | Hard and soft constraints | Rule engine implementation |
| 9. UI STATE LOGIC | Layer sequencing | Dropdown dependency flow |
| 10. GLOBAL VALIDATION MATRIX | All invalid combinations | Final validation before export |

---

## IMPLEMENTATION CHECKLIST

- [ ] Read COMPREHENSIVE_RULES_DOCUMENT.md in full
- [ ] Map each dropdown to its section in the rules document
- [ ] Implement hard rule blocking (Section 8.1 - 8.5)
- [ ] Implement soft constraint warnings (Section 8)
- [ ] Implement film preset logic (Section 7)
- [ ] Implement UI layer sequencing (Section 9)
- [ ] Implement `/options` cascading filters for UI dropdowns
- [ ] Surface preset fallback warnings when enums are missing
- [ ] Test all invalid combinations (Section 10)
- [ ] Document any new constraints as they are discovered


---

## EXTENDING THE SYSTEM

### Adding a New Camera

1. Add to SECTION 1.1 with complete specification
2. Add weight classification to SECTION 1.2
3. Add mount compatibility to SECTION 8.1
4. If special constraints exist, add to SECTION 8.4

### Adding a New Film Preset

1. Add to SECTION 7 with complete preset definition
2. Include `disallowed_moods` and `disallowed_sources`
3. Add validation rule to SECTION 10 if needed

### Adding a New Lighting Rule

1. Add to SECTION 4 (lighting systems)
2. Add constraint to SECTION 8.3 (time/source validation)
3. Add to SECTION 10 (invalid combinations) if hard rule

---

## CRITICAL CONSTRAINTS (QUICK REFERENCE)

❌ **Invalid Always:**
- Night + Sun
- Cheerful + Low-Key
- Alexa 65 + Handheld
- 65mm lens + S35 camera
- 1940s era + LED lighting

⚠️ **Warning Always:**
- Medium camera + Extended Handheld
- Wide lens (14mm) + Close-Up framing
- Large Format + Fast handheld movement

✅ **Always Valid:**
- Any equipment + Motion Control (repeatable motion)
- Any preset selection (presets are internally coherent)
- Any shot size + film preset combination

---

## QUESTIONS FOR AGENTS

**Before asking for clarification, check:**

1. Is your question answered in COMPREHENSIVE_RULES_DOCUMENT.md?
   - Search for the category (Camera, Lighting, Preset, etc.)

2. Is there a hard rule vs. soft constraint distinction?
   - Hard rules = blocks
   - Soft constraints = warnings

3. Are you following the layer sequence (Section 9)?
   - Each dropdown should filter the next layer

4. Does your implementation match the validation matrix (Section 10)?
   - All invalid states must be blocked

---

## TECHNICAL STACK RECOMMENDATIONS

**Frontend:**
- React / Vue with state management (Zustand, Pinia)
- JSON schema validator (Ajv)
- Dropdown framework (React-Select, etc.)

**Backend:**
- Rule engine (Node.js or Python)
- Config serialization (JSON)
- Preset registry (database or JSON)

**Deployment:**
- Export final config as JSON
- Feed to AI prompt generator
- Support preset saving/loading

---

## VERSION CONTROL

**Current Version:** 1.2  
**Last Updated:** February 22, 2026  
**Source Files:** All markdown files in this folder  
**Single Source of Truth:** COMPREHENSIVE_RULES_DOCUMENT.md  


Any changes to rules must be:
1. Made in the appropriate source .md file first
2. Extracted and consolidated into COMPREHENSIVE_RULES_DOCUMENT.md
3. Documented in this onboarding guide

---

## SUPPORT & ESCALATION

For issues not covered by the rules document:

1. Check all 10 sections of COMPREHENSIVE_RULES_DOCUMENT.md
2. Review the film preset definitions to understand pattern
3. If adding a new rule:
   - Define as hard rule OR soft constraint
   - Add to appropriate section
   - Add to validation matrix (Section 10)
   - Update this onboarding document

---

**Good luck with your implementation!**

---

## GALLERY CROSS-TAB COMMUNICATION

The **Gallery** tab is a sibling top-level tab alongside Cinema and Storyboard in the Director's Console frontend. Gallery and Storyboard run in the same browser window and communicate via `window` CustomEvents.

### Event Protocol

| Event Name | Direction | Payload | Purpose |
|------------|-----------|---------|---------|
| `gallery:request-image-params` | Gallery → Storyboard | `{ filePath: string }` | Ask Storyboard for the generation parameters used to create a file |
| `gallery:image-params-response` | Storyboard → Gallery | `{ filePath, workflowId, parameterValues }` | Respond with workflow + parameters for the requested file |
| `gallery:send-reference-image` | Gallery → Storyboard | `{ dataUrl: string, filename: string }` | Send an image to Storyboard to use as a reference input on the selected panel |
| `gallery:restore-workflow-from-metadata` | Gallery → Storyboard | `{ metadata: object }` | Send full PNG metadata to Storyboard to restore workflow + all parameters |
| `gallery:files-renamed` | Gallery → Storyboard | `{ renames: Array<{oldPath, newPath}> }` | Notify Storyboard after batch rename so it can update `panel.image` and `imageHistory` URLs |

### StoryboardUI Event Handlers

These handlers are registered in `StoryboardUI.tsx` via `useEffect` on mount:

- **`handleGalleryRequestParams`** — Looks up the panel whose `imageHistory` contains the requested `filePath`, returns its `workflowId` and `parameterValues`.
- **`handleGallerySendReference`** — Receives a base64 data URL from Gallery, sets it as the reference image input on the currently selected panel.
- **`handleGalleryRestoreWorkflow`** — Parses PNG metadata fields, selects the matching workflow, and populates all parameter values on the current panel.
- **`handleGalleryFilesRenamed`** — Iterates rename pairs and updates both `imageHistory[].url` and `panel.image` to prevent 404s after file renames.

### Important Notes

- The Gallery backend runs on the **Orchestrator** (port 9820), with 23 REST endpoints prefixed `/api/gallery/`.
- The Gallery frontend fetches images via relative URLs to the **CPE backend** (port 9800, same origin) — NOT the Orchestrator.
- Gallery metadata (ratings, tags, views, trash) is stored as a JSON flat-file at `{projectPath}/.gallery/gallery.json` (SQLite is incompatible with CIFS/SMB NAS mounts).
- When sending a reference image to Storyboard, Gallery calls `/api/read-image` on the CPE backend (same origin) to get the file as a base64 data URL.
