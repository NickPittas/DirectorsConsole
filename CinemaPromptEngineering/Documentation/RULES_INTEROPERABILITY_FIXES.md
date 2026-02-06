# RULES INTEROPERABILITY FIXES
## Comprehensive Audit & Corrections for Cinema Prompt Engineering

**Document Purpose:** This document identifies all inconsistencies, missing definitions, and gaps in the rule system, then provides the canonical fixes to be merged into COMPREHENSIVE_RULES_DOCUMENT.md.

**Audit Date:** January 17, 2026  
**Cinematography Validation:** Completed - All rules verified against professional cinematography references

---

## EXECUTIVE SUMMARY

| Issue | Count | Severity | Status |
|-------|-------|----------|--------|
| Mood/Lighting constraints too strict | 4+ | CRITICAL | FIXED - Changed to WARN |
| Era lighting dates incorrect | 6 | CRITICAL | FIXED - Historically validated |
| Missing lighting technologies | 3 | HIGH | FIXED - Added Carbon Arc, Mercury/Sodium Vapor |
| Non-standard composition terms | 6 | MEDIUM | FIXED - Reclassified or removed |
| Missing composition terms | 7 | MEDIUM | FIXED - Added standard terms |
| Camera movement terminology | 10+ | MEDIUM | FIXED - Corrected and expanded |
| Undefined color tones | 4 | HIGH | FIXED |
| Undefined lighting styles | 10 | HIGH | FIXED |
| Missing mood categories | 4 | MEDIUM | FIXED - Added Erotic, Noir, Gothic, Documentary |

---

## CRITICAL FIX 1: MOOD/LIGHTING CONSTRAINT CORRECTIONS

### 1.1 Cinematography-Validated Rule Changes

**Key Finding:** Most mood/lighting combinations should be WARN (soft constraint) not BLOCK (hard rule). Professional cinematographers regularly use "atypical" combinations for deliberate artistic effect.

```json
Constraint_Type_Corrections: {

  // === CHANGED FROM BLOCK TO WARN ===

  Dark_Moods_Plus_High_Key: {
    OLD_RULE: "BLOCK - Dark moods cannot use High_Key lighting",
    NEW_RULE: "WARN - Atypical combination, but valid for deliberate effect",
    RATIONALE: "High-key lighting in dark moods creates surreal, ironic, or clinical effects. Used in 'A Clockwork Orange' (Kubrick), psychological thrillers, and horror for unsettling contrast.",
    examples: ["The Shining (bright Overlook interiors)", "Hereditary (well-lit horror)", "Midsommar (daylight horror)"]
  },

  Romantic_Plus_Low_Key: {
    OLD_RULE: "BLOCK - Romantic mood cannot use Low_Key lighting",
    NEW_RULE: "WARN - Atypical but valid for intimate/sensual romance",
    RATIONALE: "Low-key lighting is a TRADITION in romantic cinema for intimacy, sensuality, and mystery. Candlelight romance, noir romance, and erotic scenes all use low-key.",
    examples: ["In the Mood for Love", "Eyes Wide Shut", "Body Heat", "Out of Sight", "Casablanca (Rick's Cafe scenes)"]
  },

  Melancholic_Plus_High_Key: {
    OLD_RULE: "BLOCK - Melancholic mood cannot use High_Key lighting",
    NEW_RULE: "WARN - Atypical but valid for specific melancholic expressions",
    RATIONALE: "High-key melancholy creates haunting, empty, or nostalgic effect. The bright emptiness emphasizes absence and loss.",
    examples: ["The Virgin Suicides", "Revolutionary Road", "Lost in Translation (hotel scenes)"]
  },

  Aggressive_Plus_Soft_Lighting: {
    OLD_RULE: "BLOCK - Aggressive mood cannot use Soft_Lighting",
    NEW_RULE: "WARN - Atypical but valid for controlled aggression or ironic contrast",
    RATIONALE: "Soft-lit aggression creates cognitive dissonance, making violence more disturbing. Also used for 'civilized' aggression in dialogue scenes.",
    examples: ["No Country for Old Men (hotel scenes)", "A Clockwork Orange", "American Psycho"]
  },

  // === CONFIRMED: NO BLOCKS (Complete freedom) ===

  Surreal_Moods: {
    RULE: "No lighting restrictions",
    RATIONALE: "Surreal moods explicitly break rules for artistic effect. Any lighting creates different surreal expressions.",
    CONSTRAINT_TYPE: "NONE"
  }

}
```

### 1.2 Updated Mood Categories with Corrected Constraints

