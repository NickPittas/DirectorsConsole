What follows is **PHASE A0 → A4**: a **clean, first‑principles animation ontology** designed for AI image/video generation **and** artist literacy.

This is a **parallel system**, not a variant.

---

# ANIMATION SYSTEM — FROM SCRATCH  
*(Parallel to Live‑Action Cinema System)*

---

## A0. CORE DESIGN PRINCIPLES (LOCKED)

Animation differs fundamentally from cinema:

| Live‑Action | Animation |
|------------|-----------|
| Physical cameras | Virtual cameras |
| Physical lights | Drawn / simulated light |
| Real lenses | Stylized perspective |
| Physics limits | Intentional exaggeration |
| Real exposure | Artistic exposure |

✅ **Shot size, composition, mood, color survive**  
❌ **Camera bodies, lenses, sensor physics do not**

---

# PHASE A1 — ANIMATION MEDIUM (ROOT SELECTOR)

This is the **top‑level dropdown**. Everything else depends on it.

```json
Animation_Medium: {
  Two_Dimensional: {
    description: "Flat or layered 2D imagery"
  },

  Three_Dimensional: {
    description: "Volumetric 3D models rendered in space"
  },

  Hybrid_2D_3D: {
    description: "2D aesthetics with 3D geometry"
  },

  Stop_Motion: {
    description: "Physical or simulated frame-by-frame animation"
  }
}
```

---

# PHASE A2 — VISUAL STYLE DOMAIN

This defines **artistic lineage**, not technique.

```json
Animation_Style_Domain: {
  Anime: {
    origin: "Japan",
    emphasis: ["Emotion", "Stylization"]
  },

  Manga: {
    origin: "Japan",
    emphasis: ["Linework", "Contrast"]
  },

  Western_Animation: {
    origin: "US/EU",
    emphasis: ["Character Motion", "Clarity"]
  },

  Illustration: {
    origin: "Fine Art / Editorial",
    emphasis: ["Still Imagery", "Painterly Detail"]
  },

  Graphic_Novel: {
    origin: "Comics",
    emphasis: ["Panels", "High Contrast"]
  },

  Concept_Art: {
    origin: "Pre‑production",
    emphasis: ["Mood", "World‑Building"]
  },

  Painterly: {
    origin: "Traditional Art",
    emphasis: ["Brush Strokes", "Texture"]
  }
}
```

---

# PHASE A3 — RENDERING & LINE LOGIC  
*(This replaces lenses, sensors, and lighting physics)*

---

## A3.1 LINE & SHAPE TREATMENT

```json
Line_Treatment: {
  Clean_Line: {
    description: "Uniform line weight"
  },

  Variable_Line_Weight: {
    description: "Expressive line thickness"
  },

  Sketchy: {
    description: "Loose, visible strokes"
  },

  Inked: {
    description: "Bold, high‑contrast outlines"
  },

  No_Lines: {
    description: "Pure shape and color"
  }
}
```

---

## A3.2 COLOR APPLICATION METHOD

```json
Color_Application: {
  Flat_Color: {
    description: "Single tone fills"
  },

  Cel_Shaded: {
    description: "Discrete shadow steps"
  },

  Soft_Shaded: {
    description: "Smooth tonal gradients"
  },

  Painterly_Color: {
    description: "Visible brush strokes"
  },

  Monochrome_Ink: {
    description: "Black & white only"
  }
}
```

---

## A3.3 LIGHTING MODEL (ANIMATION‑SPECIFIC)

This is **not physical lighting** — it’s *illustrative logic*.

```json
Animated_Lighting_Model: {
  Symbolic_Light: {
    description: "Light used for meaning, not realism"
  },

  Graphic_Light: {
    description: "High contrast shapes"
  },

  Naturalistic_Simulated: {
    description: "Attempts real‑world light behavior"
  },

  Stylized_Rim_Light: {
    description: "Accent silhouettes"
  },

  Glow_Emission: {
    description: "Self‑illuminated elements"
  }
}
```

---

# PHASE A4 — MOTION & CAMERA (VIRTUAL)

---

## A4.1 VIRTUAL CAMERA BEHAVIOR

These replace real camera rigs.

```json
Virtual_Camera: {
  Locked_Frame: {
    description: "No camera movement"
  },

  Digital_Pan: {
    description: "Camera pans over artwork"
  },

  Digital_Zoom: {
    description: "Scale‑based zoom"
  },

  Parallax_Pan: {
    description: "Layered depth movement"
  },

  Free_3D_Camera: {
    description: "Full volumetric camera"
  }
}
```

---

## A4.2 ANIMATION MOTION STYLE

```json
Animation_Motion_Style: {
  Limited_Animation: {
    description: "Minimal frame changes"
  },

  Full_Animation: {
    description: "Smooth, high frame count"
  },

  Snappy: {
    description: "Fast poses, strong timing"
  },

  Floaty: {
    description: "Weightless movement"
  },

  Exaggerated: {
    description: "Non‑realistic motion arcs"
  }
}
```

---

# PHASE A5 — SHARED SYSTEMS (REUSED FROM CINEMA)

These **directly connect** to your existing system.

✅ Shot Size  
✅ Composition  
✅ Mood  
✅ Color Tone  

❌ Camera bodies  
❌ Lenses  
❌ Physical lighting sources  

---

## Example: VALID CROSS‑SYSTEM RULE

✅ Anime + Close‑Up + Dreamlike  
✅ Manga + Extreme Close‑Up + High Contrast  
✅ 3D + Symmetrical Composition + Static Camera  

❌ Manga + Photorealistic Lighting  
❌ Flat Illustration + Shallow Depth of Field  
❌ Limited Animation + Whip‑Fast Camera Motion  

---

# PHASE A6 — DEVELOPER MASTER TREE (ANIMATION)

```
Animation Medium
 ├─ Style Domain
 │   ├─ Line Treatment
 │   ├─ Color Application
 │   ├─ Lighting Model
 │   └─ Motion Style
 ├─ Virtual Camera
 └─ Shared Cinematic Grammar
    ├─ Shot Size
    ├─ Composition
    ├─ Mood
    └─ Color Tone
```

---

# ✅ ANIMATION SYSTEM FOUNDATION COMPLETE

You now have:
- A **pure animation ontology**
- No live‑action leakage
- Clean dropdown logic
- AI‑friendly abstraction
- Artist‑readable structure

---