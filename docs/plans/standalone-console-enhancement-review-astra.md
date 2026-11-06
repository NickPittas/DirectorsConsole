# Standalone Console enhancement — narrow source review

What this change does: Provides Console prompt preparation, validation, and explicit legacy enhancement without requiring PE configuration. The Pi wrapper uses the standalone endpoints and passes cancellation through each operation.

Ranked findings: None substantiated within the allowed source.

Reviewed evidence (paths below are relative to `CinemaPromptEngineering/`):
- `api/providers/standalone_prompt.py:18-29`: bounded standalone input forbids extra fields; no PE configuration, session, or pixel input is required.
- `api/providers/standalone_prompt.py:67-82`: supplied context is validated, and conflicting task/dialect selections are rejected.
- `api/providers/standalone_prompt.py:85-101`: only a single declared `requires_selection` choice is resolved automatically; resolution is repeated. Unavailable packaged selections fail. Targets without packaged guidance have an explicit warning for base-prompt use.
- `api/providers/standalone_prompt.py:102-119`: model guidance is combined with caller text; metadata is explicitly not perception, and prepared content has a UTF-8 byte bound.
- `api/providers/standalone_prompt.py:120-134`: fingerprint includes full context, prepared prompts, effective selection, and returned skill metadata.
- `api/main.py:2771-2799`: validation checks the rebuilt fingerprint, rejects blank/oversized/truncated output, requires context for local H3, and delegates to shared output validation.
- `api/main.py:2872-2912`: legacy execution requires the explicit provider/model request; guidance is rebuilt after generation. Refreshed OAuth metadata survives provider failure, output rejection, and caught exceptions.
- `api/main.py:1882-1913`: the reused refresh helper requires a matching saved token and known expiry; ad-hoc credentials remain untouched.
- `frontend/src/api/client.ts:292-317,988-1045`: standalone serialization carries prompt, exact selection, and declared context; methods forward abort signals and validation fingerprint/truncation fields.
- `frontend/src/services/prompt-enhancement-agent.ts:53-76`: prepare → Pi → validate has no legacy fallback or PE state access; cancellation is forwarded and failed validation throws.

Verdict: No blocking finding in this source slice. This does not establish completion of the Console UI cutover.
Parent-supplied evidence: live prepare for LTX 2.5 i2v without PE fields returned available exact 2.5/ltx_native; not independently repeated here.
Not checked: task 74/Storyboard, resolver/catalog or shared validator internals outside the allowlist, Pi transport internals, automated tests, fixtures, builds, runtime/network/services, or private/configuration files.
Remaining risk: provider end-to-end behavior, live cancellation, OAuth persistence in the caller, and UI stale-result rejection remain unverified by this review.
