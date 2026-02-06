# COMPREHENSIVE FILMMAKING RULES DOCUMENT
## Single Source of Truth for Cinema Prompt Engineering

---

## SECTION 1: CAMERA SYSTEMS

### 1.1 Camera Manufacturers & Bodies

```json
ARRI: {
  Alexa_35: {
    sensor: "Super 35",
    mount: "LPL",
    era: "Digital Cinema",
    use_case: ["Feature Film", "High-End TV"],
    weight_kg: 3.0,
    weight_lbs: 6.6,
    weight_class: "Medium"
  },
  Alexa_Mini: {
    sensor: "Super 35",
    mount: ["PL", "LPL"],
    era: "Digital Cinema",
    weight_kg: 2.3,
    weight_lbs: 5.1,
    weight_class: "Light"
  },
  Alexa_Mini_LF: {
    sensor: "Large Format",
    mount: "LPL",
    era: "Digital Cinema",
    weight_kg: 2.6,
    weight_lbs: 5.7,
    weight_class: "Light"
  },
  Alexa_LF: {
    sensor: "Large Format",
    mount: "LPL",
    era: "Digital Cinema"
  },
  Alexa_65: {
    sensor: "65mm",
    mount: "XPL",
    era: "Digital Cinema",
    weight_class: "Heavy"
  }
}

RED: {
  V_Raptor: {
    sensor: "VistaVision / Full Frame",
    mount: "RF",
    era: "Digital Cinema"
  },
  V_Raptor_X: {
    sensor: "VistaVision / Full Frame",
    mount: "RF"
  },
  V_Raptor_XL: {
    sensor: "VistaVision",
    weight_kg: 3.6,
    weight_lbs: 8.0,
    weight_class: "Medium"
  },
  Komodo_X: {
    sensor: "Super 35",
    mount: "RF"
  },
  Monstro_8K: {
    sensor: "VistaVision / Full Frame",
    mount: "PL"
  }
}

Sony: {
  Venice_2: {
    sensor: ["Full Frame", "S35"],
    mount: "PL",
    era: "Digital Cinema",
    weight_kg: 4.3,
    weight_lbs: 9.4,
    weight_class: "Heavy"
  },
  FX9: {
    sensor: "Full Frame",
    mount: "E"
  },
  FX6: {
    sensor: "Full Frame",
    mount: "E"
  }
}

Canon: {
  C700_FF: {
    sensor: "Full Frame",
    mount: "PL"
  },
  C500_Mark_II: {
    sensor: "Full Frame",
    mount: "EF / PL"
  },
  C300_Mark_III: {
    sensor: "Super 35",
    mount: "EF / PL"
  }
}

Blackmagic: {
  Ursa_Mini_Pro_12K: {
    sensor: "Super 35",
    mount: "PL"
  },
  Pocket_6K: {
    sensor: "Super 35",
    mount: "EF"
  }
}

Panasonic: {
  Varicam_LT: {
    sensor: "Super 35",
    mount: "PL"
  },
  S1H: {
    sensor: "Full Frame",
    mount: "L"
  }
}

Nikon: {
  Z9: {
    sensor: "Full Frame",
    mount: "Z"
  }
}

Film_Cameras: {
  // ARRI Film Cameras
  Arricam_ST: {
    format: "35mm Film",
    mount: "PL",
    era: "Film Cinema",
    weight_class: "Heavy",
    notes: "Studio camera, sync sound capable"
  },
  Arricam_LT: {
    format: "35mm Film",
    mount: "PL",
    era: "Film Cinema",
    weight_class: "Medium",
    notes: "Lightweight version for handheld/Steadicam"
  },
  Arriflex_535B: {
    format: "35mm Film",
    mount: "PL",
    era: "Film Cinema",
    weight_class: "Medium",
    notes: "Industry standard 1990s-2010s"
  },
  Arriflex_35BL: {
    format: "35mm Film",
    mount: "PL",
    era: "Film Cinema",
    weight_class: "Heavy",
    notes: "Blimped studio camera"
  },
  Arriflex_35_III: {
    format: "35mm Film",
    mount: "PL",
    era: "Film Cinema",
    weight_class: "Medium",
    notes: "Versatile production camera"
  },
  
  // Panavision Film Cameras
  Panavision_Panaflex_Millennium_XL2: {
    format: "35mm Film",
    mount: "Panavision",
    era: "Film Cinema",
    weight_class: "Medium",
    notes: "Modern film camera, extremely quiet"
  },
  Panavision_Panaflex_Millennium: {
    format: "35mm Film",
    mount: "Panavision",
    era: "Film Cinema",
    weight_class: "Medium",
    notes: "Industry workhorse 2000s"
  },
  Panavision_Panaflex_Platinum: {
    format: "35mm Film",
    mount: "Panavision",
    era: "Film Cinema",
    weight_class: "Medium",
    notes: "High-end production camera"
  },
  Panavision_Panaflex_Gold: {
    format: "35mm Film",
    mount: "Panavision",
    era: "Film Cinema",
    weight_class: "Medium",
    notes: "Classic 1980s-90s camera"
  },
  Panavision_Panastar: {
    format: "35mm Film",
    mount: "Panavision",
    era: "Film Cinema",
    weight_class: "Light",
    notes: "High-speed photography capable"
  },
  
  // Large Format Film Cameras
  Panavision_System_65: {
    format: "65mm Film",
    mount: "Panavision_65",
    era: "Film Cinema",
    weight_class: "Heavy",
    notes: "Large format film, 5-perf 65mm"
  },
  IMAX_MSM_9802: {
    format: "IMAX 15/70",
    mount: "IMAX",
    era: "Film Cinema",
    weight_class: "Ultra_Heavy",
    notes: "15-perf horizontal 65mm"
  },
  IMAX_MKIV: {
    format: "IMAX 15/70",
    mount: "IMAX",
    era: "Film Cinema",
    weight_class: "Heavy",
    notes: "Modern IMAX film camera"
  },
  
  // Mitchell Film Cameras (Classic)
  Mitchell_BNC: {
    format: "35mm Film",
    mount: "Mitchell",
    era: "Classic Film",
    weight_class: "Heavy",
    notes: "Classic Hollywood studio camera"
  },
  Mitchell_BNCR: {
    format: "35mm Film",
    mount: "Mitchell",
    era: "Classic Film",
    weight_class: "Heavy",
    notes: "Reflex version of BNC"
  },
  Mitchell_BFC_65: {
    format: "65mm Film",
    mount: "Mitchell_65",
    era: "Classic Film",
    weight_class: "Ultra_Heavy",
    notes: "Large format classic camera"
  },
  
  // Super Panavision 70 Cameras
  Super_Panavision_70: {
    format: "65mm Film",
    mount: "Panavision_65",
    era: "Epic Film",
    weight_class: "Heavy",
    notes: "2.20:1 spherical 65mm format"
  },
  Ultra_Panavision_70: {
    format: "65mm Film",
    mount: "Panavision_65",
    era: "Epic Film",
    weight_class: "Heavy",
    notes: "2.76:1 anamorphic 65mm format"
  }
}

DJI: {
  Inspire_3: {
    sensor: "Full Frame",
    lens_system: "DL Mount"
  },
  Mavic_3_Cine: {
    sensor: "Micro Four Thirds",
    lens_system: "Fixed"
  }
}
```

### 1.2 Camera Weight Classes

```json
Weight_Classes: {
  Ultra_Light: "< 2.0 kg",
  Light: "2.0 – 3.0 kg",
  Medium: "3.0 – 4.0 kg",
  Heavy: "> 4.0 kg"
}

Ultra_Light_Cameras: {
  RED_V_Raptor: {
    weight_kg: 1.83,
    weight_lbs: 4.03,
    sensor: "VistaVision / Full Frame",
    notes: "Exceptionally compact for large-format"
  }
}

Light_Cameras: {
  ARRI_Alexa_Mini_LF: {
    weight_kg: 2.6,
    weight_lbs: 5.7,
    sensor: "Large Format",
    notes: "Industry standard for Steadicam & handheld LF"
  },
  ARRI_Alexa_Mini: {
    weight_kg: 2.3,
    weight_lbs: 5.1,
    sensor: "Super 35"
  }
}

Medium_Cameras: {
  ARRI_Alexa_35: {
    weight_kg: 3.0,
    weight_lbs: 6.6,
    sensor: "Super 35"
  },
  RED_V_Raptor_XL: {
    weight_kg: 3.6,
    weight_lbs: 8.0,
    sensor: "VistaVision"
  }
}

Heavy_Cameras: {
  Sony_Venice_2: {
    weight_kg: 4.3,
    weight_lbs: 9.4,
    sensor: "Full Frame",
    notes: "Integrated RAW recorder increases mass"
  },
  ARRI_Alexa_65: {
    weight_kg: "> 10.0",
    sensor: "65mm",
    notes: "Studio-only camera system"
  }
}
```

### 1.3 Sensor Types & Lens Coverage

```json
Sensor_Coverage: {
  Super_35: ["S35 Lenses", "Full Frame Lenses"],
  Full_Frame: ["Full Frame Lenses"],
  Large_Format: ["LF / FF+ Lenses"],
  VistaVision: ["Full Frame Lenses"],
  65mm: ["65mm Lenses Only"]
}
```

### 1.4 Hard Camera-Lens Compatibility Rules

```json
Camera_Lens_Hard_Rules: {
  Alexa_35: "Cannot use Full Frame lenses only",
  Alexa_LF: "Cannot use S35-only lenses",
  Alexa_65: "Cannot use anything except 65mm optics",
  Panavision_Bodies: "Cannot use non-Panavision lenses"
}

Soft_Camera_Lens_Warnings: {
  "Vintage lenses on ultra-high-resolution sensors": "Quality degradation warning",
  "Extreme wide lenses on handheld shots": "Distortion warning"
}
```

### 1.5 Camera Weight ↔ Movement Constraints

```json
Hard_Movement_Constraints: {
  Heavy: ["Handheld", "Gimbal", "Drone"],
  Alexa_65: ["Steadicam", "Handheld", "Drone"]
}

Soft_Movement_Warnings: {
  Medium_Cameras: ["Extended Handheld", "Fast Whip Pans"],
  Large_Format: ["Fast Handheld", "Whip Fast Timing"]
}
```

### 1.6 Film Stocks (For Film Cameras Only)

**UI Rule:** Film Stock dropdown is **only visible** when a Film Camera is selected.

