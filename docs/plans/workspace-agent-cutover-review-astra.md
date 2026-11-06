# Workspace agent cutover — focused source review

What this change does: A root-owned workspace conversation and application stream remain mounted across Console, Gallery and Prompt Engineer. Console mutations use the activation captured at user SEND; independent actions do not require a Console binding.

Scope: Only the requested source regions. The requested gateway files are actually under `CinemaPromptEngineering/agent_gateway/src/`. All paths below are relative to `CinemaPromptEngineering/`. No implementation changed.

## Must fix

1. **P1 — In-flight Console work loses its authorization guard before awaited writes.**
   - **Evidence:** `frontend/src/App.tsx:80–96` supplies `signal` and `isCurrent`, but `frontend/src/services/workspace-agent-actions.ts:245–262` checks them only at entry. `dispatchConsole` passes only the command to the adapter (`:162–165,195`); `StoryboardUI.tsx:7390–7403` forwards only that command. `assertApplicationProject` / `isApplicationProjectCurrent` (`:5742–5750`) check activation/project/revision, not the initiating turn, model, bridge lifetime or registration. The gateway timeout/settlement path (`agent_gateway/src/application-bridge.ts:420–450,482–487`) resolves the pending request without revoking browser execution.
   - **Trigger/effect:** Start `save_and_attach_workflow`, then cancel the turn or change the model while `flushPendingWorkflowSave()` or `persistDirtyWorkflows()` is pending. Leave the project and panel unchanged. The handler resumes, passes its project checks and starts a new project attachment save (`StoryboardUI.tsx:6597–6599,6644–6688`), then applies the attachment (`:6717–6727`). A bridge abort or command timeout likewise cannot stop those later steps through the reviewed dispatch chain. Rejecting the eventual result does not undo these new side effects.
   - **Smallest correction:** Carry a per-command currentness/cancellation guard through the existing adapter into the handlers. Combine the originating turn/model/bridge lifetime and registration identity with existing activation/revision checks; recheck immediately after awaits and before each new write. Make gateway timeout/cancellation invalidate that command in the browser. Preserve partial/unknown outcomes for writes already sent, without replay.

2. **P2 — The combined snapshot can advertise a Console activation that became stale during its final await.**
   - **Evidence:** `dispatchConsole` checks `sameScope` at `frontend/src/services/workspace-agent-actions.ts:212`, then awaits `independentSnapshots()` inside the return value at `:232–240`. There is no subsequent scope check.
   - **Trigger/effect:** Console changes activation or its adapter is replaced while the independent snapshots are pending. The result still publishes the old Console data and binding with `consoleAvailable: true`, bypassing the intended partial/unavailable branch. Downstream mutation binding checks still reject that stale activation; this finding concerns a misleading successful snapshot, not a demonstrated mutation bypass.
   - **Smallest correction:** Await the independent snapshots into a local value, then recheck the captured registration and activation before composing the result. On mismatch, reuse those independent results with Console unavailable and omit the stale Console payload.

## Other inspected contracts

No additional findings in the inspected regions: workspace history is project-free; SEND captures the Console binding; Console dispatch compares that binding before entry; prepared workflow and prompt records retain activation identity; registration cleanup checks ownership; the root owns the feed callback and mounted chat. Gateway results match the pending bridge/session/command/action and expected activation, and duplicate command/generation keys are rejected. These observations do not establish safety of downstream code outside the allowlist.

Supplied live evidence, not rerun: tab switching during a Pi snapshot reply; Gallery-origin explicit PE prepare/validate/apply; disposable Console NewProject/Discard preserving session/history and Gallery folder, followed by a successful Gallery read.

Verdict: Fix 1 and 2 before calling the cutover complete.

Not checked: tests or fixtures, self-checks, benchmarks, runtime, network, services, builds, configuration or credentials. Pending Console A→B→A, cancellation/expiry and adapter replacement remain unverified live; this report establishes source defects only.

## Parent corrections after review

- Console dispatch now associates the exact browser command with a current-turn, abort-signal and adapter/activation guard retained through handler awaits. Existing project, panel and workflow assertions include this guard; post-save partial branches also check it before subsequent attachment writes or UI application. Completed dispatch revokes its local guard.
- Gateway failed settlement, timeout and session cancellation send an authenticated command/session cancellation event. The browser tracks per-command abort controllers and aborts them on that event or stream shutdown. Explicit session abort and premature turn-stream close now cancel pending application commands. This prevents subsequent work; already submitted writes remain partial/unknown and are not undone or replayed.
- The final combined snapshot awaits independent app snapshots before its last activation/currentness check. A changed Console returns only independent app data with Console unavailable.
- Optional Prompt Engineer validation/apply and delayed Gallery folder selection also recheck the initiating action before applying local state after awaits.

Parent frontend and gateway compiler checks pass after these changes. Source corrections have not yet been live-verified for pending cancellation, timeout or A→B→A races; the review findings are not runtime acceptance claims.