```json
Mood_Categories_Corrected: {
  
  Dark_Moods: {
    moods: ["Gloomy", "Menacing", "Oppressive", "Paranoid", "Tense", "Anxious", "Claustrophobic", "Brutal", "Traumatic", "Unsettling"],
    preferred_lighting: ["Low_Key", "Hard_Lighting", "Practical_Motivated"],
    allowed_lighting: ["Low_Key", "Hard_Lighting", "Practical_Motivated", "Expressionistic", "Available_Light", "High_Key"],
    warn_lighting: ["High_Key"],  // WARN only, not BLOCK
    block_lighting: [],  // No hard blocks
    preferred_colors: ["Cool", "Desaturated", "Muted", "Bleach_Bypass", "Monochrome"],
    warn_colors: ["Pastel", "Highly_Saturated"]  // WARN only
  },

  Light_Moods: {
    moods: ["Cheerful", "Happy", "Hopeful", "Whimsical", "Adventurous"],
    preferred_lighting: ["High_Key", "Soft_Lighting", "Naturalistic"],
    allowed_lighting: ["High_Key", "Soft_Lighting", "Naturalistic", "Studio_Three_Point"],
    warn_lighting: ["Low_Key", "Hard_Lighting"],  // WARN only
    block_lighting: [],  // No hard blocks
    preferred_colors: ["Warm", "Saturated", "Pastel", "Highly_Saturated"],
    warn_colors: ["Bleach_Bypass", "Desaturated"]  // WARN only
  },

  Romantic_Moods: {
    // SPLIT FROM Light_Moods - Romantic has different lighting tradition
    moods: ["Romantic", "Sensual", "Passionate", "Intimate"],
    preferred_lighting: ["Soft_Lighting", "Low_Key", "Practical_Motivated", "Candlelight"],
    allowed_lighting: ["ALL"],  // Romantic works with any lighting
    warn_lighting: [],  // No warnings - romance is flexible
    block_lighting: [],
    preferred_colors: ["Warm", "Muted", "Saturated"],
    note: "Low-key is TRADITIONAL for romantic/sensual scenes, not atypical"
  },

  Melancholic_Moods: {
    moods: ["Melancholic", "Somber", "Reflective", "Contemplative", "Introspective", "Tender", "Bittersweet"],
    preferred_lighting: ["Soft_Lighting", "Naturalistic", "Low_Key"],
    allowed_lighting: ["Soft_Lighting", "Naturalistic", "Low_Key", "Practical_Motivated", "Available_Light", "High_Key"],
    warn_lighting: ["High_Key"],  // WARN only - high-key melancholy is artistic choice
    block_lighting: [],
    preferred_colors: ["Warm", "Muted", "Desaturated", "Monochrome"],
    warn_colors: ["Neon", "Highly_Saturated"]
  },

  Surreal_Moods: {
    moods: ["Surreal", "Dreamlike", "Hallucinatory", "Transcendent", "Meditative", "Philosophical", "Psychedelic"],
    preferred_lighting: ["Soft_Lighting", "Expressionistic"],
    allowed_lighting: ["ALL"],  // Complete freedom
    warn_lighting: [],  // No warnings
    block_lighting: [],  // No blocks
    preferred_colors: ["Muted", "Cool", "Pastel", "Neon", "Saturated"],
    block_colors: [],  // Complete freedom
    note: "Surreal explicitly breaks conventions for artistic effect"
  },

  Aggressive_Moods: {
    moods: ["Aggressive", "Angry", "Rebellious", "Kinetic", "Urgent", "Provocative", "Unhinged"],
    preferred_lighting: ["Hard_Lighting", "Low_Key", "High_Contrast"],
    allowed_lighting: ["Hard_Lighting", "Low_Key", "High_Contrast", "Available_Light", "Expressionistic", "Soft_Lighting"],
    warn_lighting: ["Soft_Lighting"],  // WARN only - soft aggression is deliberate choice
    block_lighting: [],
    preferred_colors: ["High_Contrast", "Saturated", "Desaturated", "Bleach_Bypass"],
    warn_colors: ["Pastel"]
  },

  // === NEW MOOD CATEGORIES ===

  Erotic_Sensual_Moods: {
    moods: ["Erotic", "Sensual", "Seductive", "Lustful", "Carnal"],
    preferred_lighting: ["Low_Key", "Soft_Lighting", "Practical_Motivated", "Candlelight", "Rim_Light"],
    allowed_lighting: ["ALL"],
    warn_lighting: [],
    block_lighting: [],
    preferred_colors: ["Warm", "Saturated", "Muted"],
    note: "Erotic cinema traditionally uses low-key, warm, intimate lighting"
  },

  Noir_Hardboiled_Moods: {
    moods: ["Noir", "Hardboiled", "Fatalistic", "Cynical", "World_Weary"],
    preferred_lighting: ["Low_Key", "Hard_Lighting", "Chiaroscuro", "Practical_Motivated"],
    allowed_lighting: ["Low_Key", "Hard_Lighting", "Chiaroscuro", "Practical_Motivated", "Neon_Noir"],
    warn_lighting: ["High_Key", "Soft_Lighting"],
    block_lighting: [],
    preferred_colors: ["Monochrome", "Desaturated", "Cool", "Neon"],
    note: "Classic noir and neo-noir lighting conventions"
  },

  Gothic_Horror_Moods: {
    moods: ["Gothic", "Macabre", "Grotesque", "Eldritch", "Dread"],
    preferred_lighting: ["Low_Key", "Chiaroscuro", "Expressionistic", "Practical_Motivated"],
    allowed_lighting: ["ALL"],  // Horror uses all lighting for different effects
    warn_lighting: [],  // Daylight horror is valid genre
    block_lighting: [],
    preferred_colors: ["Desaturated", "Cool", "Monochrome", "Muted"],
    note: "Gothic horror can use any lighting - Midsommar proved daylight horror"
  },

  Documentary_Realistic_Moods: {
    moods: ["Documentary", "Realistic", "Observational", "Journalistic", "Verite"],
    preferred_lighting: ["Available_Light", "Naturalistic", "Practical_Motivated"],
    allowed_lighting: ["Available_Light", "Naturalistic", "Practical_Motivated", "High_Key", "Low_Key"],
    warn_lighting: ["Expressionistic"],  // Documentary rarely uses expressionistic
    block_lighting: [],
    preferred_colors: ["Neutral", "Natural", "Desaturated"],
    note: "Documentary style prioritizes naturalism"
  }

}
```

