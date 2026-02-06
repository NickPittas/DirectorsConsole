# Code Review Report

## Scope
- Web app (React frontend + FastAPI backend)
- Standalone app (`standalone_app.py`)
- ComfyUI plugin (`ComfyCinemaPrompting`)
- Rules, presets, and rule back-propagation

## Summary of Findings
Multiple configuration and rules/preset mismatches prevent consistent enforcement across the web app, standalone app, and ComfyUI plugin. Several presets reference camera/lighting/movement values that do not exist in the current enums, so they silently fall back to defaults when applied. The rules engine also lacks cascading option filtering, leaving back-propagation of rules incomplete. Finally, ComfyUI and backend defaults are not aligned (port mismatch and partial responses).

## Web App & Backend Issues
1. **Options endpoint ignores rule back-propagation**
   - The backend `/options` endpoint returns all enum values and does not disable invalid options. It is explicitly marked as TODO in `api/main.py:234` and `cinema_rules/rules/engine.py:1748`. This prevents the UI from enforcing “downstream” restrictions (camera → lens, camera weight → movement, etc.).
   - Evidence: `api/main.py:231-284`, `cinema_rules/rules/engine.py:1738-1750`.

2. **Frontend default film stock is invalid**
   - The default live-action config sets `film_stock: ''`, but the Pydantic enum expects a valid `FilmStock` value (including `"None"`). This can raise validation errors on first validation or prompt generation.
   - Evidence: `frontend/src/store/index.ts:19-28`, `cinema_rules/schemas/live_action.py:167-214`.

3. **Preset search and apply endpoints exist, but options are not validated for UI**
   - The API provides `/presets/eras`, `/presets/domains`, `/presets/search`, and apply endpoints, but UI does not receive rule-based disablements for field options. This undermines the “back propagation of rules” requirement.
   - Evidence: `api/main.py:666-872`, `api/main.py:231-284`.

## Standalone App Issues
1. **Static fallback is correct, but depends on API running at `/api`**
   - The standalone app mounts the API at `/api`, which matches `frontend/src/api/client.ts` using `API_BASE='/api'`. This is consistent, but any non-standard deployment must update `VITE_API_BASE`.
   - Evidence: `standalone_app.py:54-70`, `frontend/src/api/client.ts:19-23`.

## ComfyUI Plugin Issues
1. **Backend URL default mismatch (8080 vs 8000)**
   - ComfyUI API proxy defaults to `http://localhost:8080`, while the main backend defaults to `8000` (as documented and used in the standalone app). This causes failed enhancement unless users set `CINEMA_BACKEND_URL`.
   - Evidence: `ComfyCinemaPrompting/api_routes.py:26`, `api/main.py:39-57`, `standalone_app.py:111-127`.

2. **Apply preset endpoints return partial data**
   - `handle_apply_live_action_preset` / `handle_apply_animation_preset` returns only config and drops validation/preset data that the frontend expects from the main API. This diverges from `/apply-preset/*` responses in `api/main.py`.
   - Evidence: `ComfyCinemaPrompting/api_routes.py:118-139`, `api/main.py:704-768`.

3. **Duplicate rule/preset copies in ComfyUI package**
   - The ComfyUI package includes duplicated `cinema_rules` modules. If they drift from core `cinema_rules`, rule consistency can break. They currently match in structure, but ongoing maintenance risk is high.
   - Evidence: `ComfyCinemaPrompting/cinema_rules/**` and `cinema_rules/**`.

## Rules & Preset Conflicts (Live-Action)
1. **Preset values reference non-existent enums**
   - `LightingSource` enum does not include `Practical_Lights`, `Artificial`, `Fluorescent`, or `Overcast` as defined in presets. Only `PRACTICAL` and `AVAILABLE` exist.
   - Evidence: `cinema_rules/schemas/live_action.py:474-505`, `cinema_rules/presets/live_action.py:742-756`, `cinema_rules/presets/live_action.py:1088-1134`.

2. **Lighting styles in presets don’t map to enums**
   - Presets use `Available_Light`, `Soft_Lighting`, `Hard_Lighting`, `High_Contrast`, `Practical_Motivated`, `Controlled`, none of which exist in `LightingStyle`. The preset application maps some values to enums, but many values still have no mapping (e.g., `High_Contrast`, `Available_Light`).
   - Evidence: `cinema_rules/schemas/live_action.py:507-523`, `cinema_rules/presets/live_action.py:320-370`, `cinema_rules/rules/engine.py:1343-1356`.

3. **Composition values in presets are outside enum**
   - Presets reference `Deep_Focus`, `Low_Angle`, `Dynamic_Framing`, `High_Contrast`, `Venetian_Blinds`, etc., which are not defined in `Composition`. `apply_live_action_preset` falls back to `Diagonal` or `Frame_Within_Frame`, losing specificity.
   - Evidence: `cinema_rules/schemas/common.py:29-47`, `cinema_rules/presets/live_action.py:60-110`, `cinema_rules/rules/engine.py:1280-1300`.

4. **Mood values in presets are outside enum**
   - Presets use moods such as `Suspicious`, `Obsessive`, `Existential`, `Decadent`, `Traumatic`, etc., which are not in `Mood`. Applying presets falls back to `Contemplative`.
   - Evidence: `cinema_rules/schemas/common.py:49-114`, `cinema_rules/presets/live_action.py:120-170`, `cinema_rules/rules/engine.py:1302-1334`.

