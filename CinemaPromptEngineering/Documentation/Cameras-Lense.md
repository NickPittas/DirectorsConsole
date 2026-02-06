Below is **PHASE 1**, delivered exactly as you requested:  
**a coherent, organized, cross‑referenced list**, not a prompt, designed for **dropdowns, logic enforcement, and developer clarity**.

No prose fluff. This is a **cinematic data model**.

---

# PHASE 1 — CAMERA & LENS SYSTEM (FOUNDATION)

This phase defines **what can physically mount to what**, **what covers which sensor**, and **what focal lengths actually exist**.

---

## 1. CAMERA MANUFACTURERS → CAMERA BODIES

### 1.1 ARRI

```json
ARRI: {
  Alexa_35: {
    sensor: "Super 35",
    mount: "LPL",
    era: "Digital Cinema",
    use_case: ["Feature Film", "High-End TV"]
  },
  Alexa_Mini: {
    sensor: "Super 35",
    mount: ["PL", "LPL"],
    era: "Digital Cinema"
  },
  Alexa_Mini_LF: {
    sensor: "Large Format",
    mount: "LPL",
    era: "Digital Cinema"
  },
  Alexa_LF: {
    sensor: "Large Format",
    mount: "LPL",
    era: "Digital Cinema"
  },
  Alexa_65: {
    sensor: "65mm",
    mount: "XPL",
    era: "Digital Cinema"
  }
}
```

---

### 1.2 RED

```json
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
  Komodo_X: {
    sensor: "Super 35",
    mount: "RF"
  },
  Monstro_8K: {
    sensor: "VistaVision / Full Frame",
    mount: "PL"
  }
}
```

---

### 1.3 SONY

```json
Sony: {
  Venice_2: {
    sensor: ["Full Frame", "S35"],
    mount: "PL",
    era: "Digital Cinema"
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
```

---

### 1.4 CANON

```json
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
```

---

### 1.5 BLACKMAGIC

```json
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
```

---

### 1.6 PANASONIC

```json
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
```

---

### 1.7 NIKON

```json
Nikon: {
  Z9: {
    sensor: "Full Frame",
    mount: "Z"
  }
}
```

---

### 1.8 FILM CAMERAS (LEGACY)

```json
Film_Cameras: {
  Arricam_ST_LT: {
    format: "35mm Film",
    mount: "PL"
  },
  Panavision_Panaflex: {
    format: "35mm Film",
    mount: "Panavision"
  }
}
```

---

### 1.9 DRONES (CAMERA-AS-UNIT)

```json
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

⚠️ **Drone rule:**  
> Drones do **NOT** expose interchangeable cinema lens families unless explicitly supported.

---

## 2. SENSOR TYPES → LENS COVERAGE LOGIC

```json
Sensor_Coverage: {
  Super_35: ["S35 Lenses", "Full Frame Lenses"],
  Full_Frame: ["Full Frame Lenses"],
  Large_Format: ["LF / FF+ Lenses"],
  VistaVision: ["Full Frame Lenses"],
  65mm: ["65mm Lenses Only"]
}
```

---

## 3. LENS MANUFACTURERS → LENS FAMILIES

### 3.1 ARRI / ZEISS

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
```

---

### 3.2 COOKE

```json
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
```

---

### 3.3 PANAVISION (LOCKED ECOSYSTEM)

```json
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
```

---

### 3.4 CANON CINEMA

```json
Canon_Lenses: {
  CN_E_Prime: {
    type: "Prime",
    coverage: "Full Frame",
    mount: "PL / EF",
    focal_lengths: [14, 20, 24, 35, 50, 85, 135]
  }
}
```

---

### 3.5 ZOOMS (SELECTED)

```json
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
```

---

## 4. CAMERA ↔ LENS COMPATIBILITY RULES

### HARD RULES
- Alexa 35 ❌ Full‑frame lenses not required
- Alexa LF ❌ S35‑only lenses
- Alexa 65 ❌ anything except 65mm optics
- Panavision bodies ❌ non‑Panavision lenses

### SOFT WARNINGS
- Vintage lenses on ultra‑high‑resolution sensors
- Extreme wide lenses on handheld shots

---

## 5. DEVELOPER VIEW — RELATIONSHIP MAP (SIMPLIFIED)

```
Camera Body
 ├─ Sensor Type
 │   ├─ Lens Coverage
 │   │   ├─ Lens Family
 │   │   │   ├─ Focal Lengths
 │   │   │   └─ Mount Compatibility
```

---

## ✅ PHASE 1 COMPLETE

This establishes:
- Real cameras
- Real lenses
- Real focal lengths
- Real physical constraints

---