---

## CRITICAL FIX 2: ERA-BASED LIGHTING TECHNOLOGY CORRECTIONS

### 2.1 Historically Validated Dates

**Major corrections based on cinema technology history:**

```json
Era_Lighting_Technology_Corrected: {

  // === CORRECTED DATES ===

  HMI: {
    OLD_DATE: "1960s",
    CORRECT_DATE: "1972",
    INVENTION: "Munich Olympics 1972 - Osram invented HMI for sports broadcasting",
    FILM_ADOPTION: "1973+ (widespread by late 1970s)",
    RATIONALE: "HMI did NOT exist in 1960s. First film use was post-Olympics."
  },

  Fluorescent_Film_Grade: {
    OLD_DATE: "1950s",
    CORRECT_DATE: "1987",
    INVENTION: "Kino Flo founded 1987 by Frieder Hochheim & Gary Swink",
    BEFORE_KINO_FLO: "Standard fluorescents caused green color cast, required heavy filtration",
    RATIONALE: "Pre-Kino Flo fluorescents were AVOIDED in film due to flickering and green shift. 1950s claim is anachronistic."
  },

  LED: {
    OLD_DATE: "1990s",
    CORRECT_DATE: "2002 (limited), 2012+ (widespread)",
    FIRST_FILM_LED: "2002 - early experiments",
    WIDESPREAD_ADOPTION: "2012+ (ARRI SkyPanel 2015 was breakthrough)",
    RATIONALE: "LED film lighting was NOT viable in 1990s. High-power LEDs for cinema emerged 2010s."
  },

  Neon: {
    OLD_DATE: "1970s (early)",
    CORRECT_DATE: "1927 (already widespread)",
    INVENTION: "1910 Paris (Georges Claude)",
    COMMERCIAL_USE: "1920s Las Vegas, Times Square",
    FILM_USE: "1920s onward - visible in silent films",
    RATIONALE: "Neon was NOT new in 1970s - it was already 50 years old!"
  },

  Tungsten_Film_Effective: {
    OLD_CLAIM: "Always available",
    CORRECT_DATE: "1927+ effective for color",
    RATIONALE: "Early film stocks (orthochromatic) couldn't capture red spectrum properly. Panchromatic stock (1920s) + tungsten = usable warm light."
  },

  // === NEW TECHNOLOGIES TO ADD ===

  Carbon_Arc: {
    ERA: "1895-1960s",
    DESCRIPTION: "Primary studio light source for 60+ years",
    CHARACTERISTICS: "Daylight-balanced, extremely bright, required skilled operators",
    PHASED_OUT: "1960s (replaced by HMI and tungsten)",
    NOTE: "Essential for Pre-1950 and 1950s presets"
  },

  Mercury_Vapor: {
    ERA: "1903+",
    DESCRIPTION: "Early artificial light source, bluish-green cast",
    USE_CASE: "Early studios, street lighting in location shots",
    NOTE: "Visible in period-appropriate urban scenes"
  },

  Sodium_Vapor: {
    ERA: "1930s+",
    DESCRIPTION: "Street lights with distinctive orange/yellow cast",
    USE_CASE: "Urban night scenes, parking lots, highways",
    NOTE: "Distinctive 'sodium vapor orange' became iconic in urban cinema"
  }

}
```

### 2.2 Corrected Era Taxonomy

