# Correct the agent connection's application scope

## Required behavior

Prompt Engineer, Console and Gallery are independent applications. One embedded agent can operate any of them from any visible tab. Cinematic constraints are optional unless the user requests them. The Prompt Engineer's explicit enhancement button retains its constrained preparation/validation path.

## Current defect

The application SSE bridge is mounted by Storyboard and keyed to its project. Console chat sessions own all application tools, while Prompt Engineer chat sessions are tool-free and automatically pass through cinematic preparation. Gallery's agent reuses the Console conversation. Always mounting these components hides some availability problems but does not correct their ownership.

## Proposed contract

1. Add a workspace agent session, owned by the authenticated browser bridge and exact harness selection. Its history, drafts and lifetime are independent of Console project identity and the visible tab. Keep legacy Prompt Engineer enhancement sessions separate. The workspace session exposes the registered application tools.
2. Mount one application bridge at the App root. Authenticate by the existing exact origin, bearer and bridge/session ownership. Register optional application adapters separately. A missing adapter affects its own operations only. Closing or rebinding a Console project does not dispose workspace or Prompt Engineer sessions and does not block independent Gallery/media actions.
3. Separate transport scope from Console target scope. A workspace command routes to the authenticated browser, without using a Console project as its transport identity. Console snapshots expose a random opaque binding ID that changes on every project switch. Console tools require that observed binding ID plus existing project/panel/workflow revisions. The browser rejects mismatches before any mutation. Do not let a server-side resolver silently retarget an old command to a new project. Internal filesystem-derived project identity stays browser-side.
4. Prompt Engineer actions use its own context revision and optional prepared-prompt ID. Gallery actions use its own workspace revision/root/server. Media inspection uses its registered asset ID and file identity. None of these requires a Console binding or project revision.
5. The root dispatcher routes independent actions directly to their adapters, and Console actions to the registered Console handler only after the binding check. Tools cannot supply arbitrary network URLs, filesystem roots outside the existing app APIs, code or shell commands. Preserve bounds, redaction, exact selected backend schemas, serialization, canonical persistence and unknown-outcome handling.
6. Show one chat conversation beside every app, with visible location informational only. The user can ask for optional Prompt Engineer constraints while working from any tab. Switching tabs does not change sessions, force cinematic preparation or interrupt a turn. A project switch invalidates only Console commands tied to the old binding; independent actions may continue. A known rejected Console command may refresh state, but cannot silently apply the old objective to another project.

## Small implementation slices, after review

## Lifecycle corrections from Astra review

- Reuse the existing bridge ID as transport workspace identity; do not invent a second workspace identifier. Pairing must work before any Console project exists. Renewal remains exact-origin, same-tab bearer/bridge ownership and exact harness selection. Session IDs alone never grant ownership. Expired credentials cannot dispatch or settle; transport reconnect does not replay commands.
- Keep the random Console binding activation ID through queue waits, validation and completion. A→B→A creates a new ID even when ordinary revisions repeat. Validate it before side effects after awaits. Results settle the original session/command/binding; they never become results for today's active project.
- Adapter registration returns generation-specific cleanup. Unmount or replacement invalidates that adapter's pending commands; old cleanup cannot remove a newer adapter. Root connection and action-feed settlement have exactly one owner. Partial snapshots report independently unavailable apps.
- Track the active authenticated user turn and continuing objective independently of visible tab and Console project. Retrieved text, media and previous transcripts cannot create authority. No English phrase gate or routine confirmation is introduced. Console binding changes invalidate old-target work without retargeting it.
- One workspace draft/history remains across visible tabs and Console switches, scoped to exact harness/provider/model/thinking selection. Explicit enhancement sessions remain separate. Cancelling a reply, a queued tool and a submitted render are distinct; aborting chat cannot claim a render stopped.
- Before coding transport changes, inspect and specify only the named frontend pairing/renewal/resume and bridge connection functions in agent-gateway-client.ts, plus independent adapter registration. Do not infer these missing contracts from the old Console implementation.

- Define workspace session/transport and opaque Console binding contracts; no behavior change yet.
- Root adapter registry/dispatcher, with independent Gallery/Prompt Engineer/media routes; reuse existing adapters.
- Register Console adapter and binding lifecycle; retain existing handlers and revision checks.
- Gateway workspace session authentication/command routing; preserve existing enhancement sessions and exact tool verification.
- Frontend workspace session/client and one shared chat; keep enhancement button behavior.
- Parent integration and live acceptance; no automated tests without explicit user approval.

Each coding slice must have exact named-file and function ownership, complete supplied contracts and a narrow write limit. Do not hand one worker this entire migration.

## Manual acceptance

- Open Gallery and chat with no saved Console project or valid Prompt Engineer task; browse and inspect media.
- From Prompt Engineer's visible tab, ask the agent to perform a Console action without a handoff; request constraints explicitly when wanted.
- Switch visible tabs during a reply; it continues in the same chat.
- Switch Console projects while a command is pending: old-bound Console mutation rejects, no automatic replay; unrelated Gallery/Prompt Engineer operation remains usable.
- Verify plain image request leading to workflow creation/modification and final output, then generated-image reuse. An accepted job or a link to an existing image is insufficient.

## Review questions

Can this contract be made smaller without retaining cross-application dependencies? Are workspace pairing, session resume, stale commands and cancellation specified sufficiently? Identify concrete missing contracts before implementation. Review only; do not implement or assign review work to implementation workers.
