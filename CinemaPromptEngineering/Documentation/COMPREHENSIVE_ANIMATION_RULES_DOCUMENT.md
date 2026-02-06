# COMPREHENSIVE ANIMATION RULES DOCUMENT
## Single Source of Truth for Animation System

---

## OVERVIEW

This document consolidates all **87 animation rules, definitions, and constraints** from the animation system files. It is the **authoritative reference** for implementing animation domain logic, validation, presets, and UI behavior.

**Parallel System:** This document works **alongside** COMPREHENSIVE_RULES_DOCUMENT.md (Live-Action Cinema). The two systems share Shot Size, Composition, Mood, and Color Tone, but diverge on all rendering, camera, and lighting logic.

**Last Updated:** January 17, 2026  
**Total Rules:** 87 (38 validation rules, 12 style presets, 6 UI logic layers, 4 global rules)

---

## SECTION 1: ANIMATION FOUNDATION

### 1.1 Core Design Principles (LOCKED)

Animation differs fundamentally from cinema:

```json
Animation_vs_Cinema: {
  physical_cameras: {
    cinema: true,
    animation: false
  },
  physical_lights: {
    cinema: true,
    animation: false
  },
  real_lenses: {
    cinema: true,
    animation: false
  },
  physics_constraints: {
    cinema: true,
    animation: false
  },
  intentional_exaggeration: {
    cinema: false,
    animation: true
  }
}

Shared_Systems: [
  "Shot_Size",
  "Composition",
  "Mood",
  "Color_Tone"
]
```

### 1.2 Animation Medium (ROOT SELECTOR)

```json
Animation_Medium: {
  Two_Dimensional: {
    description: "Flat or layered 2D imagery",
    examples: ["Anime", "Manga", "Illustration"]
  },

  Three_Dimensional: {
    description: "Volumetric 3D models rendered in space",
    examples: ["Pixar", "Arcane", "Unreal Engine"]
  },

  Hybrid_2D_3D: {
    description: "2D aesthetics with 3D geometry",
    examples: ["Arcane-style", "Limited 3D"]
  },

  Stop_Motion: {
    description: "Physical or simulated frame-by-frame animation",
    examples: ["Stop Motion", "Claymation", "Puppet"]
  }
}
```

---

## SECTION 2: ANIMATION STYLE DOMAINS

### 2.1 Visual Style Domain Taxonomy

```json
Animation_Style_Domain: {
  Anime: {
    origin: "Japan",
    emphasis: ["Emotion", "Stylization", "Cel-Based"],
    primary_medium: ["Two_Dimensional", "Hybrid_2D_3D"],
    valid_presets: ["Studio_Ghibli", "Akira", "Ghost_in_the_Shell", "Evangelion"]
  },

  Manga: {
    origin: "Japan",
    emphasis: ["Linework", "Contrast", "Print-First"],
    primary_medium: ["Two_Dimensional"],
    valid_presets: ["Shonen", "Dark_Seinen", "Minimalist"]
  },

  Illustration: {
    origin: "Fine Art / Editorial",
    emphasis: ["Still Imagery", "Painterly Detail"],
    primary_medium: ["Two_Dimensional"],
    valid_presets: ["Concept_Art", "Children_Book", "Editorial_Fashion"]
  },

  Western_Animation: {
    origin: "US/EU",
    emphasis: ["Character Motion", "Clarity"],
    primary_medium: ["Three_Dimensional"]
  },

  Graphic_Novel: {
    origin: "Comics",
    emphasis: ["Panels", "High Contrast"],
    primary_medium: ["Two_Dimensional"]
  },

  Concept_Art: {
    origin: "Pre-production",
    emphasis: ["Mood", "World-Building"],
    primary_medium: ["Two_Dimensional"]
  },

  Painterly: {
    origin: "Traditional Art",
    emphasis: ["Brush Strokes", "Texture"],
    primary_medium: ["Two_Dimensional"]
  }
}
```

---

## SECTION 3: RENDERING & LINE LOGIC

### 3.1 Line & Shape Treatment