```json
Film_Stocks: {
  // Modern Color Negative Stocks (Currently Available)
  Kodak_Vision3_500T_5219: {
    type: "Color Negative",
    format: ["35mm", "65mm"],
    sensitivity: "500 ASA",
    color_temp: "Tungsten (3200K)",
    characteristics: ["High latitude", "Low grain", "Excellent shadow detail"],
    era_available: "Modern",
    notes: "Industry standard for low-light and night work"
  },
  Kodak_Vision3_250D_5207: {
    type: "Color Negative",
    format: ["35mm", "65mm"],
    sensitivity: "250 ASA",
    color_temp: "Daylight (5500K)",
    characteristics: ["Fine grain", "Natural color rendition"],
    era_available: "Modern",
    notes: "Primary daylight stock"
  },
  Kodak_Vision3_200T_5213: {
    type: "Color Negative",
    format: ["35mm", "65mm"],
    sensitivity: "200 ASA",
    color_temp: "Tungsten (3200K)",
    characteristics: ["Fine grain", "Wide exposure latitude"],
    era_available: "Modern",
    notes: "Versatile studio stock"
  },
  Kodak_Vision3_50D_5203: {
    type: "Color Negative",
    format: ["35mm", "65mm"],
    sensitivity: "50 ASA",
    color_temp: "Daylight (5500K)",
    characteristics: ["Ultra fine grain", "Maximum sharpness"],
    era_available: "Modern",
    notes: "Highest resolution color stock"
  },
  
  // Black & White Stocks
  Kodak_Double_X_5222: {
    type: "Black & White Negative",
    format: ["35mm", "16mm"],
    sensitivity: "250 ASA",
    characteristics: ["Classic silver halide look", "High contrast capable"],
    era_available: "Modern",
    notes: "Used on Schindler's List, Raging Bull, The Lighthouse"
  },
  Kodak_Tri_X_7266: {
    type: "Black & White Reversal",
    format: ["16mm"],
    sensitivity: "200 ASA",
    characteristics: ["High contrast", "Deep blacks"],
    era_available: "Modern"
  },
  
  // IMAX Specific Stocks
  Kodak_Vision3_500T_5219_65mm: {
    type: "Color Negative",
    format: ["65mm", "IMAX 15/70"],
    sensitivity: "500 ASA",
    color_temp: "Tungsten (3200K)",
    era_available: "Modern",
    notes: "Large format version for IMAX"
  },
  Kodak_Vision3_200T_5213_65mm: {
    type: "Color Negative",
    format: ["65mm", "IMAX 15/70"],
    sensitivity: "200 ASA",
    color_temp: "Tungsten (3200K)",
    era_available: "Modern"
  },
  
  // Historic Stocks (For Period-Accurate Preset Matching)
  Eastman_5247_100T: {
    type: "Color Negative (Historic)",
    format: ["35mm"],
    sensitivity: "100 ASA",
    color_temp: "Tungsten (3200K)",
    characteristics: ["Warm color palette", "Distinctive grain structure", "70s/80s look"],
    era_available: "1970s-1980s",
    notes: "The Godfather, Star Wars, Blade Runner"
  },
  Eastman_5294_400T: {
    type: "Color Negative (Historic)",
    format: ["35mm"],
    sensitivity: "400 ASA",
    color_temp: "Tungsten (3200K)",
    characteristics: ["High speed", "Visible grain", "70s/80s night scenes"],
    era_available: "1970s-1980s",
    notes: "Blade Runner night scenes"
  },
  Eastman_5250_50T: {
    type: "Color Negative (Historic)",
    format: ["65mm"],
    sensitivity: "50 ASA",
    color_temp: "Tungsten (3200K)",
    characteristics: ["Fine grain", "Epic film look"],
    era_available: "1960s",
    notes: "Lawrence of Arabia, 2001: A Space Odyssey"
  },
  Kodak_Plus_X_5231: {
    type: "Black & White Negative (Historic)",
    format: ["35mm"],
    sensitivity: "80 ASA",
    characteristics: ["Fine grain", "Classic B&W look"],
    era_available: "1950s-1970s",
    notes: "Classic Hollywood B&W"
  }
}

Film_Stock_Format_Compatibility: {
  "35mm Film": ["35mm stocks"],
  "65mm Film": ["65mm stocks"],
  "IMAX 15/70": ["IMAX-rated 65mm stocks"],
  "Digital": ["N/A - No film stock selection"]
}
```

### 1.7 Aspect Ratios

```json
Aspect_Ratios: {
  // Academy & Classic Formats
  "1.33:1": {
    name: "Academy Ratio (4:3)",
    description: "Classic pre-widescreen standard",
    format_type: "Spherical",
    common_uses: ["Silent films", "Pre-1953 cinema", "TV classics"],
    emotional_effect: ["Intimate", "Classical", "Constraining"]
  },
  "1.37:1": {
    name: "Academy Sound",
    description: "Sound-era academy standard",
    format_type: "Spherical",
    common_uses: ["Classic Hollywood", "1930s-1950s"],
    emotional_effect: ["Classical", "Formal"]
  },
  
  // Modern Widescreen Formats
  "1.66:1": {
    name: "European Widescreen",
    description: "European theatrical standard",
    format_type: "Spherical",
    common_uses: ["European cinema", "Art films"],
    emotional_effect: ["Balanced", "European aesthetic"]
  },
  "1.78:1": {
    name: "HDTV (16:9)",
    description: "Modern television and streaming standard",
    format_type: "Spherical",
    common_uses: ["Television", "Streaming", "Documentary"],
    emotional_effect: ["Contemporary", "Familiar"]
  },
  "1.85:1": {
    name: "Theatrical Flat",
    description: "US theatrical widescreen standard",
    format_type: "Spherical",
    common_uses: ["Most theatrical releases", "Comedies", "Dramas"],
    emotional_effect: ["Cinematic", "Balanced"]
  },
  
  // Anamorphic & Ultra-Wide Formats
  "2.20:1": {
    name: "70mm Spherical",
    description: "Large format 70mm projection",
    format_type: "Spherical 65mm",
    common_uses: ["Epic films", "70mm presentations"],
    notes: "Lawrence of Arabia, 2001: A Space Odyssey",
    emotional_effect: ["Epic", "Immersive", "Grand"]
  },
  "2.35:1": {
    name: "Anamorphic (Pre-1970)",
    description: "Classic CinemaScope ratio",
    format_type: "Anamorphic",
    common_uses: ["Pre-1970 widescreen", "Epic films"],
    emotional_effect: ["Epic", "Cinematic"]
  },
  "2.39:1": {
    name: "Anamorphic Scope",
    description: "Modern anamorphic standard",
    format_type: "Anamorphic",
    common_uses: ["Action", "Sci-Fi", "Modern blockbusters"],
    notes: "Blade Runner, Mad Max: Fury Road",
    emotional_effect: ["Epic", "Expansive", "Cinematic"]
  },
  "2.76:1": {
    name: "Ultra Panavision 70",
    description: "Extreme widescreen anamorphic 70mm",
    format_type: "Anamorphic 65mm",
    common_uses: ["Epic roadshow presentations"],
    notes: "Ben-Hur, The Hateful Eight",
    emotional_effect: ["Maximum epic scope", "Overwhelming scale"]
  },
  
  // IMAX Formats
  "1.43:1": {
    name: "IMAX Full Frame",
    description: "Full 15/70 IMAX aspect ratio",
    format_type: "IMAX",
    common_uses: ["IMAX documentaries", "IMAX sequences in features"],
    notes: "Oppenheimer IMAX sequences, Dunkirk",
    emotional_effect: ["Immersive", "Overwhelming", "Visceral"]
  },
  "1.90:1": {
    name: "IMAX Digital / Laser",
    description: "IMAX expanded aspect ratio",
    format_type: "IMAX Digital",
    common_uses: ["Modern IMAX presentations"],
    emotional_effect: ["Immersive", "Modern cinematic"]
  },
  
  // Specialty Formats
  "1.19:1": {
    name: "Movietone",
    description: "Early sound film ratio",
    format_type: "Spherical",
    common_uses: ["1920s-1930s sound films"],
    notes: "The Lighthouse (stylistic choice)"
  },
  "4:3_Pillarboxed": {
    name: "Pillarboxed 4:3",
    description: "4:3 within wider frame",
    format_type: "Stylized",
    common_uses: ["Period pieces", "Artistic choice"],
    notes: "Grand Budapest Hotel flashbacks"
  }
}

Aspect_Ratio_Camera_Compatibility: {
  "35mm_Spherical": ["1.33:1", "1.37:1", "1.66:1", "1.78:1", "1.85:1"],
  "35mm_Anamorphic": ["2.35:1", "2.39:1"],
  "65mm_Spherical": ["2.20:1"],
  "65mm_Anamorphic": ["2.76:1"],
  "IMAX_15/70": ["1.43:1", "1.90:1"],
  "Digital_Any": ["Any aspect ratio via framing/cropping"]
}
```

---

## SECTION 2: LENS SYSTEMS

### 2.1 Lens Manufacturers & Families

```json
Zeiss: {
  Ultra_Prime: {
    type: "Prime",
    coverage: "Super 35",
    mount: "PL",
    focal_lengths: [8, 10, 12, 14, 16, 20, 24, 28, 32, 40, 50, 65, 85, 100, 135]
  },
  Master_Prime: {
    type: "Prime",
    coverage: "Super 35",
    mount: "PL",
    focal_lengths: [12, 14, 16, 18, 21, 25, 27, 32, 35, 40, 50, 65, 75, 100, 135]
  },
  Supreme_Prime: {
    type: "Prime",
    coverage: "Full Frame",
    mount: "PL / LPL",
    focal_lengths: [15, 18, 21, 25, 29, 35, 50, 65, 85, 100, 135]
  }
}

Cooke: {
  S4_i: {
    type: "Prime",
    coverage: "Super 35",
    mount: "PL",
    focal_lengths: [12, 14, 16, 18, 21, 25, 27, 32, 35, 40, 50, 65, 75, 100, 135]
  },
  S7_i: {
    type: "Prime",
    coverage: "Full Frame",
    mount: "PL",
    focal_lengths: [16, 18, 21, 25, 32, 40, 50, 65, 75, 100, 135]
  }
}

Panavision: {
  Primo: {
    type: "Prime",
    coverage: "Super 35",
    mount: "Panavision",
    focal_lengths: [14, 17.5, 21, 27, 35, 40, 50, 75, 100]
  },
  Primo_70: {
    type: "Prime",
    coverage: "65mm",
    mount: "Panavision"
  }
}

Canon_Lenses: {
  CN_E_Prime: {
    type: "Prime",
    coverage: "Full Frame",
    mount: "PL / EF",
    focal_lengths: [14, 20, 24, 35, 50, 85, 135]
  }
}

Zoom_Lenses: {
  Angenieux_Optimo: {
    coverage: "Super 35",
    mount: "PL",
    focal_ranges: ["15-40", "24-290"]
  },
  Angenieux_Optimo_Ultra: {
    coverage: "Full Frame",
    mount: "PL",
    focal_ranges: ["24-290"]
  }
}

// Vintage & Classic Lenses (For Period-Accurate Film Presets)
Vintage_Lenses: {
  Bausch_Lomb_Super_Baltar: {
    type: "Prime",
    coverage: "35mm Film",
    mount: "Mitchell",
    era: "1950s-1970s",
    focal_lengths: [20, 25, 35, 40, 50, 75, 100],
    characteristics: ["Warm rendering", "Classic Hollywood look", "Soft halation"],
    notes: "The Godfather (40mm and 75mm primarily)"
  },
  Zeiss_Super_Speed: {
    type: "Prime",
    coverage: "Super 35",
    mount: "PL",
    era: "1970s-Present",
    focal_lengths: [18, 25, 35, 50, 85],
    characteristics: ["Fast aperture (T1.3)", "70s look"],
    notes: "Barry Lyndon (modified), Schindler's List"
  },
  Zeiss_Standard_Speed: {
    type: "Prime",
    coverage: "Super 35",
    mount: "PL",
    era: "1970s-Present",
    focal_lengths: [16, 24, 32, 50, 85],
    characteristics: ["Sharp", "Clinical"],
    notes: "Schindler's List"
  },
  Zeiss_Planar_f07: {
    type: "Prime (Specialty)",
    coverage: "35mm Film",
    mount: "Mitchell (Modified)",
    era: "1960s",
    focal_lengths: [50],
    characteristics: ["Extremely fast aperture (f/0.7)", "NASA-developed", "Candlelight capable"],
    notes: "Barry Lyndon candlelight scenes"
  },
  Panavision_C_Series_Anamorphic: {
    type: "Anamorphic Prime",
    coverage: "35mm Anamorphic",
    mount: "Panavision",
    era: "1970s-Present",
    focal_lengths: [35, 40, 50, 75, 100],
    characteristics: ["Classic anamorphic flare", "Oval bokeh"],
    notes: "Blade Runner"
  },
  Panavision_Super_Speed: {
    type: "Prime",
    coverage: "Super 35",
    mount: "Panavision",
    era: "1970s-Present",
    focal_lengths: [24, 35, 50, 85],
    characteristics: ["Fast aperture", "Warm Panavision look"],
    notes: "Blade Runner"
  },
  Super_Panavision_70_Lenses: {
    type: "Prime",
    coverage: "65mm",
    mount: "Panavision_65",
    era: "1960s-Present",
    focal_lengths: [35, 50, 75, 100, 150],
    characteristics: ["65mm large format coverage", "Epic scale"],
    notes: "Lawrence of Arabia, 2001: A Space Odyssey"
  }
}
```

