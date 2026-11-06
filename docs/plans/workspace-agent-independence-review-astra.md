# Workspace agent independence — architecture review

Verdict: revise the migration contract before implementation. The proposed separation is correct and needs no additional approval flow. One workspace chat must control three independent applications from any tab; cinematic preparation remains optional except for the explicit enhancement action.

Evidence: bounded source inspection only; runtime unverified. The supplied verified baseline is saved Klein rendering/output delivery, not workflow creation.

## Ranked missing contracts

1. **Workspace authentication and recovery are underspecified.** `server.ts:446-450,540-590,700-780` binds session ownership, dispatch, queued mutations, SSE attachment and result settlement to Console identity. `/pair/rebind` disconnects the entire bridge and disposes Console sessions. Merely changing chat surface leaves Gallery unavailable without a project or during switches. Specify project-free initial pairing, authenticated resume under the same exact origin/browser-tab owner and harness selection, credential expiry/replacement, and invalidation of old connections. Expiry must reject new dispatch/results under expired credentials; reconnection must never replay uncertain mutations. Resume must not adopt another tab's session by session ID alone. Distinguish lost transport from lost ownership.

2. **A binding ID alone does not close asynchronous retargeting.** `ApplicationCommandBase` currently requires project identity for every action; revisions are optional. Split independent command requirements from Console requirements. Capture the Console binding when the command is created, validate it after queue waits and immediately before each side effect, and retain it through asynchronous completion. Never resolve an old command against the current project. Switching A→B→A must invalidate A's original commands. Preserve existing required revision checks per operation; no revision reset may revive an old command. Correlate results to original bridge/session/command and target, not today's Console binding. A known stale rejection and an ambiguous submission require different outcomes; `submission_unknown` never permits replay.

3. **Root ownership needs an adapter lifetime contract.** `StoryboardUI.tsx:7370-7400` currently owns bridge mounting and action-feed settlement; `application-bridge.ts` reconnects using bridge/project identity. Root ownership must include a single stream and cleanup. Each adapter registers a handler and returns cleanup that removes only that registration. Unmount/replacement invalidates its queued commands; an old cleanup cannot remove a newer handler. Commands capture adapter generation/context, with checks before mutations after awaits. Missing Console must not remove Gallery, PE or media availability. Preserve exactly-once action-feed settlement and expose partial application snapshots without requiring every adapter.

4. **Authorization must survive removal of Console framing.** `AgentChatPanel.tsx:400-475` forces PE preparation or wraps text in a Console-specific authorization label. Define active authorization from the authenticated current user turn and its continuing objective, bound to the session/turn and permitted target context. Retrieved content, attachments, handoffs and previous transcripts are data, never new authority. Ordinary wording must work without an English magic phrase. Optional PE constraints must be explicit turn context available from any tab; stale preparation must not apply to changed PE context. Do not introduce routine confirmation for already authorized reversible work.

5. **History, selection and cancellation are separate lifecycles.** `AgentChatPanel.tsx:290-325` selects history/session by surface/project; `App.tsx:131-139` mounts two chats. Specify one workspace draft/history across tabs and Console switches, while keeping explicit enhancement sessions separate. Preserve exact harness/provider/model/thinking selection; changing selection must not silently reuse an incompatible session or fall back. Define whether history is displayed across selections without falsely claiming harness continuity. Cancel reply, cancel queued tool action, and cancel submitted generation are distinct operations. Disconnecting or aborting chat does not prove a render stopped. Project switching invalidates old Console actions without cancelling independent work.

## Smallest corrected migration contract

Use the existing bridge ID as workspace transport identity; add no second workspace identifier. A random opaque Console binding per activation plus existing revisions is sufficient for Console targeting **with the lifecycle and revalidation rules above**. Binding is not authorization. Reusing path-derived identity leaks scope and fails A→B→A; reusing gateway `scopeRevision` would require Console switch synchronization and alter its transport role, so it is not demonstrably cheaper. Keep filesystem identity browser-side.

## Bounded ordering and contract questions

All paths below are relative to `CinemaPromptEngineering/` unless stated otherwise.

1. Revise `docs/plans/workspace-agent-independence-correction.md` at repository root with the contracts above.
2. Define command/session scope in `agent_gateway/src/contracts.ts`, then ownership, queues and result checks in `agent_gateway/src/server.ts`.
3. Move stream ownership through `frontend/src/storyboard/services/application-bridge.ts` and `frontend/src/App.tsx`; convert `frontend/src/storyboard/StoryboardUI.tsx` to Console adapter registration.
4. Unify chat behavior in `frontend/src/components/agent/AgentChatPanel.tsx`.

Before assigning those slices, obtain bounded contracts for `frontend/src/services/agent-gateway-client.ts` pairing/resume and `connectAgentApplicationBridge`; the imported `frontend/src/storyboard/actions/application-actions.ts` command validator; and the definitions of `getCurrentPiSessionRef` and independent adapter registration. Their ownership/serialization cannot be verified from this allowlist. Do not guess additional implementation files.

Manual acceptance: project-free Gallery/PE/media; cross-tab Console control; tab switch during reply; A→B→A during queued/asynchronous mutations; adapter replacement/unmount; same-tab resume versus second-tab isolation; bearer expiry during submission; model change; distinct reply/render cancellation; actual workflow creation, persistence, output delivery and generated-image reuse.

Not checked: automated tests, fixtures, builds, services, network, credentials or runtime behavior. No application changes made; unresolved lifecycle contracts remain implementation risks.