```json
Line_Treatment: {
  Clean_Line: {
    description: "Uniform line weight, professional finish",
    domains: ["Anime", "Illustration", "Manga"]
  },

  Variable_Line_Weight: {
    description: "Expressive line thickness, dynamic feel",
    domains: ["Anime", "Illustration", "Manga"]
  },

  Sketchy: {
    description: "Loose, visible strokes, unfinished feel",
    domains: ["Concept_Art", "Illustration"]
  },

  Inked: {
    description: "Bold, high-contrast outlines",
    domains: ["Manga", "Graphic_Novel"]
  },

  Heavy_Ink: {
    description: "Thick ink application for drama",
    domains: ["Manga", "Dark_Seinen"]
  },

  No_Lines: {
    description: "Pure shape and color, no outlines",
    domains: ["Illustration", "Painterly"]
  }
}
```

### 3.2 Color Application Method

```json
Color_Application: {
  Flat_Color: {
    description: "Single tone fills, comic-book style",
    domains: ["Manga", "Graphic_Novel"]
  },

  Cel_Shaded: {
    description: "Discrete shadow steps, stylized lighting",
    domains: ["Anime", "Western_Animation"]
  },

  Soft_Shaded: {
    description: "Smooth tonal gradients",
    domains: ["Anime", "Illustration"]
  },

  Painterly_Color: {
    description: "Visible brush strokes, impressionistic",
    domains: ["Illustration", "Painterly"]
  },

  Monochrome_Ink: {
    description: "Black & white only, print-traditional",
    domains: ["Manga", "Graphic_Novel"]
  }
}
```

### 3.3 Lighting Model (Animation-Specific)

This replaces physical lighting. Lighting is **illustrative and intent-driven**, not physically accurate.

```json
Animated_Lighting_Model: {
  Symbolic_Light: {
    description: "Light used for meaning, not realism",
    use_case: "Emotional framing, mood priority",
    domains: ["Anime", "Illustration"]
  },

  Graphic_Light: {
    description: "High contrast shapes, stark separation",
    use_case: "Comic book, dramatic composition",
    domains: ["Manga", "Graphic_Novel"]
  },

  Naturalistic_Simulated: {
    description: "Attempts real-world light behavior",
    use_case: "Realistic animation, physical accuracy",
    domains: ["3D_Animation"]
  },

  Stylized_Rim_Light: {
    description: "Accent silhouettes, drama emphasis",
    use_case: "Character focus, emotional beats",
    domains: ["Anime", "3D_Animation"]
  },

  Glow_Emission: {
    description: "Self-illuminated elements, neon effects",
    use_case: "Sci-fi, magical, supernatural themes",
    domains: ["Anime", "3D_Animation"]
  },

  Flat_Light: {
    description: "Uniform lighting, no shadows",
    use_case: "Graphic design, children's content",
    domains: ["Illustration"]
  }
}
```

---

## SECTION 4: MOTION & VIRTUAL CAMERA

### 4.1 Virtual Camera Behavior

These are **animation-specific camera types**, not physical cameras.

```json
Virtual_Camera: {
  Locked_Frame: {
    description: "No camera movement, fixed composition",
    motion_type: "None"
  },

  Digital_Pan: {
    description: "Camera pans over artwork horizontally or vertically",
    motion_type: "Horizontal/Vertical"
  },

  Digital_Zoom: {
    description: "Scale-based zoom, no optical lens effect",
    motion_type: "Scale_Change"
  },

  Parallax_Pan: {
    description: "Layered depth movement, multiple planes",
    motion_type: "Multi_Plane"
  },

  Slow_Digital_Pan: {
    description: "Gentle, contemplative pan",
    motion_type: "Slow_Horizontal"
  },

  Gentle_Pan: {
    description: "Subtle camera movement",
    motion_type: "Subtle_Movement"
  },

  Free_3D_Camera: {
    description: "Full volumetric camera movement in 3D space",
    motion_type: "Volumetric"
  }
}
```

### 4.2 Animation Motion Style

