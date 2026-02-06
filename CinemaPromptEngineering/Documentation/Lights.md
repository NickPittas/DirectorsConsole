This is the **most logic‑sensitive system** in your application.  
Lighting is where incoherent selections must be **prevented**, not merely warned.

What follows is a **clean, enforceable ontology**, designed for dropdowns, presets, and rule engines.

---

# PHASE 3 — LIGHTING SYSTEM

---

## 1. TIME OF DAY (ROOT CONSTRAINT)

Time of day is a **root selector**.  
It constrains **lighting sources**, **lighting styles**, **color temperature**, and **mood**.

```json
Time_of_Day: [
  "Dawn",
  "Morning",
  "Midday",
  "Afternoon",
  "Golden_Hour",
  "Blue_Hour",
  "Night"
]
```

---

## 2. LIGHTING SOURCES (PHYSICAL ORIGIN OF LIGHT)

These are **actual light emitters**, not looks.

```json
Lighting_Sources: {
  Natural: {
    Sun: {
      availability: ["Dawn", "Morning", "Midday", "Afternoon", "Golden_Hour"]
    },
    Moon: {
      availability: ["Night"]
    },
    Sky_Light: {
      availability: ["Dawn", "Morning", "Midday", "Afternoon", "Blue_Hour"]
    }
  },

  Artificial: {
    Tungsten: {
      color_temp: "3200K"
    },
    HMI: {
      color_temp: "5600K"
    },
    Fluorescent: {
      examples: ["Kino Flo"]
    },
    LED: {
      examples: ["ARRI Skypanel", "Aputure"]
    },
    Neon: {
      stylistic: true
    },
    Practical_Lights: {
      examples: ["Lamps", "Candles", "Streetlights"]
    }
  }
}
```

---

## 3. LIGHTING STYLES (HOW LIGHT IS SHAPED)

Lighting style defines **contrast, direction, and intention**.

```json
Lighting_Styles: {
  High_Key: {
    contrast: "Low",
    shadow_density: "Minimal"
  },

  Low_Key: {
    contrast: "High",
    shadow_density: "Deep"
  },

  Soft_Lighting: {
    shadow_edge: "Soft"
  },

  Hard_Lighting: {
    shadow_edge: "Sharp"
  },

  Naturalistic: {
    description: "Motivated by believable sources"
  },

  Expressionistic: {
    description: "Stylized, emotionally driven"
  },

  Studio_Three_Point: {
    components: ["Key", "Fill", "Back"]
  },

  Practical_Motivated: {
    description: "Visible source motivates illumination"
  }
}
```

---

## 4. LIGHTING STYLE ↔ TIME OF DAY COMPATIBILITY (HARD RULES)

```json
Lighting_Time_Constraints: {
  Night: {
    disallowed_sources: ["Sun"],
    allowed_sources: ["Moon", "Artificial", "Practical_Lights"]
  },

  Midday: {
    preferred_sources: ["Sun", "HMI"],
    disallowed_styles: ["Low_Key"]
  },

  Golden_Hour: {
    preferred_styles: ["Soft_Lighting", "Naturalistic"]
  }
}
```

---

## 5. LIGHTING STYLE ↔ MOOD RELATIONSHIP

Lighting **drives mood**.  
Mood selection should auto‑filter lighting options.

```json
Lighting_Mood_Matrix: {
  Gloomy: {
    preferred_styles: ["Low_Key", "Hard_Lighting"],
    disallowed_styles: ["High_Key"]
  },

  Cheerful: {
    preferred_styles: ["High_Key", "Soft_Lighting"],
    disallowed_styles: ["Low_Key"]
  },

  Tense: {
    preferred_styles: ["Low_Key", "Hard_Lighting", "Expressionistic"]
  },

  Dreamlike: {
    preferred_styles: ["Soft_Lighting", "Expressionistic"]
  }
}
```

---

## 6. ERA & TECHNOLOGY CONSTRAINTS (IMPORTANT)

This prevents **anachronistic lighting**.

```json
Era_Lighting_Constraints: {
  Pre_1950: {
    disallowed_sources: ["LED", "Modern Neon"],
    preferred_sources: ["Tungsten", "Practical_Lights"]
  },

  1980s: {
    allowed_sources: ["Neon", "Tungsten", "Fluorescent"]
  },

  Modern: {
    allowed_sources: ["LED", "HMI", "Practical_Lights"]
  }
}
```

---

## 7. COLOR TEMPERATURE & LIGHTING LOGIC

```json
Color_Temperature_Logic: {
  Warm: {
    sources: ["Tungsten", "Golden_Hour_Sun"]
  },

  Cool: {
    sources: ["HMI", "Moon", "Overcast_Sky"]
  },

  Mixed: {
    description: "Intentional color contrast"
  }
}
```

---

## 8. LIGHTING INTENSITY (EXPOSURE CHARACTER)

```json
Lighting_Intensity: [
  "Underexposed",
  "Neutral",
  "Overexposed"
]
```

---

## 9. DEVELOPER VIEW — LIGHTING LOGIC TREE

```
Time of Day
 ├─ Allowed Lighting Sources
 │   ├─ Lighting Style
 │   │   ├─ Color Temperature
 │   │   └─ Mood Compatibility
 └─ Era Constraints
```

---

## 10. HARD INVALID EXAMPLES (SYSTEM‑LEVEL BLOCKS)

❌ Night + Sun  
❌ Cheerful + Low‑Key Noir Lighting  
❌ 1940s Film + LED Panels  
❌ Midday + Moonlight Key  

These are **not warnings** — they are **invalid states**.

---

## ✅ PHASE 3 COMPLETE

You now have:
- Physical light sources
- Lighting styles
- Time‑of‑day enforcement
- Mood & era logic
- Color temperature coherence

This system alone can **auto‑populate**, **auto‑restrict**, and **educate users visually**.

---