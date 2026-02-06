# Director's Console — Canvas Overhaul & Critical Fixes Plan

> **Date**: February 6, 2026  
> **Scope**: 9 feature items + ~40 CRITICAL/HIGH code review findings  
> **Approach**: 5 phases, risk-ordered — critical bug fix first, then foundational refactor, then features, then tech debt

---

## Phase 1: Critical File Deletion Bug Fix (URGENT) ✅ COMPLETED

### Root Cause Analysis

Four bugs cause wrong-file deletion after non-sequential image removal:

1. **Single-node generation never stores `savedPath`**: The auto-save IIFE (StoryboardUI.tsx ~L2178-2228) saves files but never calls `setPanels()` to write `result.savedPath` back into `imageHistory` entries. Delete then fails with "image path not found."

2. **Version collision after middle deletion**: The parallel generation path (StoryboardUI.tsx ~L1452) seeds `nextVersionRef` from `imageHistory.length`, not from filesystem scan. After deleting a middle entry (reducing array length), the next generation reuses an existing version number, **overwriting files on disk**.

3. **Dual version computation**: The single-node path computes filesystem version (scan-based) and UI version (`historyLength + idx + 1`) independently. After any divergence, `metadata.version` doesn't match the actual filename.

4. **UI splice is unconditional**: `executeDelete` removes the entry from `imageHistory` even when the backend delete fails — the image disappears from UI but remains on disk.

### Implementation ✅

**1.1** ✅ In single-node auto-save IIFE (StoryboardUI.tsx ~L2373-2379, 2569-2576), added `setPanels()` to write `result.savedPath` back into matching `imageHistory` entry by `entry.id`.

**1.2** ✅ Created unified `getNextVersion()` utility in `project-manager.ts:661` that scans both filesystem and current `imageHistory` for highest version, returns `max(filesystem, history) + 1`.

**1.3** ✅ Replaced both single-node (line 2373) and parallel generation paths' version computation to use `projectManager.getNextVersion()`.

**1.4** ✅ Made `executeDelete` conditional (StoryboardUI.tsx:3385-3409) - only removes from UI when backend delete returns `success: true`. On failure, entry remains with error shown.

**1.5** ✅ Changed delete confirmation to use `entry.id` (StoryboardUI.tsx:3358, 3370, 4878) instead of stale `historyIndex`. Entry looked up by ID in current `imageHistory`.

**1.6** ✅ Added `_is_path_safe()` path traversal protection to Orchestrator `/api/delete-image`, CPE `/api/delete-file`, and CPE `/api/read-image` endpoints.

---

## Phase 2: Canvas Architecture Overhaul (Foundational) ✅ COMPLETED

### Implementation ✅

**2.1** ✅ Extended Panel interface (StoryboardUI.tsx:159-165):
- `name?: string` — User-editable panel name (default `"Panel_01"`)
- `rating?: number` — 0–5 star rating (future use)
- `locked?: boolean` — `true` once panel has generated images (prevents rename)
- `zIndex?: number` — For drag layering
- `selected?: boolean` — Multi-select state
- `folderPath?: string` — Resolved output folder for this panel

**2.2** ✅ Added per-panel folder resolution in project-manager.ts:
- `resolvePanelFolder()` returns `{projectPath}/{panelName}/`
- `generateFilenameForPanel()` uses panel name instead of numeric ID
- Updated `saveToProjectFolder()` and version scanning for per-panel folders

**2.3** ✅ Created `components/PanelHeader.tsx` and `PanelHeader.css`:
- Double-click to edit, Enter to confirm, Escape to cancel
- Validation: checks locked status and existing files
- `sanitizePanelName()` removes special characters and path separators
- Shows lock indicator, drag handle, and remove button

**2.4** ✅ Added `@dnd-kit/core` and `@dnd-kit/utilities` to package.json (lines 15-16)

**2.5** ✅ Created `components/DraggablePanel.tsx` with drag handle on panel header
- Uses `@dnd-kit/core` `useDraggable` hook
- Disabled during panel generation
- Updates panel position on drag end

**2.6** ✅ Added panel resize with bottom-right corner handle:
- `handleResizeStart`, `handleResizeMove`, `handleResizeEnd` handlers
- Minimum size: 200×200 pixels
- Updates panel width/height on mouse events

**2.7** ✅ Added panel removal with confirmation dialog:
- `handleRemovePanel()` function (StoryboardUI.tsx:1480-1500)
- Shows confirmation when panel has images in history
- Cleans up panel from state

---

## Phase 3: Canvas Interaction Features ✅ COMPLETED

