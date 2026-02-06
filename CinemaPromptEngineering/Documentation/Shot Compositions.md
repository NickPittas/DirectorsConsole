This phase defines **how subjects are framed**, **how space is organized**, and **how framing interacts with lenses, emotion, and movement**.

Again: this is a **system ontology**, not a prompt.

---

# PHASE 4 — SHOT SIZE, COMPOSITION & VISUAL GRAMMAR

---

## 1. SHOT SIZE TAXONOMY (CANONICAL)

Shot size is a **primary storytelling selector**.  
It directly influences **lens choice**, **camera distance**, **movement**, and **emotional intensity**.

```json
Shot_Size: {
  Extreme_Wide_Shot: {
    abbreviation: "EWS",
    description: "Environment dominates subject",
    emotional_function: ["Isolation", "Scale", "World-Building"]
  },

  Wide_Shot: {
    abbreviation: "WS",
    description: "Full body with surroundings",
    emotional_function: ["Context", "Spatial Awareness"]
  },

  Medium_Wide_Shot: {
    abbreviation: "MWS",
    description: "Knees up",
    emotional_function: ["Blocking", "Movement"]
  },

  Medium_Shot: {
    abbreviation: "MS",
    description: "Waist up",
    emotional_function: ["Dialogue", "Balance"]
  },

  Medium_Close_Up: {
    abbreviation: "MCU",
    description: "Chest up",
    emotional_function: ["Intimacy", "Emotion"]
  },

  Close_Up: {
    abbreviation: "CU",
    description: "Face dominates frame",
    emotional_function: ["Psychology", "Intensity"]
  },

  Extreme_Close_Up: {
    abbreviation: "ECU",
    description: "Eyes, hands, detail",
    emotional_function: ["Obsession", "Tension"]
  },

  Over_The_Shoulder: {
    abbreviation: "OTS",
    description: "Subject framed past foreground character",
    emotional_function: ["Conversation", "Power Dynamics"]
  },

  American_Shot: {
    abbreviation: "AS",
    description: "Mid-thigh framing",
    emotional_function: ["Classic Cinema", "Confrontation"]
  }
}
```

---

## 2. SHOT SIZE ↔ LENS FOCAL LENGTH LOGIC

This is **non‑negotiable physics**.

```json
Shot_Lens_Relationship: {
  Extreme_Wide_Shot: {
    preferred_focal_lengths: "14–24mm",
    notes: "Environmental emphasis"
  },

  Wide_Shot: {
    preferred_focal_lengths: "18–35mm"
  },

  Medium_Shot: {
    preferred_focal_lengths: "35–50mm"
  },

  Medium_Close_Up: {
    preferred_focal_lengths: "50–65mm"
  },

  Close_Up: {
    preferred_focal_lengths: "75–100mm"
  },

  Extreme_Close_Up: {
    preferred_focal_lengths: "100–135mm"
  }
}
```

⚠️ **Soft warning logic**:
- Wide lenses + close framing → distortion
- Long lenses + wide shots → compression, spatial flattening

---

## 3. COMPOSITION SYSTEMS

Composition governs **visual balance and meaning**.

```json
Composition_Types: {
  Rule_of_Thirds: {
    description: "Subject placed on thirds grid"
  },

  Centered_Composition: {
    description: "Subject centered in frame",
    emotional_effect: ["Power", "Isolation", "Iconography"]
  },

  Symmetrical: {
    description: "Balanced left-right composition",
    emotional_effect: ["Order", "Control"]
  },

  Asymmetrical: {
    description: "Intentional imbalance",
    emotional_effect: ["Tension", "Unease"]
  },

  Leading_Lines: {
    description: "Lines guide viewer attention"
  },

  Negative_Space: {
    description: "Empty space dominates frame",
    emotional_effect: ["Loneliness", "Scale"]
  },

  Frame_Within_Frame: {
    description: "Subject framed by environment"
  },

  Deep_Focus: {
    description: "Foreground to background sharp"
  },

  Shallow_Focus: {
    description: "Subject isolated from background"
  }
}
```

---

## 4. COMPOSITION ↔ SHOT SIZE LOGIC

Not all compositions suit all shot sizes.

```json
Composition_Shot_Compatibility: {
  Extreme_Wide_Shot: [
    "Rule_of_Thirds",
    "Leading_Lines",
    "Negative_Space",
    "Symmetrical"
  ],

  Medium_Shot: [
    "Rule_of_Thirds",
    "Centered_Composition",
    "Frame_Within_Frame"
  ],

  Close_Up: [
    "Centered_Composition",
    "Asymmetrical",
    "Shallow_Focus"
  ]
}
```

---

## 5. COMPOSITION ↔ MOVEMENT LOGIC

Composition affects camera movement feasibility.

```json
Composition_Movement_Logic: {
  Symmetrical: ["Static", "Slow Push In"],
  Asymmetrical: ["Handheld", "Arc"],
  Leading_Lines: ["Track_In"],
  Centered_Composition: ["Dolly", "Crane_Up"]
}
```

---

## 6. SHOT SIZE ↔ EMOTIONAL INTENSITY

This is crucial for **preset auto‑population**.

```json
Shot_Emotion_Map: {
  Extreme_Wide_Shot: ["Detachment", "Awe"],
  Medium_Shot: ["Neutral", "Observation"],
  Close_Up: ["Intimacy", "Tension"],
  Extreme_Close_Up: ["Obsession", "Psychological Pressure"]
}
```

---

## 7. ASPECT RATIO CONSIDERATIONS (OPTIONAL EXTENSION)

Aspect ratio influences composition choices.

```json
Aspect_Ratio_Logic: {
  "2.39:1": {
    strengths: ["Wide_Composition", "Negative_Space"]
  },
  "1.85:1": {
    strengths: ["Balanced_Frames"]
  },
  "4:3": {
    strengths: ["Centered_Composition", "Portraiture"]
  }
}
```

---

## 8. DEVELOPER VIEW — VISUAL GRAMMAR TREE

```
Shot Size
 ├─ Lens Focal Range
 │   ├─ Composition Type
 │   │   ├─ Movement Compatibility
 │   │   └─ Emotional Effect
```

---

## ✅ PHASE 4 COMPLETE

You now have:
- Canonical shot sizes
- Lens‑to‑shot physics
- Composition systems
- Emotional mapping
- Movement compatibility

At this point, **80% of cinematic coherence is structurally enforced**.

---