### 2.2 Lens Manufacturer ↔ Camera Compatibility Rules

**UI Rule:** Lens Manufacturer dropdown filters based on camera mount system.

```json
Lens_Manufacturer_Camera_Rules: {
  // Panavision Ecosystem (Closed)
  Panavision_Cameras: {
    required_lens_manufacturers: ["Panavision"],
    reason: "Panavision mount is proprietary and exclusive"
  },
  
  // PL Mount Cameras (Open Standard)
  PL_Mount_Cameras: {
    compatible_lens_manufacturers: ["Zeiss", "Cooke", "ARRI", "Angenieux", "Canon_Cinema", "Leica"],
    cameras: ["ARRI Alexa", "RED", "Sony Venice", "Blackmagic"]
  },
  
  // Classic Film Cameras
  Mitchell_Mount_Cameras: {
    compatible_lens_manufacturers: ["Bausch_Lomb", "Cooke", "Zeiss_Classic"],
    cameras: ["Mitchell BNC", "Mitchell BNCR"]
  },
  
  // 65mm / Large Format
  Large_Format_65mm: {
    required_lens_manufacturers: ["Panavision_65", "Hasselblad", "ARRI_65"],
    cameras: ["Panavision System 65", "ARRI Alexa 65", "IMAX"]
  }
}

Lens_Manufacturer_Filter_Logic: {
  "When Panavision camera selected": {
    show_only: ["Panavision Primo", "Panavision Primo 70", "Panavision C-Series", "Panavision Super Speed"],
    hide: ["Zeiss", "Cooke", "Canon"]
  },
  "When ARRI/RED/Sony selected": {
    show: ["Zeiss", "Cooke", "ARRI Signature", "Angenieux", "Canon Cinema"],
    hide: ["Panavision"]
  },
  "When Film Camera (Mitchell) selected": {
    show: ["Bausch & Lomb Super Baltar", "Cooke Speed Panchro", "Zeiss Classic"],
    hide: ["Modern digital-era lenses"]
  }
}
```

### 2.3 Shot Size ↔ Focal Length Logic

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

---

## SECTION 3: CAMERA MOVEMENT SYSTEMS

### 3.1 Movement Equipment

```json
Movement_Equipment: {
  Static: {
    description: "Locked-off camera, no movement"
  },
  Handheld: {
    description: "Operator-held camera, organic instability"
  },
  Shoulder_Rig: {
    description: "Stabilized handheld for controlled motion"
  },
  Steadicam: {
    description: "Body-mounted stabilization system"
  },
  Gimbal: {
    description: "Motorized 3-axis stabilization (Ronin, Movi)"
  },
  Dolly: {
    description: "Camera on wheeled platform on tracks"
  },
  Slider: {
    description: "Short linear movement on rails"
  },
  Jib: {
    description: "Small crane with vertical arc"
  },
  Crane: {
    description: "Large vertical and horizontal movement"
  },
  Technocrane: {
    description: "Telescoping crane with programmable motion"
  },
  Motion_Control: {
    description: "Repeatable, programmable camera motion"
  },
  Drone: {
    description: "Aerial stabilized movement"
  }
}
```

### 3.2 Movement Types (Cinematic Language)

```json
Movement_Types: {
  Pan: {
    axis: "Horizontal"
  },
  Tilt: {
    axis: "Vertical"
  },
  Roll: {
    axis: "Rotational"
  },
  Track_In: {
    direction: "Forward"
  },
  Track_Out: {
    direction: "Backward"
  },
  Truck_Left: {
    direction: "Lateral"
  },
  Truck_Right: {
    direction: "Lateral"
  },
  Push_In: {
    description: "Emotional move toward subject"
  },
  Pull_Back: {
    description: "Reveal or emotional withdrawal"
  },
  Arc: {
    description: "Circular movement around subject"
  },
  Crane_Up: {
    direction: "Vertical up"
  },
  Crane_Down: {
    direction: "Vertical down"
  },
  Zoom_In: {
    optical: true
  },
  Zoom_Out: {
    optical: true
  },
  Dolly_Zoom: {
    hybrid: true
  },
  Whip_Pan: {
    style: "Fast pan with motion blur"
  }
}
```

### 3.3 Movement Timing

```json
Movement_Timing: {
  Static: {},
  Very_Slow: {},
  Slow: {},
  Moderate: {},
  Fast: {},
  Whip_Fast: {}
}
```

### 3.4 Equipment ↔ Movement Compatibility (Hard Rules)

```json
Equipment_Movement_Compatibility: {
  Static: ["Pan", "Tilt", "Roll"],
  Handheld: ["Pan", "Tilt", "Track_In", "Track_Out", "Push_In", "Pull_Back"],
  Steadicam: ["Track_In", "Track_Out", "Arc", "Truck_Left", "Truck_Right"],
  Gimbal: ["Track_In", "Track_Out", "Arc", "Crane_Up", "Crane_Down"],
  Dolly: ["Track_In", "Track_Out", "Truck_Left", "Truck_Right", "Dolly_Zoom"],
  Jib: ["Crane_Up", "Crane_Down", "Arc"],
  Crane: ["Crane_Up", "Crane_Down", "Track_In", "Arc"],
  Technocrane: ["Crane_Up", "Crane_Down", "Track_In", "Track_Out", "Arc"],
  Motion_Control: ["Any"],
  Drone: ["Track_In", "Track_Out", "Crane_Up", "Crane_Down", "Arc"]
}
```

### 3.5 Movement ↔ Timing Logic (Soft Constraints)

```json
Movement_Timing_Logic: {
  Dolly_Zoom: ["Slow", "Moderate"],
  Whip_Pan: ["Fast", "Whip_Fast"],
  Handheld: ["Moderate", "Fast"],
  Crane: ["Slow", "Moderate"],
  Motion_Control: ["Any"]
}
```

---

## SECTION 4: LIGHTING SYSTEMS

### 4.1 Time of Day (Root Constraint)

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

### 4.2 Lighting Sources (Physical Origin of Light)

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

### 4.3 Lighting Styles (How Light is Shaped)

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

### 4.4 Lighting Time ↔ Source Constraints (Hard Rules)

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

### 4.5 Lighting Style ↔ Mood Relationship

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

### 4.6 Era & Lighting Technology Constraints

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

### 4.7 Color Temperature & Lighting Logic

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

### 4.8 Lighting Intensity

```json
Lighting_Intensity: [
  "Underexposed",
  "Neutral",
  "Overexposed"
]
```

### 4.9 Invalid Lighting Combinations (System Blocks)

```json
Invalid_Lighting_States: [
  "Night + Sun",
  "Cheerful + Low-Key Noir Lighting",
  "1940s Film + LED Panels",
  "Midday + Moonlight Key"
]
```

---

## SECTION 5: SHOT SIZE & COMPOSITION

### 5.1 Shot Size Taxonomy

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

### 5.2 Composition Systems

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

### 5.3 Composition ↔ Shot Size Compatibility

```json
Composition_Shot_Compatibility: {
  Extreme_Wide_Shot: ["Rule_of_Thirds", "Leading_Lines", "Negative_Space", "Symmetrical"],
  Medium_Shot: ["Rule_of_Thirds", "Centered_Composition", "Frame_Within_Frame"],
  Close_Up: ["Centered_Composition", "Asymmetrical", "Shallow_Focus"]
}
```

### 5.4 Composition ↔ Movement Logic

```json
Composition_Movement_Logic: {
  Symmetrical: ["Static", "Slow Push In"],
  Asymmetrical: ["Handheld", "Arc"],
  Leading_Lines: ["Track_In"],
  Centered_Composition: ["Dolly", "Crane_Up"]
}
```

### 5.5 Shot ↔ Emotional Intensity

```json
Shot_Emotion_Map: {
  Extreme_Wide_Shot: ["Detachment", "Awe"],
  Medium_Shot: ["Neutral", "Observation"],
  Close_Up: ["Intimacy", "Tension"],
  Extreme_Close_Up: ["Obsession", "Psychological Pressure"]
}
```

### 5.6 Aspect Ratio Logic

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

## SECTION 6: MOOD & COLOR SYSTEMS

### 6.1 Moods

```json
Moods: [
  "Gloomy",
  "Happy",
  "Colorful",
  "Cheerful",
  "Menacing",
  "Introspective",
  "Surreal",
  "Detached",
  "Obsessive",
  "Epic",
  "Stylized",
  "Hopeful",
  "Oppressive",
  "Melancholic",
  "Ambiguous",
  "Adventurous",
  "Somber",
  "Tense",
  "Whimsical",
  "Aggressive",
  "Existential",
  "Intimate",
  "Suspicious",
  "Decaying",
  "Reflective",
  "Unsettling",
  "Dreamlike",
  "Paranoid",
  "Transcendent",
  "Brutal",
  "Alienated",
  "Philosophical",
  "Traumatic",
  "Psychological",
  "Angry",
  "Anxious",
  "Hallucinatory",
  "Tender",
  "Provocative",
  "Absurd",
  "Controlled",
  "Contemplative",
  "Gritty",
  "Meditative",
  "Rebellious",
  "Romantic",
  "Kinetic",
  "Oppressive",
  "Unhinged",
  "Claustrophobic"
]
```

### 6.2 Color Tones

```json
Color_Tones: [
  "Cool",
  "Warm",
  "Saturated",
  "Bleach_Bypass",
  "Monochrome",
  "Desaturated",
  "Neutral",
  "Highly_Saturated",
  "Pastel",
  "Neon",
  "Muted",
  "Natural",
  "High_Contrast"
]
```

