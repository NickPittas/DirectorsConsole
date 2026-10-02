# Changelog

This file records dated project milestones from repository history; entries are not GitHub release tags. See the [README changelog](README.md#changelog) for the latest highlights.

## 2026-10-02 — Image-aware prompt enhancement

Source commit: `ab0f0c6` (`feat: add image-aware prompt enhancement [skip ci]`).

- Added a chat-style CPE prompt composer with inline `+` picker, drag-and-drop, previews, stable `@imgN` aliases, and image-only or image-plus-text enhancement.
- Added image-use modes for **Describe image**, **Use as reference**, and **Use as starting image**, with target-aware variants where supported.
- Enhancement requests preserve the full active configuration unchanged, including motion fields, plus the full selected official preset/style and other context. Selected image pixels are sent only to a compatible vision-capable LLM through native provider transports, with safe image-size validation and 53 target capabilities.
- Storyboard AI Enhance remains metadata-only. Actual reference-based generation uses the selected ComfyUI workflow's image inputs, separate from CPE's pixel-assisted prompt enhancement.
- Added named OpenAI-compatible and Anthropic-compatible endpoints, model discovery, OAuth handling, Codex catalog/fallback behavior, and response handling; fixed launcher readiness output deadlock.
- Reorganized the README into an image-led overview with focused tab, provider, preset, and cinematography guides; removed duplicate screenshots and moved the historical changelog here.
- This does not claim rendering, per-account availability, verified vision access, or a universal model guarantee. Verification was offline only: frontend lint, TypeScript checks, frontend build, Python compilation, and diff review passed; automated tests, live provider/account checks, browser checks, and paid generation were not run.

## 2026-09-19 — Prompting and UI maintenance

- `4cb3d05`: Hardened Cinema controls against translated DOM changes.
- `3be2ca0`: Added current image-model prompting guides and expanded Cinema prompt input.
- `8c1b782`: Added prompting controls and workflow categories, and fixed Gallery layout behavior.
- `c17ffb6`: Added the MIT license.

## 2026-02-22 — Gallery milestone

Source commits: `85dd63b`, `def7689`.

- Added the Gallery tab with folder tree, grid/list/masonry layouts and timeline grouping, batch rename, moves, trash/restore, ratings, tags, metadata search, duplicate detection, and Storyboard integration.
- Added JSON flat-file metadata storage for NAS/CIFS compatibility, recent projects, and borderless Pinterest-style masonry. Historical milestone; not a release tag.

## 2026-02-14 — Workflow and path compatibility

Source commit: `518a069`.

- Added downstream disable propagation for image/LoRA workflow inputs and cross-platform model-path normalization.
- Improved Ollama chat endpoint/model handling and settings parsing for model names containing colons.

## 2026-02-10 — Cross-platform path translation milestone

Source note: `AGENTS.md`, “Recent Fixes (Feb 10, 2026)”. Windows, Linux, and macOS prefixes can be mapped for shared project paths, with persisted mappings and API test translation. This is a historical implementation note, not a versioned release claim.
