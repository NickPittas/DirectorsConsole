# Workspace agent client contracts

Scope: bounded source inspection only. Inputs were the named functions in `agent-gateway-client.ts`, `workspace-agent-independence-correction.md`, and Astra's `workspace-agent-independence-review-astra.md`. No runtime validation.

## Current pairing, credential and session contracts

- The requested `bootstrapAgentGatewayFromLocation` symbol does not exist. The pairing entrypoint is `initializeAgentGatewayFromLocation` (`agent-gateway-client.ts:300-343`). It strips `dc_agent_pair` and `dc_agent_gateway` from the URL hash, requires a 43-character token, a local browser origin and a loopback gateway address, then starts one health check and one `/pair` request.
- Pair request JSON is `{token, bridgeId, surface: 'prompt-engineer'}`; project identity is deliberately absent. Browser-supplied Origin, no-store caching and redirect errors are used. Pairing starts with the cached browser bridge ID and increments a gateway revision; it aborts prior connection/model requests and clears the in-memory bearer/expiry.
- `parseCredentialResponse` requires a nonempty bearer, parseable future `expiresAt`, exact requested `bridgeId` and `surface`, optional string `projectIdentity`, and valid session refs. PE refs must have no project identity; every other surface's refs must equal the response project identity (`:251-278`).
- `installCredential` stores bearer/expiry and publishes bridge, surface, project and session inventory. Unless preserving inventory, it also aborts model loading, clears model/availability state, and advances the model request revision (`:280-298`). Expiry is an absolute timestamp checked inline; there is no expiry timer/helper in these functions.
- Renewal POSTs `/pair/renew` with the current bearer and `{}`; rebind POSTs `/pair/rebind` with optional `{projectIdentity}`. Both require unexpired credentials and preserve exact bridge/surface; renewal must preserve current project, rebind must match its requested project. Rotation failures clear credentials and mark the gateway unavailable. Rebind also drops local Console prompt-session refs (`:443-492`).
- `getCurrentPiSessionRef(surface, projectIdentity?)` returns null unless settings are loaded, valid, `harness_configured`, and select Pi. It looks up the exact selected gateway configuration; PE uses no project, other surfaces use the explicit or currently bound project (`:591-599`).
- `openPromptSession(selection, surface, projectIdentity, systemPrompt, signal, isCurrent?)` requires a live bearer, computes the surface/project/selection session key, and checks `isCurrent` before sending. It POSTs `/sessions` or `/sessions/resume` with exact gateway selection, surface, optional project identity, `reviewedContext: [{id:'cinematic-guidance', content: systemPrompt}]`, and an existing session ref only on resume. Response must be a Pi ref for the exact surface and project. `applicationToolsAvailable` must be exactly true for Console and false for PE; the ref is cached only after all checks (`:601-647`).

## Fingerprints, aborts and current SSE behavior

- `getAgentExecutionFingerprint(surface?)` covers settings loading/error/migration/selection and gateway status, bridge ID, model loading/error/availability and model IDs/image support. It omits project identity only for `surface === 'prompt-engineer'`; all other calls include it (`:495-514`). It does not include credential expiry.
- The inspected functions do not implement a settings/gateway subscription that aborts turns. `openPromptSession` and `connectAgentApplicationBridge` accept caller-owned `AbortSignal`s. Pairing/model `AbortController`s are not turn controllers. Consumers of the fingerprint must be inspected in a later caller audit to identify their actual abort subscriptions; that audit was outside this read allowlist.
- Thus selection/gateway changes can be detected by fingerprint comparison; Console project changes also change the default fingerprint, while PE ignores them. Expiry does not change the fingerprint and does not itself abort a running handler or stream. Bridge result settlement checks expiry after the handler returns.
- `connectAgentApplicationBridge(projectIdentity, handleCommand, signal)` currently requires a ready, unexpired credential and exact project match, then POSTs `{projectIdentity}` to `/application-bridge/commands` with the bearer (`:900-925`). One call owns one SSE response; there is no reconnect or replay loop.
- It accepts only `application_command` events whose JSON has string `sessionId`, a command, and exact `command.projectIdentity`. Each handler runs concurrently. A thrown handler becomes `{ok:false, commandId, action, error:{code:'application_action_failed', retryable:false}}`. Malformed, wrong-project, or mismatched-result messages are silently dropped.
- Before posting a result, it drops settlement if the signal aborted, bearer is missing/expired, bridge ID changed, or current project differs. It checks only matching `commandId` and `action` on the result, then POSTs `{projectIdentity, sessionId, result}` using the current bearer. It does not recheck a Console activation binding or revisions itself.
- EOF/abort/error exits the one read loop; `finally` cancels the reader and awaits all currently tracked command tasks. `handleCommand` receives no abort signal, so aborting the stream does not cancel its side effect and shutdown can wait for it. The signal aborts stream/result fetches, not the handler. If expiry/project change suppresses a result, this client sends no explicit stale/unknown outcome. The existing client therefore cannot promise whether an interrupted side effect happened.

