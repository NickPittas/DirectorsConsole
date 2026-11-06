# Console unsaved-work baseline map

Read-only source pass for dirty detection before agent New/Open; no implementation or runtime validation.

## Source anchors
- `StoryboardUI.tsx:478-515` keeps `panelsRef` current; `:597-599`, `:766-777`, `:1245` hold selected workflow, global parameters, and project settings.
- `:1253-1266` serializes a queued snapshot; its extra state currently reads render nodes, Comfy URL, and camera angles from closure values.
- `:4892-4927`, `:4946-4992` are Save / Save As success paths; they pass panel/parameter/workflow refs into an async save callback.
- `:4996-5276` loads JSON, scans folders, then applies settings, restored panels, parameters, camera angles, preferences, selected workflow, and Comfy URL.
- `:7628-7692` New currently asks only for panel image/images, notes, or recovery `hasPendingChanges()`; empty prompts, parameters, geometry, workflow selection, and history are missed.
- `:5924-6029` agent `save_project` captures JSON copies of panels, global parameters, workflow selection, settings; it guards those values across awaits.

## Persisted vs runtime boundary
- `project-manager.ts:1051-1065` writes panel id/geometry/name/notes/workflowId/parameterValues/enhancementPreferences/nodeId and `imageRatings` only.
- `:1038-1048` derives ratings by `savedPath`; `:1174-1190` writes settings, global parameters, selected workflow, render nodes, Comfy URL, camera angles, optional global preferences/deleted images, and generated timestamps. Workflows are explicitly omitted.
- `persistProjectStateSnapshot` supplies no global enhancement preferences or deleted images, so those fields default to null/empty on this path; per-panel preferences do persist.
- History is rebuilt from scanned files (`StoryboardUI.tsx:5121-5173`); JSON stores ratings, not entries. `image`, `images`, `imageHistory` entries, history/current cursors, `status`, `progress`, `locked`, `selected`, top-level `prompt`, and `seed` are omitted or reconstructed at runtime.
- Prompt values inside global or per-panel `parameterValues` persist and must count. The default top-level `Panel.prompt` (`:471-476`) is omitted by the save whitelist; whether it is independent user content is unresolved.
- `selectedWorkflowId` is saved; workflow definitions live separately. `workflowPersistedFingerprintRef` / `hasUnsavedWorkflowChanges` (`:583`, `:779-783`) track workflow edits, not a project baseline.

## Proposed comparison and baseline points
- Compare stable settings (excluding generated timestamps), selected workflow, global parameters, and ordered panels projected to the saved panel fields plus prompt values and history identity (`savedPath`/entry id) with rating.
- Include camera angles, render nodes, and Comfy URL if the baseline is meant to cover every field this save path writes; capture them with the same snapshot. Ignore transient progress/status, image URLs, and generated timestamps.
- Set the baseline from the captured payload only after `saveProjectState` returns success and a saved path (`:4909`, `:4974`, agent path `:6004`); never reread live refs after an await. Save As uses its captured target settings.
- After load, set it only after folder scan and state application succeed (`:5229-5266`); after New, set it to the reset state after identity activation and reset (`:7645-7692`).
- No reusable project baseline exists: agent `capturedFingerprint` is a transient save-race guard (`:5930-5978`). Workflow fingerprints cover a different store. Agent save capture also omits camera/render/Comfy values that the serializer currently reads from live closure state.

## Unknowns and next slice
- Load leaves prior global parameters or selected workflow in place when the file omits those fields (`:5236-5254`); decide/reset defaults before declaring that load baseline clean. Standalone `Panel.prompt` persistence also needs a product decision.
- Next named-file slice: `CinemaPromptEngineering/frontend/src/storyboard/StoryboardUI.tsx` — add the project comparison baseline and wire its successful Save/Load/New points using immutable captured payloads; preserve the separate workflow dirty check.

Parent follow-up: omitted parameter values, camera angles, enhancement preferences and selected workflow now reset to their defaults on successful load, including immediate parameter/preference/workflow ref synchronization. Frontend compilation passed; omitted-field load behavior has not been verified live. The exported `Panel` interface has no top-level `prompt` or `seed` fields, and the inspected Storyboard source contains no `panel.prompt` / `panel.seed` consumer. Legacy default-object keys alone do not establish lost user content; actual prompt/seed parameters remain in `parameterValues`.

Baseline integration now captures immutable save payloads before queueing, records the exact successful snapshot, and establishes the comparison on successful load and New. Global enhancement preferences and deleted-image metadata are included in both save payload and comparison. New uses the project comparison plus separate workflow dirty check rather than recovery queue activity. Restored drafts with unknown save baselines are conservatively dirty. Live Pi readback after Save reports `hasUnsavedWork: false`; editing the visible Console prompt without saving then produces `true`. Evidence: `docs/reports/screenshots/2026-11-06-embedded/unsaved-project-state-live.json`. No automated tests ran; omitted-field loading and concurrent edits during a queued save remain unverified live.
