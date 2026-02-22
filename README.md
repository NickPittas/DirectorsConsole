<p align="center">
  <h1 align="center">🎬 Director's Console</h1>
  <p align="center">
    <strong>A unified AI VFX production pipeline for cinematographically accurate image and video generation</strong>
  </p>
  <p align="center">
    <em>Project Eliot</em>
  </p>
</p>

---

Director's Console combines a **Cinema Prompt Engineering (CPE)** rules engine, a **Storyboard Canvas** for visual production planning, a **Gallery** for browsing, organizing, and managing all project media, and an **Orchestrator** for distributed rendering across multiple ComfyUI nodes. Every prompt it generates is grounded in real-world cinematography — real cameras, real lenses, real film stocks, real lighting equipment — ensuring that only what is **physically and historically possible** can be configured.

## Table of Contents

- [Key Features](#key-features)
- [Screenshots](#screenshots)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Storyboard Canvas](#storyboard-canvas)
  - [Canvas Overview](#canvas-overview)
  - [Panels](#panels)
  - [Image Viewer & Compare](#image-viewer--compare)
  - [Project Management](#project-management)
  - [Printing](#printing)
- [Gallery](#gallery)
  - [File Browser & Media Viewer](#file-browser--media-viewer)
  - [Batch Operations](#batch-operations)
  - [Ratings, Tags & Search](#ratings-tags--search)
  - [Storyboard Integration](#storyboard-integration)
- [ComfyUI Integration](#comfyui-integration)
  - [Node Manager](#node-manager)
  - [Workflows](#workflows)
  - [Multi-Node Rendering](#multi-node-rendering)
- [Cinema Prompt Engineering (CPE)](#cinema-prompt-engineering-cpe)
  - [How It Works](#how-it-works)
  - [The Rules Engine](#the-rules-engine)
  - [Live-Action Film Presets](#live-action-film-presets)
  - [Animation Presets](#animation-presets)
  - [AI-Enhanced Prompts](#ai-enhanced-prompts)
- [AI LLM Provider Setup](#ai-llm-provider-setup)
  - [API Key Providers](#api-key-providers)
  - [OAuth Providers](#oauth-providers)
  - [Local LLM Providers](#local-llm-providers)
- [Technical Reference](#technical-reference)
  - [Cameras](#cameras)
  - [Lenses](#lenses)
  - [Film Stocks](#film-stocks)
  - [Lighting](#lighting)
  - [Camera Movement](#camera-movement)
  - [Shot Sizes & Composition](#shot-sizes--composition)
- [Architecture](#architecture)
- [Development](#development)
- [License](#license)

---

## Key Features

- **Cinematographic Accuracy** — Every configuration is validated against real-world constraints. You cannot pair a Panavision lens with a non-Panavision camera. You cannot use LED lighting in a 1960s film. You cannot handheld an IMAX camera. The rules engine enforces what is physically possible.

- **67 Live-Action Film Presets** — From *Metropolis* (1927) to *Parasite* (2019), each preset loads the actual camera, lens, film stock, lighting, and aspect ratio used in that production.

- **43 Animation Presets** — Studio Ghibli, Akira, Spider-Verse, Pixar, Arcane, and more. Each with accurate style domain, rendering pipeline, motion characteristics, and visual grammar.

- **Storyboard Canvas** — Free-floating infinite canvas with draggable, resizable panels. Per-panel workflows, image history with navigation, star ratings, markdown notes, and multi-select alignment tools.

- **Gallery Tab** — Full-featured media browser for all project files. Folder tree navigation, grid/masonry/list/timeline views, batch rename with regex and templates, drag-and-drop file moves, trash with restore, ratings, color tags, PNG metadata search, duplicate detection, and direct integration with Storyboard (send reference images, restore workflow parameters from metadata).

- **Recent Projects** — Quick access to your last 10 projects from the main menu. Hover to see project path and last-opened time. Individual entries can be removed.

- **Video Generation Support** — Full pipeline support for AI video workflows (Wan 2.2, CogVideoX, HunyuanVideo, etc.). Videos are detected from ComfyUI outputs (`images`, `gifs`, `videos` keys), saved with correct extensions, displayed inline with `<video>` playback, and persisted across project save/reload.

- **Multi-Node ComfyUI Rendering** — Connect multiple ComfyUI backends and render in parallel. Real-time progress via WebSocket with per-node stage tracking. Node metrics, health monitoring, and one-click restart.

- **Generation Progress Sidebar** — Dedicated sidebar panel showing detailed progress for all active generations. Per-node workflow stage display (e.g., "Loading Checkpoint", "KSampler", "VAE Decode"), multi-phase progress for multi-KSampler workflows, and step counters. Replaces intrusive panel overlays with a minimal bottom bar indicator.

- **AI-Enhanced Prompts** — Connect 13+ LLM providers (OpenAI, Anthropic, Google AI, Ollama, and more) to refine and enhance your cinema prompts with AI assistance.

- **Model-Specific Output** — Prompts are automatically formatted for your target model: Midjourney, FLUX, Stable Diffusion XL, Wan 2.2, Runway Gen-3, CogVideoX, HunyuanVideo, and more.

- **Print Storyboards** — Export your storyboard to print with configurable layouts (1–4 panels per row), page sizes, orientation, and optional panel notes.

---

## Screenshots

### Storyboard Canvas — First Launch
![Storyboard Canvas First Load](Images/Storyboard%20Canvas%20View%20First%20Load.png)

### Storyboard Canvas — Active Project
![Storyboard Canvas with Project](Images/Storyboard%20Canvas%20View%20with%20project%20open.png)

### Project Settings
![Project Settings](Images/Storyboard%20Project%20Settings.png)

### Panel Ratings, Notes & Node Selection
![Panel Ratings and Notes](Images/Storyboard%20Panel%20Ratings-Notes-Node%20Selection.png)

### Image Viewer
![Image Viewer](Images/Storyboard%20Image%20Viewer.png)

### Image Compare
![Image Compare](Images/Storyboard%20Image%20Compare.png)

### Node Manager
![Node Manager](Images/Storyboard%20Node%20Manager.png)

### Node Metrics & Selection
![Node Metrics](Images/Storyboard%20Node%20Metrics%20and%20Selection.png)

### Load Project View
![Load Project](Images/Storyboard%20Load%20Project%20view.png)

### CPE — Live-Action Film Presets
![CPE Movie Presets](Images/CPE%20Movies%20Presets.png)

### CPE — Film Information & Technical Details
![CPE Movie Information](Images/CPE%20Movies%20Information.png)

### CPE — Animation Presets
![CPE Animation Presets](Images/CPE%20Animation%20Presets.png)

### CPE — LLM Provider Configuration
![CPE LLM Providers](Images/CPE%20LLM%20Providers.png)
![CPE LLM Providers Detail](Images/CPE%20LLM%20Providers%202.png)

---

## Installation

### Prerequisites

- **Python 3.10+** (with `pip` or `uv`)
- **Node.js 18+** (with `npm`)
- **ComfyUI** — At least one running instance for image generation
- **Git** (for cloning)

### Setup

```bash
# Clone the repository
git clone https://github.com/NickPittas/DirectorsConsole.git
cd DirectorsConsole

# Run the automated setup
python start.py --setup
```

The `--setup` flag will:
1. Create isolated Python virtual environments for both the CPE backend and the Orchestrator
2. Install all Python dependencies (FastAPI, Pydantic, httpx, loguru, Pillow, cryptography, etc.)
3. Install frontend npm packages
4. Verify all imports are working
5. Report the status of each component

### Manual Setup (if needed)

**CPE Backend:**
```bash
cd CinemaPromptEngineering
python -m venv venv
# Windows
venv\Scripts\activate
# macOS/Linux
source venv/bin/activate

pip install -r requirements.txt
```

**Frontend:**
```bash
cd CinemaPromptEngineering/frontend
npm install
```

**Orchestrator:**
```bash
cd Orchestrator
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate

pip install -r requirements.txt
```

---

## Quick Start

```bash
# Start all services (backend, frontend, orchestrator)
python start.py
```

This launches:

| Service | URL | Description |
|---------|-----|-------------|
| CPE Backend | `http://localhost:9800` | Cinema Prompt Engineering API |
| Storyboard Frontend | `http://localhost:5173` | React UI (opens in browser) |
| Orchestrator | `http://localhost:9820` | Render farm manager |

### Optional Flags

```bash
python start.py --no-orchestrator   # Skip Orchestrator
python start.py --no-frontend       # Skip Frontend (API only)
python start.py --no-browser        # Don't auto-open browser
python start.py --setup             # Verify environment only
```

---

## Storyboard Canvas

### Canvas Overview

The Storyboard Canvas is a free-floating infinite workspace for planning and executing AI-generated visual productions. Panels can be freely positioned, resized, and organized on the canvas with zoom and pan controls.

![Storyboard Canvas](Images/Storyboard%20Canvas%20View%20with%20project%20open.png)

**Canvas Controls:**
- **Zoom**: Mouse wheel (zooms from pointer position)
- **Pan**: Click and drag on empty canvas area
- **Multi-Select**: Ctrl+Click individual panels, or marquee-select by dragging
- **Alignment**: Snap guides appear when holding Shift; alignment toolbar for selected panels
- **Keyboard Shortcuts**: Ctrl+P (Print), Ctrl+S (Save), and more

### Panels

Each panel is an independent production unit with its own:

- **Workflow** — Select any imported ComfyUI workflow per panel
- **Parameters** — Each panel stores its own parameter values (prompt, steps, CFG, sampler, etc.)
- **Image & Video History** — Navigate through all generated images and videos with forward/back arrows. Videos play inline with native `<video>` controls.
- **Star Rating** — Rate images 1–5 stars for quick review
- **Markdown Notes** — Attach production notes with edit/view toggle
- **Panel Name** — Custom names that map to folder structure (e.g., "Hero_Shot" creates `{project}/Hero_Shot/`)
- **Node Selection** — Choose which ComfyUI backend renders this panel

![Panel Features](Images/Storyboard%20Panel%20Ratings-Notes-Node%20Selection.png)

### Image Viewer & Compare

**Image Viewer** — Full-resolution image viewing with zoom and metadata display.

![Image Viewer](Images/Storyboard%20Image%20Viewer.png)

**Image Compare** — Side-by-side comparison of generated images to evaluate iterations.

![Image Compare](Images/Storyboard%20Image%20Compare.png)

### Project Management

Projects are saved with all panel positions, parameters, workflow assignments, ratings, notes, and image references. All generated images are organized in per-panel folders within your project directory.

![Load Project](Images/Storyboard%20Load%20Project%20view.png)

**Project Settings** let you configure:
- Project storage path (local or network/NAS)
- Filename templates with tokens: `{panel}`, `{workflow}`, `{seed}`, `{date}`, etc.
- ComfyUI node addresses
- Auto-save preferences

![Project Settings](Images/Storyboard%20Project%20Settings.png)

### Printing

Print your storyboard with fully configurable layouts:
- **Grid columns**: 1, 2, 3, or 4 panels per row
- **Page size**: A4 or Letter
- **Orientation**: Portrait or Landscape
- **Panel selection**: All panels or only selected
- **Notes**: Optional panel notes display
- Live PDF preview before printing

---

## Gallery

The Gallery is a top-level tab alongside Cinema and Storyboard, providing a full file browser and media management interface for your project's generated images and videos.

### File Browser & Media Viewer

- **Folder Tree** — Hierarchical tree view of your project directory with expand/collapse, file counts, and drag-drop support
- **Multiple View Modes** — Grid (uniform thumbnails), Masonry (Pinterest-style borderless layout with natural aspect ratios), List (detailed table with metadata columns), and Timeline (chronological grouped by date)
- **Lightbox** — Full-resolution image/video viewer with keyboard navigation, zoom, and metadata overlay
- **Compare View** — Side-by-side comparison of selected images
- **Hover Preview** — Large preview tooltip on thumbnail hover
- **Video Scrubber** — Frame-by-frame video scrubbing in the detail panel
- **Breadcrumb Navigation** — Click-through path breadcrumbs for quick folder traversal
- **Thumbnail Sizes** — Adjustable thumbnail size slider in the toolbar

### Batch Operations

- **Batch Rename** — Rename multiple files with templates (`{name}`, `{counter}`, `{date}`, `{parent}`) and optional regex find/replace. Live preview before applying.
- **Auto-Rename** — One-click sequential renaming within a folder (e.g., `Shot_001.png`, `Shot_002.png`, ...)
- **Drag-and-Drop Move** — Drag files between folders in the tree view, with move confirmation dialog
- **Move to New Folder** — Create a new folder and move selected files in one step
- **Trash System** — Soft-delete files to a `.gallery/.trash/` folder with full restore capability. Empty trash permanently deletes.

### Ratings, Tags & Search

- **Star Ratings** — 1-5 star ratings per file, filterable from the filter bar
- **Color Tags** — Create custom named tags with colors, assign to files, filter by tag
- **PNG Metadata Search** — Full-text search across ComfyUI PNG metadata (prompts, models, samplers, seeds, etc.)
- **Duplicate Detection** — Find visually duplicate files by content hash across the project
- **Folder Statistics** — View file counts, total size, media type breakdown per folder
- **Filter Bar** — Filter by rating, tags, file type (image/video), and date range
- **Saved Views** — Save and restore view configurations (sort, filters, layout, folder state)

### Storyboard Integration

The Gallery and Storyboard tabs communicate via cross-tab events:

- **Send as Reference Image** — Right-click any gallery image to send it to the currently selected Storyboard panel as a reference image input
- **Restore Workflow & Parameters** — Right-click an image to extract its ComfyUI generation metadata and restore the workflow, prompt, and all parameters back to the Storyboard
- **Batch Rename Sync** — When files are renamed in the Gallery, the Storyboard automatically updates any panel image references that point to the renamed files
- **Shared Project Context** — Both tabs operate on the same project path, so changes in one are immediately visible in the other

### Storage Architecture

Gallery metadata (ratings, tags, view states) is stored in a JSON flat-file at `{projectPath}/.gallery/gallery.json`. This design was chosen because projects live on NAS storage (CIFS/SMB mounts) where SQLite's file locking is incompatible. The JSON store uses atomic writes (write-to-temp + rename) and thread-safe locking.

---

## ComfyUI Integration

Director's Console communicates **directly** with ComfyUI nodes for image and video generation. The frontend builds workflow JSON and sends it to ComfyUI's REST API, with real-time progress updates via WebSocket. Video outputs are automatically detected from ComfyUI's `images`, `gifs`, and `videos` output keys and saved with the correct file extension.

### Node Manager

Manage your ComfyUI render backends from the Node Manager:

- View node status (online/busy/offline)
- System metrics (VRAM, RAM, queue depth)
- One-click restart (interrupt + free memory)
- Add/remove nodes
- Checkbox selection for multi-node rendering

![Node Manager](Images/Storyboard%20Node%20Manager.png)

### Node Metrics

![Node Metrics](Images/Storyboard%20Node%20Metrics%20and%20Selection.png)

### Workflows

- **Import** any ComfyUI workflow JSON
- **Workflow Parser** automatically extracts editable parameters (prompts, dimensions, steps, CFG, samplers, models, etc.)
- **Per-panel assignment** — each panel can use a different workflow
- **Parameter isolation** — switching workflows resets technical parameters to defaults while preserving prompts and image inputs
- **Categorization** — organize workflows into custom categories

### Model & LoRA Dropdowns

Model and LoRA parameters now feature enhanced dropdown selection:

- **Folder Structure** — Models and LoRAs are organized by their folder hierarchy using `<optgroup>` elements, making it easy to navigate large model libraries (e.g., `Flux/Flux 2/Klein/flux-2-klein-base-9b-fp8.safetensors`)
- **Auto-Selection** — When a workflow is loaded, the dropdown automatically pre-selects the model or LoRA that's currently configured in the workflow
- **Cross-Platform Path Compatibility** — Path separators are automatically normalized, ensuring workflows created on Windows work correctly when submitted to Linux or macOS ComfyUI nodes, and vice versa

**Supported file types for folder grouping:**
- Models: `.safetensors`, `.pt`, `.pth`, `.bin`, `.ckpt`, `.gguf`
- LoRAs: `.safetensors`, `.pt`, `.pth`, `.bin`

### Multi-Node Rendering

When multiple ComfyUI backends are connected:
- Assign specific nodes to specific panels
- Queue jobs across multiple backends in parallel
- Real-time progress sidebar with per-node stage tracking (shows current workflow node: "CheckpointLoaderSimple", "KSampler", "VAEDecode", etc.)
- Multi-phase progress for video workflows with multiple KSamplers (e.g., "Phase 1/2")
- Step counters showing workflow execution progress (e.g., "Step 5/14")
- Global cancel button to interrupt all busy nodes
- Job groups for coordinated parallel execution
- Minimal non-intrusive panel indicator (3px bottom bar + percentage badge)

---

## Cinema Prompt Engineering (CPE)

### How It Works

CPE transforms structured cinematography configurations into optimized AI prompts. Instead of writing free-text prompts, you select from validated menus of real cameras, lenses, lighting setups, and film styles. The system then:

1. **Validates** your configuration against 56+ rules (34 live-action, 22 animation)
2. **Generates** a technically accurate prompt with all selected parameters
3. **Formats** the prompt for your specific target AI model
4. **Optionally enhances** the prompt using an LLM provider for richer description

### The Rules Engine

The rules engine is the core of CPE. It enforces that **only what is physically and historically possible** can be configured. This is not a suggestion system — it is a hard constraint engine.

#### Rule Severity Levels

| Level | Effect | Example |
|-------|--------|---------|
| **HARD** | Blocks the configuration | "Film stock cannot be selected with digital cameras" |
| **WARNING** | Allows but flags as atypical | "Cheerful mood + low-key lighting is unusual" |
| **INFO** | Informational note | "Remember to set 2x de-squeeze in post for anamorphic" |

#### What the Rules Enforce

**Camera & Film Stock Compatibility:**
- Film cameras require a film stock selection; digital cameras cannot have one
- 65mm/70mm film stocks require large format cameras
- IMAX film stocks require IMAX cameras
- Ultra Panavision 70 requires 2.76:1 aspect ratio (and vice versa)

**Lens & Camera Ecosystem:**
- Panavision cameras only accept Panavision lenses (closed ecosystem)
- Panavision lenses require Panavision cameras (Alexa 65 exempt for Primo 70)
- Alexa 65 only accepts 65mm-format lenses (ARRI Prime 65, DNA, Primo 70, Hasselblad V, Vintage Spherical)
- Large Format cameras (Alexa LF/Mini LF) cannot use S35-only lenses (vignetting)

**Physical Movement Constraints:**
- Heavy cameras (>4kg) cannot be handheld, mounted on gimbals, or flown on drones
- Medium cameras cause operator fatigue warnings for handheld
- Jib cranes only allow Crane Up/Down, Arc, and Static movements
- Drones are limited to Track In/Out, Crane Up/Down, Arc, and Static
- Dolly zoom requires dolly or slider equipment

**Era-Appropriate Technology:**
- HMI lighting not available before 1972
- Kino Flo not available before 1987
- LED film lighting not available before 2002
- Film presets automatically disallow anachronistic light sources

**Natural Light Physics:**
- Sunlight not available at night
- Moonlight impossible at midday
- Direct sunlight not available during blue hour
- Low-key lighting impossible at midday outdoors

**Composition & Optics:**
- Wide lenses (<35mm) on close-ups cause facial distortion (warning)
- Long lenses (>85mm) on wide shots create heavy compression (warning)
- Vintage lenses may not resolve well on 8K+ sensors (warning)
- Certain compositions conflict with specific shot sizes (e.g., negative space in ECU)

**Animation-Specific Rules:**
- Manga must use monochrome/ink color, locked camera, graphic lighting, no motion, and 2D medium
- Illustration must be static with locked camera
- 2D animation cannot use Free 3D camera
- 3D animation requires volumetric lighting (not flat/minimal)
- Anime cannot use photoreal + naturalistic simulated combo

#### Dynamic Option Filtering

The UI doesn't just validate after the fact — it **proactively disables invalid options** in real-time. When you select a Panavision camera, only Panavision lenses are selectable. When you choose night time, the sun is greyed out. The `get_available_options()` endpoint tests every possible option against your current configuration and returns which ones would cause violations.

---

### Live-Action Film Presets

67 meticulously researched film presets spanning nearly a century of cinema. Each preset encodes the **actual production equipment** used on that film: camera body, film stock, lenses, focal lengths, aspect ratio, lighting style, color tone, mood, compositions, shot sizes, and movement.

![Film Presets](Images/CPE%20Movies%20Presets.png)

![Film Information](Images/CPE%20Movies%20Information.png)

#### Silent Era (1920s)
| Preset | Year | Camera | Film Stock |
|--------|------|--------|------------|
| Metropolis | 1927 | UFA Custom | Eastman Double-X |
| Un Chien Andalou | 1929 | Pathe Studio | Eastman Plus-X |

#### Classic Hollywood & Film Noir (1940s)
| Preset | Year | Camera | Film Stock |
|--------|------|--------|------------|
| The Maltese Falcon | 1941 | Mitchell BNC | Eastman Plus-X |
| Citizen Kane | 1941 | Mitchell BNC | Eastman Plus-X |
| Casablanca | 1942 | Mitchell BNC | Eastman Plus-X |
| Double Indemnity | 1944 | Mitchell BNC | Eastman Plus-X |
| Bicycle Thieves | 1948 | Arriflex 35 | Eastman Plus-X |
| Sunset Boulevard | 1950 | Mitchell BNC | Eastman Plus-X |

#### Japanese & European Cinema (1950s)
| Preset | Year | Camera | Film Stock |
|--------|------|--------|------------|
| Rashomon | 1950 | Mitchell BNC | Eastman Plus-X |
| Tokyo Story | 1953 | Mitchell BNC | Eastman Plus-X |
| Seven Samurai | 1954 | Mitchell BNC | Eastman Plus-X |
| The Seventh Seal | 1957 | Arriflex 35 | Eastman Plus-X |
| Vertigo | 1958 | Mitchell BNC | Eastman 5247 |

#### New Wave & 1960s Cinema
| Preset | Year | Camera | Film Stock |
|--------|------|--------|------------|
| Breathless | 1960 | Eclair NPR | Eastman Plus-X |
| La Dolce Vita | 1960 | Arriflex 35 | Eastman 5247 |
| Lawrence of Arabia | 1962 | Super Panavision 70 | Kodak 65mm 250D |
| Jules et Jim | 1962 | Eclair NPR | Eastman Plus-X |
| Harakiri | 1962 | Mitchell BNC | Eastman Plus-X |
| Persona | 1966 | Arriflex 35BL | Eastman 5254 |
| The Battle of Algiers | 1966 | Arriflex 35 | Eastman Plus-X |
| 2001: A Space Odyssey | 1968 | Super Panavision 70 | Kodak 65mm 200T |

#### New Hollywood & 1970s
| Preset | Year | Camera | Film Stock |
|--------|------|--------|------------|
| A Clockwork Orange | 1971 | Arricam ST | Eastman 5254 |
| The French Connection | 1971 | Arriflex 35BL | Eastman 5254 |
| The Godfather | 1972 | Arriflex 35BL | Eastman 5254 |
| Solaris | 1972 | Arriflex 35 | Eastman 5250 |
| Chinatown | 1974 | Panavision Panaflex | Eastman 5247 |
| Barry Lyndon | 1975 | Arricam ST | Eastman 5247 |
| One Flew Over the Cuckoo's Nest | 1975 | Arriflex 35BL | Eastman 5247 |
| The Mirror | 1975 | Arriflex 35 | Eastman 5250 |
| Taxi Driver | 1976 | Arriflex 35BL | Eastman 5247 |
| Star Wars | 1977 | Panavision Panaflex | Eastman 5247 |
| Alien | 1979 | Panavision Panaflex | Eastman 5247 |
| Apocalypse Now | 1979 | Arriflex 35BL | Eastman 5247 |
| Stalker | 1979 | Arriflex 35 | Eastman 5250 |

#### 1980s
| Preset | Year | Camera | Film Stock |
|--------|------|--------|------------|
| Blade Runner | 1982 | Panavision Panaflex | Eastman 5293 |
| Brazil | 1985 | Arriflex 35BL | Eastman 5293 |
| Come and See | 1985 | Arriflex 35 | Eastman 5250 |
| Blue Velvet | 1986 | Arriflex 35BL | Eastman 5293 |

#### 1990s
| Preset | Year | Camera | Film Stock |
|--------|------|--------|------------|
| Schindler's List | 1993 | Arricam ST | Kodak Double-X 5222 |
| Pulp Fiction | 1994 | Panavision Platinum | Kodak Vision 500T 5279 |
| The Shawshank Redemption | 1994 | Arricam ST | Kodak Vision 500T 5279 |
| La Haine | 1995 | Arriflex 35BL | Kodak Double-X 5222 |
| Heat | 1995 | Panavision Platinum | Kodak Vision 500T 5279 |
| The Thin Red Line | 1998 | Arricam ST | Kodak Vision 500T 5279 |
| The Matrix | 1999 | Panavision Millennium | Kodak Vision 500T 5279 |
| Eyes Wide Shut | 1999 | Arricam ST | Kodak Vision 500T 5279 |

#### 2000s
| Preset | Year | Camera | Film Stock / Format |
|--------|------|--------|---------------------|
| In the Mood for Love | 2000 | Arricam ST | Fuji Eterna 500T |
| Requiem for a Dream | 2000 | Arriflex 435 | Kodak Vision 500T 5279 |
| Mulholland Drive | 2001 | Panavision Millennium | Kodak Vision 500T 5279 |
| Amélie | 2001 | Arricam ST | Fuji Eterna 500T |
| Oldboy | 2003 | Arricam ST | Kodak Vision2 500T 5218 |
| Memories of Murder | 2003 | Arricam ST | Kodak Vision2 500T 5218 |
| Children of Men | 2006 | Arricam ST | Kodak Vision3 500T 5219 |
| No Country for Old Men | 2007 | Arricam ST | Kodak Vision3 500T 5219 |
| There Will Be Blood | 2007 | Panavision Millennium XL2 | Kodak Vision3 500T 5219 |
| The Dark Knight | 2008 | IMAX MSM 9802 / Panavision | IMAX 500T / Kodak Vision3 |
| Enter the Void | 2009 | Arriflex 435 | Kodak Vision3 500T 5219 |

#### 2010s
| Preset | Year | Camera | Format |
|--------|------|--------|--------|
| The Tree of Life | 2011 | Arricam ST | Kodak Vision3 500T 5219 |
| Drive | 2011 | Alexa | Digital |
| Her | 2013 | Alexa XT | Digital |
| Under the Skin | 2013 | Alexa | Digital |
| The Grand Budapest Hotel | 2014 | Arricam ST | Kodak Vision3 500T 5219 |
| Mad Max: Fury Road | 2015 | Alexa XT | Digital |
| Moonlight | 2016 | Alexa Mini | Digital |
| Roma | 2018 | Alexa 65 | Digital |
| The Lighthouse | 2019 | Arricam ST | Kodak Double-X 5222 |
| Parasite | 2019 | Alexa 65 | Digital |

---

### Animation Presets

43 animation presets across four style domains, each with curated rendering pipelines, motion characteristics, and visual grammars.

![Animation Presets](Images/CPE%20Animation%20Presets.png)

#### Anime (22 presets)
Studio Ghibli, Akira, Ghost in the Shell, Evangelion, Makoto Shinkai, Kyoto Animation, MAPPA, Wit Studio, Ufotable, Studio Trigger, Gainax, Satoshi Kon, Cowboy Bebop, Samurai Champloo, Mob Psycho 100, One Punch Man, Cyberpunk Edgerunners, Violet Evergarden, Attack on Titan, Death Note, Fullmetal Alchemist Brotherhood, Steins;Gate

#### Manga (6 presets)
Shonen, Dark Seinen, Shojo, Josei, Horror Manga, Slice of Life Manga

#### 3D Animation (8 presets)
Pixar, DreamWorks, Disney 3D, Arcane, Spider-Verse, Unreal Cinematic, Blender Stylized, Stop Motion

#### Illustration (7 presets)
Concept Art, Editorial Illustration, Book Illustration, Western Comics, Graphic Novel, Watercolor, Digital Painting

Each preset configures: **medium** (2D / 3D / Hybrid / Stop Motion), **style domain**, **line treatment** (clean / variable / inked / sketchy), **color application** (flat / cel / soft / painterly), **lighting model** (symbolic / graphic / naturalistic), **surface detail**, **motion style** (limited / full / exaggerated / fluid), and **virtual camera** behavior.

---

### AI-Enhanced Prompts

Beyond rule-based generation, CPE can send your structured prompt to an LLM for enrichment. The LLM adds:
- Atmospheric detail and environmental description
- Character and object specifics
- Narrative context
- Model-optimized phrasing

**Model-Specific Formatting:**

| Target Model | Type | Strategy |
|--------------|------|----------|
| Midjourney | Image | Comma-separated keywords + `--v 6 --q 2` parameters |
| FLUX | Image | Natural language sentences, no negative prompts |
| SDXL / Stable Diffusion | Image | Comma-separated keywords with weights |
| Wan 2.2 | Video | 80–120 words, over-specified, padded with detail |
| Runway Gen-3 | Video | Natural language, lowercase |
| CogVideoX | Video | Concise, max 15 parts (224 token limit) |
| HunyuanVideo | Video | Capitalized sentences |
| LTX-2 | Video | 200 word limit |

---

## AI LLM Provider Setup

Director's Console supports 13+ LLM providers for AI-enhanced prompt generation. All credentials are stored **locally** in an encrypted database (`%APPDATA%/CinemaPromptEngineering/credentials.db`) using Fernet encryption. **No credentials are stored in the source code or environment files.**

![LLM Providers](Images/CPE%20LLM%20Providers.png)
![LLM Provider Setup](Images/CPE%20LLM%20Providers%202.png)

### API Key Providers

These providers require an API key, which you enter directly in the Settings panel:

| Provider | How to Get a Key | Models |
|----------|------------------|--------|
| **OpenAI** | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | GPT-4o, GPT-4 Turbo, DALL-E 3 |
| **Anthropic** | [console.anthropic.com](https://console.anthropic.com) | Claude 3.5 Sonnet, Claude 3 Opus |
| **Google AI** | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | Gemini Pro, Gemini Ultra, Imagen |
| **OpenRouter** | [openrouter.ai/keys](https://openrouter.ai/keys) | Multi-model aggregator (100+ models) |
| **Replicate** | [replicate.com/account/api-tokens](https://replicate.com/account/api-tokens) | FLUX, SDXL, open-source models |
| **Stability AI** | [platform.stability.ai](https://platform.stability.ai) | Stable Diffusion, SDXL |
| **fal.ai** | [fal.ai/dashboard](https://fal.ai/dashboard) | Fast FLUX/SDXL/video inference |
| **Together AI** | [api.together.xyz](https://api.together.xyz) | Open-source fast inference |
| **GitHub Models** | GitHub Personal Access Token (PAT) | GPT-4o, Claude, Llama via GitHub |

**To add an API key provider:**
1. Open **Settings** (gear icon in the menu)
2. Find the provider in the list
3. Enter your API key
4. Click **Test** to verify the connection
5. The key is immediately encrypted and stored locally

### OAuth Providers

These providers use OAuth authentication flows. You must supply your own **Client ID** (and Client Secret where required):

| Provider | Flow Type | Requires Client Secret |
|----------|-----------|----------------------|
| **Antigravity** (Google AI) | Authorization Code + PKCE | Yes |
| **OpenAI Codex** | Authorization Code + PKCE | No |

**To set up an OAuth provider:**
1. Open **Settings** → find the provider
2. Enter the **Client ID** (required)
3. Enter the **Client Secret** if required (Antigravity only)
4. Click **Connect** — this opens a browser window for OAuth authorization
5. After authorization, the access token is encrypted and stored locally
6. Tokens auto-refresh when expired

### Local LLM Providers

No API key needed — these connect to LLMs running on your machine:

| Provider | Default URL | Notes |
|----------|-------------|-------|
| **Ollama** | `http://localhost:11434` | Auto-detected when running |
| **LM Studio** | `http://localhost:1234` | OpenAI-compatible API |

Just start the local LLM server and Director's Console will detect it automatically.

> **Note for Ollama users:** If you encounter issues, ensure you're using the latest Ollama version. Model names with tags (e.g., `llama3:latest`) are supported. Embedding models are automatically filtered from the chat model list.

---

## Technical Reference

### Cameras

**49 camera bodies** across 14 manufacturers, classified by weight for movement constraint enforcement:

<details>
<summary><strong>Digital Cameras</strong></summary>

| Manufacturer | Bodies |
|-------------|--------|
| ARRI | Alexa 35, Alexa Mini, Alexa Mini LF, Alexa LF, Alexa 65, Alexa, Alexa XT |
| RED | V-Raptor, V-Raptor X, V-Raptor XL, Komodo-X, Monstro 8K, RED One |
| Sony | Venice 2, FX9, FX6 |
| Canon | C700 FF, C500 Mark II, C300 Mark III |
| Blackmagic | Ursa Mini Pro 12K, Pocket 6K |
| Panasonic | VariCam LT, S1H |
| Nikon | Z9 |
| DJI | Inspire 3, Mavic 3 Cine |

</details>

<details>
<summary><strong>Film Cameras</strong></summary>

| Manufacturer | Bodies |
|-------------|--------|
| ARRI Film | Arricam ST, Arricam LT, ARRI 535B, ARRI 35BL, ARRI 35 III, Arriflex 35, Arriflex 35BL, Arriflex 435 |
| Panavision | Millennium XL2, Millennium, Platinum, Gold, Panastar, Panaflex, Super Panavision 70, Ultra Panavision 70, XL |
| Mitchell | BNC, BNCR, BFC 65 |
| Eclair | NPR |
| IMAX | MSM 9802, MKIV, GT |
| Vintage | UFA Custom, Pathe Studio |

</details>

**Camera types:** Digital, Film  
**Sensor sizes:** Super 35, Full Frame, Large Format, 65mm, Micro Four Thirds, Film 35mm, Film 65mm, Film 70mm, IMAX 15/70, IMAX GT  
**Weight classes:** Ultra Light (<2kg), Light (2–3kg), Medium (3–4kg), Heavy (>4kg)

### Lenses

**47 lens families** from 19 manufacturers:

<details>
<summary><strong>Full Lens List</strong></summary>

| Manufacturer | Families |
|-------------|----------|
| ARRI | Signature Prime, Master Prime, Ultra Prime, Prime 65, Prime DNA |
| Zeiss | Supreme Prime, Master Prime, CP.3, Super Speed, Standard Speed, Ultra Prime, Planar, Planar f/0.7 |
| Cooke | S7/i, S4/i, Anamorphic/i, Panchro/i Classic, Speed Panchro |
| Panavision | Primo, Primo 70, Anamorphic, C Series, E Series, Sphero, Ultra Speed |
| Leica | Summilux-C, Summicron-C, Thalia |
| Canon | Sumire Prime, CN-E, K35 |
| Sony | CineAlta |
| Sigma | Cine, High Speed |
| Angénieux | Optimo, EZ, HR |
| Vintage | Bausch & Lomb Super Baltar, Bausch & Lomb Baltar, Todd-AO, Hawk V-Lite, Hawk V-Plus, Vintage Anamorphic, Vintage Spherical |
| Hasselblad | HC, V |
| IMAX | IMAX Optics |

</details>

**Mount types:** PL, LPL, XPL, Panavision, Mitchell BNC, IMAX  
**Focal length range:** 8mm – 1200mm  
**Aspect ratios:** 1.33:1, 1.37:1, 1.43:1, 1.66:1, 1.78:1, 1.85:1, 1.90:1, 2.20:1, 2.35:1, 2.39:1, 2.76:1

### Film Stocks

**31 film stocks** spanning the entire history of motion picture photography:

<details>
<summary><strong>Full Film Stock List</strong></summary>

| Category | Stocks |
|----------|--------|
| **Kodak Vision3** (current) | 500T 5219, 250D 5207, 200T 5213, 50D 5203 |
| **Kodak Vision2** | 500T 5218, 200T 5217 |
| **Kodak Vision** | 500T 5279, 320T 5277 |
| **Black & White** | Kodak Double-X 5222, Kodak Tri-X, Eastman Double-X, Eastman Plus-X |
| **Historic Color** | Eastman 5247, 5293, 5294, 5250, 5254, Technicolor, Kodachrome |
| **Fuji** | Eterna 500T, Eterna 250D, Eterna 250T |
| **65mm / 70mm** | Kodak 65mm 500T, 65mm 250D, 65mm 200T |
| **IMAX** | 500T, 250D |

</details>

### Lighting

**24 lighting sources** with era-appropriate constraints:

| Category | Sources | Era Restriction |
|----------|---------|----------------|
| **Natural** | Sun, Moon, Overcast, Window, Skylight | — |
| **Classic** | Tungsten, Carbon Arc, Mercury Vapor, Sodium Vapor | Carbon Arc: 1895–1960s |
| **Modern** | HMI, Kino Flo, LED, Fluorescent | HMI: 1972+, Kino Flo: 1987+, LED: 2002+ |
| **Practical** | Practical Lights, Candle, Firelight, Neon, Television, Computer Screen | Neon: 1927+ |
| **Mixed** | Mixed, Available Light | — |

**20 lighting styles:** High Key, Low Key, Soft, Hard, Naturalistic, Expressionistic, Chiaroscuro, Rembrandt, Split, Rim, Silhouette, Motivated, Practical Motivated, Available Light, High Contrast, Controlled, Flat, Dramatic

### Camera Movement

**16 movement equipment types** with physics-based constraints:

| Equipment | Notes |
|-----------|-------|
| Static | Tripod-mounted, no movement |
| Handheld | Limited to Ultra Light and Light cameras |
| Shoulder Rig | All weight classes with fatigue warnings |
| Steadicam | Smooth tracking, most weight classes |
| Gimbal | Electronic stabilization, light cameras only |
| Dolly / Dolly Track | Ground-level tracking shots |
| Slider | Short-range smooth movements |
| Crane | Full vertical and horizontal range |
| Jib | Limited to Crane Up/Down, Arc, Static |
| Technocrane | Precision remote-controlled crane |
| Motion Control | Repeatable programmed moves |
| Drone | Aerial, limited movements, light cameras only |
| Cable Cam | Suspended cable system |
| Car Mount | Vehicle-mounted for driving shots |
| SnorriCam | Body-mounted, actor-facing |

**31 movement types:** Static, Pan, Tilt, Pan & Tilt, Track In/Out, Push In, Pull Back, Truck Left/Right, Crab, Arc, Crane Up/Down, Boom Up/Down, Dolly Zoom, Push-Pull, Zoom In/Out, Crash Zoom, Roll, Whip Pan/Tilt, Follow, Lead, Orbit, Reveal, Fly Through

**6 timing options:** Static, Very Slow, Slow, Moderate, Fast, Whip Fast

### Shot Sizes & Composition

**12 shot sizes:** Extreme Wide Shot (EWS), Wide Shot (WS), Medium Wide Shot (MWS), Medium Shot (MS), Medium Close-Up (MCU), Close-Up (CU), Big Close-Up (BCU), Extreme Close-Up (ECU), Over the Shoulder (OTS), POV, American Shot, Italian Shot

**79 composition styles** including: Rule of Thirds, Centered, Symmetrical, Golden Ratio, Golden Spiral, Dynamic Symmetry, Leading Lines, Frame Within Frame, Negative Space, Depth Layering, and many more.

**81 mood options** across positive, neutral, tension, dark, and intense categories.

**13 color tones:** Warm Saturated/Desaturated, Cool Saturated/Desaturated, Neutral Saturated/Desaturated, Monochrome, Sepia, Teal & Orange, Cross Processed, Bleach Bypass, High/Low Contrast B&W

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Director's Console                         │
├──────────────┬──────────────┬──────────────┬────────────────┤
│   Storyboard │    Gallery   │  CPE Engine  │  Orchestrator   │
│    Canvas    │  File Browser │ Python/FastAPI│ Python/FastAPI  │
│              │              │  Port 9800    │  Port 9820      │
│   React + TypeScript         │              │                 │
│   Port 5173                  │              │                 │
├──────────────┴──────────────┴──────────────┴────────────────┤
│                                                               │
│  Frontend ←──REST──→ CPE Backend ←──Manifests──→ Orchestrator │
│     │                     │                         │         │
│     │                     │                         │         │
│     └────WebSocket────────┴────Direct REST──→ ComfyUI Nodes   │
│                                                               │
│  Gallery ←──CustomEvents──→ Storyboard (cross-tab comm)       │
│  Gallery ←──REST──→ Orchestrator /api/gallery/* (23 endpoints)│
│                                                               │
├───────────────────────────────────────────────────────────────┤
│  Storage: Project files on local/NAS filesystem                │
│  Gallery metadata: {project}/.gallery/gallery.json (JSON)      │
│  Credentials: %APPDATA%/CinemaPromptEngineering/ (encrypted)  │
└───────────────────────────────────────────────────────────────┘
```

**Key Communication Patterns:**
- **Frontend → ComfyUI**: Direct REST API calls and WebSocket for generation and progress
- **Frontend → CPE Backend**: REST API for prompt generation, validation, presets, settings, credentials
- **Frontend → Orchestrator**: REST API for job groups, backend management, project scanning, gallery operations
- **Gallery ↔ Storyboard**: Cross-tab CustomEvents on `window` for reference images, workflow restore, file rename sync
- **CPE → Orchestrator → ComfyUI**: JSON manifests for distributed rendering

---

## Development

### Running in Development Mode

```bash
# Backend with hot-reload
cd CinemaPromptEngineering
python -m uvicorn api.main:app --host 0.0.0.0 --port 9800 --reload

# Frontend with HMR
cd CinemaPromptEngineering/frontend
npm run dev

# Orchestrator with hot-reload
cd Orchestrator
python -m uvicorn orchestrator.api:app --host 0.0.0.0 --port 9820 --reload
```

### Running Tests

```bash
# All tests
python -m pytest tests/ -v

# Specific test files
python -m pytest tests/test_cpe_api.py -v
python -m pytest tests/test_cinema_rules.py -v
```

### Building for Production

```bash
# Build frontend
cd CinemaPromptEngineering/frontend
npm run build

# Build standalone executable (Windows)
cd CinemaPromptEngineering
.\build_installer.ps1
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite 5, Zustand, TanStack Query v5 |
| Backend | Python 3.10+, FastAPI, Pydantic v2, httpx, aiohttp |
| Rendering | ComfyUI (direct WebSocket) |
| Storage | Local/NAS filesystem, JSON flat-file (Gallery metadata), SQLite (encrypted credentials) |
| Logging | Loguru |

---

## Changelog

### February 22, 2026

**Features:**
- **Gallery Tab**: Full-featured media browser added as a top-level tab alongside Cinema and Storyboard. Includes folder tree navigation, grid/masonry/list/timeline views, batch rename with regex and templates, drag-and-drop file moves, trash with restore, star ratings, color tags, PNG metadata search, duplicate detection, and direct Storyboard integration (send reference images, restore workflow parameters). 23 new API endpoints on the Orchestrator (`/api/gallery/*`). Gallery metadata stored as JSON flat-file (`{project}/.gallery/gallery.json`) for NAS/CIFS compatibility.
- **Recent Projects Menu**: Quick access to last 10 projects from the main menu. Hover to see project path and last-opened time. Individual entries can be removed. Stored in localStorage.
- **Pinterest-Style Masonry View**: Gallery masonry layout redesigned with borderless thumbnails, 4px gaps, no card chrome. Selection uses outline, hover uses opacity fade.

**Bug Fixes:**
- **Send to Storyboard Reference Image**: Fixed endpoint URL (was incorrectly targeting Orchestrator port 9820 instead of CPE backend port 9800) and response field (`data.dataUrl` instead of `data.data`).
- **Batch Rename Storyboard Sync**: Fixed `panel.image` not updating when gallery files are renamed, causing 404 on the canvas.

### February 14, 2026

**Features:**
- **Intelligent Parameter Disable Propagation**: When disabling an image or Lora input, all downstream nodes that depend on it are now automatically disabled. This prevents ComfyUI errors when bypassing inputs that have downstream dependencies (e.g., LoadImage → DWPreprocessor → ControlNetApply → KSampler chain).

**Bug Fixes:**
- **Path Normalization**: Fixed Windows backslash handling in model paths. Paths like `Qwen\model.safetensors` are now correctly converted to `Qwen/model.safetensors` for Linux compatibility.
- **Ollama Integration**: Fixed 405 error by appending `/api/chat` to the endpoint. Model names with `ollama:` prefix are now stripped before sending to the API. Embedding models are filtered from the chat model list.
- **Settings Persistence**: Fixed model ID parsing to correctly handle colons in model names (e.g., `ollama:llama3:latest`).

---

## License

This project is proprietary software. All rights reserved.

---

<p align="center">
  <strong>Director's Console</strong> — Project Eliot<br>
  <em>Because every frame deserves the precision of real cinematography.</em>
</p>
