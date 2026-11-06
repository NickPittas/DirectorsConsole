# Codex application boundary — narrow architecture review

**Decision:** proceed with bounded adapter implementation; keep Codex UI activation gated. The proposed controls are a viable product boundary, but current evidence does not establish enforcement of application-only effects. Literal zero built-ins is unnecessary for workspace chat; arbitrary host access remains unacceptable.

## Evidence and limits
- Read the two named plan documents, `CinemaPromptEngineering/agent_gateway/src/contracts.ts` session/scope interfaces, and the eight supplied generated 0.166.0 types. No other implementation was inspected.
- Parent metadata evidence establishes initialization and accepted `shell_tool=false`, not a model-visible tool inventory or execution boundary. Documented gates and registry names below are supplied evidence, not newly verified behavior.
- `dynamicTools` registers application tools; the schema does not say it replaces built-ins. Rejecting server requests cannot stop built-ins that execute inside app-server without asking the host.
- Empty app-owned `CODEX_HOME`/cwd reduce inherited configuration and context; neither is filesystem confinement. Read-only sandboxing alone does not establish confidentiality of host files or eliminate network access.

## Minimum boundary
- Pin `/home/npittas/.local/share/mise/installs/codex/0.166.0/bin/codex`; never invoke the public wrapper, which can mutate global mise configuration.
- Use app-owned home/cwd, explicit read-only sandbox, no approval escalation, and host-owned settings: `features.shell_tool=false`, `features.view_image=false`, `web_search="disabled"`, apps/plugins disabled, `project_doc_max_bytes=0`; exclude inherited MCP configuration.
- Explicitly disable applicable stable gates `multi_agent`, `sleep_tool`, `plugins`, `in_app_browser`, `browser_use`, `computer_use`, `remote_plugin`, `skill_search`. Under-development `skip_host_skill_discovery` and `request_permissions_tool` require pinned semantics before being relied upon.
- Disable environment access with `environments: []`; constrain runtime workspace/capability roots to the intended application profile. Do not accept arbitrary config, paths, environment overrides or capability roots from browser/model input.
- Allow only required host RPCs for initialization, account/catalog metadata, owned thread lifecycle, turns and interruption. Exclude generic `fs/*`, command execution and configuration mutation RPCs.
- Reject every server request except validated `item/tool/call` for tool-enabled application sessions; tool-free enhancement rejects that too. Rejection is protocol handling, not a new user approval flow.
- Validate tool namespace/name/arguments against the registered application tools and bind `threadId`, `turnId`, `callId` to the active owner. Supply bridge/session scope from authenticated host state; never trust model-supplied scope.
- Preserve existing command validation, revision checks and action policies. Reuse `ApplicationCommandDispatcher`; do not introduce a general filesystem/shell/network tool or another application's runtime dependency.
- Workspace sessions remain independent of an active Console project: retain owning bridge identity internally, as `ApplicationSessionScope` specifies. Keep workspace and PE enhancement histories, scopes and tool capabilities separate.
- Harmless internal planning is acceptable in workspace chat only if it cannot read files, execute processes, access the network or spawn agents. For literal tool-free PE enhancement, `dynamicTools: []` alone is insufficient; disable remaining callable tools or keep that surface unavailable.

## Exact selection and resume
- Dispatch by selected harness; pass exact provider/model and supported reasoning level. Set `allowProviderModelFallback:false` on start; reject mismatching returned model/provider before any turn. Never substitute Pi, another model, or another reasoning level.
- `ThreadStartResponse` exposes effective cwd, roots, instruction sources and sandbox/profile for validation; `disabledPluginIds` explicitly does not filter capabilities and is not an enforcement signal.
- Resume only host-owned thread IDs bound to bridge/surface/project/selection; prohibit caller-provided `history` and `path`. Reapply the boundary and reject selection mismatch before turns.
- `ThreadResumeParams` lacks both `allowProviderModelFallback` and `dynamicTools`: persistence/replacement of tool registration, effective settings and resume fallback behavior need pinned proof. Start-time validation alone cannot justify safe resume.

## CLI-login reuse remains unresolved
- `GetAccountResponse`/`Account` describe account state, not credential transfer; use `account/read` with `refreshToken:false` for metadata and avoid logging personal account details unnecessarily.
- `CODEX_HOME` combines authentication and rollouts. Reusing the CLI home defeats the proposed isolation; a fresh home does not establish access to the CLI login.
- Require upstream 0.166.0 evidence for a supported shared credential/keyring or authentication-provider mechanism, including lookup identity, refresh ownership and isolation from global config/history. If absent, report login reuse unsupported; do not invent a credential-file parser, copy secrets by default, or silently change authentication mode.

## Precise proof needed before activation
- Trace pinned tool-registry construction for the selected model/config: all file-read/write/patch, shell, network/search, MCP/app/plugin, skill, browser/computer and subagent paths; determine which bypass client requests and which gates actually remove them.
- Establish gate precedence and instruction/skill discovery across home/cwd/parents, empty-root/environment semantics, effective sandbox read/network reach, and persistence across start/resume/turn overrides. A feature-list response is insufficient.
- Obtain permitted pinned behavior evidence for the resulting workspace and tool-free enhancement profiles, exact selection on resume, and supported CLI-login reuse; no such verification was performed here.

## Implementation that can progress while gated
- Add narrow pinned protocol codecs and transport/RPC allowlists, then a Codex-specific account/catalog mapper with explicit unavailable states and exact-selection validation.
- Add host-owned session mapping and start-response validation, followed separately by scoped dynamic-tool dispatch and streaming/cancellation settlement. Keep resume disabled until its contract is proven; preserve existing Pi behavior and saved Codex selections without enabling unverified turns.
- This review writes only this report. No implementation, tests/fixtures/self-checks, builds, CLI/runtime/services, auth/config/credential access, network calls or delegated agents; remaining risk is unproven builtin isolation and login reuse.