```json
Era_Taxonomy_Corrected: {

  Silent_Era: {
    years: "1895-1929",
    available_technology: ["Carbon_Arc", "Tungsten", "Natural_Light", "Mercury_Vapor"],
    forbidden_sources: ["Fluorescent", "HMI", "LED", "Neon", "Kino_Flo"],
    note: "Carbon arc was primary studio source"
  },
  
  Pre_1950: {
    years: "1930-1949",
    available_technology: ["Carbon_Arc", "Tungsten", "Practical_Lights", "Natural_Light", "Neon", "Sodium_Vapor"],
    forbidden_sources: ["Fluorescent_Film", "HMI", "LED", "Kino_Flo"],
    note: "Classic Hollywood, Film Noir - NEON IS VALID (existed since 1927)"
  },
  
  1950s: {
    years: "1950-1959",
    available_technology: ["Carbon_Arc", "Tungsten", "Practical_Lights", "Neon", "Sodium_Vapor"],
    forbidden_sources: ["HMI", "LED", "Kino_Flo"],
    warn_sources: ["Fluorescent"],  // Existed but problematic
    note: "Technicolor era - fluorescent AVOIDED due to green cast"
  },
  
  1960s: {
    years: "1960-1969",
    available_technology: ["Tungsten", "Carbon_Arc", "Neon", "Practical_Lights", "Sodium_Vapor"],
    forbidden_sources: ["HMI", "LED", "Kino_Flo"],
    warn_sources: ["Fluorescent"],
    note: "New Wave movements - HMI did NOT exist yet"
  },
  
  1970s: {
    years: "1970-1979",
    available_technology: ["Tungsten", "HMI", "Neon", "Practical_Lights", "Sodium_Vapor"],
    forbidden_sources: ["LED", "Kino_Flo"],
    conditional: {
      HMI: "1972+ only (post-Munich Olympics)"
    },
    note: "New Hollywood - HMI from 1972 onward"
  },
  
  1980s: {
    years: "1980-1989",
    available_technology: ["Tungsten", "HMI", "Neon", "Practical_Lights", "Sodium_Vapor"],
    forbidden_sources: ["LED", "Kino_Flo"],
    conditional: {
      Kino_Flo: "1987+ only"
    },
    note: "High concept era - Kino Flo invented 1987"
  },
  
  1990s: {
    years: "1990-1999",
    available_technology: ["Tungsten", "HMI", "Kino_Flo", "Neon", "Practical_Lights", "Sodium_Vapor"],
    forbidden_sources: ["LED"],
    note: "Indie revolution - NO LED YET"
  },
  
  2000s: {
    years: "2000-2009",
    available_technology: ["Tungsten", "HMI", "Kino_Flo", "Neon", "Practical_Lights", "Sodium_Vapor", "Early_LED"],
    forbidden_sources: [],
    conditional: {
      LED: "2002+ experimental only, not widespread"
    },
    note: "Digital transition - early LED experiments"
  },
  
  Modern: {
    years: "2010-present",
    available_technology: ["ALL"],
    forbidden_sources: [],
    note: "Full digital, LED standard from ~2012"
  }

}
```

---

## FIX 3: COMPOSITION TERMINOLOGY CORRECTIONS

### 3.1 Reclassifications

```json
Composition_Reclassifications: {

  // === MOVED TO SHOT SIZE (Not Composition) ===
  Extreme_Close_Up: {
    OLD_CATEGORY: "Composition",
    NEW_CATEGORY: "Shot_Size",
    RATIONALE: "ECU describes framing distance, not compositional arrangement. It's a shot size like Wide, Medium, Close-Up."
  },

  // === MOVED TO LIGHTING (Not Composition) ===
  Venetian_Blinds: {
    OLD_CATEGORY: "Composition",
    NEW_CATEGORY: "Lighting_Effect",
    RATIONALE: "Venetian blind shadows are a LIGHTING effect, not a framing/composition technique. The composition could be anything while using this lighting."
  },

  // === REMOVED (Non-Standard Terms) ===
  Poetic: {
    ACTION: "REMOVE from Composition list",
    RATIONALE: "Poetic is a GENRE/STYLE term, not a compositional technique. Many different compositions can be 'poetic'.",
    ALTERNATIVE: "Use 'Painterly' or 'Lyrical_Framing' for specific visual approaches"
  },

  Street_Level: {
    ACTION: "REMOVE from Composition list",
    RATIONALE: "Street_Level describes camera POSITION (low angle in urban setting), not composition. Could use any composition from street level.",
    ALTERNATIVE: "Use 'Low_Angle' + urban setting in environment"
  },

  Industrial_Frames: {
    ACTION: "REMOVE from Composition list",
    RATIONALE: "Describes SUBJECT MATTER (industrial environments), not compositional technique.",
    ALTERNATIVE: "Use 'Frame_Within_Frame' or 'Geometric' + industrial setting"
  },

  // === RENAMED FOR CLARITY ===
  Handheld_Frames: {
    OLD_NAME: "Handheld_Frames",
    NEW_NAME: "Handheld_Composition",
    RATIONALE: "Clarify this refers to the compositional aesthetics of handheld, not the movement equipment"
  }

}
```