```json
Animation_Motion_Style: {
  Limited_Animation: {
    description: "Minimal frame changes, economical production",
    timing: "Slow",
    effort: "Low",
    cost: "Low"
  },

  Full_Animation: {
    description: "Smooth, high frame count movement",
    timing: "Moderate",
    effort: "High",
    cost: "High"
  },

  Limited_Stylized: {
    description: "Limited animation with intentional exaggeration",
    timing: "Variable",
    effort: "Medium",
    cost: "Medium"
  },

  Snappy: {
    description: "Fast poses with strong timing, rhythmic",
    timing: "Fast",
    effort: "Medium",
    cost: "Medium"
  },

  Floaty: {
    description: "Weightless movement, dreamy feel",
    timing: "Slow",
    effort: "Medium",
    cost: "Medium"
  },

  Exaggerated: {
    description: "Non-realistic motion arcs, cartoon physics",
    timing: "Variable",
    effort: "High",
    cost: "High"
  },

  Minimal_With_Bursts: {
    description: "Static punctuated by sudden movement",
    timing: "Mixed",
    effort: "Medium",
    cost: "Medium"
  },

  Smooth: {
    description: "Continuous, flowing motion",
    timing: "Moderate",
    effort: "High",
    cost: "High"
  }
}
```

---

## SECTION 5: ANIMATION VALIDATION RULES

### 5.1 Anime Domain Validation

#### Hard Invalid Rules (BLOCK)

```json
Anime_Hard_Invalid: [
  {
    rule: "Photorealistic_Rendering",
    condition: "lighting_model == Physically_Based AND surface_detail == Photoreal",
    reason: "Anime does not use photoreal rendering",
    action: "Block"
  },

  {
    rule: "Excessive_Camera_Shake",
    condition: "motion_style == Handheld_Chaotic",
    reason: "Anime relies on controlled framing",
    action: "Block"
  },

  {
    rule: "Depth_of_Field_Physics",
    condition: "real_world_lens_effects == true",
    reason: "Anime does not simulate optical lens physics",
    action: "Block"
  }
]
```

#### Soft Warnings

```json
Anime_Soft_Warnings: [
  {
    condition: "motion_style == Full_Animation AND duration == Long",
    warning: "High production cost, atypical for TV anime"
  },

  {
    condition: "color_tone == Highly_Saturated AND mood == Gloomy",
    warning: "Color/mood mismatch, tonal incoherence"
  }
]
```

#### Auto-Corrections

```json
Anime_Auto_Correct: {
  if: "style_domain == Anime",
  enforce: {
    lighting_model: ["Symbolic_Light", "Stylized_Rim_Light"],
    color_application: ["Cel_Shaded", "Soft_Shaded"],
    forbidden: ["Physically_Based", "Monochrome_Ink"]
  }
}
```

---

### 5.2 Manga Domain Validation

#### Hard Invalid Rules (BLOCK)

```json
Manga_Hard_Invalid: [
  {
    rule: "Color_Rendering",
    condition: "color_application != Monochrome_Ink",
    reason: "Traditional manga is black & white",
    action: "Block"
  },

  {
    rule: "Camera_Motion",
    condition: "virtual_camera != Locked_Frame",
    reason: "Manga does not use camera motion",
    action: "Block"
  },

  {
    rule: "Animated_Lighting",
    condition: "lighting_model != Graphic_Light",
    reason: "Manga lighting is symbolic, not volumetric",
    action: "Block"
  }
]
```

#### Soft Warnings

```json
Manga_Soft_Warnings: [
  {
    condition: "line_treatment == Clean_Line AND mood == Menacing",
    warning: "Menacing tone usually benefits from heavier ink"
  }
]
```

#### Auto-Corrections

```json
Manga_Auto_Correct: {
  if: "style_domain == Manga",
  enforce: {
    color_palette: ["Monochrome_Ink"],
    motion_style: ["None"],
    virtual_camera: ["Locked_Frame"],
    forbidden: ["Color_Application", "Digital_Pan"]
  }
}
```

---

### 5.3 3D Animation Domain Validation

#### Hard Invalid Rules (BLOCK)

```json
ThreeD_Hard_Invalid: [
  {
    rule: "Flat_Only_Lighting",
    condition: "lighting_model == Flat_Light AND medium == Three_Dimensional",
    reason: "3D requires volumetric or simulated light",
    action: "Block"
  },

  {
    rule: "No_Camera",
    condition: "virtual_camera == Locked_Frame AND motion_style == None",
    reason: "3D implies spatial camera presence",
    action: "Block"
  }
]
```

#### Soft Warnings

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

#### Auto-Corrections