---

## SECTION 7: FILM STYLE PRESETS

All presets follow this enhanced structure with technical specifications:

```json
Film_Preset_Template: {
  // Visual Style
  era: "string",
  mood: ["allowed moods"],
  color_tone: ["allowed color tones"],
  lighting_style: ["recommended lighting styles"],
  lighting_sources: ["allowed lighting sources"],
  composition: ["recommended compositions"],
  shot_sizes: ["recommended shot sizes"],
  movement: ["recommended movement types"],
  
  // NEW: Technical Specifications
  camera_type: "Digital | Film_35mm | Film_65mm | IMAX",
  camera_body: ["specific camera models used"],
  film_stock: "film stock used (if applicable)",
  aspect_ratio: "aspect ratio",
  lens_manufacturer: ["lens manufacturers used"],
  lens_family: ["specific lens families"],
  primary_focal_lengths: ["primary focal lengths used"],
  
  // Constraints
  disallowed_moods: ["moods that violate this style"],
  disallowed_sources: ["lighting sources that violate this style"],
  required_camera_type: "Film | Digital | Any"
}
```

### 7.1 Classic & Film Noir Presets

```json
Film_Preset_The_Godfather: {
  era: "1970s",
  mood: "Menacing",
  color_tone: ["Warm", "Desaturated"],
  lighting_style: ["Low_Key", "Soft_Lighting"],
  lighting_sources: ["Tungsten", "Practical_Lights"],
  composition: ["Centered_Composition", "Negative_Space"],
  shot_sizes: ["Medium_Shot", "Close_Up"],
  movement: ["Static", "Slow_Dolly"],
  
  // Technical Specifications
  camera_type: "Film_35mm",
  camera_body: ["Mitchell_BNCR"],
  film_stock: "Eastman_5247_100T",
  aspect_ratio: "1.85:1",
  lens_manufacturer: ["Bausch_Lomb"],
  lens_family: ["Super_Baltar"],
  primary_focal_lengths: [40, 75],
  notes: "90% shot on 40mm. Gordon Willis 'Prince of Darkness' style."
}

Film_Preset_Citizen_Kane: {
  era: "Pre_1950",
  mood: "Introspective",
  color_tone: ["Monochrome"],
  lighting_style: ["Low_Key", "Hard_Lighting"],
  lighting_sources: ["Tungsten"],
  composition: ["Deep_Focus", "Low_Angle"],
  shot_sizes: ["Wide_Shot", "Medium_Shot"],
  movement: ["Static"],
  
  // Technical Specifications
  camera_type: "Film_35mm",
  camera_body: ["Mitchell_BNC"],
  film_stock: "Kodak_Plus_X_5231",
  aspect_ratio: "1.37:1",
  lens_manufacturer: ["Cooke"],
  lens_family: ["Speed_Panchro"],
  primary_focal_lengths: [24, 35],
  notes: "Deep focus cinematography by Gregg Toland."
}

Film_Preset_Double_Indemnity: {
  era: "1944",
  mood: "Menacing",
  color_tone: ["Monochrome"],
  lighting_style: ["Low_Key", "Hard_Lighting"],
  composition: ["High_Contrast", "Venetian_Blinds"],
  movement: ["Static"]
}

Film_Preset_The_Maltese_Falcon: {
  era: "1941",
  mood: "Suspicious",
  color_tone: ["Monochrome"],
  lighting_style: ["Low_Key"],
  composition: ["Centered_Composition"],
  movement: ["Minimal"]
}

Film_Preset_Sunset_Boulevard: {
  era: "1950",
  mood: "Decaying",
  color_tone: ["Monochrome"],
  lighting_style: ["Expressionistic"],
  composition: ["Asymmetrical"],
  movement: ["Slow_Dolly"]
}

Film_Preset_Casablanca: {
  era: "Pre_1950",
  mood: "Melancholic",
  color_tone: ["Monochrome"],
  lighting_style: ["Low_Key", "Soft_Lighting"],
  lighting_sources: ["Tungsten", "Practical_Lights"],
  composition: ["Rule_of_Thirds", "Frame_Within_Frame"],
  shot_sizes: ["Medium_Shot", "Close_Up"],
  movement: ["Static", "Minimal_Dolly"],
  disallowed_sources: ["LED", "Neon"]
}
```

### 7.2 European Cinema Presets

```json
Film_Preset_Bicycle_Thieves: {
  era: "1948",
  mood: "Melancholic",
  color_tone: ["Monochrome"],
  lighting_style: ["Naturalistic"],
  composition: ["Street_Level"],
  movement: ["Handheld"]
}

Film_Preset_La_Dolce_Vita: {
  era: "1960",
  mood: "Existential",
  color_tone: ["Monochrome"],
  lighting_style: ["Naturalistic"],
  composition: ["Wide_Frames"],
  movement: ["Slow_Tracking"]
}

Film_Preset_Breathless: {
  era: "1960",
  mood: "Rebellious",
  color_tone: ["Monochrome"],
  lighting_style: ["Available_Light"],
  composition: ["Improvised"],
  movement: ["Handheld"]
}

Film_Preset_Tokyo_Story: {
  era: "1953",
  mood: "Reflective",
  color_tone: ["Monochrome"],
  lighting_style: ["Naturalistic"],
  composition: ["Low_Angle_Static"],
  movement: ["None"]
}

Film_Preset_Harakiri: {
  era: "1962",
  mood: "Oppressive",
  color_tone: ["Monochrome"],
  lighting_style: ["Hard_Lighting"],
  composition: ["Geometric"],
  movement: ["Controlled"]
}

Film_Preset_Stalker: {
  era: "1979",
  mood: "Meditative",
  color_tone: ["Desaturated"],
  lighting_style: ["Naturalistic"],
  composition: ["Negative_Space"],
  movement: ["Slow_Tracking"]
}

Film_Preset_The_Mirror: {
  era: "1975",
  mood: "Introspective",
  color_tone: ["Muted"],
  lighting_style: ["Soft_Natural"],
  composition: ["Poetic"],
  movement: ["Floating"]
}
```

### 7.3 Modern Cinema Presets

```json
Film_Preset_Blade_Runner: {
  era: "1980s",
  mood: "Gloomy",
  color_tone: ["Cool", "Desaturated"],
  lighting_style: ["Low_Key", "Hard_Lighting", "Practical_Motivated"],
  lighting_sources: ["Neon", "Tungsten", "Practical_Lights"],
  composition: ["Centered_Composition", "Symmetrical"],
  shot_sizes: ["Wide_Shot", "Medium_Shot"],
  movement: ["Slow_Dolly", "Static"],
  disallowed_moods: ["Cheerful", "Hopeful"],
  
  // Technical Specifications
  camera_type: "Film_35mm",
  camera_body: ["Panavision_Panaflex_Gold"],
  film_stock: "Eastman_5247_100T",
  film_stock_night: "Eastman_5294_400T",
  aspect_ratio: "2.39:1",
  lens_manufacturer: ["Panavision"],
  lens_family: ["C_Series_Anamorphic", "Super_Speed"],
  primary_focal_lengths: [35, 50, 75],
  notes: "Jordan Cronenweth ASC. Anamorphic for signature oval bokeh and horizontal flares."
}

Film_Preset_Mulholland_Drive: {
  era: "2001",
  mood: "Surreal",
  color_tone: ["Neutral", "Cool"],
  lighting_style: ["Expressionistic", "Low_Key"],
  lighting_sources: ["Practical_Lights", "Tungsten"],
  composition: ["Asymmetrical", "Negative_Space"],
  shot_sizes: ["Medium_Close_Up", "Close_Up"],
  movement: ["Slow_Push_In", "Unsettling_Static"],
  disallowed_moods: ["Cheerful"],
  
  // Technical Specifications
  camera_type: "Film_35mm",
  camera_body: ["Panavision_Panaflex_Millennium"],
  film_stock: "Kodak_Vision_500T_5279",
  aspect_ratio: "1.85:1",
  lens_manufacturer: ["Panavision"],
  lens_family: ["Primo"],
  primary_focal_lengths: [27, 40, 75],
  notes: "Peter Deming cinematography. Lynch's signature surreal atmosphere."
}

Film_Preset_Mad_Max_Fury_Road: {
  era: "2015",
  mood: "Aggressive",
  color_tone: ["Warm", "Highly_Saturated"],
  lighting_style: ["Hard_Lighting"],
  lighting_sources: ["Sun"],
  composition: ["Centered_Action"],
  shot_sizes: ["Wide_Shot"],
  movement: ["Fast_Tracking"],
  
  // Technical Specifications
  camera_type: "Digital",
  camera_body: ["ARRI_Alexa_XT", "ARRI_Alexa_M"],
  aspect_ratio: "2.39:1",
  lens_manufacturer: ["Zeiss"],
  lens_family: ["Master_Prime"],
  primary_focal_lengths: [21, 27, 35],
  notes: "John Seale ACS ASC. Digital with anamorphic framing. Hyper-saturated orange/teal grade."
}

Film_Preset_Moonlight: {
  era: "2016",
  mood: "Tender",
  color_tone: ["Cool", "Saturated"],
  lighting_style: ["Soft_Lighting"],
  lighting_sources: ["Moon", "Practical_Lights"],
  composition: ["Intimate_Framing"],
  shot_sizes: ["Close_Up"],
  movement: ["Slow_Tracking"],
  
  // Technical Specifications
  camera_type: "Digital",
  camera_body: ["ARRI_Alexa_Mini"],
  aspect_ratio: "2.39:1",
  lens_manufacturer: ["Hawk"],
  lens_family: ["V_Lite_Anamorphic"],
  primary_focal_lengths: [35, 50, 75],
  notes: "James Laxton cinematography. Anamorphic for intimate character isolation."
}

Film_Preset_Grand_Budapest: {
  era: "2014",
  mood: "Whimsical",
  color_tone: ["Highly_Saturated", "Pastel"],
  lighting_style: ["High_Key"],
  lighting_sources: ["Artificial"],
  composition: ["Symmetrical", "Centered_Composition"],
  shot_sizes: ["Wide_Shot"],
  movement: ["Mechanical_Dolly"],
  
  // Technical Specifications
  camera_type: "Film_35mm",
  camera_body: ["ARRIFLEX_535B"],
  film_stock: "Kodak_Vision3_500T_5219",
  aspect_ratio: "1.37:1",
  aspect_ratio_period: {
    "1930s_sequences": "1.37:1",
    "1960s_sequences": "2.39:1",
    "Modern_sequences": "1.85:1"
  },
  lens_manufacturer: ["Cooke"],
  lens_family: ["S4_i"],
  primary_focal_lengths: [25, 40, 75],
  notes: "Robert Yeoman ASC. Multiple aspect ratios for different time periods. Shot on film."
}

Film_Preset_Drive: {
  era: "2011",
  mood: "Detached",
  color_tone: ["Neon", "Cool"],
  lighting_style: ["Practical_Motivated"],
  composition: ["Centered"],
  movement: ["Slow_Dolly"],
  
  // Technical Specifications
  camera_type: "Digital",
  camera_body: ["ARRI_Alexa"],
  aspect_ratio: "2.39:1",
  lens_manufacturer: ["Panavision"],
  lens_family: ["C_Series_Anamorphic"],
  primary_focal_lengths: [40, 50, 75],
  notes: "Newton Thomas Sigel ASC. Digital anamorphic. 80s neon aesthetic."
}

Film_Preset_Oldboy: {
  era: "2003",
  mood: "Brutal",
  color_tone: ["Desaturated"],
  lighting_style: ["Hard_Lighting"],
  lighting_sources: ["Fluorescent", "Practical_Lights"],
  composition: ["Constrained_Framing"],
  shot_sizes: ["Medium_Shot"],
  movement: ["Extended_Tracking"],
  
  // Technical Specifications
  camera_type: "Film_35mm",
  camera_body: ["ARRIFLEX_535B"],
  film_stock: "Kodak_Vision_500T_5279",
  aspect_ratio: "2.39:1",
  lens_manufacturer: ["Zeiss"],
  lens_family: ["Ultra_Prime"],
  primary_focal_lengths: [24, 32, 50],
  notes: "Chung Chung-hoon cinematography. Famous single-take corridor fight."
}

Film_Preset_Parasite: {
  era: "2019",
  mood: "Tense",
  color_tone: ["Neutral"],
  lighting_style: ["Naturalistic"],
  lighting_sources: ["Practical_Lights"],
  composition: ["Architectural_Symmetry"],
  shot_sizes: ["Medium_Shot"],
  movement: ["Slow_Tracking"],
  
  // Technical Specifications  
  camera_type: "Digital",
  camera_body: ["ARRI_Alexa_65"],
  aspect_ratio: "2.39:1",
  lens_manufacturer: ["ARRI"],
  lens_family: ["DNA_LF"],
  primary_focal_lengths: [35, 50, 80],
  notes: "Hong Kyung-pyo cinematography. Large format for architectural precision."
}
```

