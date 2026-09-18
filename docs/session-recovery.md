# Session recovery and autosave

The app keeps one versioned IndexedDB draft per session identity in `directors-console-session-drafts`.

- A known saved project uses its normalized project JSON path as its identity.
- Work with no known project file uses a stable `unsaved:<uuid>` identity; starting a new session rotates it.
- The active pointer changes only in the same transaction as the draft record. A missing active pointer is treated as no active draft; malformed or dangling pointers block recovery.
- Recovery runs before the Cinema, Storyboard, or Gallery components mount. It restores the active app tab, project identity, Storyboard work state, panel history/layout/parameters, and the CPE configurations, user/enhanced prompt text, target model, and preset selections. A restored target model is not silently replaced when the later catalog differs; the UI warns instead.
- Workflow catalogs, logs, provider credentials/OAuth, active jobs, and function references are not stored.
- Generating panels become `error` with an interrupted message and cleared transient tracking. The app does not claim that a server job was cancelled and does not resubmit or reattach it.
- Writes are coalesced after roughly 500ms and flushed on high-value project actions, `pagehide`, and visibility changes. These are best-effort crash safeguards, not a guarantee for the last keystroke.
- `blob:` previews are materialized only from local Blob URLs. Remote URLs and saved-path references remain references; failed materialization, cloning, or quota/storage writes retain the previous valid snapshot and show `Autosave unavailable — save manually.`
- Corrupt, unsupported, or unreadable snapshots are not deleted automatically. The recovery screen offers Retry, explicit confirmed Discard of only the active target, or confirmed Start new; a malformed pointer can be cleared without deleting archived records.

Checks use fake IndexedDB and no provider, ComfyUI, personal browser storage, or user workflow fixtures. Browser quota behavior is represented only by the adapter's failure-boundary simulation, not a real quota exhaustion test.