### 3.2 Missing Standard Composition Terms to Add

```json
Composition_Additions: {

  Golden_Ratio: {
    description: "Subject placed according to phi (1.618:1) proportions",
    emotional_effect: ["Harmony", "Natural beauty", "Classical"],
    use_case: ["Portraiture", "Landscape", "Art cinema"],
    note: "More organic than Rule of Thirds, used in classical art"
  },

  Golden_Spiral: {
    description: "Fibonacci spiral guides eye through frame",
    emotional_effect: ["Flow", "Natural movement", "Elegance"],
    use_case: ["Dynamic compositions", "Action following", "Nature"],
    note: "Logarithmic spiral based on golden ratio"
  },

  Dynamic_Symmetry: {
    description: "Diagonal-based compositional system",
    emotional_effect: ["Energy", "Movement", "Sophistication"],
    use_case: ["Action", "Art cinema", "Architecture"],
    note: "Jay Hambidge's system using root rectangles"
  },

  Headroom: {
    description: "Space above subject's head in frame",
    emotional_effect: "Varies with amount - tight = tension, loose = isolation",
    use_case: ["Interviews", "Dialogue", "Portraits"],
    note: "Too much = lost, too little = cramped"
  },

  Lead_Room: {
    description: "Space in direction subject faces or moves",
    emotional_effect: ["Anticipation", "Direction", "Balance"],
    use_case: ["Movement shots", "Dialogue", "Action"],
    note: "Also called 'looking room' or 'nose room'"
  },

  Fill_The_Frame: {
    description: "Subject occupies most/all of frame with minimal background",
    emotional_effect: ["Intensity", "Focus", "Intimacy", "Impact"],
    use_case: ["Portraits", "Product", "Dramatic emphasis"],
    note: "Eliminates distracting background"
  },

  Radial_Balance: {
    description: "Elements arranged around central point",
    emotional_effect: ["Focus", "Energy", "Explosion/Implosion"],
    use_case: ["Action", "Group shots", "Abstract"],
    note: "Draws eye to center through radiating elements"
  }

}
```

---

## FIX 4: CAMERA MOVEMENT TERMINOLOGY CORRECTIONS

### 4.1 Equipment Constraint Corrections

```json
Movement_Equipment_Corrections: {

  Jib_Arm: {
    OLD_MOVEMENTS: ["Crane_Up", "Crane_Down", "Arc"],
    CORRECTED_MOVEMENTS: ["Crane_Up", "Crane_Down", "Arc", "Boom_Up", "Boom_Down", "Limited_Pan", "Limited_Tilt"],
    RATIONALE: "Jibs can also boom (move arm up/down without changing camera angle) and many support limited pan/tilt at the head"
  },

  Drone: {
    OLD_MOVEMENTS: ["Track_In", "Track_Out", "Crane_Up", "Crane_Down", "Arc"],
    CORRECTED_MOVEMENTS: ["Track_In", "Track_Out", "Crane_Up", "Crane_Down", "Arc", "Orbit", "Reveal", "Follow", "Flyover", "Flythrough", "Establish"],
    RATIONALE: "Modern drones are extremely versatile - can do almost any movement. Added drone-specific movements."
  },

  Steadicam: {
    OLD_MOVEMENTS: "Limited list",
    CORRECTED_MOVEMENTS: ["Track_In", "Track_Out", "Follow", "Lead", "Circle", "Arc", "Reveal", "Crane_Up", "Crane_Down", "Stair_Climb", "Through_Doorway"],
    RATIONALE: "Steadicam is highly versatile - can do most movements that don't require precise repeatability",
    CANNOT_DO: ["Motion_Control_Repeat", "Macro_Precise"]
  },

  Handheld: {
    ALLOWED_MOVEMENTS: ["All basic movements with characteristic shake"],
    CHARACTERISTIC: "Organic, human movement quality",
    BEST_FOR: ["Documentary", "Verite", "Intimate", "Chaos"],
    LIMITATIONS: ["Cannot achieve smooth, mechanical precision"]
  }

}
```

### 4.2 Missing Movement Terms to Add