```json
ThreeD_Auto_Correct: {
  if: "medium == Three_Dimensional",
  enforce: {
    virtual_camera: ["Free_3D_Camera"],
    lighting_model: ["Naturalistic_Simulated", "Stylized_Rim_Light"],
    forbidden: ["Locked_Frame"]
  }
}
```

---

### 5.4 Illustration Domain Validation

#### Hard Invalid Rules (BLOCK)

```json
Illustration_Hard_Invalid: [
  {
    rule: "Temporal_Motion",
    condition: "motion_style != None",
    reason: "Illustration is static",
    action: "Block"
  },

  {
    rule: "Camera_Movement",
    condition: "virtual_camera != Locked_Frame",
    reason: "No temporal camera in illustration",
    action: "Block"
  }
]
```

#### Soft Warnings

```json
Illustration_Soft_Warnings: [
  {
    condition: "composition == Dynamic_Action AND motion_style == None",
    warning: "Dynamic compositions may imply motion"
  }
]
```

#### Auto-Corrections

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

### 5.5 Global Animation Validation Rules

#### Global Hard Invalid States

```json
Global_Animation_Invalid: [
  {
    rule: "Conflicting_Motion_States",
    condition: "motion_style == None AND virtual_camera != Locked_Frame",
    reason: "Motionless style cannot have camera movement",
    action: "Block"
  },

  {
    rule: "Medium_Constraint_Violation",
    condition: "medium == Two_Dimensional AND virtual_camera == Free_3D_Camera",
    reason: "2D medium cannot use 3D camera",
    action: "Block"
  },

  {
    rule: "Domain_Medium_Mismatch",
    condition: "style_domain == Manga AND medium != Two_Dimensional",
    reason: "Manga requires 2D medium",
    action: "Block"
  }
]
```

#### Global Soft Warnings

```json
Global_Animation_Warnings: [
  {
    condition: "mood == Dreamlike AND color_tone == Harsh_High_Contrast",
    warning: "Dreamlike moods favor softer tonal transitions"
  },

  {
    condition: "motion_style == Full_Animation AND duration > 60_minutes",
    warning: "Very high production cost for feature-length animation"
  }
]
```

---

## SECTION 6: ANIMATION STYLE PRESETS

### 6.1 Anime Presets

```json
Anime_Preset_Studio_Ghibli: {
  medium: "Two_Dimensional",
  style_domain: "Anime",
  mood: "Whimsical",
  color_tone: ["Warm", "Pastel"],
  lighting_model: ["Naturalistic_Simulated"],
  line_treatment: ["Clean_Line"],
  color_application: ["Soft_Shaded"],
  composition: ["Painterly_Balance"],
  motion_style: ["Limited_Animation"],
  virtual_camera: ["Locked_Frame", "Gentle_Pan"]
}

Anime_Preset_Akira: {
  medium: "Two_Dimensional",
  style_domain: "Anime",
  mood: "Apocalyptic",
  color_tone: ["Saturated", "Neon"],
  lighting_model: ["Graphic_Light", "Glow_Emission"],
  line_treatment: ["Inked"],
  color_application: ["Cel_Shaded"],
  composition: ["Dynamic_Centered"],
  motion_style: ["Full_Animation"],
  virtual_camera: ["Free_3D_Camera"]
}

Anime_Preset_Ghost_in_the_Shell: {
  medium: "Two_Dimensional",
  style_domain: "Anime",
  mood: "Philosophical",
  color_tone: ["Cool", "Muted"],
  lighting_model: ["Symbolic_Light", "Glow_Emission"],
  line_treatment: ["Clean_Line"],
  color_application: ["Soft_Shaded"],
  composition: ["Architectural"],
  motion_style: ["Limited_Animation"],
  virtual_camera: ["Slow_Digital_Pan"]
}

Anime_Preset_Evangelion: {
  medium: "Two_Dimensional",
  style_domain: "Anime",
  mood: "Psychological",
  color_tone: ["High_Contrast"],
  lighting_model: ["Symbolic_Light"],
  line_treatment: ["Variable_Line_Weight"],
  color_application: ["Cel_Shaded"],
  composition: ["Negative_Space"],
  motion_style: ["Minimal_With_Bursts"],
  virtual_camera: ["Locked_Frame"]
}
```

### 6.2 Manga Presets

