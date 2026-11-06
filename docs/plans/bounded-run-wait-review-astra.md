# Bounded run wait — narrow source review

Scope: allowed wait helper, applicationTool/dispatch/awaitOrAbort/get_run,
ApplicationResult/get_run contract, and bridge pending/result lifecycle only.

1. **P2 — Tool abort alone leaves the current bridge read pending.**
   `console-tools.ts:198-217,394-406`: awaitOrAbort rejects on abort, but
   scope.dispatch receives no cancellation signal or command-cancellation callback.
   The helper prevents another read once the active read returns; it cannot
   settle that active read. The pending entry/timer remains until a result,
   bridge/session cancellation, or the 120-second command timeout.
   `application-bridge.ts:397-402,520-531` has cleanup through cancelSession/settle,
   but the inspected tool-abort path does not invoke it.
   Parent should connect abort to cleanup of this specific pending read if no
   existing Stop hook guarantees it. External Stop wiring was outside scope;
   this is a signal-only cleanup finding, not a claim that UI Stop fails.

2. **P2 — The advertised 20-minute budget is a soft deadline.**
   `wait-for-run.ts:17-38`: the deadline is checked only after await read().
   A read started just before expiry can continue past it, up to the bridge's
   120-second timeout (`application-bridge.ts:10,457-470`). That timeout returns
   an error rather than the last pending snapshot marked waitTimedOut.
   Bound the active read to the remaining budget, with pending-read cleanup,
   or explicitly describe the wall-clock budget as soft. The 20-read cap holds.

Other inspected behavior: only waitSeconds=60 repeats; each read gets a fresh
UUID while retaining the original run, revision, project, Console binding,
bridge and session. Bridge results validate pending-command scope/action/binding;
the helper validates data.runId. Errors, unknown statuses (including
submission_unknown), and jobs requiring manual resolution stop further reads.
Budget-marked pending results retain status and data; no completion is invented.

Parent-supplied live evidence only: one 12-second video, one Pi get_run(60)
call spanning two bridge commands for the same run (pending then complete),
one render prompt, native video result, then final reply. Not independently run.

Skipped: implementation, tests/test access, fixtures, self-checks, builds,
network/runtime/services, configuration/private files, and out-of-scope callers.
Cancellation and expiry remain source-reviewed only; neither is live-proven.

Parent follow-up: the internal dispatch contract now accepts an optional AbortSignal. The long-run read passes its tool signal; the bridge settles that exact pending command on abort, sends its existing application_cancel event, clears its timer and removes the abort listener on settlement. Pre-aborted reads are not sent. Existing session Stop cleanup remains. Gateway build passed; signal-only cancellation was not live-verified.

The time budget is now explicitly described as checked between reads, with up to the existing 120-second command bound for an in-flight read. The helper documents this limit; no hard wall-clock deadline is claimed. The 20-read cap and truthful pending status remain unchanged.