### 7.4 Additional Film Presets

```json
Film_Preset_Apocalypse_Now: {
  era: "1970s",
  mood: "Surreal",
  color_tone: ["Warm", "Saturated"],
  lighting_style: ["Expressionistic", "Naturalistic"],
  lighting_sources: ["Sun", "Practical_Lights"],
  composition: ["Asymmetrical"],
  shot_sizes: ["Wide_Shot", "Close_Up"],
  movement: ["Slow_Dolly", "Handheld"],
  
  // Technical Specifications
  camera_type: "Film_35mm",
  camera_body: ["ARRIFLEX_35BL", "Panavision_Panaflex"],
  film_stock: "Eastman_5247_100T",
  aspect_ratio: "2.39:1",
  lens_manufacturer: ["Panavision", "Zeiss"],
  lens_family: ["Primo", "Super_Speed"],
  primary_focal_lengths: [24, 35, 85],
  notes: "Vittorio Storaro ASC AIC. Technicolor process. Hallucinatory Vietnam aesthetic."
}

Film_Preset_2001_A_Space_Odyssey: {
  era: "1960s",
  mood: "Detached",
  color_tone: ["Neutral", "Cool"],
  lighting_style: ["High_Key", "Controlled"],
  lighting_sources: ["Artificial"],
  composition: ["Symmetrical", "Centered_Composition"],
  shot_sizes: ["Wide_Shot"],
  movement: ["Static", "Slow_Tracking"],
  
  // Technical Specifications
  camera_type: "Film_65mm",
  camera_body: ["Mitchell_BFC_65", "Super_Panavision_70"],
  film_stock: "Eastman_5250_50T",
  aspect_ratio: "2.20:1",
  lens_manufacturer: ["Panavision"],
  lens_family: ["Super_Panavision_70_Lenses"],
  primary_focal_lengths: [35, 50, 100],
  notes: "Geoffrey Unsworth BSC. Super Panavision 70mm spherical. Kubrick's precision framing."
}

Film_Preset_Taxi_Driver: {
  era: "1970s",
  mood: "Menacing",
  color_tone: ["Warm", "Saturated"],
  lighting_style: ["Low_Key", "Practical_Motivated"],
  lighting_sources: ["Neon", "Tungsten"],
  composition: ["Centered_Composition"],
  shot_sizes: ["Medium_Close_Up", "Close_Up"],
  movement: ["Slow_Dolly"],
  
  // Technical Specifications
  camera_type: "Film_35mm",
  camera_body: ["ARRIFLEX_35BL"],
  film_stock: "Eastman_5247_100T",
  aspect_ratio: "1.85:1",
  lens_manufacturer: ["Zeiss"],
  lens_family: ["Super_Speed"],
  primary_focal_lengths: [25, 35, 85],
  notes: "Michael Chapman ASC. Gritty NYC night photography. Heavy Neon influence."
}

Film_Preset_Seven_Samurai: {
  era: "1954",
  mood: "Epic",
  color_tone: ["Monochrome"],
  lighting_style: ["Naturalistic"],
  lighting_sources: ["Sun"],
  composition: ["Dynamic_Blocking"],
  shot_sizes: ["Wide_Shot"],
  movement: ["Tracking"],
  
  // Technical Specifications
  camera_type: "Film_35mm",
  camera_body: ["Mitchell_BNC"],
  film_stock: "Kodak_Plus_X_5231",
  aspect_ratio: "1.37:1",
  lens_manufacturer: ["Cooke"],
  lens_family: ["Speed_Panchro"],
  primary_focal_lengths: [25, 40, 75],
  notes: "Asakazu Nakai cinematography. Kurosawa's dynamic multi-camera action sequences."
}

Film_Preset_Vertigo: {
  era: "1958",
  mood: "Obsessive",
  color_tone: ["Stylized", "Saturated"],
  lighting_style: ["Expressionistic"],
  lighting_sources: ["Tungsten"],
  composition: ["Centered_Composition"],
  shot_sizes: ["Close_Up"],
  movement: ["Dolly_Zoom"],
  
  // Technical Specifications
  camera_type: "Film_35mm",
  camera_body: ["Mitchell_BNC"],
  film_stock: "Eastman_Color_Negative",
  aspect_ratio: "1.85:1",
  lens_manufacturer: ["Bausch_Lomb"],
  lens_family: ["Super_Baltar"],
  primary_focal_lengths: [35, 50, 75],
  notes: "Robert Burks ASC. Invented the dolly zoom (Vertigo effect)."
}

Film_Preset_Lawrence_of_Arabia: {
  era: "1962",
  mood: "Epic",
  color_tone: ["Warm"],
  lighting_style: ["Naturalistic"],
  lighting_sources: ["Sun"],
  composition: ["Wide_Symmetrical"],
  shot_sizes: ["Extreme_Wide_Shot"],
  movement: ["Static", "Slow_Crane"],
  
  // Technical Specifications
  camera_type: "Film_65mm",
  camera_body: ["Super_Panavision_70"],
  film_stock: "Eastman_5250_50T",
  aspect_ratio: "2.20:1",
  lens_manufacturer: ["Panavision"],
  lens_family: ["Super_Panavision_70_Lenses"],
  primary_focal_lengths: [28, 50, 100, 150],
  notes: "Freddie Young BSC. Super Panavision 70mm. Epic desert photography."
}

Film_Preset_Pulp_Fiction: {
  era: "1994",
  mood: "Stylized",
  color_tone: ["Warm", "Saturated"],
  lighting_style: ["High_Key", "Practical_Motivated"],
  lighting_sources: ["Tungsten"],
  composition: ["Centered_Composition"],
  shot_sizes: ["Medium_Shot"],
  movement: ["Static"],
  
  // Technical Specifications
  camera_type: "Film_35mm",
  camera_body: ["ARRIFLEX_535B"],
  film_stock: "Kodak_Vision_500T_5279",
  aspect_ratio: "2.39:1",
  lens_manufacturer: ["Panavision"],
  lens_family: ["Primo"],
  primary_focal_lengths: [27, 40, 75],
  notes: "Andrzej Sekula cinematography. Tarantino's signature dialogue framing."
}

Film_Preset_Shawshank: {
  era: "1994",
  mood: "Hopeful",
  color_tone: ["Warm"],
  lighting_style: ["Soft_Lighting"],
  lighting_sources: ["Sun", "Practical_Lights"],
  composition: ["Rule_of_Thirds"],
  shot_sizes: ["Wide_Shot", "Medium_Shot"],
  movement: ["Slow_Dolly"],
  
  // Technical Specifications
  camera_type: "Film_35mm",
  camera_body: ["Panavision_Panaflex_Platinum"],
  film_stock: "Kodak_Vision_500T_5279",
  aspect_ratio: "1.85:1",
  lens_manufacturer: ["Panavision"],
  lens_family: ["Primo"],
  primary_focal_lengths: [27, 40, 75, 100],
  notes: "Roger Deakins CBE BSC ASC. Hopeful lighting even in prison setting."
}

Film_Preset_No_Country_for_Old_Men: {
  era: "2007",
  mood: "Menacing",
  color_tone: ["Desaturated"],
  lighting_style: ["Naturalistic", "Low_Key"],
  lighting_sources: ["Sun", "Practical_Lights"],
  composition: ["Negative_Space"],
  shot_sizes: ["Wide_Shot"],
  movement: ["Static"],
  
  // Technical Specifications
  camera_type: "Film_35mm",
  camera_body: ["ARRIFLEX_535B"],
  film_stock: "Kodak_Vision3_500T_5219",
  aspect_ratio: "1.85:1",
  lens_manufacturer: ["Zeiss"],
  lens_family: ["Master_Prime"],
  primary_focal_lengths: [21, 27, 50],
  notes: "Roger Deakins CBE BSC ASC. Minimalist Texas landscape cinematography."
}

Film_Preset_Children_of_Men: {
  era: "2006",
  mood: "Oppressive",
  color_tone: ["Cool", "Desaturated"],
  lighting_style: ["Naturalistic"],
  lighting_sources: ["Overcast_Sky"],
  composition: ["Handheld_Frames"],
  shot_sizes: ["Wide_Shot"],
  movement: ["Extended_Handheld"],
  
  // Technical Specifications
  camera_type: "Film_35mm",
  camera_body: ["ARRIFLEX_435"],
  film_stock: "Kodak_Vision2_500T_5218",
  aspect_ratio: "1.85:1",
  lens_manufacturer: ["Zeiss"],
  lens_family: ["Ultra_Prime"],
  primary_focal_lengths: [18, 21, 27],
  notes: "Emmanuel Lubezki AMC ASC. Famous long takes. Handheld chaos."
}

Film_Preset_The_Matrix: {
  era: "1999",
  mood: "Stylized",
  color_tone: ["Green_Tint", "Cool"],
  lighting_style: ["Hard_Lighting"],
  lighting_sources: ["Artificial"],
  composition: ["Centered_Composition"],
  shot_sizes: ["Medium_Shot"],
  movement: ["Controlled_Dolly"],
  
  // Technical Specifications
  camera_type: "Film_35mm",
  camera_body: ["Panavision_Panaflex_Millennium"],
  film_stock: "Kodak_Vision_500T_5279",
  aspect_ratio: "2.39:1",
  lens_manufacturer: ["Panavision"],
  lens_family: ["Primo"],
  primary_focal_lengths: [27, 40, 75],
  notes: "Bill Pope ASC. Green color grade in Matrix world. Bullet time sequences."
}

Film_Preset_In_the_Mood_for_Love: {
  era: "2000",
  mood: "Melancholic",
  color_tone: ["Warm", "Saturated"],
  lighting_style: ["Soft_Lighting"],
  lighting_sources: ["Practical_Lights"],
  composition: ["Frame_Within_Frame"],
  shot_sizes: ["Medium_Close_Up"],
  movement: ["Slow_Tracking"],
  
  // Technical Specifications
  camera_type: "Film_35mm",
  camera_body: ["ARRIFLEX_535B"],
  film_stock: "Kodak_Vision_500T_5279",
  aspect_ratio: "1.66:1",
  lens_manufacturer: ["Cooke"],
  lens_family: ["S4_i"],
  primary_focal_lengths: [32, 50, 75],
  notes: "Christopher Doyle HKSC. European aspect ratio. Slow motion. Frame within frame."
}

Film_Preset_Rashomon: {
  era: "1950",
  mood: "Ambiguous",
  color_tone: ["Monochrome"],
  lighting_style: ["Naturalistic", "Hard_Lighting"],
  lighting_sources: ["Sun"],
  composition: ["Dynamic_Framing"],
  shot_sizes: ["Medium_Shot"],
  movement: ["Tracking"],
  
  // Technical Specifications
  camera_type: "Film_35mm",
  camera_body: ["Mitchell_BNC"],
  film_stock: "Kodak_Plus_X_5231",
  aspect_ratio: "1.37:1",
  lens_manufacturer: ["Cooke"],
  lens_family: ["Speed_Panchro"],
  primary_focal_lengths: [25, 40, 75],
  notes: "Kazuo Miyagawa cinematography. Revolutionary use of sunlight and mirrors."
}

Film_Preset_Star_Wars_ANH: {
  era: "1977",
  mood: "Adventurous",
  color_tone: ["Warm"],
  lighting_style: ["High_Key"],
  lighting_sources: ["Artificial"],
  composition: ["Classic_Composition"],
  shot_sizes: ["Wide_Shot"],
  movement: ["Crane", "Dolly"],
  
  // Technical Specifications
  camera_type: "Film_35mm",
  camera_body: ["Panavision_Panaflex"],
  film_stock: "Eastman_5247_100T",
  aspect_ratio: "2.39:1",
  lens_manufacturer: ["Panavision"],
  lens_family: ["C_Series_Anamorphic"],
  primary_focal_lengths: [35, 50, 75],
  notes: "Gilbert Taylor BSC. Anamorphic. Classic Hollywood space opera aesthetic."
}

Film_Preset_Schindlers_List: {
  era: "1993",
  mood: "Somber",
  color_tone: ["Monochrome"],
  lighting_style: ["Naturalistic", "Low_Key"],
  lighting_sources: ["Practical_Lights"],
  composition: ["Rule_of_Thirds"],
  shot_sizes: ["Medium_Shot"],
  movement: ["Handheld"],
  
  // Technical Specifications
  camera_type: "Film_35mm",
  camera_body: ["ARRIFLEX_535B", "ARRIFLEX_35_III"],
  film_stock: "Kodak_Double_X_5222",
  aspect_ratio: "1.85:1",
  lens_manufacturer: ["Zeiss"],
  lens_family: ["Super_Speed", "Standard_Speed"],
  primary_focal_lengths: [25, 35, 50],
  notes: "Janusz Kamiński. Black & white documentary style. Handheld immediacy."
}

Film_Preset_The_Dark_Knight: {
  era: "2008",
  mood: "Menacing",
  color_tone: ["Cool", "Desaturated"],
  lighting_style: ["Low_Key"],
  lighting_sources: ["Artificial", "Practical_Lights"],
  composition: ["Centered_Composition"],
  shot_sizes: ["Wide_Shot"],
  movement: ["IMAX_Crane"],
  
  // Technical Specifications
  camera_type: "Film_35mm_IMAX",
  camera_body: ["Panavision_Panaflex_Millennium_XL2", "IMAX_MSM_9802"],
  film_stock: "Kodak_Vision3_500T_5219",
  film_stock_imax: "Kodak_Vision3_500T_5219_65mm",
  aspect_ratio: "2.39:1",
  aspect_ratio_imax: "1.43:1",
  lens_manufacturer: ["Panavision", "Hasselblad"],
  lens_family: ["Primo", "IMAX_Optics"],
  primary_focal_lengths: [35, 50, 75],
  notes: "Wally Pfister ASC. First major feature with IMAX sequences."
}

Film_Preset_Barry_Lyndon: {
  era: "1975",
  mood: "Detached",
  color_tone: ["Natural", "Warm"],
  lighting_style: ["Naturalistic"],
  lighting_sources: ["Candlelight", "Sun"],
  composition: ["Painterly", "Symmetrical"],
  shot_sizes: ["Wide_Shot"],
  movement: ["Minimal", "Slow_Zoom"],
  
  // Technical Specifications
  camera_type: "Film_35mm",
  camera_body: ["Mitchell_BNC"],
  film_stock: "Eastman_5247_100T",
  aspect_ratio: "1.66:1",
  lens_manufacturer: ["Zeiss"],
  lens_family: ["Zeiss_Planar_f07"],
  lens_specialty: "Carl Zeiss Planar 50mm f/0.7 (NASA lens)",
  primary_focal_lengths: [50],
  notes: "John Alcott BSC. Candlelight scenes with f/0.7 NASA lens. No artificial lighting."
}

Film_Preset_Metropolis: {
  era: "1927",
  mood: "Oppressive",
  color_tone: ["Monochrome"],
  lighting_style: ["Expressionistic"],
  lighting_sources: ["Artificial"],
  composition: ["Symmetrical"],
  shot_sizes: ["Wide_Shot"],
  movement: ["Static"]
}

Film_Preset_Seventh_Seal: {
  era: "1957",
  mood: "Existential",
  color_tone: ["Monochrome"],
  lighting_style: ["High_Contrast"],
  lighting_sources: ["Natural"],
  composition: ["Iconic_Silhouettes"],
  shot_sizes: ["Wide_Shot"],
  movement: ["Static"]
}

Film_Preset_Amelie: {
  era: "2001",
  mood: "Whimsical",
  color_tone: ["Warm", "Saturated"],
  lighting_style: ["Soft_Lighting"],
  lighting_sources: ["Practical_Lights"],
  composition: ["Centered_Composition"],
  shot_sizes: ["Medium_Shot"],
  movement: ["Gentle_Dolly"]
}

Film_Preset_There_Will_Be_Blood: {
  era: "2007",
  mood: "Oppressive",
  color_tone: ["Warm", "Desaturated"],
  lighting_style: ["Naturalistic", "Low_Key"],
  lighting_sources: ["Sun", "Practical_Lights"],
  composition: ["Negative_Space"],
  shot_sizes: ["Wide_Shot"],
  movement: ["Slow_Crane"]
}

Film_Preset_Her: {
  era: "2013",
  mood: "Intimate",
  color_tone: ["Warm", "Pastel"],
  lighting_style: ["Soft_Lighting"],
  lighting_sources: ["Practical_Lights"],
  composition: ["Centered_Composition"],
  shot_sizes: ["Medium_Close_Up"],
  movement: ["Slow_Tracking"]
}

Film_Preset_Chinatown: {
  era: "1974",
  mood: "Paranoid",
  color_tone: ["Warm", "Desaturated"],
  lighting_style: ["Naturalistic", "Low_Key"],
  lighting_sources: ["Sun", "Practical_Lights"],
  composition: ["Rule_of_Thirds", "Negative_Space"],
  shot_sizes: ["Medium_Shot", "Wide_Shot"],
  movement: ["Static", "Slow_Dolly"]
}

Film_Preset_Blue_Velvet: {
  era: "1986",
  mood: "Unsettling",
  color_tone: ["Highly_Saturated"],
  lighting_style: ["Expressionistic", "Hard_Lighting"],
  lighting_sources: ["Tungsten", "Practical_Lights"],
  composition: ["Centered_Composition", "Asymmetrical"],
  shot_sizes: ["Close_Up"],
  movement: ["Slow_Push_In"]
}

Film_Preset_Eyes_Wide_Shut: {
  era: "1999",
  mood: "Dreamlike",
  color_tone: ["Warm", "Saturated"],
  lighting_style: ["Soft_Lighting", "Practical_Motivated"],
  lighting_sources: ["Tungsten", "Christmas_Lights"],
  composition: ["Centered_Composition"],
  shot_sizes: ["Medium_Close_Up"],
  movement: ["Slow_Tracking"]
}

Film_Preset_Barry_Lyndon: {
  era: "1975",
  mood: "Detached",
  color_tone: ["Natural", "Warm"],
  lighting_style: ["Naturalistic"],
  lighting_sources: ["Candlelight", "Sun"],
  composition: ["Painterly", "Symmetrical"],
  shot_sizes: ["Wide_Shot"],
  movement: ["Minimal", "Slow_Zoom"]
}

Film_Preset_The_Tree_of_Life: {
  era: "2011",
  mood: "Transcendent",
  color_tone: ["Warm", "Natural"],
  lighting_style: ["Naturalistic"],
  lighting_sources: ["Sun"],
  composition: ["Organic_Framing"],
  shot_sizes: ["Wide_Shot", "Close_Up"],
  movement: ["Floating_Handheld"]
}

Film_Preset_Roma: {
  era: "2018",
  mood: "Reflective",
  color_tone: ["Monochrome"],
  lighting_style: ["Naturalistic"],
  lighting_sources: ["Sun", "Practical_Lights"],
  composition: ["Wide_Static_Frames"],
  shot_sizes: ["Wide_Shot"],
  movement: ["Slow_Pan"]
}

Film_Preset_Memories_of_Murder: {
  era: "2003",
  mood: "Oppressive",
  color_tone: ["Muted"],
  lighting_style: ["Naturalistic"],
  lighting_sources: ["Overcast_Sky", "Practical_Lights"],
  composition: ["Observational"],
  shot_sizes: ["Medium_Shot"],
  movement: ["Slow_Tracking"]
}

Film_Preset_Battle_of_Algiers: {
  era: "1966",
  mood: "Urgent",
  color_tone: ["Monochrome"],
  lighting_style: ["Available_Light"],
  lighting_sources: ["Sun"],
  composition: ["Documentary_Style"],
  shot_sizes: ["Wide_Shot"],
  movement: ["Handheld"]
}

Film_Preset_Come_and_See: {
  era: "1985",
  mood: "Traumatic",
  color_tone: ["Desaturated"],
  lighting_style: ["Naturalistic"],
  lighting_sources: ["Overcast_Sky"],
  composition: ["Disorienting_Framing"],
  shot_sizes: ["Close_Up"],
  movement: ["Slow_Handheld"]
}

Film_Preset_Persona: {
  era: "1966",
  mood: "Psychological",
  color_tone: ["Monochrome"],
  lighting_style: ["High_Contrast"],
  lighting_sources: ["Natural"],
  composition: ["Extreme_Close_Up"],
  shot_sizes: ["Close_Up", "Extreme_Close_Up"],
  movement: ["Static"]
}

Film_Preset_La_Haine: {
  era: "1995",
  mood: "Angry",
  color_tone: ["Monochrome"],
  lighting_style: ["Naturalistic"],
  lighting_sources: ["Available_Light"],
  composition: ["Street_Level"],
  shot_sizes: ["Medium_Shot"],
  movement: ["Handheld"]
}

Film_Preset_Requiem_for_a_Dream: {
  era: "2000",
  mood: "Anxious",
  color_tone: ["Highly_Saturated"],
  lighting_style: ["Hard_Lighting"],
  lighting_sources: ["Artificial"],
  composition: ["Aggressive_Closeups"],
  shot_sizes: ["Extreme_Close_Up"],
  movement: ["Fast_Montage"]
}

Film_Preset_Enter_the_Void: {
  era: "2009",
  mood: "Hallucinatory",
  color_tone: ["Neon", "Saturated"],
  lighting_style: ["Expressionistic"],
  lighting_sources: ["Neon", "Artificial"],
  composition: ["POV_Framing"],
  shot_sizes: ["Wide_Shot"],
  movement: ["Floating"]
}

Film_Preset_A_Clockwork_Orange: {
  era: "1971",
  mood: "Provocative",
  color_tone: ["High_Contrast"],
  lighting_style: ["Hard_Lighting"],
  lighting_sources: ["Artificial"],
  composition: ["Wide_Angle_Centered"],
  shot_sizes: ["Wide_Shot"],
  movement: ["Static"]
}

Film_Preset_Brazil: {
  era: "1985",
  mood: "Absurd",
  color_tone: ["Muted"],
  lighting_style: ["Expressionistic"],
  lighting_sources: ["Artificial"],
  composition: ["Overdesigned_Frames"],
  shot_sizes: ["Wide_Shot"],
  movement: ["Mechanical"]
}

Film_Preset_Heat: {
  era: "1995",
  mood: "Controlled",
  color_tone: ["Cool"],
  lighting_style: ["Naturalistic"],
  lighting_sources: ["Practical_Lights"],
  composition: ["Architectural"],
  shot_sizes: ["Wide_Shot"],
  movement: ["Locked_Off"]
}

Film_Preset_The_Thin_Red_Line: {
  era: "1998",
  mood: "Contemplative",
  color_tone: ["Warm", "Natural"],
  lighting_style: ["Naturalistic"],
  lighting_sources: ["Sun"],
  composition: ["Organic_Wide_Frames"],
  shot_sizes: ["Wide_Shot"],
  movement: ["Floating"]
}

Film_Preset_The_Lighthouse: {
  era: "2019",
  mood: "Unhinged",
  color_tone: ["Monochrome"],
  lighting_style: ["Hard_Lighting"],
  composition: ["Claustrophobic"],
  movement: ["Rigid"]
}

Film_Preset_Under_the_Skin: {
  era: "2013",
  mood: "Alienated",
  color_tone: ["Cold"],
  lighting_style: ["Minimal"],
  composition: ["Abstract"],
  movement: ["Observational"]
}

Film_Preset_Alien: {
  era: "1979",
  mood: "Claustrophobic",
  color_tone: ["Cool", "Desaturated"],
  lighting_style: ["Low_Key"],
  composition: ["Industrial_Frames"],
  movement: ["Slow_Creep"]
}

Film_Preset_Solaris: {
  era: "1972",
  mood: "Existential",
  color_tone: ["Muted"],
  lighting_style: ["Naturalistic"],
  composition: ["Minimalist"],
  movement: ["Slow"]
}

Film_Preset_The_French_Connection: {
  era: "1971",
  mood: "Gritty",
  color_tone: ["Desaturated"],
  lighting_style: ["Available_Light"],
  composition: ["Rough_Framing"],
  movement: ["Handheld"]
}

Film_Preset_One_Flew_Over_Cuckoos_Nest: {
  era: "1975",
  mood: "Oppressive",
  color_tone: ["Natural"],
  lighting_style: ["Soft_Natural"],
  composition: ["Observational"],
  movement: ["Minimal"]
}
```

