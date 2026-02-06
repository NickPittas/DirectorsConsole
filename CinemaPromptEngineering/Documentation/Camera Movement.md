Below is **PHASE 2 — CAMERA MOVEMENT SYSTEMS & CINEMATIC LANGUAGE**.

This phase defines **what moves the camera**, **how it moves**, **how fast**, and **what combinations are physically and cinematically coherent**.

No prompts. No fluff. Pure system design.

---

# PHASE 2 — CAMERA MOVEMENT SYSTEMS

---

## 1. MOVEMENT EQUIPMENT (PHYSICAL SYSTEMS)

These are **hardware selectors**. They determine what movements are possible.

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

---

## 2. CAMERA MOVEMENT TYPES (CINEMATIC LANGUAGE)

These are **movement verbs**.  
They are **independent of equipment**, but constrained by it.

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

---

## 3. MOVEMENT TIMING / VELOCITY

This defines **temporal character** of motion.

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

---

## 4. EQUIPMENT ↔ MOVEMENT COMPATIBILITY (HARD RULES)

```json
Equipment_Movement_Compatibility: {
  Static: ["Pan", "Tilt", "Roll"],

  Handheld: [
    "Pan",
    "Tilt",
    "Track_In",
    "Track_Out",
    "Push_In",
    "Pull_Back"
  ],

  Steadicam: [
    "Track_In",
    "Track_Out",
    "Arc",
    "Truck_Left",
    "Truck_Right"
  ],

  Gimbal: [
    "Track_In",
    "Track_Out",
    "Arc",
    "Crane_Up",
    "Crane_Down"
  ],

  Dolly: [
    "Track_In",
    "Track_Out",
    "Truck_Left",
    "Truck_Right",
    "Dolly_Zoom"
  ],

  Jib: [
    "Crane_Up",
    "Crane_Down",
    "Arc"
  ],

  Crane: [
    "Crane_Up",
    "Crane_Down",
    "Track_In",
    "Arc"
  ],

  Technocrane: [
    "Crane_Up",
    "Crane_Down",
    "Track_In",
    "Track_Out",
    "Arc"
  ],

  Motion_Control: [
    "Any"
  ],

  Drone: [
    "Track_In",
    "Track_Out",
    "Crane_Up",
    "Crane_Down",
    "Arc"
  ]
}
```

---

## 5. MOVEMENT ↔ TIMING LOGIC (SOFT CONSTRAINTS)

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

## 6. CAMERA WEIGHT & FORMAT CONSTRAINTS (SOFT WARNINGS)

```json
Camera_Movement_Warnings: {
  Heavy_Cinema_Cameras: {
    restricted_on: ["Handheld", "Small Gimbal"]
  },
  65mm_Cameras: {
    restricted_on: ["Steadicam", "Drone"]
  }
}
```

---

## 7. DEVELOPER VIEW — MOVEMENT LOGIC TREE

```
Movement Equipment
 ├─ Allowed Movement Types
 │   ├─ Movement Timing
 │   │   └─ Camera Weight Constraints
```

---

## ✅ PHASE 2 COMPLETE

You now have:
- Physical movement systems
- Cinematic movement language
- Timing logic
- Hardware feasibility rules

This can already **prevent impossible selections** and **guide coherent motion choices**.

---