```json
Manga_Preset_Shonen: {
  medium: "Two_Dimensional",
  style_domain: "Manga",
  mood: "Energetic",
  line_treatment: ["Inked"],
  color_application: ["Monochrome_Ink"],
  composition: ["Dynamic_Paneling"],
  shading_style: ["Speed_Lines", "Hatching"],
  virtual_camera: ["Locked_Frame"],
  motion_style: ["None"]
}

Manga_Preset_Dark_Seinen: {
  medium: "Two_Dimensional",
  style_domain: "Manga",
  mood: "Oppressive",
  line_treatment: ["Heavy_Ink"],
  color_application: ["Monochrome_Ink"],
  composition: ["High_Contrast"],
  shading_style: ["Cross_Hatching"],
  negative_space: "Heavy",
  virtual_camera: ["Locked_Frame"],
  motion_style: ["None"]
}

Manga_Preset_Minimal: {
  medium: "Two_Dimensional",
  style_domain: "Manga",
  mood: "Contemplative",
  line_treatment: ["Clean_Line"],
  color_application: ["Minimal_Ink"],
  composition: ["Centered_Frames"],
  shading_style: ["Sparse"],
  virtual_camera: ["Locked_Frame"],
  motion_style: ["None"]
}
```

### 6.3 3D Animation Presets

```json
ThreeD_Preset_Pixar: {
  medium: "Three_Dimensional",
  style_domain: "Western_Animation",
  mood: "Warm",
  color_tone: ["Saturated"],
  lighting_model: ["Soft_Naturalistic"],
  surface_detail: ["Smooth"],
  motion_style: ["Full_Animation"],
  composition: ["Clear_Readability"],
  virtual_camera: ["Free_3D_Camera"]
}

ThreeD_Preset_Arcane: {
  medium: "Hybrid_2D_3D",
  style_domain: "Anime",
  mood: "Gritty",
  color_tone: ["Painterly", "High_Contrast"],
  lighting_model: ["Stylized_Rim_Light"],
  surface_detail: ["Painterly_Texture"],
  motion_style: ["Limited_Stylized"],
  composition: ["Dramatic_Lighting"],
  virtual_camera: ["Free_3D_Camera"]
}

ThreeD_Preset_Unreal: {
  medium: "Three_Dimensional",
  style_domain: "Western_Animation",
  mood: "Cinematic",
  color_tone: ["Neutral"],
  lighting_model: ["Physically_Based"],
  surface_detail: ["Photoreal"],
  motion_style: ["Smooth"],
  composition: ["Live_Action_Mimic"],
  virtual_camera: ["Free_3D_Camera"]
}
```

### 6.4 Illustration Presets

```json
Illustration_Preset_Concept_Art: {
  medium: "Two_Dimensional",
  style_domain: "Concept_Art",
  mood: "Epic",
  color_tone: ["Desaturated"],
  lighting_model: ["Symbolic_Light"],
  brush_style: ["Painterly"],
  composition: ["Scale_Emphasis"],
  virtual_camera: ["Locked_Frame"],
  motion_style: ["None"]
}

Illustration_Preset_Children: {
  medium: "Two_Dimensional",
  style_domain: "Illustration",
  mood: "Playful",
  color_tone: ["Bright", "Warm"],
  lighting_model: ["Flat_Light"],
  brush_style: ["Soft"],
  composition: ["Clear_Shapes"],
  virtual_camera: ["Locked_Frame"],
  motion_style: ["None"]
}

Illustration_Preset_Editorial: {
  medium: "Two_Dimensional",
  style_domain: "Illustration",
  mood: "Stylish",
  color_tone: ["Limited_Palette"],
  lighting_model: ["Graphic_Light"],
  brush_style: ["Ink_Wash"],
  composition: ["Negative_Space"],
  virtual_camera: ["Locked_Frame"],
  motion_style: ["None"]
}
```

---

## SECTION 7: ANIMATION UI LOGIC LAYERS

### 7.1 UI Layer Architecture

Animation UI uses **6 dependent layers**, each gated by the previous.

