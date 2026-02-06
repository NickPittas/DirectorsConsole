This phase **binds everything together**.  
It is where artistic intent becomes **structured, enforceable logic** and where film references act as **preset controllers**, not loose inspiration.

Again: **this is a data model**, not a prompt.

---

# PHASE 5 — COLOR, MOOD & FILM STYLE PRESETS

---

## 1. MOOD (ROOT EMOTIONAL STATE)

Mood is a **high‑level selector**.  
It **constrains** lighting, color, movement, and composition.

```json
Mood: {
  Gloomy: {
    energy: "Low",
    contrast: "High"
  },

  Melancholic: {
    energy: "Low",
    contrast: "Moderate"
  },

  Tense: {
    energy: "High",
    contrast: "High"
  },

  Cheerful: {
    energy: "High",
    contrast: "Low"
  },

  Hopeful: {
    energy: "Rising",
    contrast: "Moderate"
  },

  Dreamlike: {
    energy: "Floating",
    contrast: "Soft"
  },

  Surreal: {
    energy: "Unstable",
    contrast: "Variable"
  },

  Menacing: {
    energy: "Oppressive",
    contrast: "Very High"
  }
}
```

---

## 2. COLOR TONES (IMAGE TREATMENT)

Color tone is **downstream from mood & lighting**.

```json
Color_Tones: {
  Warm: {
    temperature_bias: "Amber",
    emotional_effect: ["Comfort", "Nostalgia"]
  },

  Cool: {
    temperature_bias: "Blue",
    emotional_effect: ["Detachment", "Isolation"]
  },

  Neutral: {
    temperature_bias: "Balanced"
  },

  Saturated: {
    chroma: "High",
    emotional_effect: ["Energy", "Intensity"]
  },

  Desaturated: {
    chroma: "Low",
    emotional_effect: ["Bleakness", "Realism"]
  },

  Bleach_Bypass: {
    chroma: "Very Low",
    contrast: "Very High",
    emotional_effect: ["Harshness", "Violence"]
  },

  Monochrome: {
    chroma: "None",
    emotional_effect: ["Timelessness", "Abstraction"]
  },

  Sepia: {
    chroma: "Warm Monochrome",
    emotional_effect: ["Memory", "History"]
  }
}
```

---

## 3. MOOD ↔ COLOR ↔ LIGHTING LOGIC (HARD + SOFT)

```json
Mood_Color_Lighting_Matrix: {
  Gloomy: {
    allowed_colors: ["Cool", "Desaturated", "Monochrome"],
    preferred_lighting: ["Low_Key", "Hard_Lighting"]
  },

  Cheerful: {
    allowed_colors: ["Warm", "Saturated"],
    preferred_lighting: ["High_Key", "Soft_Lighting"],
    disallowed_lighting: ["Low_Key"]
  },

  Dreamlike: {
    allowed_colors: ["Soft_Warm", "Pastel", "Cool"],
    preferred_lighting: ["Soft_Lighting", "Expressionistic"]
  },

  Menacing: {
    allowed_colors: ["Cool", "Bleach_Bypass"],
    preferred_lighting: ["Low_Key", "Hard_Lighting"]
  }
}
```

---

## 4. MOVEMENT ↔ MOOD LOGIC

Movement must match emotional state.

```json
Mood_Movement_Logic: {
  Gloomy: ["Static", "Very_Slow"],
  Tense: ["Slow_Push_In", "Moderate_Handheld"],
  Cheerful: ["Moderate", "Flowing"],
  Dreamlike: ["Floating", "Slow_Arc"],
  Menacing: ["Slow", "Inevitable"]
}
```

---

## 6. PRESET BEHAVIOR (IMPORTANT FOR UX)

```json
Preset_Behavior: {
  apply_mode: "Auto-Populate",
  user_override: true,
  locked_fields: ["Era", "Disallowed_Moods"],
  warning_on_override: true
}
```

---

## 7. DEVELOPER VIEW — FINAL MASTER LOGIC TREE

```
Film Preset
 ├─ Era
 ├─ Mood
 │   ├─ Color Tone
 │   ├─ Lighting Style
 │   │   └─ Lighting Source
 │   ├─ Movement Profile
 │   └─ Shot Size Bias
 └─ Hard Disallowed States
```

---

## 8. HARD INVALID EXAMPLES (FINAL SAFETY NET)

❌ Blade Runner + Cheerful  
❌ Casablanca + Neon Lighting  
❌ Menacing Mood + High‑Key Lighting  
❌ Dreamlike + Whip‑Fast Camera Movement  

These are **system‑level blocks**, not suggestions.

---

## ✅ PHASE 5 COMPLETE — SYSTEM FINISHED

You now have a **complete cinematic ontology**:

✅ Cameras, sensors, lenses, focal lengths  
✅ Movement systems with physical constraints  
✅ Lighting sources with time‑of‑day & era logic  
✅ Shot size & composition grammar  
✅ Mood, color, and film‑driven presets  

This is **not a prompt generator** — it is a **cinematic reasoning engine** that *can* generate prompts downstream.

---