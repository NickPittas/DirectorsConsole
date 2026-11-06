# Codex one-turn lifecycle: source-only review

Scope: only the five authorized `CinemaPromptEngineering/agent_gateway/src/codex-*.ts` files.
Paths below are relative to `CinemaPromptEngineering/agent_gateway/src/`.

## P1 — Queued application dispatch can run after transport failure

- Location: `codex-rpc.ts:106-115`, `codex-rpc.ts:177-187`; `codex-turn.ts:144`, `codex-turn.ts:194`.
- A stdout chunk can contain a valid tool request followed by a malformed frame.
  The first queues invocation; the second synchronously calls `stop()`, making RPC unusable.
  The coordinator observes only `rpc.closed`, which resolves later on child closure.
  Meanwhile the queued microtasks run with an un-aborted internal signal, so
  `codex-application-tools.ts:140-144` can dispatch an application action after transport failure.
- Minimal correction: signal transport failure synchronously from `stop()` to the coordinator
  and abort its tool signal there; retain `closed` as the actual child-closure promise.

## P2 — Terminal cleanup mislabels potentially executed actions as rejected

- Location: `codex-turn.ts:85`, `codex-turn.ts:92-101`, `codex-turn.ts:110-116`.
- If a tool has entered `execute()` and an interrupted terminal event arrives before its
  promise settles, `fail()` aborts and `finishPending()` immediately sends `REJECTED`.
  Abort does not prove the action was prevented or rolled back. The wrapper's later
  unknown-outcome result (`codex-application-tools.ts:144-147`) is discarded by `respondOnce()`.
  The existing inspect-before-replay warning is therefore lost for precisely this race.
- Minimal correction: use `TOOL_FAILED` for unresolved invocations during terminal cleanup;
  reserve `REJECTED` for calls known not to have been dispatched.

## P2 — Invalid or foreign-thread tool requests receive no RPC reply

- Location: `codex-turn.ts:181-183`; `codex-rpc.ts:158-164`.
- The listener silently drops non-object parameters and mismatched/missing thread IDs,
  before the wrapper or `toolRequest()` can reject them. RPC has already registered the
  request, and its server-request set has no timeout. The peer receives no rejection;
  enough such requests also exhaust the 64 outstanding-request slots.
- Minimal correction: explicitly respond with a failed tool result for these rejected
  requests while this one-turn coordinator owns the connection.

Static review only. No source edits, tests, fixtures, self-checks, builds, runtime/provider
calls, browser use, or credential/config inspection. Findings were not reproduced live.

## Parent corrections

- RPC now exposes a stop signal aborted synchronously when transport enters closing;
  the coordinator aborts its tool signal immediately and checks both before invocation.
- Pending invocations are tracked separately from uninvoked calls. Cleanup reports
  potentially executed actions as unknown with inspect-before-replay guidance.
- Invalid and foreign-thread requests receive failed responses while the coordinator
  owns the connection, including before the turn-start acknowledgement.
- Gateway `npm run typecheck` passed after these corrections. Runtime races remain
  unverified; no automated tests or provider calls were performed.
