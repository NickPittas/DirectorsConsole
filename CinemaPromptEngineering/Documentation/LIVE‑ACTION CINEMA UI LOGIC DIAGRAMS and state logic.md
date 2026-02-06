1. **UI logic diagrams for LIVE‑ACTION CINEMA** (same rigor as animation)
2. **Translate BOTH systems (Live‑Action + Animation) into STATE DIAGRAMS**  
   → implementation‑ready finite‑state logic

No prompts, no fluff — this is **product‑grade UX/system design**.

---

# PART I — LIVE‑ACTION CINEMA UI LOGIC DIAGRAMS

This mirrors the animation UI logic, but with **physical reality enforcement**.

---

## LAYER 0 — ROOT MODE (ALREADY DEFINED)

```
[ Project Type ]
 ├─ Live‑Action Cinema ✅
 └─ Animation
```

Selecting **Live‑Action Cinema** activates **real‑world constraints**.

---

## LAYER 1 — LIVE‑ACTION DOMAIN GATE

```
Live‑Action Cinema
 ├─ Camera System
 ├─ Lens System
 ├─ Camera Movement
 ├─ Lighting System
 ├─ Shot & Composition
 ├─ Mood & Color
 └─ Film Style Presets (optional)
```

---

## LAYER 2 — CAMERA SYSTEM (ROOT OF LIVE‑ACTION)

### STEP 1 — CAMERA MANUFACTURER

```
[ Camera Manufacturer ]
 ├─ ARRI
 ├─ RED
 ├─ Sony
 ├─ Canon
 ├─ Blackmagic
 ├─ Panasonic
 ├─ Nikon
 └─ Film Cameras
```

### UI RULES
- ❌ Nothing else unlocks before this
- ✅ Selection filters **camera bodies**

---

### STEP 2 — CAMERA BODY (FILTERED)

```
IF Manufacturer == ARRI
 ├─ Alexa 35
 ├─ Alexa Mini
 ├─ Alexa Mini LF
 ├─ Alexa LF
 └─ Alexa 65
```

### UI EFFECTS
- Sets:
  - Sensor type
  - Weight class
  - Mount
- Locks:
  - Incompatible sensor/lens options

---

### STEP 3 — SENSOR (AUTO / LOCKED)

```
[ Sensor ]
 ├─ Super 35 (auto)
 ├─ Large Format (auto)
 ├─ 65mm (locked)
```

🚫 **User cannot override sensor**  
This prevents impossible builds.

---

## LAYER 3 — LENS SYSTEM (PHYSICALLY CONSTRAINED)

### STEP 4 — LENS MANUFACTURER (FILTERED)

```
Based on Camera Mount + Sensor:
 ├─ Zeiss
 ├─ Cooke
 ├─ ARRI
 ├─ Panavision (locked ecosystem)
 └─ Canon
```

---

### STEP 5 — LENS FAMILY

```
Zeiss
 ├─ Ultra Primes (S35 only)
 ├─ Master Primes (S35 only)
 ├─ Supreme Primes (FF/LF)
```

### UI RULES
- ❌ Families incompatible with sensor are hidden
- ⚠️ Vintage lenses on high‑res sensors → warning

---

### STEP 6 — FOCAL LENGTH (FILTERED)

```
IF Lens == Ultra Primes
 ├─ 14mm
 ├─ 18mm
 ├─ 25mm
 ├─ 32mm
 ├─ 50mm
 └─ 85mm
```

✅ Only **real focal lengths** appear.

---

## LAYER 4 — CAMERA MOVEMENT UI LOGIC

### STEP 7 — MOVEMENT EQUIPMENT

```
[ Movement Equipment ]
 ├─ Static
 ├─ Handheld
 ├─ Steadicam
 ├─ Dolly
 ├─ Crane
 ├─ Technocrane
 ├─ Motion Control
 └─ Drone
```

### HARD RULES
- Alexa 65 → disables Handheld / Steadicam / Drone
- Heavy cameras → Handheld shows warning

---

### STEP 8 — MOVEMENT TYPE (FILTERED)

```
IF Equipment == Dolly
 ├─ Track In
 ├─ Track Out
 ├─ Dolly Zoom
 └─ Lateral Move
```

---

### STEP 9 — MOVEMENT TIMING

```
[ Timing ]
 ├─ Static
 ├─ Slow
 ├─ Moderate
 ├─ Fast
 └─ Whip (conditional)
```

⚠️ Whip + Heavy Camera → warning