---

## SECTION 8: VALIDATION RULES (HARD CONSTRAINTS)

### 8.1 Camera ↔ Lens Mount Validation

```json
Mount_Compatibility_Rules: {
  LPL_Mount: ["ARRI Alexa cameras"],
  PL_Mount: ["RED", "Sony Venice", "Canon C700", "Blackmagic", "Panavision"],
  RF_Mount: ["RED cameras"],
  E_Mount: ["Sony FX series"],
  EF_Mount: ["Canon EOS series"],
  Panavision_Mount: ["Panavision bodies only"]
}
```

### 8.2 Sensor ↔ Lens Coverage Validation

```json
Sensor_Lens_Coverage_Rules: {
  Super_35: "Can use S35 or Full Frame lenses",
  Full_Frame: "Requires Full Frame lenses",
  Large_Format: "Requires LF/FF+ lenses",
  65mm: "Requires 65mm optics only"
}
```

### 8.3 Time of Day ↔ Lighting Source Validation

```json
Time_Lighting_Rules: {
  Night: {
    allowed: ["Moon", "Practical_Lights", "Artificial"],
    forbidden: ["Sun"]
  },
  Dawn: {
    allowed: ["Sun", "Sky_Light"],
    forbidden: ["Moon", "Midday Light"]
  },
  Midday: {
    allowed: ["Sun", "HMI"],
    forbidden: ["Moon"]
  },
  Golden_Hour: {
    preferred: ["Sun"],
    allowed: ["Practical_Lights"]
  },
  Blue_Hour: {
    allowed: ["Sky_Light", "Artificial"],
    forbidden: ["Sun", "Midday light"]
  }
}
```

