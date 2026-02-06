# QUICK NAVIGATION GUIDE
## Cinema Prompt Engineering Rules & Documentation

---

## START HERE

### For Project Overview
👉 **[COMPLETION_REPORT.md](COMPLETION_REPORT.md)** — 5 min read
- What was delivered
- Task completion summary
- Statistics and metrics

### For Development Setup
👉 **[AGENT_ONBOARDING.md](AGENT_ONBOARDING.md)** — 10 min read
- System architecture
- Implementation checklist
- Quick reference cards
- Technical stack recommendations

### For Rules Reference - Cinema (Developer Bible)
👉 **[COMPREHENSIVE_RULES_DOCUMENT.md](COMPREHENSIVE_RULES_DOCUMENT.md)** — Use as reference
- Single source of truth for live-action cinema
- All 150+ rules organized
- Validation matrices
- Film preset definitions

### For Rules Reference - Animation (Developer Bible)
👉 **[COMPREHENSIVE_ANIMATION_RULES_DOCUMENT.md](COMPREHENSIVE_ANIMATION_RULES_DOCUMENT.md)** — Use as reference
- Single source of truth for animation
- All 87 rules organized by domain
- Anime, Manga, 3D Animation, Illustration systems
- 12 style presets with constraints
- UI layer sequencing

---

## CINEMA SYSTEM - RULE LOOKUP BY CATEGORY