---

## LAYER 5 — LIGHTING SYSTEM UI LOGIC

### STEP 10 — TIME OF DAY (ROOT)

```
[ Time of Day ]
 ├─ Dawn
 ├─ Day
 ├─ Golden Hour
 ├─ Blue Hour
 └─ Night
```

🚨 This constrains everything below.

---

### STEP 11 — LIGHTING SOURCE (FILTERED)

```
IF Time == Night
 ├─ Moon
 ├─ Practical Lights
 ├─ Neon
 └─ Artificial (LED / Tungsten)
```

❌ Sun hidden at Night

---

### STEP 12 — LIGHTING STYLE

```
[ Lighting Style ]
 ├─ High‑Key
 ├─ Low‑Key
 ├─ Soft
 ├─ Hard
 ├─ Naturalistic
 └─ Expressionistic
```

### HARD INVALID
- Cheerful + Low‑Key → blocked
- Pre‑1950 + LED → blocked

---

## LAYER 6 — SHOT, COMPOSITION, MOOD

These are **shared grammar**, same as animation.

```
[ Shot Size ]
[ Composition ]
[ Mood ]
[ Color Tone ]
```

### VALIDATION EXAMPLES
- ECU + 14mm → warning (distortion)
- Blade Runner preset + Cheerful → blocked

---

## LAYER 7 — FILM STYLE PRESETS (MACRO OVERRIDE)

```
[ Film Preset ]
 ├─ Blade Runner
 ├─ The Godfather
 ├─ Casablanca
 ├─ Barry Lyndon
 └─ Mad Max: Fury Road
```

### PRESET BEHAVIOR
- Auto‑populate:
  - Lighting
  - Mood
  - Color
  - Movement bias
- Lock:
  - Era‑critical constraints
- Allow:
  - Shot size overrides (with warnings)

---

# ✅ LIVE‑ACTION UI LOGIC COMPLETE

You now have **full parity** with the animation UI logic.

---

# PART II — STATE DIAGRAMS (FINITE STATE MACHINES)

Now we translate **both systems** into **formal state logic**.

---

## STATE DIAGRAM A — LIVE‑ACTION CINEMA

```
[START]
  ↓
[Select Project Type]
  ↓
[Live‑Action Cinema]
  ↓
[Select Camera Manufacturer]
  ↓
[Select Camera Body]
  ↓
[Sensor Auto‑Set]
  ↓
[Select Lens Manufacturer]
  ↓
[Select Lens Family]
  ↓
[Select Focal Length]
  ↓
[Select Movement Equipment]
  ↓
[Select Movement Type]
  ↓
[Select Movement Timing]
  ↓
[Select Time of Day]
  ↓
[Select Lighting Source]
  ↓
[Select Lighting Style]
  ↓
[Select Shot Size]
  ↓
[Select Composition]
  ↓
[Select Mood]
  ↓
[Select Color Tone]
  ↓
[Optional: Apply Film Preset]
  ↓
[VALIDATION STATE]
 ├─ ✅ Valid → Ready
 ├─ ⚠️ Warning → Ready w/ Flags
 └─ ❌ Invalid → Rollback to Last Valid State
```

---

## STATE DIAGRAM B — ANIMATION SYSTEM

```
[START]
  ↓
[Select Project Type]
  ↓
[Animation]
  ↓
[Select Animation Medium]
  ↓
[Select Style Domain]
  ↓
[Domain‑Specific Controls]
  ↓
[Select Shot Size]
  ↓
[Select Composition]
  ↓
[Select Mood]
  ↓
[Select Color Tone]
  ↓
[Optional: Apply Style Preset]
  ↓
[VALIDATION STATE]
 ├─ ✅ Valid → Ready
 ├─ ⚠️ Warning → Ready w/ Flags
 └─ ❌ Invalid → Auto‑Correct or Block
```

---

## GLOBAL STATE RULES (BOTH SYSTEMS)

```
ANY STATE CHANGE →
  ↓
[Re‑validate Downstream Fields]
  ↓
[Disable / Warn / Auto‑Correct]
```

### KEY PROPERTY
✅ **No illegal terminal states exist**

---

# ✅ WHAT YOU NOW HAVE (CRITICAL)

You now possess:

✅ Full **Live‑Action UI logic**
✅ Full **Animation UI logic**
✅ Deterministic **state machines**
✅ Clear rollback behavior
✅ A system engineers can *actually build*

This is **product‑ready system architecture**, not theory.

---