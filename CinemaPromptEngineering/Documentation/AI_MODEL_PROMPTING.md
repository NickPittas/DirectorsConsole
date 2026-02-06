# AI MODEL PROMPTING GUIDE
## Comprehensive Analysis for Cinema Prompt Engineering

**Version:** 1.0  
**Last Updated:** January 17, 2026  
**Purpose:** Define optimal prompt structures for each supported AI image/video generation model

---

## TABLE OF CONTENTS

1. [Overview & Model Comparison](#overview--model-comparison)
2. [Image Generation Models (Commercial/API)](#image-generation-models)
   - [Midjourney v6](#1-midjourney-v6)
   - [DALL-E 3](#2-dall-e-3)
   - [Stable Diffusion XL (SDXL)](#3-stable-diffusion-xl-sdxl)
   - [Flux](#4-flux)
3. [Video Generation Models (Commercial/API)](#video-generation-models)
   - [Runway Gen-3/4](#1-runway-gen-3-alpha--gen-4)
   - [Pika Labs](#2-pika-labs)
   - [OpenAI Sora](#3-openai-sora)
   - [Kling (Kuaishou)](#4-kling-kuaishou)
   - [Google Veo](#5-google-veo-veo-2--31)
4. [Comparative Summary](#comparative-summary)
5. [Cinema Prompt Engineering Integration](#cinema-prompt-engineering-integration)
6. [Model-Specific Formatting Rules](#model-specific-formatting-rules)
7. [Open-Source Models (ComfyUI Focus)](#open-source-models-comfyui-focus)
   - **Image Generation:**
     - [FLUX.2](#1-flux2-black-forest-labs)
     - [Qwen-Image](#2-qwen-image-alibaba-tongyi-lab)
     - [Stable Diffusion 3.5](#3-stable-diffusion-35-stability-ai)
   - **Video Generation:**
     - [Wan 2.2](#1-wan-22-alibaba)
     - [HunyuanVideo](#2-hunyuan-video-tencent)
     - [CogVideoX](#3-cogvideox-thudmzai)
     - [Mochi](#4-mochi-genmo)
     - [LTX-Video / LTX-2](#5-ltx-video--ltx-2-lightricks)
     - [Nano Banana](#6-nano-banana-google-gemini-api)
   - [Open-Source Model Comparison](#open-source-model-comparison)
   - [ComfyUI Workflow Integration](#comfyui-workflow-integration)

---

## OVERVIEW & MODEL COMPARISON

### Quick Reference Matrix

| Model | Type | Max Duration | Cinematic Control | Best For |
|-------|------|--------------|-------------------|----------|
| **Midjourney v6** | Image | N/A | Excellent | Artistic, stylized images |
| **DALL-E 3** | Image | N/A | Good | Accurate prompt following |
| **SDXL** | Image | N/A | Excellent | Customizable, LoRAs |
| **Flux** | Image | N/A | Excellent | Photorealism |
| **Runway Gen-3/4** | Video | 10 sec | Excellent | Intermediate users |
| **Pika Labs** | Video | 3-10 sec | Good | Beginners |
| **Sora** | Video | 60 sec | Excellent | Professional cinematography |
| **Kling** | Video | 10 sec | Professional | Chinese content, long takes |
| **Google Veo** | Video | 8 sec | Comprehensive | Audio-visual projects |

---

## IMAGE GENERATION MODELS

### 1. MIDJOURNEY V6

#### 1.1 Prompt Structure

```
[Subject] in [Setting], [Lighting], [Camera/Lens], [Style], [Mood/Atmosphere] --ar [ratio] --s [stylize] --v 6
```

**Optimal Order:**
1. Subject description (character, object)
2. Action/pose
3. Environment/setting
4. Lighting conditions
5. Camera angle/lens
6. Film stock/style reference
7. Color palette
8. Mood/atmosphere
9. Parameters (--ar, --s, --v)

#### 1.2 Cinematic Keywords That Work

| Category | Effective Keywords |
|----------|-------------------|
| **Camera** | shot on ARRI Alexa, shot on RED, 35mm film, anamorphic lens, shallow depth of field, bokeh |
| **Lighting** | cinematic lighting, Rembrandt lighting, chiaroscuro, golden hour, blue hour, practical lighting, neon lighting |
| **Film Stock** | Kodak Portra, Kodak Vision3, Fujifilm, film grain, vintage film |
| **Lens** | 85mm portrait, 24mm wide angle, 50mm, anamorphic flare, lens distortion |
| **Style** | Roger Deakins cinematography, Vittorio Storaro, Gordon Willis, film noir |

#### 1.3 Parameters

| Parameter | Effect | Recommended |
|-----------|--------|-------------|
| `--ar` | Aspect ratio | 16:9 (cinematic), 2.39:1 (anamorphic) |
| `--s` | Stylization | 100-250 for cinematic |
| `--c` | Chaos | 0-20 for controlled results |
| `--q` | Quality | 1 (default) |
| `--v 6` | Version | Always use v6 |

#### 1.4 Example Prompts

**Film Noir Style:**
```
A detective in a trench coat standing under a streetlamp, rain-slicked streets, 
1940s Los Angeles, high contrast black and white, Venetian blind shadows across face, 
hard lighting, shot on 35mm film, film noir cinematography, low angle shot, 
50mm lens --ar 16:9 --s 200 --v 6
```

**Modern Blockbuster:**
```
Hero standing on rooftop at golden hour, city skyline background, 
shot on ARRI Alexa 65, anamorphic lens flare, teal and orange color grade, 
cinematic lighting, shallow depth of field, Roger Deakins cinematography --ar 2.39:1 --s 150 --v 6
```

---

### 2. DALL-E 3

#### 2.1 Prompt Structure

DALL-E 3 responds best to **natural language descriptions** rather than keyword lists.

```
[Detailed scene description in complete sentences, describing subject, action, 
environment, lighting, camera position, and artistic style as if briefing a photographer]
```

**Key Principles:**
- Write in complete, descriptive sentences
- Be specific about spatial relationships
- Describe lighting sources explicitly
- Mention camera angle and framing
- Reference specific artistic styles or films

#### 2.2 Cinematic Language

| Category | How to Describe |
|----------|-----------------|
| **Camera** | "photographed from a low angle", "captured with a wide-angle lens", "shot from behind the subject" |
| **Lighting** | "lit by a single window on the left", "illuminated by neon signs", "backlit by the setting sun" |
| **Style** | "in the style of film noir cinematography", "resembling a Wes Anderson film", "like a scene from Blade Runner" |
| **Mood** | "creating a sense of isolation", "evoking nostalgia", "with an atmosphere of tension" |

#### 2.3 Parameters

| Setting | Options | Notes |
|---------|---------|-------|
| **Size** | 1024x1024, 1024x1792, 1792x1024 | Use 1792x1024 for cinematic |
| **Style** | vivid, natural | "vivid" for stylized, "natural" for realism |
| **Quality** | standard, hd | Always use "hd" for cinematic |

#### 2.4 Example Prompts

**Neo-Noir:**
```
A woman in a red dress sits alone at a bar counter in a dimly lit cocktail lounge. 
The scene is illuminated primarily by neon signs visible through rain-streaked windows, 
casting pink and blue reflections on the polished bar surface. The camera captures her 
from a three-quarter angle, emphasizing her isolation in the empty space. The image has 
the visual style of modern neo-noir cinema, with high contrast, deep shadows, and 
saturated color accents against a predominantly dark palette.
```

**Period Drama:**
```
An elegant ballroom scene from the 1920s, captured as if through a vintage film camera. 
Crystal chandeliers illuminate couples dancing, their reflections visible in the polished 
marble floor. The warm, golden lighting creates a soft glow reminiscent of candlelight. 
The composition frames the dancers from across the room, with ornate columns in the 
foreground creating depth. The style evokes the cinematography of classic Hollywood 
period films, with a slight film grain and warm color temperature.
```

---

### 3. STABLE DIFFUSION XL (SDXL)

#### 3.1 Prompt Structure

SDXL uses weighted tokens and responds well to technical terms:

```
[Quality boosters], [Subject], [Action], [Environment], [Lighting], [Camera], [Film/Style], [Color]
```

**Weight Syntax:** `(keyword:weight)` where 1.0 is default, 1.3+ emphasizes

#### 3.2 Effective Prompt Tokens

| Category | Tokens |
|----------|--------|
| **Quality** | masterpiece, best quality, highly detailed, professional, 8k uhd |
| **Camera** | shot on arri alexa, shot on red, canon eos, sony a7, dslr |
| **Lens** | 85mm lens, 35mm lens, anamorphic, wide angle, telephoto, macro |
| **Film** | kodak portra 400, fujifilm, cinestill 800t, film grain, analog |
| **Lighting** | cinematic lighting, dramatic lighting, rembrandt lighting, volumetric lighting, rim light |
| **Style** | photorealistic, cinematic, film still, movie scene, cinematography |

#### 3.3 Negative Prompts (Critical for SDXL)

```
(worst quality:1.4), (low quality:1.4), (normal quality:1.4), lowres, bad anatomy, 
bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, 
jpeg artifacts, signature, watermark, username, blurry, artist name, 
(deformed iris:1.3), (deformed pupils:1.3)
```

**Cinematic-Specific Negatives:**
```
oversaturated, cartoon, illustration, painting, drawing, anime, 
(overexposed:1.2), (underexposed:1.2), amateur photography
```

#### 3.4 Example Prompts

**Positive:**
```
masterpiece, best quality, cinematic film still, (shot on arri alexa:1.2), 
a weathered detective in a rain-soaked alley at night, 
(neon signs reflecting in puddles:1.1), dramatic low-key lighting, 
high contrast, film noir cinematography, anamorphic lens, 
shallow depth of field, (kodak vision3:1.1), moody atmosphere, 
professional color grading, 8k uhd
```

**Negative:**
```
(worst quality:1.4), (low quality:1.4), cartoon, illustration, anime, 
oversaturated, overexposed, amateur, blurry, text, watermark
```

---

### 4. FLUX

#### 4.1 Prompt Structure

Flux excels at photorealism and understands natural language well:

```
[Detailed scene], [Technical camera details], [Lighting specifics], [Style/Reference]
```

**Key Strengths:**
- Exceptional at realistic human faces and hands
- Understands complex lighting setups
- Responds well to specific camera/lens mentions
- Excellent text rendering (unlike most models)

#### 4.2 Effective Keywords

| Category | Keywords |
|----------|----------|
| **Realism** | photorealistic, hyperrealistic, ultra realistic, photograph, photo |
| **Camera** | DSLR, mirrorless, medium format, shot on Phase One, Hasselblad |
| **Technical** | f/1.8 aperture, 1/500 shutter speed, ISO 400, RAW photo |
| **Lighting** | studio lighting, natural light, golden hour, overcast, flash photography |

#### 4.3 Example Prompts

**Cinematic Portrait:**
```
Photorealistic cinematic portrait of a middle-aged man with weathered features, 
sitting in a dimly lit jazz club. Shot on medium format camera with 80mm lens at f/2.8. 
Practical lighting from a table lamp creates warm highlights on his face while 
the background falls into soft bokeh. The mood is contemplative and intimate, 
reminiscent of a Gordon Willis interior scene. Subtle film grain, 
professional color grading with warm shadows and neutral highlights.
```

---

## VIDEO GENERATION MODELS

### 1. RUNWAY GEN-3 ALPHA / GEN-4

#### 1.1 Prompt Structure

```
[camera movement]: [establishing scene]. [additional details].
```

**Key Principles:**
- Be direct and descriptive, not conversational
- Avoid negative phrasing ("no clouds") - use positive alternatives ("clear sky")
- Do NOT describe input images when using image-to-video - focus on movement only
- Repeat/reinforce key ideas in different sections for better adherence

#### 1.2 Motion Keywords

| Category | Keywords |
|----------|----------|
| **Basic Camera** | Static, Pan (left/right), Tilt (up/down), Dolly (in/out), Truck (left/right), Pedestal (up/down) |
| **Advanced Camera** | Zoom (in/out), Crane/Jib, Arc, Roll, Whip Pan, Handheld, Steadicam |
| **Specialty** | FPV (First-Person View), Tracking, Hyperspeed, Crane_Up, Crane_Down |
| **Subject Motion** | Grows, Emerges, Explodes, Ascends, Undulates, Warps, Transforms, Ripples, Shatters, Unfolds, Vortex |

#### 1.3 Cinematic Terms

| Type | Available Keywords |
|------|-------------------|
| **Camera Styles** | Low angle, High angle, Overhead, FPV, Handheld, Wide angle, Close-up, Macro cinematography, Over-the-shoulder, Tracking, Establishing wide, 50mm lens, SnorriCam, Realistic documentary, Camcorder |
| **Lighting Styles** | Diffused lighting, Silhouette, Lens flare, Back lit, Side lit, [color] gel lighting, Venetian lighting |
| **Style & Aesthetic** | Moody, Cinematic, Iridescent, Home video VHS, Glitchcore |

#### 1.4 Duration/Timing

- Standard generation: 4-10 seconds per clip
- Timing controlled through movement speed keywords ("slow", "fast", "gradual", "sudden")
- Use "slow-motion" or "time-lapse" explicitly for temporal effects

#### 1.5 Example Prompts

**Camera Movement:**
```
Low angle static shot: The camera is angled up at a woman wearing all orange 
as she stands in a tropical rainforest with colorful flora. 
The dramatic sky is overcast and gray.
```

**Seamless Transition:**
```
Continuous hyperspeed FPV footage: The camera seamlessly flies through 
a glacial canyon to a dreamy cloudscape.
```

**Title Card:**
```
A title screen with dynamic movement. The scene starts at a colorful paint-covered wall. 
Suddenly, black paint pours on the wall to form the word 'Cinema'. 
The dripping paint is detailed and textured, centered, superb cinematic lighting.
```

---

### 2. PIKA LABS

#### 2.1 Prompt Structure

```
[subject] + [action] + [style directives] + [cinematic elements] + [technical specifications]
```

**Key Principles:**
- Image-to-video produces higher quality cinematic results than text-to-video
- Use "/" command to add parameters and camera movements
- Combine multiple images for character consistency (multi-image fusion)
- Include negative prompts to exclude unwanted elements

#### 2.2 Motion Keywords

| Category | Keywords |
|----------|----------|
| **Camera Moves** | Tracking shot, 360 orbit, Push-in, Overhead crane view, Low angle heroic shot, Pan left/right, Tilt up/down, Dolly in/out, Zoom, Crane, Arc, Whip pan |
| **Animation Styles** | 20+ animation styles including anime, claymation, stop-motion, cel-shaded |

#### 2.3 Style Options

| Type | Available Options |
|------|-------------------|
| **Style Transfer** | Anime, photorealistic, Pixar-like 3D, classic Disney, Japanese anime, watercolor, charcoal sketch |
| **Lighting** | Golden hour, film noir, Rembrandt lighting, high-key, low-key, volumetric, backlighting |
| **Mood/Style** | Epic, whimsical, gritty, romantic, horror, sci-fi, vintage, noir |

#### 2.4 Example Prompts

**Dynamic Action:**
```
A knight battling a dragon. An epic fantasy scene, painted in the style of Frank Frazetta, 
with dramatic chiaroscuro lighting. Wide-angle shot, slow-motion capture, 
turbulent clouds in the background. 8K resolution, cinematic color grading, 
high detail, motion blur.
```

**Character Consistency:**
```
A lone detective walks down a rain-slicked street, film noir style, 
low-angle shot, neon lights reflecting in puddles, 
steady camera following from behind. 
[Use character reference image for consistency]
```

---

### 3. OPENAI SORA

#### 3.1 Prompt Structure

Sora uses a cinematographer-briefing approach:

```
[camera shot] + [action/movement] + [subject description] + [environment/context] + [lighting/atmosphere]
```

**Key Principles:**
- Think of prompting like briefing a cinematographer who has never seen your storyboard
- If you leave out details, Sora will improvise
- Include specific camera instructions for controlled outputs
- Supports multi-shot sequences and dialogue

#### 3.2 Shot Types & Camera Movements

| Category | Keywords |
|----------|----------|
| **Shot Types** | Close-Up (CU), Over-the-Shoulder (OTS), High Angle, Low Angle, Bird's Eye View, Dutch Angle, Wide Shot (WS), Medium Shot (MS), Extreme Close-Up, Full Shot |
| **Camera Movements** | Pan, Tilt, Dolly, Truck, Pedestal, Zoom, Crane/Jib, Handheld, Steadicam, Arc, Roll, Whip Pan, Zoom Burst, Push In, Pull Out |
| **Special Effects** | Slow-motion, Time-lapse, Rack focus, Dolly zoom (vertigo effect) |

#### 3.3 Technical Terms

| Type | Available Options |
|------|-------------------|
| **Lenses** | Wide-angle, Telephoto, 35mm, 50mm, 85mm, Fisheye |
| **Depth of Field** | Shallow depth of field (bokeh), Deep depth of field, Rack focus |
| **Color** | Monochromatic, Monochromatic blue palette, Warm autumnal tones, Cool futuristic palette |
| **Film Style** | Shot on 35mm film, Anamorphic widescreen, IMAX, Film grain, Vintage 16mm |

#### 3.4 Duration: Up to 60 seconds

#### 3.5 Example Prompts

**Action Sequence:**
```
Begin with a wide shot of a bustling downtown area at dusk. 
Follow with a handheld camera tracking a speeding car weaving through traffic, 
interspersed with close-ups of the driver's intense focus.
```

**Complex Camera Work:**
```
Start with a wide angle, over-the-shoulder shot of the protagonist standing at 
the edge of a cliff. Dolly in slowly as they extend their hand over the valley below. 
Then tilt down to reveal the winding river beneath. Finally, cut to a close-up shot 
of their determined expression, zooming in to capture every subtle emotion.
```

**Noir Style:**
```
Use high contrast lighting and deep shadows to create a moody noir atmosphere. 
Start with a medium shot of the detective under a streetlamp in the rain, 
followed by close-ups highlighting their contemplative expressions.
```

---

### 4. KLING (Kuaishou)

#### 4.1 Prompt Structure

```
[subject] + [action description] + [environment] + [camera movement] + [style/lighting]
```

**Key Principles:**
- Strong performance with Chinese language prompts
- Professional mode offers advanced parameter control
- Start-to-end frame control for consistent sequences
- Multi-modal input support (text + images)

#### 4.2 Motion Keywords

| Category | Keywords |
|----------|----------|
| **Camera Moves** | Tracking, Dolly in/out, Crane up/down, Pan, Tilt, Zoom, Arc, Handheld, Steadicam |
| **Dynamic Moves** | 360 orbit, Push-pull, Whip pan, Hyperspeed, Bullet time |
| **Subject Motion** | Walking, Running, Flying, Dancing, Fighting, Transform |

#### 4.3 Example Prompts

**Epic Scene:**
```
A massive dragon soaring through storm clouds, lightning illuminating its scales. 
Camera follows from behind as the dragon banks sharply, revealing a medieval castle below. 
Dramatic lighting, epic orchestral score, photorealistic, 8K.
```

**Urban Action:**
```
A spy mission in Tokyo neon district. Handheld tracking shot following the protagonist 
through crowded streets. Quick cut to over-the-shoulder as they exchange a briefcase. 
Rain-slicked streets reflecting neon lights. Film noir atmosphere.
```

---

### 5. GOOGLE VEO (Veo 2 & 3.1)

#### 5.1 Prompt Structure (5-Element)

```
[Subject] + [Action] + [Scene/Context] + [Camera Angles/Movements] + [Visual Style/Aesthetics]
```

**Key Principles:**
- Break ideas into key components for effective guidance
- Negative prompts supported (describe what you DON'T want)
- Safety filters automatically block inappropriate content
- Audio prompts supported in Veo 3.1

#### 5.2 Comprehensive Camera Vocabulary

| Category | Keywords |
|----------|----------|
| **Camera Angles** | Eye-level, Low-angle, High-angle, Bird's-eye view, Worm's-eye view, Dutch angle, Over-the-shoulder, POV |
| **Shot Types** | Close-up, Extreme close-up, Medium shot, Full shot, Wide shot |
| **Camera Moves** | Static shot, Pan, Tilt, Dolly, Truck, Pedestal, Zoom, Crane shot, Aerial/drone shot, Handheld, Whip pan, Arc shot |
| **Lens Effects** | Wide-angle lens, Telephoto lens, Shallow DOF (bokeh), Deep DOF, Lens flare, Rack focus, Fisheye, Vertigo effect |

#### 5.3 Lighting Vocabulary

| Type | Options |
|------|---------|
| **Natural** | Natural light, Golden hour, Side lighting, Backlighting |
| **Artificial** | Artificial light, Volumetric lighting |
| **Cinematic Styles** | Rembrandt, Film noir, High-key, Low-key |

#### 5.4 Style/Aesthetics

| Style | Description |
|-------|-------------|
| **Photorealistic** | True-to-life rendering |
| **Cinematic** | Film-like quality |
| **Anime** | Japanese animation style |
| **Vintage** | Aged, historical look |
| **Noir** | High contrast, shadows |
| **Sci-fi** | Futuristic elements |
| **Epic/grandiose** | Large scale, dramatic |
| **Peaceful/serene** | Calm, tranquil |

#### 5.5 Unique Feature: Audio Prompts (Veo 3.1)

Veo 3.1 uniquely supports audio prompts for dialogue and ambient sound:

```
A medium shot in a dimly lit interrogation room. The seasoned detective says: 
'Your story has holes.' The nervous informant, sweating under a single bare bulb, 
replies: 'I'm telling you everything I know.' The only other sounds are the slow, 
rhythmic ticking of a wall clock and the faint sound of rain against the window.
```

---

## COMPARATIVE SUMMARY

### Feature Comparison Matrix

| Feature | Runway Gen-3/4 | Pika Labs | Sora | Kling | Google Veo |
|---------|----------------|-----------|------|-------|------------|
| **Max Duration** | 10 sec | 3-10 sec | **60 sec** | 10 sec | 8 sec |
| **Camera Control** | Excellent | Good | **Excellent** | Professional | **Comprehensive** |
| **Chinese Prompts** | No | No | No | **Excellent** | Limited |
| **Audio Support** | No | No | No | No | **Veo 3.1** |
| **Negative Prompts** | No | **Yes** | No | **Yes** | **Yes** |
| **Character Consistency** | Gen-4 | Multi-image | Limited | Start-to-end | Reference-based |
| **Best For** | Intermediate | Beginners | Professional | Chinese content | Audio-visual |

### Prompt Complexity Comparison

| Model | Prompt Style | Complexity | Learning Curve |
|-------|--------------|------------|----------------|
| **Midjourney** | Keywords + Parameters | Medium | Medium |
| **DALL-E 3** | Natural Language | Low | Low |
| **SDXL** | Weighted Tokens | High | High |
| **Flux** | Natural + Technical | Medium | Medium |
| **Runway** | Structured Scenes | Medium | Low |
| **Pika** | Simple + Commands | Low | Low |
| **Sora** | Cinematographer Brief | High | Medium |
| **Kling** | Structured + Chinese | Medium | Medium |
| **Veo** | 5-Element Structure | Medium | Medium |

---

## CINEMA PROMPT ENGINEERING INTEGRATION

### How Our System Maps to Each Model

Our Cinema Prompt Engineering system generates structured data that must be converted to model-specific prompts:

#### Data We Generate:

```json
{
  "camera": "ARRI Alexa 65",
  "lens": "Panavision Primo 70",
  "focal_length": "50mm",
  "aperture": "f/2.8",
  "movement": "Slow Dolly In",
  "time_of_day": "Golden Hour",
  "lighting_source": "Sun",
  "lighting_style": "Naturalistic",
  "shot_size": "Medium Shot",
  "composition": "Rule of Thirds",
  "mood": "Contemplative",
  "color_tone": "Warm",
  "film_preset": "The Godfather"
}
```

#### Model-Specific Conversion:

**For Midjourney:**
```
[scene description], shot on ARRI Alexa, 50mm lens, f/2.8 shallow depth of field, 
slow dolly movement, golden hour lighting, naturalistic lighting, medium shot, 
rule of thirds composition, contemplative mood, warm color palette, 
Gordon Willis cinematography --ar 2.39:1 --s 200 --v 6
```

**For DALL-E 3:**
```
A contemplative scene captured in a medium shot, with the subject positioned 
according to the rule of thirds. The image is photographed with the warm, 
golden light of sunset streaming in, creating naturalistic illumination 
reminiscent of Gordon Willis's work on The Godfather. The camera appears 
to be slowly moving closer to the subject, with a shallow depth of field 
creating soft bokeh in the background. The overall mood is contemplative, 
with warm amber tones throughout.
```

**For Runway Gen-3:**
```
Slow dolly in: A contemplative medium shot during golden hour. 
The warm, naturalistic lighting illuminates the scene with soft shadows. 
Rule of thirds composition. The mood is contemplative with warm color tones.
```

---

## MODEL-SPECIFIC FORMATTING RULES

### Template Variables

Our system should support these variables that map to model-specific syntax:

| Variable | Midjourney | DALL-E 3 | SDXL | Flux | Runway | Sora | Veo |
|----------|------------|----------|------|------|--------|------|-----|
| `{camera}` | "shot on {camera}" | "photographed with a {camera}" | "(shot on {camera}:1.2)" | "Shot on {camera}" | - | "shot on {camera}" | - |
| `{lens}` | "{focal}mm lens" | "{focal}mm focal length" | "{focal}mm lens" | "{focal}mm at f/{aperture}" | "{focal}mm lens" | "{focal}mm lens" | "{type} lens" |
| `{lighting}` | "{style} lighting" | "illuminated by {source}" | "({style} lighting:1.1)" | "{style} lighting" | "{style} lighting" | "{style} lighting" | "{style}" |
| `{movement}` | - | "the camera {moves}" | - | - | "{movement}:" | "{movement}" | "{movement}" |
| `{mood}` | "{mood} atmosphere" | "creating a {mood} mood" | "{mood}, {mood} atmosphere" | "{mood} atmosphere" | "{mood}" | "{mood} atmosphere" | "{mood}" |

### Required Formatting Per Model

| Model | Required Elements | Forbidden Elements |
|-------|-------------------|-------------------|
| **Midjourney** | --ar, --v 6 | Negative phrasing in prompt |
| **DALL-E 3** | Complete sentences | Parameter syntax |
| **SDXL** | Negative prompt | Conversational language |
| **Flux** | Technical specifics | Excessive keywords |
| **Runway** | Movement prefix | Image descriptions in I2V |
| **Pika** | / commands for params | - |
| **Sora** | Scene breakdown | Vague instructions |
| **Kling** | Chinese optional | - |
| **Veo** | 5-element structure | Unsafe content |

---

## APPENDIX: PROMPT TEMPLATES

### A. Universal Cinematic Elements

These terms work across most models:

```
UNIVERSAL LIGHTING:
- golden hour, blue hour, magic hour
- cinematic lighting, dramatic lighting
- high-key, low-key
- backlit, side-lit, rim light
- practical lighting, neon lighting
- Rembrandt lighting, chiaroscuro

UNIVERSAL CAMERA:
- wide shot, medium shot, close-up
- low angle, high angle, dutch angle
- shallow depth of field, deep focus
- tracking shot, dolly, pan, tilt

UNIVERSAL STYLE:
- cinematic, film still, movie scene
- photorealistic, hyperrealistic
- film grain, vintage
- noir, sci-fi, epic
```

### B. Model-Specific Boosters

**Midjourney Quality:**
```
--ar 16:9 --s 200 --v 6 --q 1
```

**SDXL Quality:**
```
masterpiece, best quality, highly detailed, professional, 8k uhd, RAW photo
```

**Flux Realism:**
```
photorealistic, hyperrealistic, ultra detailed, professional photography, 8K
```

---

## OPEN-SOURCE MODELS (ComfyUI Focus)

This section covers open-source models that can run locally via ComfyUI, essential for offline workflows and custom pipelines.

---

### IMAGE GENERATION: OPEN-SOURCE

#### 1. FLUX.2 (Black Forest Labs)

**Released:** November 2025  
**License:** Open weights (dev variant)  
**Parameters:** 32B (dev), 4B/9B (klein)

##### 1.1 Model Variants

| Variant | Parameters | Speed | Quality | Use Case |
|---------|------------|-------|---------|----------|
| **FLUX.2 [dev]** | 32B | Slower | Highest | Production |
| **FLUX.2 [klein]** | 4B/9B | Sub-second | Good | Rapid prototyping |
| **FLUX.2 [pro/max]** | API only | Fast | Highest | Commercial API |

##### 1.2 Prompt Structure

FLUX.2 uses **natural language** with a 4-pillar structure:

```
Subject + Action + Style + Context
```

**Key Principles:**
- **No negative prompts** - FLUX.2 doesn't support them; describe what you WANT
- Word order matters: Most important elements FIRST
- Supports **HEX color codes** directly: `#FF6B35 orange sunset`
- Supports **JSON structured prompts** for complex scenes
- Optimal prompt length: 30-80 words

##### 1.3 Cinematic Keywords

| Category | Effective Keywords |
|----------|-------------------|
| **Camera** | 85mm lens, wide-angle, telephoto, shallow DOF, f/2.8 aperture |
| **Lighting** | Rembrandt lighting, rim light, golden hour, volumetric, chiaroscuro |
| **Style** | photorealistic, cinematic, film grain, anamorphic, IMAX |
| **Reference** | shot on ARRI Alexa, medium format, Hasselblad |

##### 1.4 ComfyUI Parameters

| Parameter | Default | Range | Notes |
|-----------|---------|-------|-------|
| `guidance_scale` | 3.5 | 1-7 | 3-5 for quality; higher = stricter |
| `num_inference_steps` | 50 | 20-100 | 50 is standard |
| `caption_upsample_temperature` | 0.15 | 0-1 | Improves prompt understanding |

##### 1.5 Example Prompt

```
A weathered detective in a rain-soaked Tokyo alley at night, #FF6B35 neon signs 
reflecting in puddles, shot with 85mm lens at f/1.8, cinematic film grain, 
shallow depth of field, Blade Runner aesthetic, high contrast shadows
```

---

#### 2. QWEN-IMAGE (Alibaba Tongyi Lab)

**Released:** December 2025 (Qwen-Image-2512)  
**License:** Open-source  
**Architecture:** Multimodal Diffusion Transformer (MMDiT)

##### 2.1 Prompt Structure

Qwen uses **positional token processing** - front-loaded subjects receive most attention:

```
Subject, Style, Details, Composition, Lighting
```

**Key Principles:**
- **Front-load primary subjects** - first tokens get priority
- Use 1-3 sentences; detailed but not overloaded
- Supports **weighted elements**: `(mountains:1.5)`
- Put exact text in **double quotes**: `"Grand Opening"`
- Supports negative prompts for unwanted elements

##### 2.2 Parameters

| Parameter | Default | Recommended | Notes |
|-----------|---------|-------------|-------|
| `guidance_scale` | 4.0 | 4-7 (production) | Lower = more creative |
| `num_inference_steps` | 50 | 25-30 (quick), 50 (final) | Cost proportional to steps |

##### 2.3 Supported Aspect Ratios

| Ratio | Dimensions |
|-------|------------|
| 1:1 | 1328×1328 |
| 16:9 | 1664×928 |
| 9:16 | 928×1664 |
| 4:3 | 1472×1104 |
| 3:2 | 1584×1056 |

##### 2.4 Example Prompt

```
A middle-aged detective in a dimly lit jazz club, film noir style, 
(dramatic shadows:1.3), warm amber lighting from table lamp, 
soft bokeh background, contemplative mood, "WHISKEY" neon sign visible
```

**Negative Prompt:**
```
低分辨率, 低画质, 肢体畸形, 手指畸形, 画面过饱和, AI感
(low resolution, low quality, deformed limbs, deformed fingers, oversaturated, AI look)
```

---

#### 3. STABLE DIFFUSION 3.5 (Stability AI)

**Released:** 2024-2025  
**License:** Stability AI Community License

##### 3.1 Prompt Structure

Similar to SDXL with weighted tokens:

```
[Quality], [Subject], [Action], [Environment], [Lighting], [Camera], [Style]
```

**Weight Syntax:** `(keyword:weight)` where 1.0 is default

##### 3.2 Recommended Quality Tokens

```
masterpiece, best quality, highly detailed, professional photography, 
8K UHD, RAW photo, cinematic lighting
```

**Negative:**
```
(worst quality:1.4), (low quality:1.4), cartoon, illustration, anime,
blurry, watermark, text, oversaturated
```

---

### VIDEO GENERATION: OPEN-SOURCE

#### 1. WAN 2.2 (Alibaba)

**Released:** 2025  
**License:** Open-source  
**Architecture:** Mixture-of-Experts (MoE)

##### 1.1 Model Variants

| Model | Parameters | Function | VRAM |
|-------|------------|----------|------|
| **Wan2.2-TI2V-5B** | 5B | Text & Image to Video | ~12GB |
| **Wan2.2-T2V-A14B** | 14B | Text to Video | ~24GB+ |
| **Wan2.2-I2V-A14B** | 14B | Image to Video | ~24GB+ |
| **Wan2.2-S2V** | - | Audio-Driven Video | ~24GB+ |

##### 1.2 Prompt Structure (CRITICAL)

Wan 2.2 requires **highly detailed prompts** (80-120 words) due to MoE architecture. Vague prompts = random "cinematic chaos."

**Framework:**
```
Shot Order → Camera Motion → Character/Action → Environment → Constraints
```

**Key Principles:**
- **Over-specify everything** - the model fills gaps with random cinematic elements
- CFG=1 workflows **disable negative prompts** - use positive constraints
- Lead with what camera sees FIRST
- Describe motion explicitly: "camera slowly pans left revealing..."
- Include timing: "over 3 seconds", "gradually", "sudden"

##### 1.3 Camera Control Keywords

Wan2.2 Fun Camera Control model supports:

| Motion | Keywords |
|--------|----------|
| **Pan** | Pan Up, Pan Down, Pan Left, Pan Right |
| **Zoom** | Zoom In, Zoom Out |
| **Combined** | Pan Left + Zoom In, etc. |
| **Static** | Static (no motion) |

##### 1.4 ComfyUI Parameters

| Parameter | Default | Notes |
|-----------|---------|-------|
| `width/height` | 1280×720 | 720p max for 14B |
| `length` | 81 frames | Number of frames |
| `speed` | 1.0 | Video speed multiplier |
| `sampler` | DDIM | DDIM + uniform scheduler if blocky frames |
| `steps` | 20 | 2-4 with COVID LoRA for speed |

##### 1.5 Example Prompt (Image-to-Video)

```
Opening shot: The detective stands motionless in the rain-soaked alley. 
Camera slowly pushes in over 3 seconds, maintaining eye-level angle. 
Neon signs flicker in the background, casting pink and blue reflections 
on wet cobblestones. The subject's trench coat drips water; he does NOT 
move his hands or turn his head. Rain particles visible in foreground. 
Atmospheric fog diffuses the distant streetlight. The mood is tense, 
noir, contemplative. No sudden movements, no other characters enter frame.
```

---

#### 2. HUNYUAN VIDEO (Tencent)

**Released:** 2024-2025  
**License:** Open-source  
**Parameters:** 13B (original), 8.3B (v1.5 lightweight)

##### 2.1 Model Variants

| Model | Parameters | VRAM | Features |
|-------|------------|------|----------|
| **HunyuanVideo** | 13B | High | T2V, I2V |
| **HunyuanVideo 1.5** | 8.3B | 24GB | Consumer GPU friendly, 720p native |

##### 2.2 Key Features

- **Dual-stream to Single-stream Transformer** for unified image/video
- **MLLM text encoder** (better than CLIP/T5)
- **3D VAE** for efficient video compression
- **Prompt Rewrite model** with Normal/Master modes

##### 2.3 Prompt Modes

| Mode | Description |
|------|-------------|
| **Normal Mode** | Improves model understanding of instructions |
| **Master Mode** | Prioritizes visual quality (may ignore text details) |

##### 2.4 ComfyUI Parameters

| Parameter | Notes |
|-----------|-------|
| `embedded_guidance_scale` | Default 6.0 - controls prompt strength |
| `text_encoder` | llava_llama3 + clip_l required |
| `vae` | hunyuan_video_vae_bf16 |

##### 2.5 Example Prompt

```
A lone samurai walks through a misty bamboo forest at dawn. 
Volumetric light rays pierce through the canopy, creating 
god rays that illuminate floating particles. The samurai's 
robes billow gently in the breeze. Camera tracks alongside 
at waist height. Cinematic color grading with teal shadows 
and amber highlights. Atmospheric, contemplative, epic.
```

---

#### 3. COGVIDEOX (THUDM/Z.ai)

**Released:** 2024-2025  
**License:** Open-source  
**Architecture:** Diffusion Transformer

##### 3.1 Model Variants

| Model | Parameters | Function |
|-------|------------|----------|
| **CogVideoX-2B** | 2B | Entry-level T2V |
| **CogVideoX-5B** | 5B | Higher quality T2V |
| **CogVideoX-5B-I2V** | 5B | Image to Video |

##### 3.2 Prompt Guidelines

- **Prompt Language:** English only
- **Token Limit:** 224-226 tokens
- **Optimization:** Use LLMs (GPT-4, GLM-4) to expand prompts
- **Long prompts work best** - model trained on detailed descriptions

##### 3.3 ComfyUI Parameters

| Parameter | Default | Notes |
|-----------|---------|-------|
| `num_frames` | 49 | Total frames |
| `num_inference_steps` | 50 | Quality vs speed |
| `guidance_scale` | 6.0 | Prompt adherence |
| `use_dynamic_cfg` | True | Improves consistency |

##### 3.4 Example Prompt

```
A panda, dressed in a small red jacket and tiny hat, sits on a 
wooden stool in a serene bamboo forest. The panda's fluffy paws 
strum a miniature acoustic guitar, producing soft, melodic tunes. 
Nearby, other pandas gather, watching curiously. Soft natural 
lighting filters through bamboo leaves. Peaceful, whimsical atmosphere.
```

---

#### 4. MOCHI (Genmo)

**Released:** October 2024  
**License:** Apache 2.0 (fully open)  
**Parameters:** 10B (AsymmDiT architecture)

##### 4.1 Key Features

- **Fully open** under Apache 2.0
- Optimized for **consumer GPUs** (< 24GB VRAM)
- Strong **prompt adherence** and motion quality
- Uses T5-XXL text encoder

##### 4.2 ComfyUI Parameters

| Parameter | Recommended | Notes |
|-----------|-------------|-------|
| `steps` | 75 | Sweet spot: 50-100 |
| `cfg` | 4.5-7.0 | Higher = more prompt adherence |
| `video_size` | 480 | Only 480p supported in Mochi 1 |
| `sampler` | Euler | Simple scheduler |

##### 4.3 Example Prompts

```
A calming nature walk through a beautiful autumn forest.

The underground world of ants building their complex colony.

A time-lapse of a seed growing into a towering tree in a forest.

The vibrant nightlife of a coral reef under a full moon.
```

---

#### 5. LTX-VIDEO / LTX-2 (Lightricks)

**Released:** 2024-2025 (LTX-2 latest)  
**License:** Open-source  
**Architecture:** DiT-based

##### 5.1 Key Features

- **Real-time generation** (30 FPS)
- **Audio support** in LTX-2 (dialogue, ambient sound)
- Benefits from **long descriptive prompts**
- Native 720p, upscalable to 1080p

##### 5.2 Prompt Structure (5 Elements)

```
1. Establish the Shot (cinematography terms)
2. Set the Scene (lighting, color, atmosphere)
3. Describe the Action (natural sequence)
4. Define Characters (physical cues)
5. Identify Camera Movements
6. Describe Audio (dialogue in quotes)
```

**Key Principles:**
- Write as **single flowing paragraph**
- Use **present tense**
- Keep under **200 words**
- Start directly with action
- Be literal and precise

##### 5.3 Helpful Terms

| Category | Terms |
|----------|-------|
| **Animation** | cel-shaded, stop-motion, rotoscope |
| **Cinematic** | film grain, anamorphic, IMAX, Panavision |
| **Lighting** | golden hour, chiaroscuro, neon-lit, volumetric |
| **Sound** | "dialogue in quotes", ambient rain, orchestral score |

##### 5.4 ComfyUI Parameters

| Parameter | Notes |
|-----------|-------|
| `resolution` | 720p base, upscale pass to 1080p |
| `frame_count` | Configure per workflow |
| `frame_rate` | 30 FPS default |
| `cfg` | Guidance strength |
| `steps` | Sampling steps |

##### 5.5 Example Prompt (with Audio)

```
A medium shot in a dimly lit interrogation room. The seasoned detective 
leans forward and says: "Your story has holes." The nervous informant, 
sweating under a single bare bulb, replies: "I'm telling you everything 
I know." A wall clock ticks slowly in the background. Rain patters 
against the window. The camera slowly pushes in on the detective's 
skeptical expression. High contrast lighting, deep shadows, noir atmosphere.
```

---

#### 6. NANO BANANA (Google Gemini API)

**Note:** This is an **API-based model** (Google Gemini 2.5 Flash Image / Gemini 3 Pro Image), not locally runnable, but accessible via ComfyUI Partner Nodes.

##### 6.1 Features

- Studio-grade quality
- 4K content generation
- Advanced text rendering (10+ languages)
- High-resolution blending (up to 14 images)
- Strong character consistency

##### 6.2 ComfyUI Access

Access via **Google Gemini** Partner Nodes in ComfyUI:
- Requires API credits
- No local VRAM required
- Works well as keyframe generator for Wan 2.2 workflows

---

### OPEN-SOURCE MODEL COMPARISON

| Model | Type | Params | License | VRAM | Strengths |
|-------|------|--------|---------|------|-----------|
| **FLUX.2** | Image | 32B | Open weights | 12-24GB | Photorealism, text, HEX colors |
| **Qwen-Image** | Image | - | Open | ~12GB | Weighted prompts, multilingual |
| **Wan 2.2** | Video | 5-14B | Open | 12-24GB | Cinematic control, camera |
| **HunyuanVideo** | Video | 8-13B | Open | 24GB | Quality, prompt rewrite |
| **CogVideoX** | Video | 2-5B | Open | 12-24GB | Entry-level, motion |
| **Mochi** | Video | 10B | Apache 2.0 | <24GB | Fully open, consumer HW |
| **LTX-2** | Video | - | Open | - | Real-time, audio support |

---

### COMFYUI WORKFLOW INTEGRATION

#### Model Download Locations

```
ComfyUI/
├── models/
│   ├── checkpoints/          # Full model checkpoints
│   ├── diffusion_models/     # UNet/DiT weights
│   ├── text_encoders/        # CLIP, T5, LLaVA
│   ├── vae/                   # VAE models
│   └── loras/                 # LoRA adapters
```

#### Recommended Precision by VRAM

| VRAM | Precision | Notes |
|------|-----------|-------|
| 8-12GB | FP8, GGUF Q4/Q5 | Lower quality, faster |
| 16-24GB | FP8, BF16 | Good balance |
| 24GB+ | BF16, FP32 | Best quality |

---

## DOCUMENT END

**Next Steps:**
1. Implement prompt formatter for each model
2. Create LLM enhancement layer for natural language conversion
3. Build model selection UI
4. Test outputs across all models

**Version History:**
- 1.0 (Jan 17, 2026): Initial comprehensive guide
- 1.1 (Jan 17, 2026): Added open-source models section (FLUX.2, Qwen-Image, Wan 2.2, HunyuanVideo, CogVideoX, Mochi, LTX-2, Nano Banana)
