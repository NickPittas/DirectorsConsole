# Codex login ownership review

Source-only review of the three permitted login/host files and bounded server sections.
Paths below are relative to `CinemaPromptEngineering/agent_gateway/src/`.

## Findings

1. **P2 — Cleanup failure releases ownership before cleanup is confirmed.**
   Locations: `codex-login-manager.ts:60-72,114-128,156-158`;
   `codex-host.ts:65-68,112-126`.
   When host disposal rejects, the manager records `cleanupFailed` but publishes
   terminal `failed`. A subsequent start replaces `current`, losing the retained
   host and its cleanup-failure flag; manager disposal then only sees the new record.
   Startup failures are worse: `disposeOwned` suppresses disposal rejection before
   `openCodexHost` throws, so the manager never receives the host or cleanup failure.
   Thus neither path preserves ownership until successful cleanup, which is needed
   to enforce the single-active-host requirement when teardown fails.
   Minimal fix: retain failed-cleanup ownership and block replacement until cleanup
   succeeds; propagate a sanitized startup cleanup failure with retained cleanup
   ownership instead of discarding it. Do not expose raw transport errors.
   This establishes lost ownership on rejection, not an observed orphan process;
   the RPC disposal implementation and runtime were outside the permitted scope.

2. **P2 — Finished or cancelling login URLs remain available during teardown.**
   Locations: `codex-login-manager.ts:65-72,98-106,117-119,131-145`.
   Settlement awaits host disposal before clearing `awaiting_login` and `authUrl`.
   Cancellation similarly aborts the controller without clearing the snapshot.
   During these awaits, owner GET still returns the URL, and owner POST returns
   that same snapshot as an active sign-in, although completion or cancellation
   is already known. Buffered completion can also resolve before startup publishes
   its initial `awaiting_login` snapshot. This is stale owner-visible status/URL
   exposure; no cross-owner disclosure is established.
   Minimal fix: clear the URL as soon as completion/cancellation is known and
   prevent startup from publishing it afterward. Keep replacement blocked until
   teardown completes, independently of the visible status.

No source implementation was changed. No tests, fixtures, self-checks, builds,
runtime, CLI execution, browser/network/provider/login attempts, credentials,
configuration, installs, worktrees, commits, pushes, or child agents were used.
Initializer-ready success and the stated startup-ack cancellation allowance were
treated as intended behavior; existing pairing/origin/Host infrastructure was assumed correct.

Parent corrections: teardown now clears the visible URL before awaiting native cleanup,
and a separate teardown flag blocks replacement. Already-buffered completion is checked
before exposing the initial URL. Failed cleanup retains ownership and blocks another
start. Startup cleanup errors carry a sanitized retry closure; the login owner and
adapter retain it for cleanup rather than discarding the owned RPC. Gateway typecheck
passed. These failure paths remain source-checked; no actual login or tests were run.