### 8.4 Mood ↔ Lighting Style Validation

```json
Mood_Lighting_Rules: {
  Cheerful: {
    required_styles: ["High_Key", "Soft_Lighting"],
    forbidden_styles: ["Low_Key"]
  },
  Gloomy: {
    preferred_styles: ["Low_Key", "Hard_Lighting"],
    forbidden_styles: ["High_Key"]
  },
  Menacing: {
    preferred_styles: ["Low_Key", "Hard_Lighting"]
  },
  Hopeful: {
    preferred_styles: ["High_Key", "Soft_Lighting"]
  }
}
```

### 8.5 Film Preset Overrides

```json
Film_Preset_Validation_Rules: {
  "When film preset is selected": {
    auto_populate: ["mood", "color_tone", "lighting_style", "lighting_sources", "composition", "camera_type", "aspect_ratio", "lens_manufacturer", "film_stock"],
    override: "All manual selections unless specifically allowed",
    lock_fields: ["era", "disallowed_moods", "disallowed_sources", "camera_type", "aspect_ratio"]
  }
}
```

### 8.6 Film Stock Validation Rules

**UI Rule:** Film Stock dropdown is only visible when a Film Camera is selected.

```json
Film_Stock_Validation_Rules: {
  // Hard Rules (Block)
  "Digital Camera selected": {
    film_stock_dropdown: "HIDDEN",
    reason: "Digital cameras do not use film stock"
  },
  "Film Camera selected": {
    film_stock_dropdown: "VISIBLE",
    default: "Auto-select based on era or preset"
  },
  
  // Format Compatibility (Hard Rules)
  "35mm Film Camera": {
    allowed_stocks: ["35mm_stocks_only"],
    forbidden_stocks: ["65mm_stocks", "IMAX_stocks"]
  },
  "65mm Film Camera": {
    allowed_stocks: ["65mm_stocks"],
    forbidden_stocks: ["35mm_only_stocks"]
  },
  "IMAX Camera": {
    allowed_stocks: ["IMAX_rated_65mm_stocks"],
    forbidden_stocks: ["35mm_stocks"]
  },
  
  // Era Compatibility (Soft Warnings)
  "Modern film stock on Pre-1970s preset": {
    action: "WARN",
    message: "Modern film stock may not match vintage aesthetic of this preset"
  },
  "Historic film stock on Modern preset": {
    action: "WARN", 
    message: "Historic film stock may introduce grain/characteristics not typical of this era"
  }
}

Film_Stock_Dropdown_Filter: {
  "When 35mm Film Camera selected": {
    show: ["Kodak_Vision3_500T_5219", "Kodak_Vision3_250D_5207", "Kodak_Vision3_200T_5213", "Kodak_Vision3_50D_5203", "Kodak_Double_X_5222", "Eastman_5247_100T", "Eastman_5294_400T"],
    hide: ["65mm_specific_stocks", "IMAX_stocks"]
  },
  "When 65mm Film Camera selected": {
    show: ["Kodak_Vision3_500T_5219_65mm", "Kodak_Vision3_200T_5213_65mm", "Eastman_5250_50T"],
    hide: ["35mm_only_stocks"]
  },
  "When Monochrome preset selected": {
    auto_select: "Kodak_Double_X_5222",
    highlight: ["Black_White_stocks"]
  }
}
```

### 8.7 Aspect Ratio Validation Rules

```json
Aspect_Ratio_Validation_Rules: {
  // Camera Format Constraints (Hard Rules)
  "35mm Spherical Camera": {
    allowed_ratios: ["1.33:1", "1.37:1", "1.66:1", "1.78:1", "1.85:1"],
    forbidden_ratios: ["2.76:1"],
    default: "1.85:1"
  },
  "35mm Anamorphic Camera/Lens": {
    allowed_ratios: ["2.35:1", "2.39:1"],
    forbidden_ratios: ["1.33:1", "1.37:1"],
    default: "2.39:1"
  },
  "65mm Spherical Camera": {
    allowed_ratios: ["2.20:1"],
    default: "2.20:1"
  },
  "65mm Anamorphic Camera": {
    allowed_ratios: ["2.76:1"],
    default: "2.76:1"
  },
  "IMAX Camera": {
    allowed_ratios: ["1.43:1", "1.90:1"],
    default: "1.43:1"
  },
  "Digital Camera": {
    allowed_ratios: ["Any via sensor crop/framing"],
    default: "Based on lens selection"
  },
  
  // Lens-Aspect Relationship (Hard Rules)
  "Anamorphic Lens selected": {
    force_ratio: ["2.35:1", "2.39:1", "2.76:1"],
    reason: "Anamorphic lenses produce widescreen via optical squeeze"
  },
  "Spherical Lens selected": {
    allowed_ratios: ["1.33:1", "1.37:1", "1.66:1", "1.78:1", "1.85:1", "2.20:1"],
    forbidden_ratios: ["2.35:1_native", "2.39:1_native", "2.76:1"],
    note: "Widescreen achieved via cropping, not optics"
  }
}

Aspect_Ratio_Preset_Override: {
  "Film Preset with defined aspect ratio": {
    action: "AUTO_SELECT",
    lock: true,
    example: "Lawrence_of_Arabia preset → 2.20:1 locked"
  },
  "Grand Budapest Hotel": {
    multiple_ratios: true,
    note: "User selects time period, aspect ratio follows"
  }
}
```

### 8.8 Lens Manufacturer Validation Rules

