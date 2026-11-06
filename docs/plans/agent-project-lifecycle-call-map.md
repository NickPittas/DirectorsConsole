# Agent project lifecycle call map

Read-only map for path-based project operations; no lifecycle authority or gateway design.

## Existing calls

- **Save:** `handleSaveProject()` flushes the session draft, awaits pending workflow persistence, then saves a snapshot using the current project settings/name. After a successful file write it awaits session-identity activation, updates `projectFilePath`, clears the failure state, and reports success. A failed workflow flush or save returns before the settings commit. (`StoryboardUI.tsx:4908-4944`)
- **Save As / Open entry points:** `handleSaveProjectAs()` and `handleLoadProject()` only set `fileBrowserMode` to `save`/`open`; both require the UI modal. (`StoryboardUI.tsx:4946-4954`)
- **Folder selection:** `handleLoadProjectFolderSelect(folderPath)` stores the selected path and awaits `projectManager.listProjects(folderPath)`; it only fills/clears the available-project list. (`StoryboardUI.tsx:5294-5317`)
- **New:** `handleNewProject()` may use `window.confirm`; Save must succeed or reset stops, while Discard sets `discard=true`. It awaits identity activation before replacing settings, six panels, parameters, selected workflow, and the cinema session. (`StoryboardUI.tsx:7534-7602`)

## Explicit path/name service seams

- `persistProjectStateSnapshot(panels, parameters, workflowId, settingsOverride = currentProject)` serializes saves through a promise queue and passes panels, parameters, workflow id, render nodes, ComfyUI URL, and camera angles to `saveProjectState`. (`StoryboardUI.tsx:1268-1284`)
- `saveProjectState(..., settingsOverride?: ProjectSettings)` accepts a target `ProjectSettings`; `settings.path` and `settings.name` supply folder and `<sanitized-name>_project.json`. This supports an explicit path+name without first changing shared settings. (`project-manager.ts:994-1012,1167-1205`)
- Save externalizes `data:image/*` / `data:video/*` parameter values via Orchestrator `/api/save-base64-image` into panel or project `.ref_images`, then POSTs the project JSON to `/api/save-project`. Panels are reduced to saved layout/notes/workflow/parameters/preferences/node id/ratings; workflow definitions are omitted. (`project-manager.ts:1023-1065,1068-1163,1167-1193`)
- `loadProjectState(filePath, {commitSettings?})` accepts an explicit project file path. Default commit (`true`) replaces `currentProject`, persists settings, and notifies listeners; `{commitSettings:false}` returns staged state without those settings mutations. `listProjects(folderPath?)` only enumerates files. (`project-manager.ts:1215-1276,1281-1285`)
- `saveProjectAndRecordRecent(name, save)` and `loadProjectAndRecordRecent(path, load)` await the supplied operation and record recent-project history only after success. (`project-actions.ts:16-32`; imported by `StoryboardUI.tsx:62`)

## Commit, identity, and data effects

- `saveProjectState` writes reference-image files and a project JSON; no delete operation appears in this save path. Backend overwrite/retention behavior is unknown because backend code was out of scope. (`project-manager.ts:1068-1205`)
- Save As can stage target settings through `settingsOverride`; the existing snapshot callback also accepts the override. `restoreFromSession(settings)` is an explicit settings commit (local storage + listeners). `setProject(settings)` commits settings, persists/notifies, and asynchronously syncs the current project to Orchestrator. (`project-manager.ts:241-252,329-340`)
- `activateSessionIdentity` awaits `transitionIdentity` then clears the active-draft pointer. New’s explicit discard skips saving dirty in-memory draft data during the identity transition; the inspected transition does not delete project files. Whether pointer clearing removes stored draft bytes is unknown. (`session-recovery.ts:189-201,244-280`)
- New also rotates the unsaved identity (local storage) and resets in-memory UI state; no project-folder deletion is present in its callback. (`project-manager.ts:270-279`; `StoryboardUI.tsx:7553-7601`)

## Reuse boundary and unknowns

- Reusable pieces already present: queued `persistProjectStateSnapshot`, recent-recording wrappers, explicit `settingsOverride`, staged `loadProjectState(..., {commitSettings:false})`, and awaited `activateSessionIdentity`. No separate reusable New-state reset is exposed in the inspected callbacks.
- The requested Open entry/folder callbacks stop at opening the browser and listing projects; this map does not establish the selected-file UI’s final state-restore sequence. Project file and reference-image I/O use the configured Orchestrator URL directly; the inspected calls have no PE dependency. (`StoryboardUI.tsx:4946-4954,5294-5317`; `project-manager.ts:1089-1097,1132-1140,1232-1243`)