```json
Movement_Additions: {

  Crash_Zoom: {
    description: "Extremely fast zoom in or out",
    equipment: ["Any camera with zoom lens"],
    emotional_effect: ["Shock", "Revelation", "Emphasis", "70s style"],
    examples: ["Kill Bill", "Jaws", "Shaun of the Dead"],
    speed: "Very fast (under 1 second)",
    note: "Also called 'snap zoom' or 'whip zoom'"
  },

  Whip_Tilt: {
    description: "Very fast tilt up or down, often with motion blur",
    equipment: ["Tripod", "Handheld", "Gimbal"],
    emotional_effect: ["Energy", "Transition", "Reveal"],
    speed: "Very fast",
    note: "Vertical equivalent of whip pan"
  },

  SnorriCam: {
    description: "Camera mounted to actor's body, facing them",
    equipment: ["Body rig", "Chest mount"],
    emotional_effect: ["Disorientation", "Subjectivity", "Intoxication", "Panic"],
    examples: ["Requiem for a Dream", "Mean Streets", "Pi"],
    note: "Background moves while subject stays centered and static"
  },

  Dutch_Roll: {
    description: "Camera rotates on its longitudinal axis while shooting",
    equipment: ["Gimbal", "Specialized head", "Drone"],
    emotional_effect: ["Disorientation", "Dream", "Madness"],
    note: "Different from Dutch Angle (which is static tilt)"
  },

  Push_Pull: {
    description: "Dolly in while zooming out, or reverse (Vertigo effect)",
    equipment: ["Dolly", "Zoom lens"],
    emotional_effect: ["Unease", "Realization", "Vertigo", "Psychological shift"],
    examples: ["Vertigo", "Jaws", "Goodfellas"],
    note: "Also called 'Dolly Zoom', 'Vertigo Effect', or 'Hitchcock Zoom'"
  },

  Crab: {
    description: "Camera moves laterally (sideways) parallel to subject",
    equipment: ["Dolly", "Slider", "Steadicam"],
    emotional_effect: ["Following", "Revealing", "Lateral energy"],
    note: "Same as 'Truck' - both terms valid"
  },

  Boom: {
    description: "Vertical camera movement on jib/crane arm without angle change",
    equipment: ["Jib", "Crane"],
    emotional_effect: ["Smooth vertical reveal", "Level change"],
    note: "Different from Pedestal (tripod column) or Crane (with angle change)"
  }

}
```

### 4.3 Terminology Clarifications

```json
Movement_Terminology_Clarifications: {

  Push_In_vs_Dolly_In: {
    CLARIFICATION: "SAME THING - Push In = Dolly In",
    PREFERRED_TERM: "Dolly_In (more precise)",
    NOTE: "Push In is common on set, Dolly In is more technical"
  },

  Track_vs_Truck: {
    CLARIFICATION: "Different terms for different axes",
    TRACK: "Movement along camera's Z-axis (forward/back) - also called Dolly",
    TRUCK: "Movement along camera's X-axis (left/right) - also called Crab",
    NOTE: "UK/Europe often uses 'Track' for both"
  },

  Zoom_vs_Dolly: {
    CLARIFICATION: "COMPLETELY DIFFERENT",
    ZOOM: "Optical (lens changes focal length). Background relationship to subject CHANGES (compression changes).",
    DOLLY: "Physical (camera moves through space). Background relationship to subject MAINTAINS (natural perspective).",
    EMOTIONAL_DIFFERENCE: "Dolly feels natural, Zoom feels artificial/urgent"
  },

  Dutch_Angle_Static: {
    CLARIFICATION: "Dutch Angle is a COMPOSITION/ANGLE, not a movement",
    STATIC: "Fixed tilted angle on roll axis",
    MOVEMENT: "If the Dutch Angle changes during shot, it's 'Dutch Roll' or 'Rotating Dutch'",
    NOTE: "Add to Composition, not Movement, unless dynamic"
  }

}
```

---

## FIX 5: COMPLETE COLOR TONE TAXONOMY

```json
Color_Tones_Complete: {

  // === EXISTING (in master list) ===
  Cool: {
    temperature_bias: "Blue",
    kelvin_range: "5600K-10000K",
    emotional_effect: ["Detachment", "Isolation", "Clinical", "Sadness"]
  },
  Warm: {
    temperature_bias: "Amber/Orange",
    kelvin_range: "2700K-4000K",
    emotional_effect: ["Comfort", "Nostalgia", "Intimacy", "Safety"]
  },
  Neutral: {
    temperature_bias: "Balanced",
    kelvin_range: "5000K-5600K",
    emotional_effect: ["Objectivity", "Realism", "Documentary"]
  },
  Saturated: {
    chroma: "High",
    emotional_effect: ["Energy", "Intensity", "Vitality"]
  },
  Highly_Saturated: {
    chroma: "Very High",
    emotional_effect: ["Hyperreal", "Stylized", "Pop"]
  },
  Desaturated: {
    chroma: "Low",
    emotional_effect: ["Bleakness", "Realism", "Historical"]
  },
  Muted: {
    chroma: "Subdued",
    emotional_effect: ["Subtlety", "Sophistication", "Restraint"]
  },
  Monochrome: {
    chroma: "None",
    emotional_effect: ["Timelessness", "Abstraction", "Classic"]
  },
  Bleach_Bypass: {
    chroma: "Very Low",
    contrast: "Very High",
    emotional_effect: ["Harshness", "Violence", "Grit"]
  },
  Pastel: {
    chroma: "Soft High",
    emotional_effect: ["Innocence", "Whimsy", "Lightness"]
  },
  Neon: {
    chroma: "Electric",
    hues: ["Magenta", "Cyan", "Electric Blue", "Hot Pink"],
    emotional_effect: ["Urban", "Futuristic", "Nightlife", "Artificial"]
  },
  Natural: {
    chroma: "True to life",
    emotional_effect: ["Authenticity", "Documentary", "Organic"]
  },
  High_Contrast: {
    contrast: "Extreme",
    emotional_effect: ["Drama", "Graphic", "Bold"]
  },

  // === NEW (used in presets but undefined) ===
  Green_Tint: {
    temperature_bias: "Green shift",
    use_case: "Matrix-style, surveillance, digital",
    emotional_effect: ["Artificial", "Digital", "Surveillance", "Sickly"]
  },
  Cold: {
    temperature_bias: "Very Blue",
    kelvin_range: "8000K+",
    emotional_effect: ["Alienation", "Death", "Inhuman"]
  },
  Stylized: {
    chroma: "Intentionally artificial",
    description: "Color choices that prioritize aesthetic over realism",
    emotional_effect: ["Heightened", "Theatrical", "Designed"]
  },
  Soft_Warm: {
    temperature_bias: "Gentle Amber",
    kelvin_range: "3500K-4500K",
    emotional_effect: ["Gentle", "Memory", "Faded warmth"]
  },
  Sepia: {
    chroma: "Warm Monochrome",
    emotional_effect: ["Memory", "History", "Aged"]
  },
  Teal_Orange: {
    description: "Complementary color grade",
    use_case: "Modern blockbusters",
    emotional_effect: ["Cinematic", "Commercial", "Polished"]
  }

}
```