### Need to implement camera dropdowns?
📌 [COMPREHENSIVE_RULES_DOCUMENT.md - SECTION 1: CAMERA SYSTEMS (Lines 6-266)](COMPREHENSIVE_RULES_DOCUMENT.md#section-1-camera-systems)
- Camera manufacturers (ARRI, RED, Sony, etc.)
- Camera bodies with specifications
- Weight classes and movement constraints

### Need to implement lens dropdowns?
📌 [COMPREHENSIVE_RULES_DOCUMENT.md - SECTION 2: LENS SYSTEMS (Lines 267-372)](COMPREHENSIVE_RULES_DOCUMENT.md#section-2-lens-systems)
- Lens manufacturers and families
- Focal length requirements by shot size
- Mount compatibility rules

### Need to implement movement dropdowns?
📌 [COMPREHENSIVE_RULES_DOCUMENT.md - SECTION 3: CAMERA MOVEMENT (Lines 373-516)](COMPREHENSIVE_RULES_DOCUMENT.md#section-3-camera-movement-systems)
- Movement equipment (Handheld, Dolly, Crane, etc.)
- Movement types (Pan, Tilt, Track, Arc, etc.)
- Equipment ↔ Movement compatibility (hard rules)

### Need to implement lighting dropdowns?
📌 [COMPREHENSIVE_RULES_DOCUMENT.md - SECTION 4: LIGHTING SYSTEMS (Lines 517-698)](COMPREHENSIVE_RULES_DOCUMENT.md#section-4-lighting-systems)
- Time of day (root constraint)
- Lighting sources with availability
- Lighting styles
- Hard rules: Time ↔ Source validation

### Need to implement shot/composition dropdowns?
📌 [COMPREHENSIVE_RULES_DOCUMENT.md - SECTION 5: SHOT & COMPOSITION (Lines 699-840)](COMPREHENSIVE_RULES_DOCUMENT.md#section-5-shot-size--composition)
- Shot sizes (EWS, WS, MS, CU, etc.)
- Composition types with emotional effects
- Shot ↔ Focal length relationships

### Need to implement mood/color dropdowns?
📌 [COMPREHENSIVE_RULES_DOCUMENT.md - SECTION 6: MOOD & COLOR (Lines 841-921)](COMPREHENSIVE_RULES_DOCUMENT.md#section-6-mood--color-systems)
- 50+ mood values
- 13 color tone values
- Mood ↔ Lighting constraints

### Need to implement film presets?
📌 [COMPREHENSIVE_RULES_DOCUMENT.md - SECTION 7: FILM PRESETS (Lines 922-1642)](COMPREHENSIVE_RULES_DOCUMENT.md#section-7-film-style-presets)
- 50+ film style presets
- Auto-populate fields per preset
- Disallowed moods/sources per preset

---

## ANIMATION SYSTEM - RULE LOOKUP BY CATEGORY

### Need to implement animation mode selector?
📌 [COMPREHENSIVE_ANIMATION_RULES_DOCUMENT.md - SECTION 1.2: ANIMATION MEDIUM (Lines 30-50)](COMPREHENSIVE_ANIMATION_RULES_DOCUMENT.md#12-animation-medium-root-selector)
- Animation Medium (2D, 3D, Hybrid, Stop Motion)
- Root gatekeeper for animation workflows

### Need to implement animation style domain dropdowns?
📌 [COMPREHENSIVE_ANIMATION_RULES_DOCUMENT.md - SECTION 2: ANIMATION STYLE DOMAINS (Lines 83-137)](COMPREHENSIVE_ANIMATION_RULES_DOCUMENT.md#section-2-animation-style-domains)
- Anime, Manga, 3D Animation, Illustration
- Domain-specific UI flows
- Medium ↔ Domain compatibility

### Need to implement animation rendering controls?
📌 [COMPREHENSIVE_ANIMATION_RULES_DOCUMENT.md - SECTION 3: RENDERING & LINE LOGIC (Lines 138-252)](COMPREHENSIVE_ANIMATION_RULES_DOCUMENT.md#section-3-rendering--line-logic)
- Line treatment (Clean, Variable, Sketchy, Inked, Heavy Ink, No Lines)
- Color application (Flat, Cel Shaded, Soft Shaded, Painterly, Monochrome)
- Lighting models (Symbolic, Graphic, Naturalistic, Rim Light, Glow, Flat)

### Need to implement animation motion & camera controls?
📌 [COMPREHENSIVE_ANIMATION_RULES_DOCUMENT.md - SECTION 4: MOTION & VIRTUAL CAMERA (Lines 253-361)](COMPREHENSIVE_ANIMATION_RULES_DOCUMENT.md#section-4-motion--virtual-camera)
- Virtual camera types (Locked Frame, Digital Pan, 3D Camera, etc.)
- Animation motion styles (Limited, Full, Snappy, Exaggerated, etc.)

### Need to implement animation presets?
📌 [COMPREHENSIVE_ANIMATION_RULES_DOCUMENT.md - SECTION 6: ANIMATION STYLE PRESETS (Lines 627-807)](COMPREHENSIVE_ANIMATION_RULES_DOCUMENT.md#section-6-animation-style-presets)
- 12 animation style presets
- Studio Ghibli, Akira, Pixar, Arcane, Manga presets, etc.
- Preset application and override logic

### Need to understand animation validation rules?
📌 [COMPREHENSIVE_ANIMATION_RULES_DOCUMENT.md - SECTION 5: ANIMATION VALIDATION RULES (Lines 362-626)](COMPREHENSIVE_ANIMATION_RULES_DOCUMENT.md#section-5-animation-validation-rules)
- Domain-specific hard rules (Anime, Manga, 3D, Illustration)
- Soft warnings per domain
- Global animation constraints
- Auto-correction patterns

### Need to understand animation UI layer sequencing?
📌 [COMPREHENSIVE_ANIMATION_RULES_DOCUMENT.md - SECTION 7: ANIMATION UI LOGIC LAYERS (Lines 808-951)](COMPREHENSIVE_ANIMATION_RULES_DOCUMENT.md#section-7-animation-ui-logic-layers)
- 6 sequential UI layers
- Domain-specific UI flows
- Layer gating and dependencies

---

## VALIDATION & CONSTRAINTS

### Hard Rules (Blocks User Selection)
📌 [COMPREHENSIVE_RULES_DOCUMENT.md - SECTION 8: VALIDATION RULES (Lines 1643-1730)](COMPREHENSIVE_RULES_DOCUMENT.md#section-8-validation-rules-hard-constraints)

**Examples:**
- Night + Sun (physically impossible)
- Heavy camera + Handheld (physically impossible)
- Alexa 65 + S35 lens (incompatible mount)

### Soft Constraints (Warns User)
📌 [AGENT_ONBOARDING.md - Critical Constraints](AGENT_ONBOARDING.md#critical-constraints-quick-reference)

**Examples:**
- Medium camera + Extended Handheld (operator fatigue)
- Wide lens + Close-Up (distortion)

### All Invalid Combinations
📌 [COMPREHENSIVE_RULES_DOCUMENT.md - SECTION 10: VALIDATION MATRIX (Lines 1782-1826)](COMPREHENSIVE_RULES_DOCUMENT.md#section-10-global-validation-matrix-all-invalid-states)

---

## IMPLEMENTATION PATTERNS

### UI Layer Sequencing
📌 [COMPREHENSIVE_RULES_DOCUMENT.md - SECTION 9: UI STATE LOGIC (Lines 1731-1781)](COMPREHENSIVE_RULES_DOCUMENT.md#section-9-ui-state-logic)

**Layer order (17 sequential layers):**
1. Project Type
2. Camera Manufacturer
3. Camera Body
4. Sensor (auto-set)
5. Lens Manufacturer
...and 12 more

### Dropdown Enable/Disable Logic
📌 [COMPREHENSIVE_RULES_DOCUMENT.md - SECTION 9.2](COMPREHENSIVE_RULES_DOCUMENT.md#92-dropdown-enabledisable-logic)

**Pattern:**
```
IF user selects Heavy Camera
  DISABLE ["Handheld", "Gimbal", "Drone"]

IF user selects Night time
  HIDE ["Sun"]
  SHOW ["Moon", "Artificial_Lights", "Practical_Lights"]
```

---

## QUICK FACTS

### Cinema System

| What | Count | Where |
| --- | --- | --- |
| Camera manufacturers | 8 | SECTION 1.1 |
| Camera bodies | 25 | SECTION 1.1 |
| Lens families | 15+ | SECTION 2.1 |
| Movement equipment types | 12 | SECTION 3.1 |
| Movement types | 14 | SECTION 3.2 |
| Lighting sources | 10 | SECTION 4.2 |
| Lighting styles | 8 | SECTION 4.3 |
| Shot sizes | 9 | SECTION 5.1 |
| Composition types | 9 | SECTION 5.2 |
| Mood values | 50+ | SECTION 6.1 |
| Color tone values | 13 | SECTION 6.2 |
| Film presets | 50+ | SECTION 7 |
| Hard rule constraints | 8 | SECTION 8 |
| Soft constraints | 5 | SECTION 8 |
| Invalid combinations | 14 | SECTION 10 |
| **Total cinema rules** | **150+** | All sections |

### Animation System

| What | Count | Where |
| --- | --- | --- |
| Animation mediums | 4 | SECTION 1.2 |
| Animation domains | 4 | SECTION 2.1 |
| Line treatments | 6 | SECTION 3.1 |
| Color application methods | 5 | SECTION 3.2 |
| Lighting models | 6 | SECTION 3.3 |
| Virtual camera types | 7 | SECTION 4.1 |
| Motion styles | 8 | SECTION 4.2 |
| Animation presets | 12 | SECTION 6 |
| Domain hard rules | 11 | SECTION 5 |
| Soft warnings | 8 | SECTION 5 |
| UI layers | 6 | SECTION 7 |
| Invalid combinations | 10 | SECTION 10 |
| **Total animation rules** | **87** | All sections |

### Shared Systems (Both Cinema & Animation)

| System | Values | Reference |
| --- | --- | --- |
| Shot sizes | 9 identical | Both docs SECTION 5 |
| Composition types | 9 identical | Both docs SECTION 5 |
| Moods | 50+ identical | Both docs SECTION 6 |
| Color tones | 13 identical | Both docs SECTION 6 |
| **Total shared rules** | **237+** | Unified across both systems |

---

## COMMON QUESTIONS

### Q: Where do I find the rule for X?
→ Use **Find** (Ctrl+F) in COMPREHENSIVE_RULES_DOCUMENT.md

### Q: What happens when user selects Blade Runner preset?
→ See COMPREHENSIVE_RULES_DOCUMENT.md SECTION 7.3 "Film_Preset_Blade_Runner"

### Q: How do I add a new camera?
→ See AGENT_ONBOARDING.md "Extending the System"

### Q: What's a hard rule vs soft constraint?
→ See AGENT_ONBOARDING.md "Key Rules by Category"

### Q: How do the layers work?
→ See COMPREHENSIVE_RULES_DOCUMENT.md SECTION 9.1

### Q: Which combinations are invalid?
→ See COMPREHENSIVE_RULES_DOCUMENT.md SECTION 10

---

## RECOMMENDED READING ORDER

**For First-Time Setup:**
1. This document (5 min)
2. AGENT_ONBOARDING.md (15 min)
3. COMPREHENSIVE_RULES_DOCUMENT.md Sections 1-3 (20 min)
4. Then reference remaining sections as needed

**For Feature Implementation:**
1. Find relevant section in COMPREHENSIVE_RULES_DOCUMENT.md
2. Check AGENT_ONBOARDING.md for implementation patterns
3. Refer to COMPLETION_REPORT.md for statistics

**For Debugging:**
1. Check COMPREHENSIVE_RULES_DOCUMENT.md SECTION 8 (validation rules)
2. Check COMPREHENSIVE_RULES_DOCUMENT.md SECTION 10 (invalid combinations)
3. Check AGENT_ONBOARDING.md "Critical Constraints"

---

## DOCUMENT MAP

```
Cinema Prompt Engineering/
├── QUICK_NAVIGATION_GUIDE.md                        ← You are here
├── COMPLETION_REPORT.md                             ← What was done & statistics
├── AGENT_ONBOARDING.md                              ← Developer setup & patterns
│
├── COMPREHENSIVE_RULES_DOCUMENT.md                  ← Full cinema rules (1,626 lines)
├── COMPREHENSIVE_ANIMATION_RULES_DOCUMENT.md        ← Full animation rules (1,800+ lines)
│
├── Cinema Source Files (for reference):
├── Camera Movement.md                               ← Movement rules extracted
├── Camera Weights.md                                ← Weight/constraint rules extracted
├── Cameras-Lense.md                                 ← Camera/lens rules extracted
├── Lights.md                                        ← Lighting rules extracted
├── Shot Compositions.md                             ← Composition rules extracted
├── Film Presets 1.md                                ← 25 film presets extracted
├── Film Presets 2.md                                ← 20+ film presets extracted
├── Film Presets 3.md                                ← 10+ film presets extracted
├── LIVE‑ACTION CINEMA UI LOGIC...                   ← UI layer logic extracted
├── MASTER JSON SCHEMA.md                            ← Schema reference
│
└── Animation Source Files (for reference):
    ├── Animation.md                                 ← Animation foundation rules
    ├── Animation Logic Diagram.md                   ← Animation UI logic extracted
    ├── Animation Rules.md                           ← Animation validation extracted
    └── Animation Styles.md                          ← Animation presets extracted
```

---

## KEY FILES TO START WITH

### For Live-Action Cinema

1. **COMPREHENSIVE_RULES_DOCUMENT.md** (40.55 KB)
   - Your cinema development bible
   - All 150+ rules in one place
   - Searchable by Ctrl+F

2. **AGENT_ONBOARDING.md** (reference)
   - System overview
   - Common patterns
   - Implementation checklist

3. **COMPLETION_REPORT.md** (reference)
   - What was extracted
   - Statistics
   - Next steps

### For Animation

1. **COMPREHENSIVE_ANIMATION_RULES_DOCUMENT.md** (45+ KB)
   - Your animation development bible
   - All 87 rules in one place
   - 4 animation domains (Anime, Manga, 3D, Illustration)
   - Searchable by Ctrl+F

2. **AGENT_ONBOARDING.md** (reference)
   - Animation system overview
   - Implementation patterns
   - Checklist

3. **COMPLETION_REPORT.md** (reference)
   - Animation statistics
   - Shared systems guide

### For Both Systems

- **QUICK_NAVIGATION_GUIDE.md** (this file)
  - Quick reference and navigation
  - Shared systems documentation
  - Implementation patterns

---

## SUPPORT

**Everything you need is in these three documents.**

If you have questions:
1. Check COMPREHENSIVE_RULES_DOCUMENT.md (search by keyword)
2. Check AGENT_ONBOARDING.md (search by section)
3. Check COMPLETION_REPORT.md (for context on what was extracted)

**The rules document is your single source of truth.**

---

**Last Updated:** January 17, 2026  
**Status:** Production Ready  
**Completeness:** 100% - All rules extracted from source files
