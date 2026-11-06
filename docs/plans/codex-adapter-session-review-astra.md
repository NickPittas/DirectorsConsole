# Codex adapter/session bounded source review

Scope: only codex-adapter.ts, codex-session.ts, codex-open-thread.ts, and codex-thread-resume.ts under CinemaPromptEngineering/agent_gateway/src/.

1. **P2 — Image cleanup failure does not prevent session reuse.**
   Locations: `CinemaPromptEngineering/agent_gateway/src/codex-session.ts:79-94`, `:39-47`; `CinemaPromptEngineering/agent_gateway/src/codex-adapter.ts:279-285`.
   A staging-cleanup error or rejected `staged.dispose()` sets sticky `cleanupFailed`, but the finally block releases `busy`; subsequent prompts never check that flag. The adapter also releases its busy flag and clears its media registry. Thus another turn can use the same workspace after image removal failed, with prior prompt media potentially still present. The sticky error is consulted only during eventual disposal.
   Minimal correction: reject further prompts once `cleanupFailed` is set, requiring disposal instead of reusing a workspace whose media cleanup failed.

2. **P2 — Failed creation cleanup is lost during adapter disposal.**
   Locations: `CinemaPromptEngineering/agent_gateway/src/codex-open-thread.ts:15-17`, `:79-81`; `CinemaPromptEngineering/agent_gateway/src/codex-adapter.ts:432-437`, `:320-332`.
   If disposal races with thread creation, creation can reach either cleanup path, both of which swallow an RPC disposal rejection. Adapter disposal waits for creations with `allSettled` but ignores their outcomes; its cleanup-failure check covers only managed-session closing promises. With no managed session, adapter disposal therefore resolves successfully even when the newly opened host's cleanup rejected, losing the cleanup failure and any indication that host shutdown was not confirmed.
   Minimal correction: preserve a sanitized creation-cleanup failure in adapter state and include it in the final disposal result; propagate that distinction from `openCodexThread` without exposing transport details.

Source inspection only; no tests, runtime, provider, browser, or network verification. Known limits supplied in the task are excluded from findings.

Parent corrections: image cleanup failure now closes the owned RPC and rejects all
later prompts on that runtime. Thread-opening cleanup propagates a distinct sanitized
failure; adapter creation tracks it, including cleanup after a late successful open,
and adapter disposal rejects when that sticky failure exists. Gateway typecheck passed.
Cleanup rejection paths remain source-verified only; no tests or provider calls ran.
