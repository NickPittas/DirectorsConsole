Below is a **corrected and expanded CAMERA WEIGHT & FORMAT CONSTRAINTS section**, grounded in **real manufacturer specifications**, with **clear weight classes**, **camera references**, and **movement implications**.

This is still **system data**, not advice or prompts.

---

# UPDATED — CAMERA WEIGHT & FORMAT CONSTRAINTS  
*(PHASE 2 ADDENDUM)*

## 1. CAMERA WEIGHT CLASSES (BODY‑ONLY BASELINE)

> **Important implementation note**  
> All weights below are **body only**, without lens, battery, matte box, motors, or accessories.  
> Real‑world rigged weight is typically **+50–120%**.

### Weight Class Definitions

```json
Weight_Classes: {
  Ultra_Light: "< 2.0 kg",
  Light: "2.0 – 3.0 kg",
  Medium: "3.0 – 4.0 kg",
  Heavy: "> 4.0 kg"
}
```

---

## 2. CAMERA MODELS WITH VERIFIED WEIGHTS

### 2.1 ULTRA‑LIGHT CAMERAS (< 2.0 kg)

```json
Ultra_Light_Cameras: {
  RED_V_Raptor: {
    weight_kg: 1.83,
    weight_lbs: 4.03,
    sensor: "VistaVision / Full Frame",
    notes: "Exceptionally compact for large-format"
  }
}
```

Source: RED / Panavision specs. [<sup>1</sup>](https://www.red.com/v-raptor-x-black?utm_source=openai)

✅ Ideal for:
- Handheld
- Gimbal
- Drone (with payload limits)
- Steadicam

---

### 2.2 LIGHT CAMERAS (2.0 – 3.0 kg)

```json
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
```

Sources: ARRI official documentation. [<sup>2</sup>](https://www.arri.com/en/camera-systems/camera/K1.0024074?utm_source=openai)

✅ Ideal for:
- Handheld
- Steadicam
- Gimbal (high‑end)
- Dolly
- Crane

⚠️ Drone use: **Only with high‑payload drones**

---

### 2.3 MEDIUM CAMERAS (3.0 – 4.0 kg)

```json
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
```

Sources: ARRI & RED specifications. [<sup>3</sup>](https://www.arri.com/en/camera-systems/cameras/alexa-35?utm_source=openai)

✅ Ideal for:
- Dolly
- Crane
- Technocrane
- Motion control

⚠️ Handheld & Steadicam: **soft warning** (operator fatigue, inertia)

---

### 2.4 HEAVY CAMERAS (> 4.0 kg)

```json
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

Sources: Sony & ARRI official specs. [<sup>4</sup>](https://sony-cinematography.com/venice2/?utm_source=openai)

✅ Ideal for:
- Dolly
- Crane
- Technocrane
- Motion control
- Studio builds

❌ Disallowed:
- Handheld
- Gimbal
- Drone
- Steadicam (except specialized rigs)

---

## 3. CAMERA WEIGHT ↔ MOVEMENT CONSTRAINT MATRIX

### HARD CONSTRAINTS

```json
Hard_Movement_Constraints: {
  Heavy: ["Handheld", "Gimbal", "Drone"],
  Alexa_65: ["Steadicam", "Handheld", "Drone"]
}
```

---

### SOFT WARNINGS

```json
Soft_Movement_Warnings: {
  Medium_Cameras: ["Extended Handheld", "Fast Whip Pans"],
  Large_Format: ["Fast Handheld", "Whip Fast Timing"]
}
```

---

## 4. DEVELOPER LOGIC — HOW TO USE THIS

### Example logic (pseudo):

```
IF camera.weight_class == "Heavy"
  DISABLE ["Handheld", "Gimbal", "Drone"]

IF camera.weight_class == "Medium"
  WARN ["Handheld", "Fast Movement Timing"]

IF sensor == "65mm"
  FORCE ["Dolly", "Crane", "Motion Control"]
```

---

## ✅ THIS FIX ACHIEVES

- Real, referenceable camera mass
- Objective classification (not opinion)
- Enforceable movement logic
- Clear UI behavior for dropdown enable/disable
- Cinematically accurate constraints

---