```json
Lens_Manufacturer_Validation_Rules: {
  // Panavision Ecosystem (Hard Rule - Closed System)
  "Panavision Camera Body selected": {
    lens_manufacturers: ["Panavision ONLY"],
    reason: "Panavision mount is proprietary",
    action: "BLOCK all non-Panavision lenses"
  },
  
  // PL Mount Cameras (Hard Rule - Open Ecosystem)
  "PL Mount Camera selected": {
    lens_manufacturers: ["Zeiss", "Cooke", "ARRI", "Angenieux", "Canon_Cinema", "Leica"],
    action: "HIDE Panavision lenses"
  },
  
  // Classic Film Cameras
  "Mitchell Camera selected": {
    lens_manufacturers: ["Bausch_Lomb", "Cooke_Vintage", "Zeiss_Classic"],
    reason: "Mitchell mount compatibility"
  },
  
  // 65mm / Large Format (Hard Rule)
  "65mm Camera selected": {
    lens_manufacturers: ["Panavision_65", "ARRI_65", "Hasselblad"],
    action: "BLOCK 35mm-only lens families"
  },
  
  // IMAX Cameras (Hard Rule)
  "IMAX Camera selected": {
    lens_manufacturers: ["IMAX_Optics", "Hasselblad"],
    reason: "IMAX requires specific large format optics"
  }
}

Lens_Family_Film_Preset_Rules: {
  // When Film Preset specifies lens family
  "Preset with lens_family defined": {
    action: "AUTO_SELECT and HIGHLIGHT",
    allow_override: true,
    warning_on_override: "This lens family differs from the original film"
  },
  
  // Example preset-specific rules
  "The_Godfather preset": {
    required_manufacturer: "Bausch_Lomb",
    required_family: "Super_Baltar",
    highlight_focal_lengths: [40, 75],
    note: "90% of film shot on 40mm"
  },
  "Blade_Runner preset": {
    required_manufacturer: "Panavision",
    required_family: ["C_Series_Anamorphic", "Super_Speed"],
    highlight_focal_lengths: [35, 50, 75],
    note: "Anamorphic for signature flares"
  },
  "Barry_Lyndon preset": {
    required_manufacturer: "Zeiss",
    required_family: "Zeiss_Planar_f07",
    highlight_focal_lengths: [50],
    note: "f/0.7 NASA lens for candlelight"
  }
}
```

---

## SECTION 9: UI STATE LOGIC

### 9.1 Layer Logic (Sequenced Dependencies)

```json
UI_Layer_Sequence: {
  LAYER_0: "Project Type (Live-Action or Animation)",
  LAYER_1: "Camera Type (Digital or Film)",
  LAYER_2: "Camera Manufacturer",
  LAYER_3: "Camera Body",
  LAYER_4: "Sensor / Film Format (Auto-set, locked)",
  LAYER_5: "Film Stock (ONLY IF Film Camera selected)",
  LAYER_6: "Aspect Ratio",
  LAYER_7: "Lens Manufacturer (Filtered by camera mount)",
  LAYER_8: "Lens Family",
  LAYER_9: "Focal Length",
  LAYER_10: "Movement Equipment",
  LAYER_11: "Movement Type",
  LAYER_12: "Movement Timing",
  LAYER_13: "Time of Day",
  LAYER_14: "Lighting Source",
  LAYER_15: "Lighting Style",
  LAYER_16: "Shot Size",
  LAYER_17: "Composition",
  LAYER_18: "Mood",
  LAYER_19: "Color Tone",
  LAYER_20: "Film Preset (optional macro override - can be selected at any time)"
}
```

### 9.2 New Dropdown Visibility Rules

```json
Camera_Type_Dropdown_Logic: {
  "Digital": {
    show: ["Digital camera manufacturers: ARRI, RED, Sony, Canon, Blackmagic, Panasonic, Nikon, DJI"],
    hide: ["Film Stock dropdown"],
    aspect_ratio: "Full range available"
  },
  "Film_35mm": {
    show: ["Film camera manufacturers: ARRI Film, Panavision, Mitchell"],
    show: ["Film Stock dropdown"],
    filter_stocks: "35mm stocks only",
    aspect_ratio: ["1.33:1", "1.37:1", "1.66:1", "1.78:1", "1.85:1", "2.35:1", "2.39:1"]
  },
  "Film_65mm": {
    show: ["65mm camera manufacturers: Panavision System 65, Super Panavision 70, Ultra Panavision 70"],
    show: ["Film Stock dropdown"],
    filter_stocks: "65mm stocks only",
    aspect_ratio: ["2.20:1", "2.76:1"]
  },
  "Film_IMAX": {
    show: ["IMAX cameras"],
    show: ["Film Stock dropdown"],
    filter_stocks: "IMAX 65mm stocks",
    aspect_ratio: ["1.43:1", "1.90:1"]
  }
}

Film_Stock_Visibility_Logic: {
  "Film Camera selected": {
    film_stock_dropdown: "VISIBLE",
    position: "After Camera Body, Before Aspect Ratio"
  },
  "Digital Camera selected": {
    film_stock_dropdown: "HIDDEN"
  }
}

Lens_Manufacturer_Filter_Logic: {
  "Panavision camera selected": {
    show_only: ["Panavision"],
    hide: ["All other manufacturers"],
    reason: "Panavision mount is proprietary"
  },
  "ARRI/RED/Sony PL mount selected": {
    show: ["Zeiss", "Cooke", "ARRI", "Angenieux", "Canon Cinema"],
    hide: ["Panavision"]
  },
  "Mitchell camera selected": {
    show: ["Bausch & Lomb", "Cooke Vintage", "Zeiss Classic"],
    hide: ["Modern digital-era lenses"]
  },
  "65mm camera selected": {
    show: ["Panavision 65", "ARRI 65", "Hasselblad"],
    hide: ["35mm-only lenses"]
  }
}
```

### 9.3 Original Dropdown Enable/Disable Logic

```json
Dropdown_Logic: {
  "If Heavy Camera selected": {
    disable: ["Handheld", "Gimbal", "Drone"]
  },
  "If Alexa 65 selected": {
    disable: ["Steadicam", "Handheld", "Drone"],
    force_enable: ["Dolly", "Crane", "Technocrane", "Motion Control"]
  },
  "If Night time selected": {
    hide: ["Sun"],
    show: ["Moon", "Practical_Lights", "Artificial"]
  },
  "If Cheerful mood selected": {
    disable: ["Low_Key"],
    auto_select: ["High_Key", "Soft_Lighting"]
  }
}
```

### 9.4 Film Preset Override Logic

```json
Film_Preset_Override_Logic: {
  "When Film Preset selected": {
    // Auto-populate all technical fields
    auto_set: {
      camera_type: "preset.camera_type",
      camera_body: "preset.camera_body (suggested, not locked)",
      film_stock: "preset.film_stock (if film camera)",
      aspect_ratio: "preset.aspect_ratio (LOCKED)",
      lens_manufacturer: "preset.lens_manufacturer",
      lens_family: "preset.lens_family",
      primary_focal_lengths: "preset.primary_focal_lengths (highlighted)"
    },
    
    // Lock critical fields
    lock_fields: ["aspect_ratio", "camera_type"],
    
    // Warn if user overrides aesthetic fields
    warn_on_override: ["lens_manufacturer", "lens_family", "film_stock"],
    
    // Allow full override of these
    allow_override: ["camera_body", "focal_length", "movement", "lighting"]
  }
}
```

---

## SECTION 10: GLOBAL VALIDATION MATRIX (All Invalid States)

```json
Invalid_Combinations: [
  // Original Rules
  "Night + Sun lighting",
  "Cheerful mood + Low-Key lighting",
  "1940s Film + LED lighting",
  "Midday + Moonlight key",
  "Blade Runner preset + Cheerful mood",
  "Casablanca preset + LED sources",
  "Mulholland Drive preset + Cheerful mood",
  "Alexa 65 + Handheld equipment",
  "Alexa 65 + Drone equipment",
  "65mm lens + S35 camera",
  "S35-only lens + Large Format camera",
  
  // NEW: Film Stock Rules (Hard Blocks)
  "Digital Camera + Film Stock selected",
  "35mm Film Camera + 65mm Film Stock",
  "65mm Film Camera + 35mm-only Film Stock",
  "IMAX Camera + Non-IMAX Film Stock",
  
  // NEW: Aspect Ratio Rules (Hard Blocks)
  "35mm Spherical Lens + 2.76:1 Aspect Ratio",
  "Anamorphic Lens + 1.33:1 Aspect Ratio",
  "Anamorphic Lens + 1.37:1 Aspect Ratio",
  "65mm Spherical Camera + 2.39:1 Anamorphic Aspect Ratio",
  "IMAX Camera + 2.39:1 Aspect Ratio",
  
  // NEW: Lens Manufacturer Rules (Hard Blocks)
  "Panavision Camera + Non-Panavision Lens",
  "Non-Panavision Camera + Panavision Lens",
  "Mitchell Camera + Modern Digital-Era Lens",
  "65mm Camera + 35mm-Only Lens",
  "IMAX Camera + Standard Cinema Lens",
  
  // NEW: Film Preset Locked Field Violations
  "Lawrence_of_Arabia preset + Non-2.20:1 Aspect Ratio",
  "Blade_Runner preset + Non-Panavision Lens",
  "The_Godfather preset + Non-Bausch_Lomb Lens (warning only)",
  "Barry_Lyndon preset + Non-Zeiss_f07 Lens (for candlelight scenes)",
  "Schindlers_List preset + Color Film Stock"
]

Soft_Warning_Combinations: [
  // Aesthetic Mismatches (Warn but Allow)
  "Modern film stock + Pre-1970s preset",
  "Historic film stock + Modern preset",
  "Override lens manufacturer from preset recommendation",
  "Override lens family from preset recommendation",
  "Wide lens (14mm) + Close-Up framing",
  "Medium camera + Extended Handheld (operator fatigue)",
  "Large Format + Fast handheld movement",
  "Vintage lens + Ultra-high-resolution digital sensor"
]
```

---

## WHAT THIS DOCUMENT PROVIDES

✅ **Single Source of Truth** - All rules extracted from source files  
✅ **Complete Cross-Reference** - What affects what, why, and how  
✅ **Hard Rules** - Technically impossible combinations (blocked)  
✅ **Soft Constraints** - Cinematically incoherent but technically possible (warned)  
✅ **Preset Logic** - How film presets override and lock fields  
✅ **Developer Ready** - Structured for rule engines and validation logic  
✅ **Extensible** - Easy to add new cameras, lenses, films, presets  

### NEW FEATURES IN THIS VERSION:
✅ **Film Camera System** - Complete 35mm, 65mm, and IMAX film cameras  
✅ **Film Stock Dropdown** - Appears only when film camera selected  
✅ **Aspect Ratio System** - Full range from 1.33:1 to 2.76:1 with camera constraints  
✅ **Lens Manufacturer Filtering** - Auto-filters based on camera mount system  
✅ **Enhanced Film Presets** - Technical specifications (camera, film stock, aspect ratio, lenses)  
✅ **Preset-Driven Lens Rules** - Presets recommend specific lenses used in original films  

---
