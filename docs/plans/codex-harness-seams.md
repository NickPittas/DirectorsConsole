# Codex application-harness seams
Scope: static source map for adding Codex as an application harness; Pi stays unchanged and no provider fallback is implied.

## Current seams
- Identity: `agent_gateway/src/contracts.ts:1-26` already admits `codex` in `AgentHarnessId`/`AgentSelection`/`AgentSessionRef`; selection still requires `provider`, `modelId`, and optional generic `thinkingLevel`.
- Pi catalog/error types: `contracts.ts:29-43,69-116` are Pi-shaped (`PiModelSummary`, `PiAvailability`, `PiStreamEvent`, `PiGatewayErrorCode`, `CreatePiSessionInput`); keep their current meaning.
- Pi hard stop: `agent_gateway/src/pi-adapter.ts:167-195` rejects non-Pi selections and refs; public surface at `306-390,450,593-620,945` covers availability, models, create/resume/turn/abort/dispose, and tool capability.
- Persistence: `api/providers/credential_storage.py:55-87,336-351` accepts Codex identity but validates only nonblank provider/model IDs, the shared thinking-level enum, and migration state; it does not validate live auth/catalog availability.
- Factory/routes: `agent_gateway/src/server.ts:490,836-941` creates one Pi adapter; `/models`, `/sessions`, and `/sessions/resume` all use it. Dispatch session create/resume by exact `selection.harnessId`; keep `/turn` session-owned.
- Session isolation: `server.ts:340-354,532-554,892-941` validates Pi refs then binds refs to bridge, surface, project, and unique owner before resume; retain those checks for Codex refs.
- Pi auth/catalog/status: `frontend/src/services/agent-gateway-client.ts:220-250,301-439,579` parses Pi model/availability shapes and errors, pairs with the local gateway, refreshes `/models`, and exposes disconnected/unavailable/loading/error states. Codex auth and inventory must come from its own harness path.
- Session cache/response checks: `agent-gateway-client.ts:87,543-650` keys refs by surface/project/harness/provider/model/level, resumes on the same key, requires `harnessId === 'pi'`, and verifies `applicationToolsAvailable`.
- Tool capability: `server.ts:845-941` returns adapter capability on open/resume; `agent-gateway-client.ts:642-648` rejects mismatches before a turn. Make Codex capability explicit and keep the surface policy aligned.
- Selector: `frontend/src/components/AgentHarnessSettings.tsx:45-122,153-230` edits only Pi catalog selections; preserves unsupported saved harnesses, labels Codex unsupported, and saves through shared settings.
- Enhancement boundary: `agent-gateway-client.ts:779-865` is explicitly `runPiPromptTurn`; Codex needs its own harness routing for both application chat and tool-free prompt enhancement. Preserve the existing surface isolation and never fall back to Pi automatically.

## Minimal implementation slices (at most two files each)
1. Selection contract/persistence: `contracts.ts` + `credential_storage.py`; settle Codex identity and reasoning-level fields while preserving Pi serialization.
2. Codex app auth/catalog and routing: new `agent_gateway/src/codex-adapter.ts` + `agent_gateway/src/server.ts`; add explicit Codex adapter factory dispatch and status/error mapping, without routing through Pi auth/catalog.
3. Settings selection and inventory parsing: `AgentHarnessSettings.tsx` + `agent-gateway-client.ts`; add a Codex application-harness selection flow and preserve unavailable saved selections.
4. Resume/isolation/tool capability: `codex-adapter.ts` + `server.ts`; own Codex session refs/resume while retaining bridge/surface/project ownership and reporting tool capability.

Read-only evidence only (`rg` plus bounded reads); no tests, builds, runtime, auth, network, or Codex wrapper. The public Codex wrapper mutates global mise config and was not run.

Parent coordination note: the four slices above describe integration areas, not executable Luna assignments. Adapter transport, protocol codecs, catalog/auth mapping, session creation, resume, turn streaming and route wiring must be separate bounded implementation tasks with exact inputs and owned regions; do not delegate the whole adapter plus server at once.

Parent local verification: the direct installed binary `/home/npittas/.local/share/mise/installs/codex/0.166.0/bin/codex` reports `codex-cli 0.166.0`. Its experimental TypeScript protocol was generated to `/tmp/directors-console-ui-retry-plownlfq/codex-0.166.0-protocol` with a disposable CODEX_HOME; no service or model turn ran and the mutable public wrapper was not invoked. The pinned schema includes `allowProviderModelFallback`, `dynamicTools` and explicit `modelProvider` on thread start; dynamic function tools require `type: function`, name, description and inputSchema. Model/tool isolation and auth remain unverified.