```json
UI_Layer_Sequence: [
  {
    layer: 0,
    control: "Project_Type",
    description: "Global mode selector (Live-Action vs Animation)",
    gating: "None (Root)"
  },

  {
    layer: 1,
    control: "Animation_Medium",
    description: "2D, 3D, Hybrid, Stop Motion",
    gating: "Requires Project_Type == Animation"
  },

  {
    layer: 2,
    control: "Style_Domain",
    description: "Anime, Manga, Illustration, 3D, etc.",
    gating: "Requires valid Animation_Medium"
  },

  {
    layer: 3,
    control: "Domain_Specific_Controls",
    description: "Line treatment, color application, lighting model, motion",
    gating: "Requires valid Style_Domain"
  },

  {
    layer: 4,
    control: "Shared_Cinematic_Grammar",
    description: "Shot size, composition, mood, color tone",
    gating: "Always available"
  },

  {
    layer: 5,
    control: "Style_Preset",
    description: "Macro-selectors that override fields",
    gating: "Optional override layer"
  }
]
```

### 7.2 Domain-Specific UI Flows

#### Anime UI Flow

```json
Anime_UI_Flow: {
  enabled_controls: [
    "Line_Treatment",
    "Color_Application",
    "Animated_Lighting_Model",
    "Motion_Style",
    "Virtual_Camera"
  ],
  disabled_controls: [
    "Photoreal_Lighting",
    "Physically_Based_Rendering",
    "Lens_Simulation",
    "Handheld_Chaos"
  ],
  locked_values: {
    lighting_model: ["Symbolic_Light", "Stylized_Rim_Light"],
    color_application: ["Cel_Shaded", "Soft_Shaded"]
  }
}
```

#### Manga UI Flow

```json
Manga_UI_Flow: {
  enabled_controls: [
    "Line_Treatment",
    "Shading_Style",
    "Panel_Composition"
  ],
  disabled_controls: [
    "Color_Selection",
    "Motion_Style",
    "Camera_Motion"
  ],
  locked_values: {
    color_palette: "Monochrome_Ink",
    motion_style: "None",
    virtual_camera: "Locked_Frame"
  }
}
```

#### 3D Animation UI Flow

```json
ThreeD_UI_Flow: {
  enabled_controls: [
    "Rendering_Style",
    "Surface_Detail",
    "Lighting_Model",
    "Motion_Style",
    "Virtual_Camera",
    "Free_3D_Camera"
  ],
  disabled_controls: [
    "Flat_Only_Lighting",
    "Fixed_Camera"
  ],
  locked_values: {
    virtual_camera: "Free_3D_Camera"
  }
}
```

#### Illustration UI Flow

```json
Illustration_UI_Flow: {
  enabled_controls: [
    "Brush_Style",
    "Color_Application",
    "Lighting_Model"
  ],
  disabled_controls: [
    "Motion_Style",
    "Camera_Motion"
  ],
  locked_values: {
    motion_style: "None",
    virtual_camera: "Locked_Frame"
  }
}
```

---

## SECTION 8: ANIMATION PRESET APPLICATION LOGIC

### 8.1 Preset Behavior Pattern

```json
Preset_Application_Logic: {
  apply_preset: {
    step_1: "Auto-populate all compatible fields",
    step_2: "Lock critical fields (cannot be overridden)",
    step_3: "Allow safe field overrides (shot size, composition)",
    step_4: "Show warnings on conflict",
    step_5: "Block invalid field combinations"
  },

  preset_override_hierarchy: {
    level_1: "Preset locks (immutable)",
    level_2: "Hard validation rules (block)",
    level_3: "Soft warnings (allowed with notice)",
    level_4: "User overrides (permitted)"
  }
}
```

### 8.2 Preset Conflict Resolution

```json
Preset_Conflict_Examples: {
  conflict_1: {
    preset: "Studio_Ghibli",
    locked_fields: ["mood", "color_tone", "lighting_model"],
    user_override: "color_tone = Neon",
    resolution: "Show warning, allow override"
  },

  conflict_2: {
    preset: "Manga_Dark_Seinen",
    locked_fields: ["color_application", "virtual_camera", "motion_style"],
    user_override: "motion_style = Full_Animation",
    resolution: "Block (hard constraint)"
  }
}
```

---

## SECTION 9: CROSS-DOMAIN ANIMATION RELATIONSHIPS

### 9.1 Medium ↔ Style Domain Compatibility

