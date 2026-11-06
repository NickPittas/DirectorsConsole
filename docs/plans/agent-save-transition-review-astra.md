What this change does: Agent Save As saves a captured project and transfers the active turn's Console grant only after a validated activation receipt. The transport response retains the original binding for request correlation.

Scope: Source-only review of the five requested files and named regions, plus directly connected definitions within those files. Paths below are relative to `CinemaPromptEngineering/frontend/src/`.
Evidence: Parent reports real Pi Save As with six panels → file with six → new activation → add seventh; second Save As with seven → file with seven → add eighth, with correct title. These successful runs were supplied evidence, not independently reproduced here.

Must fix:

1. **P2 — A queued project write can start after its command becomes stale.**
   - Location: `storyboard/StoryboardUI.tsx:5997-6003`; connected persistence queue at `1253-1267` and human save caller at `4891-4908`.
   - What this is: `assertCapturedSource()` validates before enqueueing; the queued callback later calls `projectManager.saveProjectState()` without another guard.
   - Trigger: A human save is still writing, the agent save passes validation and queues behind it, then the user cancels the turn, the session expires, or the source changes before the queued agent write starts.
   - Result: The queued write still starts with the captured payload. The check at `6012` prevents activation only after the file write; returning `outcome_unknown` cannot undo that newly started stale write. This is distinct from cancellation after an already submitted write.
   - Smallest fix: Let the existing persistence helper accept a current-source guard and run it inside its queue callback immediately before `saveProjectState`; pass `assertCapturedSource` from this handler.
   - If skipped: Cancellation and source freshness stop activation but do not reliably stop project writes that have not started yet.

2. **P2 — Rejected activation can remove the active recovery pointer.**
   - Location: `storyboard/services/session-recovery.ts:255-260,289-299`; caller catches the failure at `storyboard/StoryboardUI.tsx:6011-6021`.
   - What this is: Both same-identity and changed-identity activation await `clearActiveDraftPointer()` before the next current-source assertion and before committing project settings.
   - Trigger: The file write succeeds; cancellation, session expiry, or a source edit occurs while pointer clearing is awaiting completion. The post-clear assertion then throws.
   - Result: The handler correctly reports the written file and uncertain activation, but the previous recovery pointer has already been removed. The rejected transition neither restores that pointer nor schedules its restoration; without a later draft write, automatic recovery loses its active selection. The saved file itself is not proven lost.
   - Smallest fix: Make pointer removal recoverable on post-clear guard failure: restore the prior active pointer before rejecting, guarded against overwriting a newer identity/generation. Apply the same handling to both branches.
   - If skipped: A cancelled or stale save can change recovery state even though project activation was refused.

Other checked boundaries:

- `App.tsx:81-95` checks active turn, session ID, execution fingerprint, and passes the workspace scope/turn; dispatcher additionally checks abort state. Cancellation clears the active turn in `services/agent-conversations.ts:391-401`.
- `services/workspace-agent-actions.ts:211-227` blocks newly dispatched Console mutations during a save and makes tracked mutations fail their current check while that save is pending. This is a cooperative guard, not cancellation of already submitted I/O.
- Source fingerprints and revision/binding checks reject changed captured panel/parameter/project settings before activation (`StoryboardUI.tsx:5737-5747,5972-5982`). Binding checks distinguish a fresh activation of A after human A → B → A; matching project identity alone does not revive the command.
- Completed transition receipts require the captured source, current destination, exact revision, live control, and the same active workspace turn (`workspace-agent-actions.ts:240-253`). Grant transfer verifies both the prior grant and current Console binding (`agent-conversations.ts:231-259`).
- Same-identity saves need no grant transfer; the existing binding remains usable. Activation failures return `savedPath` with `outcome_unknown`; scope-change wrapping retains the operation result. No change to the original envelope binding is requested.

Verdict: Fix 1 and 2 before treating cancellation and failed activation as fully handled.
Not checked: No implementation, tests or test access, fixtures, self-checks, benchmarks, builds, runtime, network, configuration, secrets, or agents. Imported transport/storage implementations outside the five files were not inspected; findings establish source ordering, not reproduced runtime failures.

## Parent follow-up

Both findings corrected after this review. `persistProjectStateSnapshot` accepts an optional source guard and invokes it inside the existing queue immediately before starting the project write; agent Save passes `assertCapturedSource`. Guarded recovery-pointer clearing now captures the prior pointer in the clearing transaction, rechecks currentness after completion, and restores the prior pointer on rejection only if it is still absent, its draft record remains, and the controller identity/generation has not changed. Unguarded clearing retains its original behavior, including clearing corrupt pointers. Both identity branches use this guarded path.

Frontend TypeScript compilation passed. An actual Pi request then saved the current eight-panel project to its existing file successfully; file readback contains eight panels, and the UI retained its name and panel count. Cancellation during pointer clearing and a stale write queued behind another save were not reproduced live; the fixes for those ordering cases are source-checked only. No automated tests ran.