### Implementation ✅

**3.1** ✅ Multi-select panels:
- Ctrl+Click toggle on panels (StoryboardUI.tsx:4266-4269)
- Marquee drag-select on canvas background:
  - State: `isMarqueeSelecting`, `marqueeStart`, `marqueeEnd`
  - Handlers: `handleMarqueeMouseMove`, `handleMarqueeMouseUp`
  - Visual: Blue semi-transparent rectangle during selection (lines 4329-4342)
  - Selects panels that intersect with marquee rectangle

**3.2** ✅ Multi-panel movement:
- Modified `handleDragEnd` (StoryboardUI.tsx:396-464) to move all selected panels
- When dragging a selected panel, applies same delta to all `panel.selected === true`
- Uses adjusted delta for snap positioning (when Shift held)

**3.3** ✅ Alignment toolbar:
- Floating toolbar when 2+ panels selected (StoryboardUI.tsx:4244-4307)
- 6 alignment buttons with SVG icons:
  - Align left, right, top, bottom
  - Distribute horizontal, vertical
- `alignPanels()` function (lines 631-669)
- `distributePanels()` function (lines 672-721)

**3.4** ✅ Snap-to-panel guides:
- Hold Shift during drag for snap-to-guide mode
- `calculateSnapGuides()` function (StoryboardUI.tsx:570-628):
  - Detects left, center, right edges (vertical)
  - Detects top, center, bottom edges (horizontal)
  - 10px snap threshold
- Visual guide lines rendered in canvas (lines 4344-4360)
- Red lines show snap alignment

**3.5** ✅ Folder import:
- `handleFolderDrop()` function (StoryboardUI.tsx:724-744) listens for drag events
- Opens folder browser dialog pre-filled with dropped folder name
- Modal dialog (lines 5276-5346) with:
  - Header showing folder name
  - Existing `FolderBrowserModal` component
  - Creates new panel on selection
  - Cancel functionality

### Bug Fixes Applied
- Fixed snapGuides state type mismatch (line 276)
- Fixed snap logic for position 0 (line 427)

---

## Phase 4: Panel Features — Notes, Ratings, Print ✅ COMPLETED

### Implementation ✅

**4.1** ✅ Panel notes with markdown support:
- Created `PanelNotes.tsx` component with `react-markdown` for rendering
- Toggle between edit (textarea) and view (rendered markdown) modes
- 300ms debounced auto-save
- Integrated into panel footer below image content

**4.2** ✅ Star rating system:
- Created `StarRating.tsx` component with 5 Lucide Star icons
- Click to rate (1-5 stars), click same star to reset to 0
- Integrated into `PanelHeader` component
- Stores rating in panel state (`panel.rating`)

**4.3** ✅ Print dialog:
- Created `PrintDialog.tsx` component with configuration options
- Layout options: 1-4 panels per row
- Toggles for: show notes, show metadata, show ratings
- Page settings: A4/Letter, Portrait/Landscape
- Uses `window.print()` with `@media print` CSS for storyboard-style output
- Shows preview of how many panels will be printed

---

## Phase 5: Code Review Remediation (CRITICAL + HIGH)

### Steps

**5.1** Security: Move hardcoded OAuth secrets to env vars. Restrict CORS origins. Add SSRF protection.

**5.2** Async I/O: Wrap filesystem ops in Orchestrator with `asyncio.to_thread()`.

**5.3** React Error Boundary: Wrap StoryboardUI component.

**5.4** WebSocket reconnection: Exponential backoff 1s→30s with jitter, max 20 attempts.

**5.5** Delete duplicate `ComfyCinemaPrompting/cinema_rules/` directory.

**5.6** Error handling: Specific exceptions instead of bare `except:`. Proper HTTP status codes instead of catch-all 422.

**5.7** StoryboardUI.tsx decomposition: Extract ImageViewer, Canvas, PanelCard components.

**5.8** Tests: Add pytest tests for project management endpoints. Add delete flow integration test.

---

## Key Decisions

- **Drag library**: `@dnd-kit` (lightweight, maintained, tree-shakeable)
- **Per-panel folders**: Subfolders under project path by panel name
- **Panel naming lock**: Locked after first generation
- **Print layout**: Configurable via dialog (1–4 per row, notes placement, metadata)
- **Folder drop**: Opens folder browser dialog pre-filled with dropped folder name
- **Notes rendering**: `react-markdown` for full Markdown support
- **Code review scope**: CRITICAL + HIGH (~40 items); MEDIUM/LOW deferred