5. **Movement values in presets are not applied at all**
   - `apply_live_action_preset` maps camera/lens/lighting/visual grammar but does not map preset `movement` to `MovementConfig`, so preset movement is ignored.
   - Evidence: `cinema_rules/presets/live_action.py:24-29`, `cinema_rules/rules/engine.py:1479-1589`.

6. **Movement enum coverage is incomplete vs rules document**
   - The rules document includes `Shoulder_Rig`, `Push_In`, `Pull_Back`, but enums are missing these. The rules engine expects a broader movement taxonomy than the schema supports.
   - Evidence: `Documentation/COMPREHENSIVE_RULES_DOCUMENT.md:858-899`, `cinema_rules/schemas/live_action.py:390-438`.

## Rules & Preset Conflicts (Animation)
1. **Animation rules document lists domains not supported by schema**
   - The rules doc includes `Western_Animation`, `Graphic_Novel`, `Painterly`, `Concept_Art`, but the schema only supports `Anime`, `Manga`, `ThreeD`, `Illustration`. This causes rule coverage gaps for documented domains.
   - Evidence: `Documentation/COMPREHENSIVE_ANIMATION_RULES_DOCUMENT.md:85-133`, `cinema_rules/schemas/animation.py:22-28`.

2. **Lighting model naming mismatch**
   - The rules doc specifies `Graphic_Light`, `Glow_Emission`, `Flat_Light`, while enums use `GRAPHIC`, `GLOW`, and `MINIMAL`. Some presets use `Graphic` and `Glow` strings, but the name mismatch makes it harder to maintain parity with documentation.
   - Evidence: `Documentation/COMPREHENSIVE_ANIMATION_RULES_DOCUMENT.md:207-248`, `cinema_rules/schemas/animation.py:55-64`, `cinema_rules/presets/animation.py:48-120`.

3. **Preset composition/mood values rely on free-form strings**
   - Animation presets use composition values like `Action_Lines`, `Cinematic`, `Comic_Panels`, etc., that do not exist in the shared `Composition` enum, so `apply_animation_preset` falls back to `Diagonal` or `Rule_of_Thirds`.
   - Evidence: `cinema_rules/presets/animation.py:169-200`, `cinema_rules/rules/engine.py:1617-1626`.

## Coverage Gaps (Cameras, Lenses, Lights, Equipment)
1. **Camera manufacturer/model coverage is partial vs rules doc**
   - The comprehensive rules doc contains additional camera types and vintage systems not represented in enums (e.g., specific Panavision System 65 or other legacy entries). Some line items exist only in documentation, not in the schema.
   - Evidence: `Documentation/COMPREHENSIVE_RULES_DOCUMENT.md:8-275`, `cinema_rules/schemas/live_action.py:21-161`.

2. **Lighting sources and styles in presets exceed enum definitions**
   - Presets and docs include `Practical_Lights`, `Artificial`, `Fluorescent`, `Overcast`, `Available_Light`, `High_Contrast`, `Practical_Motivated`, `Controlled`, but enums do not. This causes preset data to be partially unmappable.
   - Evidence: `cinema_rules/schemas/live_action.py:474-523`, `cinema_rules/presets/live_action.py:740-820`.

3. **Movement equipment and types are missing documented values**
   - `Shoulder_Rig`, `Push_In`, `Pull_Back` are present in docs but not in the schema or rules implementation. This means the UI cannot express documented movement options.
   - Evidence: `Documentation/COMPREHENSIVE_RULES_DOCUMENT.md:860-935`, `cinema_rules/schemas/live_action.py:390-438`.

## Back-Propagation of Rules (Cascading Logic)
- The rule engine does not implement cascading option filtering (`get_available_options` returns an empty list). The backend `/options` endpoint just returns all enum values with no disablement reasons. This prevents rule back-propagation into UI dropdowns.
- Evidence: `cinema_rules/rules/engine.py:1738-1750`, `api/main.py:231-284`.

## Recommendations (High Priority)
1. **Align enums with documentation and presets**
   - Add missing lighting sources/styles, movement types, and composition/mood values to schemas (or update presets to match existing enums).
2. **Implement cascading option filtering**
   - Fill in `RuleEngine.get_available_options` and update `/options` to return `disabled_options` and reasons.
3. **Normalize preset mapping**
   - Add explicit mappings for preset `movement`, `lighting_style`, `lighting_sources`, `composition`, and `mood` so presets don’t silently degrade.
4. **Fix ComfyUI backend default**
   - Default `CINEMA_BACKEND_URL` to `http://localhost:8000` or document the required env var.
5. **Return full preset apply responses in ComfyUI API routes**
   - Match the main API shape by returning config + validation + preset.

---

## Files Reviewed (Primary)
- `cinema_rules/schemas/live_action.py`
- `cinema_rules/schemas/animation.py`
- `cinema_rules/schemas/common.py`
- `cinema_rules/rules/engine.py`
- `cinema_rules/presets/live_action.py`
- `cinema_rules/presets/animation.py`
- `cinema_rules/presets/cinematography_styles.py`
- `api/main.py`
- `frontend/src/store/index.ts`
- `frontend/src/api/client.ts`
- `standalone_app.py`
- `ComfyCinemaPrompting/__init__.py`
- `ComfyCinemaPrompting/api_routes.py`
- `Documentation/COMPREHENSIVE_RULES_DOCUMENT.md`
- `Documentation/COMPREHENSIVE_ANIMATION_RULES_DOCUMENT.md`
