# Console project transition contract — narrow source review

Scope: only the six requested frontend files/slices; no implementation or runtime verification.
Paths below are relative to `CinemaPromptEngineering/frontend/src/`.
The reported live human-switch check is user-provided evidence, not repeated here.

## Findings (2)
1. **Continuation needs an explicit transfer, including Save.** `agent-conversations.ts:219-238,303-320` stores the send-time binding and requires it for Console authorization. `workspace-agent-actions.ts:193-247,289-296` rejects a changed binding. `StoryboardUI.tsx:4933-4934,4997-4998,5240-5241,5360-5361,7555-7556` rotates it on Save, Save As, Open and New. Simply exposing these operations would invalidate their own turn. Keep the existing human A→B→A rejection; do not make snapshot reads update authorization.
2. **The UI New handler is not a safe agent contract.** `StoryboardUI.tsx:7536-7604` uses browser confirmations, a content/pending-draft heuristic, resets panels/history and calls `useCinemaStore.getState().resetSession()`. That heuristic does not establish actual unsaved project changes; reusing the whole handler would couple project creation to Prompt Engineer and UI dialogs. Extract only the Console lifecycle work; preserve existing files and history unless explicitly discarded.

## Minimal types and grant ownership
Reuse the workspace bridge, adapter registration, binding UUIDs, command IDs and existing result envelope.
Proposed action names: `create_project`, `open_project`, `save_project`; Luna64 owns their service/payload mapping.
Keep `AgentChatMessage.consoleBindingId` as immutable send-time provenance; add `consoleGrantBindingId?: string | null`.
Initialize both fields at turn start; the active-request getter returns the effective grant as its existing `consoleBindingId` field (legacy records fall back to the captured field).
`getActiveConsoleUserRequest` then consumes the transferred grant through its existing getter, without changing project-identity checks.
Add the following shared types in `services/workspace-agent-contracts.ts`:
```ts
type UnsavedWorkChoice = 'save' | 'discard' | 'cancel';
type ProjectTransition = { fromBindingId: string; toBindingId: string; projectRevision: number };
type ProjectOperationOutcome =
  | { status: 'completed'; transition?: ProjectTransition }
  | { status: 'needs_unsaved_work_choice'; projectRevision: number }
  | { status: 'cancelled' }
  | { status: 'outcome_unknown'; reason: string };
```
Use `ProjectOperationOutcome` as typed project-operation result data; the envelope already carries `commandId`, `action`, `ok` and errors.
A changed activation requires `transition`; unchanged Save omits it. Never invent an activation change from project identity equality.
The adapter creates the receipt from its actual committed activation, never from tool input or a snapshot; private project identity stays browser-only.
Successful transferred results expose the new binding in outer `consoleBindingId`; failures/unknown outcomes retain the command's original binding and cannot transfer.

## Guarded transfer sequence
1. Capture registration identity/generation, workspace scope key, turn ID, grant, project revision, session/harness fingerprint and signal. Require expected binding = grant = live binding before starting; null grant cannot acquire a Console through a snapshot.
2. Serialize project transitions per registration and reject concurrent Console mutations while one is pending. Recheck source binding/revision and currentness after preparation awaits and immediately before any destructive publish; human activation always rotates its UUID, including A→B→A.
3. Extend adapter `dispatch(command, control?)` with `{ signal: AbortSignal; isCurrent: () => boolean }` for project handlers. Reuse existing tracked-command checks before commit; do not weaken `sameScope` for ordinary actions.
4. Stage load/save work before activation. At the actual activation/state commit, recheck the guard synchronously and publish coherently with no intervening await. An awaited helper's entry check alone is insufficient if it can publish later; Luna64 must provide the commit guard at that boundary.
5. Handle a project receipt before the ordinary post-dispatch `sameScope` rejection. Validate envelope, allowlisted project action, `ok`, completed status, exact captured from-binding, nonempty distinct to-binding, live destination binding/revision and unchanged registration; recheck signal plus root currentness.
6. Add `transferActiveConsoleGrant(scopeKey, turnId, fromBindingId, toBindingId): boolean` in `agent-conversations.ts`: synchronous compare-and-set against the active turn and effective grant, replacing only that assistant message's grant field and publishing. Call only after step 5, without an await between validation and transfer.
7. A failed compare-and-set, cancellation, malformed receipt, handler error after possible mutation, or lost session/harness/registration after commit means no transfer and an explicit unknown outcome. Never retry automatically or roll back over a newer human project. Cancellation known to precede effects may return cancelled.
8. An unchanged successful Save still needs currentness checks. Save-before-New must keep all deliberate intermediate activations inside the guarded operation and return one source-to-final receipt; never accept an unrelated intervening activation.

## Unsaved work and independence
New/Open input accepts optional `unsavedWorkChoice` tied to `expectedProjectRevision`; reuse existing revisions rather than adding a consent token.
Detect actual unpersisted project work, including prompts, parameters, workflows, panels and history—not merely whether images exist or a draft flush is pending.
With dirty work and no expressed choice, return `needs_unsaved_work_choice` without changing activation; ask specifically Save, Discard or Cancel. Clean projects need no confirmation.
Save must complete before replacement; failed/unknown Save stops replacement. Discard affects only explicitly identified unsaved state, never deletes saved projects/media/history files; Cancel changes nothing.
Console create/open/save dispatch must not call or await PE/Gallery adapters, resets or snapshots. Retain optional snapshot summaries as observational only; unavailable optional apps cannot gate project operations.
Keep the Console adapter available across tabs; a mounted blank Console already has a binding (`StoryboardUI.tsx:1262`). A genuinely absent adapter stays unavailable; never bootstrap authorization by silently binding a pending turn.

## Tiny Luna slices
1. `services/workspace-agent-contracts.ts` + `services/agent-conversations.ts`: add types, separate grant field and the single guarded transfer function; preserve provenance and getter shape.
2. `App.tsx:80-107` root bridge only: supply captured scope/turn transfer context; retain session ID, fingerprint, active-turn and abort guards. `components/agent/AgentChatPanel.tsx:377-392`: keep send-time capture; initialize grant through `beginAgentAssistantTurn`, no snapshot rebinding.
3. `services/workspace-agent-actions.ts` registry/currentness/dispatch: one project-operation branch, serialization, receipt validation/CAS and explicit unknown handling; include project actions in mutation classification. Ordinary dispatch remains unchanged.
4. `storyboard/StoryboardUI.tsx:1262-1297,4933,4997,5240,5360,7516-7604`: guarded activation receipt, Console-only lifecycle extraction and typed dirty-work outcome. Coordinate service calls and downstream command schema/handler wiring with Luna64; those files were not inspected here.

Not checked: tests, fixtures, self-checks, builds, network, runtime, configuration/private files or project-service internals. Risk: commit-boundary guard and accurate dirty-state detection must be implemented before grant transfer is safe.