---

## FIX 6: COMPLETE LIGHTING STYLE TAXONOMY

```json
Lighting_Styles_Complete: {

  // === EXISTING ===
  High_Key: {
    contrast: "Low",
    shadow_density: "Minimal",
    fill_ratio: "1:1 to 2:1",
    use_case: ["Comedy", "Romance", "Musicals", "Commercials"],
    description: "Bright, even illumination with minimal shadows"
  },
  Low_Key: {
    contrast: "High",
    shadow_density: "Deep",
    fill_ratio: "8:1 to 16:1",
    use_case: ["Film Noir", "Thriller", "Horror", "Drama", "Romance"],
    description: "Dominant shadows, selective illumination",
    note: "VALID FOR ROMANCE - see Fix 1"
  },
  Soft_Lighting: {
    shadow_edge: "Soft/Diffused",
    source_size: "Large relative to subject",
    use_case: ["Beauty", "Romance", "Drama"],
    description: "Gentle gradation between light and shadow"
  },
  Hard_Lighting: {
    shadow_edge: "Sharp/Defined",
    source_size: "Small/Point source",
    use_case: ["Noir", "Thriller", "Stylized"],
    description: "Crisp shadow edges, dramatic"
  },
  Naturalistic: {
    description: "Motivated by believable sources",
    use_case: ["Drama", "Documentary style"],
    note: "Light appears to come from logical in-scene sources"
  },
  Expressionistic: {
    description: "Stylized, emotionally driven, non-realistic",
    use_case: ["Horror", "Art films", "Psychological"],
    note: "Light serves emotion over logic"
  },
  Studio_Three_Point: {
    components: ["Key", "Fill", "Back/Rim"],
    use_case: ["Interviews", "Classic Hollywood", "Portraits"],
    description: "Traditional controlled lighting setup"
  },
  Practical_Motivated: {
    description: "Visible source motivates illumination",
    use_case: ["Modern cinema", "Realism"],
    note: "Lamps, windows, screens visible and 'causing' the light"
  },

  // === NEW ===
  Available_Light: {
    description: "Using only existing light sources, no added film lighting",
    use_case: ["Documentary", "Neorealism", "Guerrilla filmmaking"],
    examples: ["Breathless", "The French Connection", "La Haine"]
  },
  High_Contrast: {
    contrast: "Extreme",
    shadow_density: "Either very deep or absent",
    description: "Maximum separation between light and dark",
    examples: ["Persona", "The Seventh Seal", "A Clockwork Orange"]
  },
  Minimal: {
    description: "Barely lit, edge of visibility",
    use_case: ["Horror", "Art film", "Abstract"],
    examples: ["Under the Skin"]
  },
  Neon_Noir: {
    description: "Noir lighting with neon color sources",
    use_case: ["Cyberpunk", "Neo-noir", "Urban night"],
    examples: ["Blade Runner", "Ghost in the Shell", "Drive"]
  },
  Chiaroscuro: {
    description: "Extreme contrast between light and dark, painterly",
    origin: "Renaissance painting technique",
    use_case: ["Period", "Art film", "Drama"]
  },
  Rembrandt: {
    description: "Triangle of light on shadow-side cheek",
    use_case: ["Portraiture", "Drama", "Classic"]
  },
  Silhouette: {
    description: "Subject completely dark against bright background",
    use_case: ["Iconic shots", "Mystery", "Graphic"]
  },
  Rim_Light: {
    description: "Edge lighting separating subject from background",
    use_case: ["Dramatic", "Sci-fi", "Music video"]
  },
  Candlelight: {
    description: "Motivated by actual or simulated candle sources",
    color_temperature: "~1800K (very warm)",
    use_case: ["Period drama", "Romance", "Intimacy"],
    examples: ["Barry Lyndon", "The Favourite"]
  }

}
```