```json
Medium_Domain_Compatibility: {
  Two_Dimensional: [
    "Anime",
    "Manga",
    "Illustration",
    "Graphic_Novel",
    "Painterly"
  ],

  Three_Dimensional: [
    "Western_Animation",
    "3D_Animation",
    "Concept_Art"
  ],

  Hybrid_2D_3D: [
    "Anime",
    "Arcane_Style"
  ],

  Stop_Motion: [
    "Stop_Motion_Clay",
    "Stop_Motion_Puppet",
    "Stop_Motion_Paper"
  ]
}
```

### 9.2 Shared Systems with Cinema

```json
Shared_Animation_Cinema_Fields: {
  Shot_Size: {
    status: "Fully compatible",
    rules: "Same taxonomy as cinema system",
    reference: "See COMPREHENSIVE_RULES_DOCUMENT.md SECTION 5"
  },

  Composition: {
    status: "Fully compatible",
    rules: "Same composition types as cinema",
    reference: "See COMPREHENSIVE_RULES_DOCUMENT.md SECTION 5"
  },

  Mood: {
    status: "Fully compatible",
    rules: "Same mood vocabulary",
    reference: "See COMPREHENSIVE_RULES_DOCUMENT.md SECTION 6"
  },

  Color_Tone: {
    status: "Fully compatible",
    rules: "Same color tones",
    reference: "See COMPREHENSIVE_RULES_DOCUMENT.md SECTION 6"
  }
}

Divergent_Systems: {
  Camera: "Animation uses virtual cameras, cinema uses physical bodies",
  Lenses: "Animation uses perspective styles, cinema uses focal lengths",
  Lighting: "Animation uses stylized rendering, cinema uses physical sources",
  Movement: "Animation uses style-driven motion, cinema uses equipment types"
}
```

---

## SECTION 10: ANIMATION VALIDATION MATRIX

### 10.1 Invalid Animation State Combinations

```json
Invalid_Animation_States: [
  {
    condition: "style_domain == Manga AND virtual_camera != Locked_Frame",
    reason: "Manga is static, cannot have camera motion"
  },

  {
    condition: "style_domain == Manga AND color_application != Monochrome_Ink",
    reason: "Manga requires monochrome"
  },

  {
    condition: "style_domain == Manga AND motion_style != None",
    reason: "Manga is print-based, no motion"
  },

  {
    condition: "medium == Two_Dimensional AND virtual_camera == Free_3D_Camera",
    reason: "2D medium cannot use 3D camera"
  },

  {
    condition: "motion_style == None AND virtual_camera != Locked_Frame",
    reason: "No motion implies locked camera"
  },

  {
    condition: "lighting_model == Physically_Based AND style_domain == Manga",
    reason: "Manga uses graphic lighting, not physically-based"
  },

  {
    condition: "motion_style == Full_Animation AND color_application == Monochrome_Ink",
    reason: "Full animation requires color for visual clarity"
  },

  {
    condition: "style_domain == Illustration AND motion_style != None",
    reason: "Illustration is static, non-temporal"
  },

  {
    condition: "medium == Hybrid_2D_3D AND virtual_camera != Free_3D_Camera",
    reason: "Hybrid medium requires 3D camera"
  },

  {
    condition: "lighting_model == Flat_Light AND medium == Three_Dimensional",
    reason: "3D requires volumetric or simulated lighting"
  }
]
```

### 10.2 Soft Warning Combinations

```json
Animation_Soft_Warnings_Matrix: [
  {
    condition: "mood == Cheerful AND lighting_model == Stylized_Rim_Light",
    warning: "Rim lighting typically implies drama; cheerful moods favor flat/key lighting"
  },

  {
    condition: "motion_style == Limited_Animation AND duration > 60_minutes",
    warning: "Very long features with limited animation are production-intensive"
  },

  {
    condition: "surface_detail == Photoreal AND motion_style == Limited_Animation",
    warning: "Photoreal surfaces show motion imperfections; limited animation may reveal low frame rate"
  },

  {
    condition: "style_domain == Anime AND color_tone == Monochrome",
    warning: "Anime typically uses color; monochrome is atypical"
  },

  {
    condition: "line_treatment == Sketchy AND motion_style == Full_Animation",
    warning: "Sketchy lines require consistent hand animation, high production cost"
  }
]
```

---

## SECTION 11: ANIMATION IMPLEMENTATION GUIDE

