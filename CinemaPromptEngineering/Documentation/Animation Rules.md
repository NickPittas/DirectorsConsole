Below is a **formal validation layer**, split **per animation domain**, with:

- ✅ **Hard invalid states** (blocked)
- ⚠️ **Soft warnings** (allowed but flagged)
- 🔁 **Auto‑corrections** (optional system behavior)
- 🧠 **Rationale** (for developers, not users)

This is written so it can be implemented as:
- rule engine
- schema validation
- UI dropdown enable/disable logic

---

# ANIMATION SYSTEM — VALIDATION RULES  
*(Domain‑Specific)*

---

# 1️⃣ ANIME DOMAIN — VALIDATION RULES

Anime is **stylized, emotionally driven, cel‑based**, and often **economical in motion**.

---

## 1.1 HARD INVALID RULES (BLOCK)

```json
Anime_Hard_Invalid: [
  {
    rule: "Photorealistic_Rendering",
    condition: "lighting_model == Physically_Based AND surface_detail == Photoreal",
    reason: "Anime does not use photoreal rendering"
  },
  {
    rule: "Excessive_Camera_Shake",
    condition: "motion_style == Handheld_Chaotic",
    reason: "Anime relies on controlled framing"
  },
  {
    rule: "Depth_of_Field_Physics",
    condition: "real_world_lens_effects == true",
    reason: "Anime does not simulate optical lens physics"
  }
]
```

---

## 1.2 SOFT WARNINGS

```json
Anime_Soft_Warnings: [
  {
    condition: "motion_style == Full_Animation AND duration == Long",
    warning: "High production cost, atypical for TV anime"
  },
  {
    condition: "color_tone == Highly_Saturated AND mood == Gloomy",
    warning: "Color/mood mismatch"
  }
]
```

---

## 1.3 AUTO‑CORRECTIONS (OPTIONAL)

```json
Anime_Auto_Correct: {
  if: "style_domain == Anime",
  enforce: {
    lighting_model: ["Symbolic_Light", "Stylized_Rim_Light"],
    color_application: ["Cel_Shaded", "Soft_Shaded"]
  }
}
```

---

# 2️⃣ MANGA DOMAIN — VALIDATION RULES

Manga is **static, graphic, print‑first**.

---

## 2.1 HARD INVALID RULES

```json
Manga_Hard_Invalid: [
  {
    rule: "Color_Rendering",
    condition: "color_application != Monochrome_Ink",
    reason: "Traditional manga is black & white"
  },
  {
    rule: "Camera_Motion",
    condition: "virtual_camera != Locked_Frame",
    reason: "Manga does not use camera motion"
  },
  {
    rule: "Animated_Lighting",
    condition: "lighting_model != Graphic_Light",
    reason: "Manga lighting is symbolic, not volumetric"
  }
]
```

---

## 2.2 SOFT WARNINGS

```json
Manga_Soft_Warnings: [
  {
    condition: "line_treatment == Clean_Line AND mood == Menacing",
    warning: "Menacing tone usually benefits from heavier ink"
  }
]
```

---

## 2.3 AUTO‑CORRECTIONS

```json
Manga_Auto_Correct: {
  if: "style_domain == Manga",
  enforce: {
    color_palette: ["Monochrome"],
    motion_style: ["Static_Frames"]
  }
}
```

---

# 3️⃣ 3D ANIMATION DOMAIN — VALIDATION RULES

3D animation supports **realistic light**, but style must remain coherent.

---

## 3.1 HARD INVALID RULES

```json
ThreeD_Hard_Invalid: [
  {
    rule: "Flat_Only_Lighting",
    condition: "lighting_model == Flat_Light AND medium == Three_Dimensional",
    reason: "3D requires volumetric or simulated light"
  },
  {
    rule: "No_Camera",
    condition: "virtual_camera == Locked_Frame AND motion_style == None",
    reason: "3D implies spatial camera presence"
  }
]
```

---

## 3.2 SOFT WARNINGS

```json
ThreeD_Soft_Warnings: [
  {
    condition: "surface_detail == Photoreal AND motion_style == Limited_Animation",
    warning: "Photoreal surfaces clash with limited animation"
  },
  {
    condition: "lighting_model == Stylized_Rim_Light AND mood == Cheerful",
    warning: "Rim lighting often implies drama or tension"
  }
]
```

---

## 3.3 AUTO‑CORRECTIONS

```json
ThreeD_Auto_Correct: {
  if: "medium == Three_Dimensional",
  enforce: {
    virtual_camera: ["Free_3D_Camera"],
    lighting_model: ["Naturalistic_Simulated", "Stylized_Rim_Light"]
  }
}
```

---

# 4️⃣ ILLUSTRATION / CONCEPT ART DOMAIN — VALIDATION RULES

Illustration is **static, composition‑driven, non‑temporal**.

---

## 4.1 HARD INVALID RULES

```json
Illustration_Hard_Invalid: [
  {
    rule: "Temporal_Motion",
    condition: "motion_style != None",
    reason: "Illustration is static"
  },
  {
    rule: "Camera_Movement",
    condition: "virtual_camera != Locked_Frame",
    reason: "No temporal camera in illustration"
  }
]
```

---

## 4.2 SOFT WARNINGS

```json
Illustration_Soft_Warnings: [
  {
    condition: "composition == Dynamic_Action AND motion_style == None",
    warning: "Dynamic compositions may imply motion"
  }
]
```

---

## 4.3 AUTO‑CORRECTIONS

```json
Illustration_Auto_Correct: {
  if: "style_domain == Illustration",
  enforce: {
    motion_style: ["None"],
    virtual_camera: ["Locked_Frame"]
  }
}
```

---

# 5️⃣ CROSS‑DOMAIN GLOBAL RULES

These apply **to all animation domains**.

---

## 5.1 GLOBAL HARD INVALIDS

```json
Global_Animation_Invalid: [
  {
    rule: "Conflicting_Motion_States",
    condition: "motion_style == None AND virtual_camera != Locked_Frame",
    reason: "Motionless style cannot have camera movement"
  }
]
```

---

## 5.2 GLOBAL SOFT WARNINGS

```json
Global_Animation_Warnings: [
  {
    condition: "mood == Dreamlike AND color_tone == Harsh_High_Contrast",
    warning: "Dreamlike moods favor softer tonal transitions"
  }
]
```

---

# 6️⃣ DEVELOPER IMPLEMENTATION MODEL

### Validation Order (Recommended)

```
1. Animation Medium
2. Style Domain
3. Domain Hard Invalids
4. Auto-Corrections
5. Soft Warnings
6. User Overrides
```

---

# ✅ WHAT THIS GIVES YOU

You now have:

✅ **Hard logic enforcement**  
✅ **Artist‑friendly warnings**  
✅ **Auto‑coherence without hand‑holding**  
✅ **AI‑safe configuration states**  
✅ **Clear developer rationale**

This is the **missing layer** most systems never build.

---