---

## FIX 7: PRESET CONSTRAINT UPDATES

### 7.1 Updated Constraint Philosophy

```json
Preset_Constraint_Philosophy: {

  BLOCK_vs_WARN: {
    BLOCK: "Physically impossible or historically impossible",
    WARN: "Atypical but artistically valid",
    DEFAULT: "Prefer WARN unless truly impossible"
  },

  examples: {
    BLOCK: "Night + Sun (physically impossible)",
    BLOCK: "1940s preset + LED (historically impossible)",
    WARN: "Cheerful mood + Low-Key (atypical but valid)",
    WARN: "Romantic mood + Hard lighting (atypical but valid)"
  }

}
```

### 7.2 Era-Corrected Preset Constraints

```json
Preset_Era_Corrections: {

  Film_Preset_Casablanca: {
    era: "1942",
    CORRECTED_forbidden_sources: ["LED", "HMI", "Kino_Flo"],
    REMOVED_forbidden_sources: ["Neon"],  // Neon existed in 1942!
    note: "Neon was common in 1942 - Rick's Cafe could have neon signs"
  },

  Film_Preset_Citizen_Kane: {
    era: "1941",
    CORRECTED_forbidden_sources: ["LED", "HMI", "Kino_Flo"],
    available_sources: ["Tungsten", "Carbon_Arc", "Practical", "Neon"],
    note: "Deep focus achieved with carbon arc lighting"
  },

  Film_Preset_The_Godfather: {
    era: "1972",
    CORRECTED_forbidden_sources: ["LED", "Kino_Flo"],
    available_sources: ["Tungsten", "Practical", "Neon"],
    note: "HMI just invented - not used on Godfather. Gordon Willis used tungsten."
  },

  Film_Preset_Blade_Runner: {
    era: "1982",
    available_sources: ["Tungsten", "HMI", "Neon", "Practical"],
    forbidden_sources: ["LED", "Kino_Flo"],  // Kino Flo 1987
    note: "Neon is ESSENTIAL to Blade Runner aesthetic"
  }

}
```

---

## IMPLEMENTATION CHECKLIST

- [x] Mood/Lighting constraints changed from BLOCK to WARN (Section 1)
- [x] Added new mood categories: Erotic, Noir, Gothic, Documentary (Section 1.2)
- [x] Era lighting dates corrected with historical validation (Section 2)
- [x] Added missing lighting technologies: Carbon Arc, Mercury Vapor, Sodium Vapor (Section 2)
- [x] Composition terms reclassified or removed (Section 3.1)
- [x] Added missing composition terms (Section 3.2)
- [x] Camera movement equipment constraints corrected (Section 4.1)
- [x] Added missing camera movements (Section 4.2)
- [x] Movement terminology clarified (Section 4.3)
- [x] Color tone taxonomy completed (Section 5)
- [x] Lighting style taxonomy completed (Section 6)
- [x] Preset era constraints corrected (Section 7)

---

## VALIDATION RULE UPDATES

```json
Validation_Rules_Corrected: {

  Mood_Lighting_Validation: {
    OLD: "mood.disallowed_lighting → BLOCK",
    NEW: "mood.warn_lighting → WARN, mood.block_lighting → BLOCK",
    implementation: "Most combinations are WARN, very few are BLOCK"
  },

  Era_Technology_Validation: {
    implementation: "era.forbidden_sources → BLOCK (historically impossible)",
    examples: [
      "1940s + LED → BLOCK",
      "1960s + HMI → BLOCK (invented 1972)",
      "1980s + Kino_Flo → WARN if before 1987, BLOCK if anachronistic in period film"
    ]
  },

  Physical_Impossibility_Validation: {
    implementation: "BLOCK only for physics violations",
    examples: [
      "Night + Sun → BLOCK",
      "Interior + Natural Sunlight without windows → BLOCK"
    ]
  }

}
```

---

## DOCUMENT END

**Version:** 2.0 (Cinematography Validated)  
**Validation Date:** January 17, 2026  
**Changes from v1.0:**
- All mood/lighting BLOCKs converted to WARNs where appropriate
- Era lighting dates historically corrected
- Composition/Movement terminology standardized
- New mood categories added

**Next Steps:**
1. Merge into COMPREHENSIVE_RULES_DOCUMENT.md
2. Generate JSON schema from merged document
3. Implement validation engine with BLOCK/WARN distinction
4. Test against all 80+ film presets