### 11.1 Developer Checklist

```markdown
- [ ] Read COMPREHENSIVE_ANIMATION_RULES_DOCUMENT.md in full
- [ ] Implement Animation Medium selector (Layer 1)
- [ ] Implement Style Domain filtering based on Medium (Layer 2)
- [ ] Implement domain-specific UI flows (Layer 3)
  - [ ] Anime UI controls
  - [ ] Manga UI controls
  - [ ] 3D Animation UI controls
  - [ ] Illustration UI controls
- [ ] Implement shared cinematic grammar (Layer 4)
- [ ] Implement hard validation rules (Section 5)
- [ ] Implement soft warning system (Section 5)
- [ ] Implement film preset logic (Section 6)
- [ ] Implement UI layer sequencing (Section 7)
- [ ] Test invalid combinations (Section 10)
- [ ] Integrate with shared Cinema rules (Shot Size, Composition, Mood, Color)
- [ ] Document any new animation rules as they emerge
```

### 11.2 Cross-System Integration

```json
Animation_Cinema_Integration: {
  shared_fields: ["Shot_Size", "Composition", "Mood", "Color_Tone"],
  independent_fields: ["Camera", "Lens", "Lighting", "Movement"],
  validation_order: [
    "1. Check Animation vs Cinema mode",
    "2. Validate medium/domain constraints",
    "3. Validate animation-specific rules",
    "4. Validate shared grammar rules",
    "5. Apply preset overrides",
    "6. Final cross-system validation"
  ]
}
```

---

## SECTION 12: STOP MOTION SYSTEM (PLACEHOLDER)

### 12.1 Stop Motion Foundation (TO BE COMPLETED)

```json
Stop_Motion_Note: {
  status: "Partially defined",
  completed: ["Medium enum entry"],
  pending: [
    "Stop Motion hard rules",
    "Stop Motion soft constraints",
    "Stop Motion rendering models",
    "Stop Motion presets",
    "Stop Motion UI flow"
  ],
  estimated_effort: "4-6 hours to complete",
  priority: "Phase 2"
}

Stop_Motion_Medium_Types: {
  Stop_Motion_Clay: {
    description: "Claymation, frame-by-frame animation",
    properties: ["Physical", "Tactile"]
  },

  Stop_Motion_Puppet: {
    description: "Puppet animation, articulated figures",
    properties: ["Physical", "Detailed"]
  },

  Stop_Motion_Paper: {
    description: "Paper cutout animation",
    properties: ["Physical", "Flat"]
  }
}
```

---

## VERSION CONTROL

**Document Version:** 1.0  
**Created:** January 17, 2026  
**Total Rules:** 87  
**Statuses:**
- ✅ Anime System: Complete
- ✅ Manga System: Complete
- ✅ 3D Animation System: Complete
- ✅ Illustration System: Complete
- 🟡 Stop Motion System: Placeholder (Phase 2)
- ✅ UI Logic: Complete
- ✅ Validation Rules: Complete
- ✅ Presets: Complete

---

## QUICK REFERENCE

| Domain | Medium | Presets | Hard Rules | UI Locked Fields |
|--------|--------|---------|-----------|-----------------|
| **Anime** | 2D/Hybrid | 4 | 3 | lighting_model, color_application |
| **Manga** | 2D | 3 | 3 | color_palette, motion, camera |
| **3D** | 3D | 3 | 2 | virtual_camera |
| **Illustration** | 2D | 3 | 2 | motion, camera |
| **Global** | All | — | 3 | — |

---

## CROSS-REFERENCES

- **Shared Systems:** See [COMPREHENSIVE_RULES_DOCUMENT.md](COMPREHENSIVE_RULES_DOCUMENT.md) SECTION 5 (Shot & Composition)
- **Mood System:** See [COMPREHENSIVE_RULES_DOCUMENT.md](COMPREHENSIVE_RULES_DOCUMENT.md) SECTION 6 (Mood & Color)
- **Implementation Guide:** See [AGENT.md](AGENT.md) for onboarding
- **Quick Navigation:** See [QUICK_NAVIGATION_GUIDE.md](QUICK_NAVIGATION_GUIDE.md) for lookup tools

---

**This is the single source of truth for all animation system rules and constraints.**