## Minimal migration contract

- Keep the existing `bridgeId` as authenticated workspace transport/session scope; add no `workspaceId`. Pair once before any Console project exists. Root owns one SSE stream and routes only to independently registered adapters. A missing adapter reports its own app unavailable; it must not disable Gallery, PE or media actions. Do not infer uninspected adapter capabilities.
- Decouple the root stream from Console project state: remove the project requirement from the root connection signature/body and event gate. The authenticated bearer resolves to the same bridge owner; visible tab and project are not transport identity. Project switching must not renew/rebind the workspace transport or dispose its chat session.
- The workspace chat needs an explicit project-free session scope bound to the existing bridge ID and exact harness/provider/model/thinking selection. The inspected client only demonstrates `console`/`prompt-engineer` surface behavior; it does not establish an existing workspace session capability. Add that contract explicitly rather than treating workspace chat as Console or as PE enhancement. No provider/model fallback.
- Keep PE enhancement on its separate explicit path: preserve `openPromptSession`'s PE surface, cinematic `systemPrompt`, exact Pi/session checks and `applicationToolsAvailable === false`. Do not make ordinary shared chat pass through cinematic preparation.
- Make workspace abort/fingerprint semantics selection- and credential-aware but project-independent. Keep Console target invalidation separate: give every Console activation a new opaque `bindingId`, including A→B→A; retain it with the command through queues/awaits and recheck binding plus existing operation revisions immediately before every side effect and after awaits. A binding is a stale-target guard, not authorization.

## Proposed command/result envelope

Use `bridgeId` only as a correlation echo; the bearer and server-side bridge ownership remain the authority. Preserve current `sessionId`, `commandId`, `action`, action payload and result shape; add an explicit target so independent actions carry no Console identity:

```json
{"bridgeId":"<existing bridge id>","sessionId":"<owned session>","command":{"commandId":"<id>","action":"<registered action>","target":{"application":"console","bindingId":"<opaque activation>","revisions":"<existing required Console revisions>"}}}
```

Independent targets carry only their own existing context: PE `{application:'prompt-engineer', contextRevision, preparedPromptId?}`, Gallery `{application:'gallery', workspaceRevision, rootId, serverId}`, media `{application:'media', assetId, fileIdentity}`. These are routing/context fields, not new capabilities; reject unsupported actions and arbitrary URLs/roots.

```json
{"bridgeId":"<same authenticated bridge>","sessionId":"<original session>","result":{"commandId":"<same id>","action":"<same action>","target":"<exact original target>","outcome":"applied|rejected_stale|submission_unknown"}}
```

Settle only against the authenticated original bridge, session, command and target. `rejected_stale` is a known pre-side-effect rejection (`error.code: stale_console_binding`, nonretryable); it may trigger a state refresh, never retarget. `submission_unknown` means dispatch may have reached a side effect but completion is unconfirmed; never replay it. Preserve existing revisions in addition to `bindingId`. Independent Gallery/PE/media outcomes never depend on Console binding.

## Caller/symbol contracts to retain

- Root retains one-time `initializeAgentGatewayFromLocation`, exact credential parsing/install, and `connectAgentApplicationBridge` ownership; its project-bound call signature is the client change point.
- Keep `renewAgentGatewayCredential` bridge/surface/session ownership unchanged. Restrict `rebindAgentGatewayProject` to explicit Console lifecycle if still needed; it must not rebind or delete workspace/PE enhancement sessions.
- Consumers of `getAgentExecutionFingerprint` need a project-independent workspace variant while preserving exact selection invalidation. Consumers of `getCurrentPiSessionRef` and the private `openPromptSession` retain PE's separate project-free Pi session contract.
- The actual callsite list, fingerprint subscribers, gateway session schema, action validator and adapter registration are not established by these allowed reads. Astra's review explicitly requires those as separate bounded contracts before implementation; do not rewrite callers from inference.

Source limits: inspected only the named client functions/helpers and the two plan/review documents. No tests, fixtures, SDK, services, application files, or runtime behavior were checked.
