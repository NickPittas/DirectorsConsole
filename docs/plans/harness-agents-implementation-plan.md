# Harness Agents and ComfyUI Implementation Plan

**Status:** revised by parent after Astra review; bounded Pi foundation implementation may proceed under the user's existing request. This document grants no additional runtime installation, private-configuration, test, or delivery authorization.

**Review disposition:** findings 1-8 in `harness-agents-plan-review-astra.md` are incorporated below. Console mutation/run tools remain disabled until their persistence, admission and submission-recovery prerequisites are implemented and reviewed. Runtime acceptance is still pending.

**Implementation progress:** T1a, T1b, T2, T3 and the small T4a existing-guidance integration are implemented and parent source-reviewed. Parent corrected duplicate reviewed-context normalization, model-ID limits, tab/project pairing, the frontend error-state/SSE TypeScript issues and the Vite agent-settings proxy. T6 storage/service code is implemented and parent source-reviewed; parent corrected consecutive queued bulk snapshots while keeping direct-write/reload/deletion barriers. T5 still owns debounce cancellation, canonical frontend revisions, durable submission tracking and panel attachment. Full curated task/adapter skill coverage remains T4b.

**Parent verification after T3:** gateway TypeScript build passed; frontend TypeScript compilation passed; syntax compilation of the three changed Python API modules passed. Using real local services with temporary CPE application data, manual HTTP requests confirmed gateway health, one-use pairing, authenticated Pi model inventory, frontend-proxied agent-settings loading and credential-free FLUX.1 prompt preparation. The first backend launch was affected by inherited Python environment variables; clearing those for that process allowed normal startup. No live Pi inference, browser interaction, ComfyUI render, automated tests, remote installation or end-to-end production-loop acceptance has run. Runtime frontend behavior and generation remain unverified.

**Resource indexing:** GLM5.3 Flash completed `agent_resources/sources.json` and its README with 26 source projects and 15 task-resource records, distinguishing primary-read facts from plan-collated unknowns. Parent reviewed the index and corrected its refresh policy to avoid per-request source research. This is source-discovery metadata, not installed skills, runnable recipes or proof of backend model availability. T5 application actions are in progress; task-specific skill packaging/resolution is the next independent T4b subtask.

**T4b backend/resource progress:** packaged local family/task guidance, `prompt_skills.json`, the bounded local resolver, skill catalog API and prepare/validate fingerprints are implemented. Parent source-reviewed these and corrected the image-count check so description-only vision inputs do not count as generator conditioning. Python syntax checks passed. Manual requests to the real CPE service confirmed FLUX.1 T2I resolves two local resources with a fingerprint, and the Qwen 2.1 catalog exposes five task choices. Prompt Engineer task/version/adapter controls are still pending; LTX control modes whose distinct media context is not yet representable remain explicitly unsupported. Frontend compilation during ongoing T5 edits has reported Storyboard diagnostics, handed to its owner; no completed frontend check is claimed for this concurrent snapshot.

**T0 read-only reconnaissance (2026-11-05):** SSH to Tailscale `100.122.195.17` authenticated successfully; host identifies as KAMINO-3, Windows 11 Pro. Located `main.py` in `C:\Users\Nick\Documents\ComfyUI-Easy-Install\ComfyUI-Easy-Install\ComfyUI`, with sibling `python_embeded`. `extra_model_paths.yaml` points its default model base to `R:\Comfyui`; default installation model folders are not authoritative for availability. `Test-Path` confirmed that base is inaccessible in SSH, while the user's saved drive mapping identifies R: as `\\192.168.100.8\Kessel`; equivalent UNC model-root access remains unverified. The SSH process/port inspection found no running ComfyUI Python process or corresponding listening port; live HTTP/WS/schema verification remains pending. Windows mapped-drive visibility must be verified in the management session before provisioning; do not replace the configured shared model base with a local download directory or remap drives automatically. No installation, configuration edits, model downloads or service starts were performed.

**Research date:** 2026-11-05

**Latest implementation update:** T4b Prompt Engineer task/version/adapter controls are implemented. Parent corrected mismatched option/selection keys and the valid-selection warning. T5 application actions, awaited workflow save/attachment, authenticated fetch/SSE bridge and durable single/parallel submission journal are implemented; parent first-pass source review corrected media capture indexing and bridge-result credential renewal. Frontend TypeScript compilation and gateway build pass after these corrections. No automated tests or T5 live acceptance have run. Console mutation tools remain unregistered until T10 integration and review. T7 conversation/handoff UI and bounded T8 backend inspection are next. Earlier progress paragraphs above are historical snapshots.

**T8a update:** managed-backend capability inspection, URL-keyed short-lived schema caching, exact advertised loader options and manual dependency-plan endpoints are implemented and parent source-reviewed. Diff whitespace checks pass; delegate syntax parsing passed. HTTP advertisement remains distinct from model identity, management access and configured model-root verification. No T8 live backend verification has run. T7 UI is in progress; T8b provisioning execution and T9 executable recipe curation follow independently in separate ownership scopes.

**T7 first-pass update:** separate visible chat panels, streaming, session notices and handoff cards are implemented. Parent review identified incomplete project-scoped visible history, missing complete immutable handoff specifications/media references, no model consumption of displayed handoffs, and no validated explicit prompt-application path. These are required T7b implementation follow-ups, not accepted omissions. T8b installation and T9a initial recipe implementation continue independently. T7 runtime acceptance remains pending.

**T7b update:** scope-keyed UI histories/drafts/feeds, context invalidation, deep-frozen generation specifications with bounded in-memory media snapshots, explicit Console handoff consumption and validated Prompt Engineer application are implemented. Parent source inspection confirms these paths and diff whitespace checks pass; delegate frontend compilation passed. Live UI/provider acceptance is still pending. Refresh clears UI history and handoff media; persisted harness sessions are separate. T8b and T9a remain in progress, with bounded comfy-cli reuse next. T10 application-tool registration has not begun.

**T9a update:** pinned LTX-2.3 distilled-LoRA and FLUX.2 Klein 4B distilled source graphs, separate application overlays, exact dependency records and read-only catalog/resolve APIs are implemented. Parent source inspection confirms fixed ID-to-file paths, hash checks and explicit unverified readiness. Klein uses upstream subgraphs; the current frontend parser does not supply subgraph conversion, so a supported export/conversion integration is required before application execution. No rendering or backend compatibility acceptance is claimed. MiniMax recipe coverage is the next T9 slice.

**T8b first-pass update:** backend management configuration, fixed SSH helper protocol, immutable model install jobs and explicit authorization/status/cancel routes are implemented. Parent review corrected a contract mismatch: dependency provenance is descriptive metadata, not necessarily a URL; authoritative source URLs retain the publisher validation. Syntax compilation and whitespace checks pass. Live management, transfer and readiness verification have not run. Remote execution requires the helper already installed and trusted SSH access; tokenized CDN redirects currently fall back to manual downloads, job history is in memory, and process-to-environment association remains unverified. These limits prevent claiming automatic installation is accepted on Kamino-3.

**T8c update:** bounded comfy-cli 1.22.0 adapter and attributed application skill are implemented; template discovery/export, cached knowledge and saved-schema workflow inspection are exposed as fixed adapter operations. Parent source inspection confirms shell-free fixed argument arrays and explicit saved-workflow/schema hooks. Delegate gateway compilation passed; installed CLI/caches and runtime operations remain unverified. T10 must register operations explicitly; the adapter does not confer automatic MCP or remote installation support. T10a typed application-tool wiring and T9b MiniMax recipe curation are in progress.

**T10a / T9b update:** six Console application tools are registered through Pi's pinned SDK and authenticated bridge; PE remains tool-free. Parent review corrected mutation serialization to share one queue across sessions for the same bridge/project, and gateway build passes. Runtime round-trip acceptance is pending. MiniMax curation adds distinct T2V, I2V, FL2V and Ref2VA records; subgraph/export requirements block the first three, with a documented 6-versus-8-step FL2V source conflict. Ref2VA has a source-identified 4-step LoRA alternative, still runtime-unverified. The T9b delegate reported a boundary violation: it accessed two upstream files under a benchmarks path, then deleted scratch copies and excluded them. No benchmark execution was reported. Subsequent curation must avoid those paths entirely.

## 1. Decisions and boundaries

1. **Ship Pi first.** Embed the official Pi TypeScript SDK in a small local Node agent gateway. Add Codex second through the official app-server stdio/JSON-RPC interface, then Claude Code through the official Claude Agent SDK. Assess Antigravity after those integrations; do not advertise it as supported until its adapter passes the same capability checks.
2. **Select an agent harness/model, not a media generator, in Agent Settings.** The shared selection is used by both Prompt Engineer and Console Agent. Keep the existing generation target (`target_model`, exact model/version, dialect and recipe) as a separate selection.
3. **Use two conversations.** Prompt Engineer and Console Agent have separate session IDs, histories, tools and skills. Sharing a model selection must not merge their context. A handoff is an explicit, immutable package sent by user action, not implicit history sharing.
4. **Preserve cinematic behavior.** Reuse `get_system_prompt()`, `build_enhancement_prompt()`, active film preset/style overrides, the canonical target registry and existing model guides. Do not replace these with a generic agent persona or a generic generation prompt.
5. **Keep direct frontend-to-ComfyUI generation.** Extract the existing frontend operations into callable application actions and let agent tools invoke those actions through a bridge to the active browser. Do not move generation into the Orchestrator or a ComfyUI MCP server.
6. **Use Comfy MCP/comfy-cli as optional domain tooling, not as the application execution pipeline.** Native application actions own panel state, upload binding, run IDs and frontend persistence. MCP support does not prove remote model discovery, filesystem access, installation or lifecycle control.
7. **Treat every render backend independently.** Cache live node/model capabilities per backend. Never assume shared input, output or model storage. Local CLI downloads must never silently substitute for remote installation.
8. **Make workflow edits real application revisions.** A valid control map, awaited persistence and panel attachment are part of one application action. Backend storage alone is not a completed workflow installation.
9. **No automatic GPU benchmarks or automated tests.** Parent code review and manual live verification come first. Automated regression tests require separate user approval after that verification. No test or benchmark artifacts are part of this plan.
10. **No worktrees.** Implementation occurs in this shared checkout with the non-overlapping ownership below. The existing dirty `Orchestrator/orchestrator/data/path_mappings.json` and untracked `agent_tasks/` are user-owned and out of scope. Parent alone commits/pushes after review and approval, using `[skip ci]`; no PR is required.

## 2. Verified existing architecture and gaps

### Prompt composition to preserve

- `CinemaPromptEngineering/api/main.py:2441-2630` validates target/images/context, obtains preset and cinematography-style overrides, calls `get_system_prompt()` and `build_enhancement_prompt()`, invokes the selected LLM, and performs local-H3 structural validation. Active config, preset and style are all supplied; this is not a base-config-only path.
- `api/providers/system_prompts.py:25-27,91-140,297-405` loads `system_prompts/model_prompts/*.md`, combines general and exact-model guidance, and serializes all cinematic configuration plus context. `system_prompts.py` is a module; `system_prompts/` is its resource directory.
- `api/providers/prompt_profiles.py` currently defines `Task = Literal['t2v', 'i2v', 'ref2v']`, model/dialect registries, typed asset roles, H3 formatting and validation. `api/providers/enhancement_images.py` separately owns image modes, actual-pixel validation and per-target image dialect capabilities.
- `cinema_rules/target_models.py` owns canonical generation-target IDs, aliases and legacy aliases. Persisted target IDs must not be replaced with harness model names.
- Existing guides already distinguish LTX 2.3/2.5, local versus hosted MiniMax H3, FLUX variants, Krea 2 and other targets. Extend these rather than creating a parallel prompt engine.

### Application and generation paths to reuse

- `frontend/src/storyboard/StoryboardUI.tsx` is the current owner of active state. Relevant paths are workflow loading/saving (`1390-1520`), raw import with `exposed: false` (`2225-2320`), parallel generation (`2543+`), single-node generation (`3028+`), enhancement (`4165+`), and Workflow Editor save (`6760+`).
- `workflow-parser.ts` supplies `parseWorkflow(workflow, objectInfo)`, `buildWorkflow()`, graph/API normalization, widget/input binding and downstream bypass behavior. `node-definitions.ts` supplies a URL-keyed live `/object_info` cache. Use the selected backend's schema, not a static node list.
- `frontend/src/storyboard/comfyui-client.ts` provides upload, history, media extraction and a retrying submission helper. The active single/parallel submission paths instead use inline `/prompt` fetches in `StoryboardUI.tsx` around lines 2944 and 3373. Run IDs currently live in React refs and do not survive reload. T5 must cover both active submission sites; if it adopts the client helper it must remove retries after ambiguous POST outcomes.
- `api/workflow_storage.py` currently writes workflow files directly with `write_text`; atomic replacement is work to implement. Its bulk sync also deletes files absent from an incoming snapshot. Frontend changes are debounce-saved with `workflowStorage.saveAll()`, whose body-level failures are not currently surfaced by the caller. T6 must coordinate every writer with T5; otherwise stale bulk saves can undo or delete new revisions. Calling only `/api/workflows` also does not update live selection, parameters or panel attachment.
- `services/orchestrator.ts` stores stable render-node IDs and polls nodes directly. `NodeManager.tsx` manages name/URL and exposes restart actions. The Orchestrator's `BackendConfig` and `ComfyUIClient` provide reusable status/cancellation concepts, but the current frontend remains authoritative for generation.

### Gaps this implementation must close

- Provider/account credentials and provider model IDs currently drive both enhancement entry points through `Settings.tsx`, `CinemaPromptEngineering.tsx` and `StoryboardUI.tsx`.
- There is no harness session manager, scoped tool surface or explicit Prompt Engineer-to-Console handoff.
- Imported controls are hidden by default and schema metadata can be absent without live `object_info`.
- Workflow records lack revision/provenance/verified-backend metadata.
- Render-node records do not distinguish HTTP reachability, remote installation access, configured model roots or verified shared storage.
- A failed or ambiguous prompt submission must not be retried blindly; current run IDs and per-node prompt IDs should become the reconciliation keys.

## 3. Target architecture

```text
Shared Agent Settings (non-secret, versioned)
          | harness + provider/model + thinking level
          v
Local Agent Gateway (Node; Pi SDK first)
  |-- Prompt Engineer session: cinematic/model skills; no app-mutation tools
  |-- Console session: application skills + bounded ComfyUI/app tools
  |-- Codex app-server adapter (second)
  |-- Claude Agent SDK adapter (third)
  `-- Antigravity assessment only (not initially advertised)
          |                         |
          | prepared prompt HTTP    | tool call
  v                         v
CPE FastAPI prompt preparation   Browser fetch/SSE application bridge
  + existing cinema rules           + expected state/workflow revision
  + existing target profiles        + idempotency/conflict checks
  + existing output validation      + extracted Storyboard actions
                                    + existing direct ComfyUI client
                                    + existing panel/history/gallery actions

Optional per-backend services:
  live ComfyUI HTTP inspection | local comfy-cli | explicitly configured remote management
```

### Pi-first gateway

Use `@earendil-works/pi-coding-agent` with:

- `ModelRuntime.create()` and `getAvailable()` to list only models with usable authentication; `getModel(provider, id)` to resolve the exact shared selection.
- `createAgentSession()`, an explicit `model` and supported `thinkingLevel`, event subscription, `agent_settled`, `abort()`, and `dispose()`.
- Separate persistent `SessionManager` stores for Prompt Engineer and Console under application-owned session directories. Do not mix these with project assets or print session contents to ordinary logs.
- `SettingsManager.inMemory()` for gateway policy so normal application actions do not write global Pi settings. Reuse existing Pi authentication read-only; login remains a user-managed harness action. Never copy legacy CPE tokens into Pi automatically.
- An explicit resource loader containing only reviewed project resources and the gateway's inline application-tool extension. Disable unrelated global/project extensions and arbitrary filesystem/bash tools for these product sessions. Pi custom tools use `pi.registerTool()` with JSON Schema/TypeBox validation.
- Actual image blocks only when the selected reasoning model advertises image input. Otherwise return a clear unsupported-input result or use an explicitly supplied text description; never pretend pixels were inspected.

Add the gateway to `start.py` with health, shutdown and a configured local port. Bind to loopback by default. Do not expose a new public service or add a generic plugin loader.

T1 owns a separate gateway package manifest and lockfile, exact Pi SDK release, supported Node engine, development/production entry points and dependency setup documentation. Resolve the actual SDK release and verify its package declarations/exports before implementing the adapter; latest documentation is not proof of installed signatures. Align with the frontend Node range where the SDK supports it. T1a supplies a standalone foundation without changing the launcher; T1b integrates startup, dependency setup, readiness and shutdown in `start.py`. Normal launches must report a disabled/unconfigured gateway clearly and retain manual application use; backend-only launches must not start an unnecessary gateway. Never start services or install dependencies as a side effect of merely importing modules.

### Later harnesses

- **Codex:** use `codex app-server` over stdio. Implement initialize/initialized, `model/list`, `thread/start`, `thread/resume`, `turn/start`, cancellation and event mapping. Use its normal approvals and MCP configuration for domain tools. Do not depend on experimental WebSocket transport or experimental dynamic tools.
- **Claude Code:** use the official TypeScript Agent SDK `query()`, `supportedModels()`, resume/fork, project `settingSources`, permission callbacks, and an in-process SDK MCP server created with `tool()`/`createSdkMcpServer()`. This future application-harness work remains in scope, but no Claude model is assigned to produce or review the implementation under the current team restriction.
- **Antigravity:** official documentation now provides a local Python SDK with custom tools, skills, MCP, policies and persistence, and a separate managed Antigravity agent through the Interactions API. The managed agent is preview and has different sandbox/structured-output constraints. The existing CPE `antigravity` provider uses a third-party OAuth integration; that is not proof of official SDK authentication compatibility. Assess local SDK model discovery, resumable sessions, image input, custom-tool approval and process lifecycle before deciding whether a Python adapter is justified.

## 4. Shared contracts

Put the transport-neutral TypeScript contracts in the gateway and mirror the Python payloads with Pydantic models at the CPE boundary. Do not create a general plugin system; these are fixed contracts for the named harnesses and tools.

### Agent selection and sessions

```text
AgentSelection {
  schemaVersion: 1
  harnessId: "pi" | "codex" | "claude-code"
  provider: string
  modelId: string
  thinkingLevel?: string
}

AgentSessionRef {
  surface: "prompt-engineer" | "console"
  harnessId: string
  sessionId: string             // harness-native ID/file reference
  projectIdentity?: string
}
```

Changing model within a harness may use the harness's supported model-switch behavior. Changing harness opens or resumes a session belonging to that harness; never replay one harness's private transcript into another implicitly. Old sessions remain resumable.

### Prompt preparation and generation specification

```text
PromptPreparation {
  systemPrompt: string
  userPrompt: string
  canonicalTargetModel: string
  task: string
  dialectId?: string
  recipeId?: string
  assetContext: ConditioningAsset[]
  warnings: string[]
}

ConditioningAsset {
  id: string
  kind: "image" | "video" | "audio"
  role: "edit_source" | "reference" | "style_reference" |
        "first_frame" | "last_frame" | "keyframe" | "control" |
        "reference_video" | "reference_audio" | "composite_sheet"
  ordinal: number
  source: "upload" | "panel" | "gallery" | "file"
  contentHash: string
  mediaRef: string               // existing validated data URL/file/panel reference
  backendBindings: Record<backendId, UploadedMediaBinding>
}
```

Extend the existing task registry incrementally with explicit values such as `t2i`, `i2i`, `multi_reference`, `outpaint`, `rgba`, `t2v`, `i2v`, `fl2v`, `l2v`, `ref2v` and `v2v`; only register a task when its model/dialect contract is defined. Keep `normalize_target_model()` for all saved aliases. Unknown task/adapter combinations fail before enhancement or submission.

### Application commands and runs

```text
ApplicationCommand {
  commandId: string
  idempotencyKey?: string
  expectedProjectRevision?: number
  expectedPanelRevision?: number
  expectedWorkflowRevision?: number
  arguments: object
}

ApplicationResult {
  ok: boolean
  commandId: string
  newRevision?: number
  runId?: string
  installJobId?: string
  data?: object
  error?: { code: string; message: string; retryable: false | true }
}

GenerationRunRef {
  runId: string                  // reuse GenerationRun.id
  projectIdentity: string
  panelId: number
  workflowId: string
  workflowRevision: number
  mode: "single" | "parallel"
  jobs: [{ backendId: string, promptId?: string, seed?: number }]
}
```

The bridge deduplicates `commandId` and generation `idempotencyKey`, but in-memory deduplication is insufficient. Before either active `/prompt` POST, persist a minimal run journal containing command/run ID, project/panel/workflow revision, backend ID, timestamp and submission state; exclude credentials and media bytes. Persist returned prompt IDs before acknowledging success. Verify a server-visible correlation mechanism against the selected ComfyUI release before choosing extra_data or caller-assigned IDs; an application run ID is not currently sent by the active paths. If supported, use that key to match queue/history records. `/history/{prompt_id}` only helps once prompt_id is known. If correlation is unavailable or ambiguous, retain `submission_unknown` across reload and require explicit manual resolution; never claim successful reconciliation or automatically resubmit. Retry only operations proven safe before submission. Reloaded journals reattach to the exact project/backend, and unknown runs never become automatically retryable.

### Backend capability and dependency records

```text
BackendCapabilityRecord {
  backendId: string
  name: string
  configuredUrl: string
  httpReachability: "unknown" | "reachable" | "unreachable"
  websocketReachability: "unknown" | "reachable" | "unreachable"
  installationAccess: "unknown" | "none" | "local-cli" | "remote-management"
  storage: "unknown" | "backend-local" | "verified-shared"
  comfyVersion?: string
  objectInfoHash?: string
  modelRoots?: Record<loaderFolder, string[]>  // discovered, never guessed
  serviceEnvironment?: string                  // discovered service/venv identity
  capabilities: string[]
  inspectedAt?: string
}
```

A URL grants neither filesystem nor management access. `object_info` enum entries prove what that backend currently advertises, not that a remote management host has the same files.

## 5. Prompt Engineer and model/task skills

### Implementation path

1. Extract the side-effect-free preparation and response-validation portions of `main.py:enhance_prompt` into an existing-provider-layer service. Preserve the legacy endpoint unchanged for migration/rollback.
2. Add an agent enhancement endpoint that calls the same preparation service, sends its exact system/user prompt and validated image blocks through the shared harness session, then runs the same local-H3/deduplication handling. Keep existing stale-response guards in both frontend callers.
3. Keep cinematic preset/style resolution and the active config serializer authoritative in Python. The Node gateway must not reimplement cinema rules.
4. Add reviewed, source-attributed `SKILL.md` resources for exact model families and tasks. Reuse the existing LTX, MiniMax and Qwen guidance as the starting point. Prompt Engineer receives these but no Console mutation tools; Console receives the same generation guidance only when needed plus ComfyUI and application-use skills.
5. Bind prompt output to a `GenerationSpec` containing exact target/version + task + dialect/adapter + actual assets/roles. A prose prompt alone is never proof that the workflow supports the requested conditioning.

### Required task-specific coverage

| Family | Prompt/conditioning contract | Recipe behavior |
|---|---|---|
| **Qwen-Image / 2.1** | Separate T2I, instruction edit, ordered multi-reference, alpha/RGBA and outpainting guidance. For 2.1, `image_1` is the edit source and later images supply content; use native `<image1>` markers only in the matching workflow. Preserve exact typography and explicit unchanged regions. | Keep base and Turbo as separate recipes. Current ComfyUI guidance documents base `25` steps, `cfg 1`, `euler`, `simple`; Turbo uses `8` steps, `cfg 1` and its shipped `ManualSigmas`. Official Turbo LoRA and community Lightning 4-step routes are distinct records, not interchangeable defaults. |
| **FLUX.1 / FLUX.2** | Separate FLUX.1 T2I/img2img/Redux/Kontext from FLUX.2 generation/editing and ordered multi-reference roles. Do not infer editing or reference capacity from a family label. | Prefer installed compatible distilled variants. FLUX.2 Klein distilled is a 4-step checkpoint; base and dev recipes retain their own schedules. Never transfer a Klein schedule to FLUX.2 Dev. |
| **Krea 2 / FLUX.1 Krea** | Keep older FLUX.1 Krea apart from Krea 2 Large/RAW and Turbo. Separate exploratory T2I from style-reference and img2img roles. | Krea 2 RAW is the full-step base (documented at 52 steps); Krea 2 Turbo is the distilled 8-step route. Style-reference uses its dedicated model/LoRA graph. |
| **LTX-2.3 / 2.5** | Separate T2V, I2V, first+last interpolation, reference/Ingredients, V2V and each IC-LoRA task. Ingredients accepts one composed sheet and exactly the two-part `Reference sheet: ... / Generated video: ...` prompt. Preserve supplied audio/dialogue. | Use official version-matched distilled templates as starting points, then curate measured alternatives. Ingredients, Union Control, Motion Track, upscalers, HDR, layout, restore and other IC-LoRAs each need their own recipe and adapter-version check. Do not infer cross-version compatibility. |
| **MiniMax H3 / H3 Max** | Preserve local named sections, `<Picture N>`/`<Video N>`/`<Audio N>` bindings, first/last alignment and hosted-vs-local dialects. Separate T2V, I2V, FL2V/L2V, Ref2VA and V2V/edit/control workflows. | Base FL2VA and Ref2VA checkpoints differ. Current official ComfyUI guides include a community 8-step FL2V LoRA and 4-step Ref2V LoRA with quality caveats. FastH3 is an 8-step distilled route for T2V/first-last I2V only, not Ref2VA. |

The existing target catalog remains intact. Where current official documentation conflicts with an existing capability record—for example, current Qwen-Image 2.1 node documentation describes 16 slots while the existing image registry says 10—open a source-review change with exact citations; do not silently rewrite saved IDs or limits during unrelated harness work.

## 6. Source curation, dependencies and provisioning

### Reuse inventory

- **Pi:** official SDK, sessions, model runtime, custom tools and skills; no separate agent loop.
- **Codex:** official app-server; no hand-written agent protocol.
- **Claude Code:** official Agent SDK and in-process MCP tools; no custom tool loop.
- **ComfyUI:** existing `WorkflowParser`, URL-keyed `object_info` cache, `ComfyUIClient`, Storyboard run lifecycle and project/gallery services.
- **Comfy domain knowledge:** adapt the official `comfy_cli/skills/comfy/SKILL.md` workflow-first guidance, with local source attribution and the application's own action constraints.
- **Workflow sources:** `Comfy-Org/workflow_templates`, model-author repositories such as `Lightricks/ComfyUI-LTXVideo` and `Lightricks/LTX-2`, and explicitly labeled maintained community recipes. Preserve URL, repository path, commit/version, author, license and retrieval date for every imported/adapted recipe.
- **Initial callable reuse route:** register one bounded Pi custom tool around the installed comfy-cli, using argument-array subprocess calls without a shell. Permit only curated template discovery/details/export, workflow slot/note inspection and schema validation, and cached knowledge discovery supported by the pinned CLI release. Enumerate exact supported commands from that release before enabling them. Export paths are confined to the application recipe cache; local inspection is explicitly labelled local. For remote checks, use the selected backend HTTP catalog or a verified saved catalog override supported by the CLI. Reject run, lifecycle, install, arbitrary filesystem and arbitrary command requests. Read/inject only reviewed skill and recipe resources. Reuse comfy-cli's own knowledge cache and store only application-specific overlays. Existing MCP may later replace this wrapper through explicit Pi SDK extension wiring; it is not assumed to be inherited automatically. Frontend actions remain the only generation path.

### Dependency resolution sequence

1. Normalize the source graph using the existing parser and the selected backend's live `object_info`.
2. Produce a report of missing node classes, known pack IDs/versions, loader inputs, exact model identities and task/adapter incompatibilities. A filename is only a lookup hint until tied to an authoritative model record and loader folder.
3. Resolve each model to an authoritative download URL, exact filename, loader folder and actual configured root on that backend. Record size/hash when the publisher provides it, license, gated status and required ComfyUI/node versions.
4. If installation access and explicit authorization exist, create an install job on **that backend**. If they do not, return exact manual instructions for that backend. Never fall back to a local install.
5. Verify downloaded bytes/completion, post-install `object_info` and loader enum visibility. Restart only through a discovered/configured service path and only after separate approval. A completed download alone is not a ready model.

### Initial source-backed dependency records to curate

These are starting records, not evidence that Kamino-3 already contains the files:

- **LTX-2.3:** `ltx-2.3-22b-dev.safetensors` or `ltx-2.3-22b-distilled-1.1.safetensors` from `Lightricks/LTX-2.3` into the configured `checkpoints` root; matching Gemma 3 directory under `text_encoders/gemma-3-12b-it-qat-q4_0-unquantized`; two-stage spatial/temporal upscalers under `latent_upscale_models`; version-matched IC-LoRAs under `loras`, such as `ltx-2.3-22b-ic-lora-union-control-ref0.5.safetensors`.
- **LTX-2.5:** use the split layout from `Lightricks/LTX-2.5`: `diffusion_models/ltx-2.5-22b-distilled-transformer-bf16.safetensors` (or the explicitly selected int8/dev variant), `text_encoders/gemma4-12b-with-proj-ltx-2.5-bf16.safetensors`, `vae/ltx-2.5-video-vae-bf16.safetensors`, and `vae/ltx-2.5-audio-vae-bf16.safetensors`; add only the exact task adapter and upscaler required by the chosen graph. This repository is gated, so report required user authorization rather than bypassing it.
- **Qwen-Image 2.1:** Comfy-Org's published graph uses `qwen_image_2.1_int8_convrot.safetensors` or `qwen_image_2.1_bf16.safetensors` under `diffusion_models`, `qwen3vl_8b_int8_convrot.safetensors` plus the task-specific `qwen3.5_9b_qwen_image_2.1_pe_t2i.int8_convrot.safetensors` or `..._pe_i2i.int8_convrot.safetensors` under `text_encoders`, and `qwen_image_2.1_vae_bf16.safetensors` under `vae`. Turbo checkpoints and the official Turbo LoRA are separate alternatives.
- **FLUX.2 Dev:** `flux2_dev_fp8mixed.safetensors` under `diffusion_models`, `mistral_3_small_flux2_bf16.safetensors` under `text_encoders`, and `flux2-vae.safetensors` under `vae`. For Klein 4B, use `flux-2-klein-4b-fp8.safetensors` (distilled) or `flux-2-klein-base-4b-fp8.safetensors`, `qwen_3_4b.safetensors`, and the same FLUX.2 VAE in their documented folders.
- **Krea 2 Turbo:** `krea2_turbo_fp8_scaled.safetensors` under `diffusion_models`, `qwen3vl_4b_fp8_scaled.safetensors` under `text_encoders`, `qwen_image_vae.safetensors` under `vae`; the style-reference graph additionally needs `krea2_style_reference.safetensors` under `loras` and its documented dedicated model variant.
- **MiniMax H3 base FL2VA:** `minimax_h3_fl2va_pruned_int8_convrot.safetensors` under `diffusion_models`, `qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors` under `text_encoders`, `minimax_h3_video_vae_int8_convrot.safetensors` and `minimax_h3_audio_vae_fp32.safetensors` under `vae`. Ref2VA instead uses `minimax_h3_ref2va_pruned_int8_convrot.safetensors`; FastH3 uses `fastvideo_fasth3_8step_v2_pruned_int8_convrot.safetensors`. Add acceleration LoRAs only from the exact matching recipe.

### Remote/local lifecycle rules

The official comfy-mcp README explicitly limits `download_model`, `install_node` and local server lifecycle to the machine running the CLI. Its `COMFYUI_URL` remote run path does not redirect those operations. It also documents that some system/free-memory operations can still target the local CLI installation. Therefore:

- Use direct selected-backend `/object_info`, `/system_stats`, `/upload/*`, `/prompt`, `/queue`, `/history` and `/ws` for runtime facts.
- Use local comfy-cli only for the machine on which it is installed.
- Implement remote provisioning only through a separately configured management adapter after installation access is verified. It must run in the discovered remote ComfyUI environment and report remote paths/results. No credential material enters prompts, tool results, plan files or logs.
- Model install jobs use `planned -> awaiting_authorization -> downloading/installing -> verifying -> ready`, with explicit `failed`/`cancelled`; no hidden local fallback and no automatic generation on completion.

## 7. Workflow controls, revisions and optimization

### Validated control exposure

For every proposed `WorkflowParameterConfig`:

1. Resolve `node_id` + `input_name` against the actual graph and selected backend `object_info`.
2. Validate widget kind, input/link binding, default, min/max/step and enum choices. Preserve linked media inputs and node-input bindings; do not flatten every value into a text widget.
3. Reject unknown nodes/inputs, incompatible types, invalid ranges and unsupported task/adapter combinations. `schemaStatus: 'verified'` requires this live check.
4. Keep raw imports hidden by default as they are now. Let the agent propose a minimal exposed set—prompt, negative prompt where supported, seed, size/duration/FPS, steps, CFG, sampler, scheduler/sigmas, denoise/strength and explicitly supported media/adapter controls—then show a diff for confirmation.
5. Persist the workflow revision successfully, update live frontend state, then attach its stable ID/revision to the chosen panel and initialize/reconcile parameter defaults. Await required project/panel persistence before reporting durable completion. If attachment persistence fails, retain the saved workflow as unattached, report the partial result and allow attachment retry without recreating it. A forced reload is a manual acceptance check, not an operation performed inside every save action.

### Revision/provenance model

Extend workflow data additively with:

```text
revision: number
parentRevision?: number
recipeId?: string
sourceProvenance: [{ sourceKind, url, repositoryPath, commitOrVersion, author, license }]
controlMapHash: string
apiGraphHash: string
editorGraphHash?: string
verifiedBackends: [{ backendId, backendFingerprint, verifiedAt, result }]
performanceClass: "unmeasured" | "estimated" | "measured-manual"
```

Keep the current workflow file compatible by supplying defaults on load. Before replacing a current record, atomically retain the previous revision in an application-owned history location. Never delete old project workflows during migration.

T6 must use temporary-file replacement for record writes and enforce expected revisions server-side across single, update and bulk writers. Serialize the application workflow-save path, cancel unsent stale debounce snapshots and reject already-sent stale snapshots using a collection revision; aborting a browser request does not undo a server write. Bulk deletion must be explicit/revision-checked and must never traverse history. Handle body-level `success: false` and partial `errors` even on HTTP 200. T5 integrates these contracts into its single-owned Storyboard save/debounce and panel/project persistence paths before agent mutation tools are enabled.

### Optimization rules

- Start from the source graph and a model/task-matched recipe. Official templates are starting points, not automatically optimal.
- Prefer an installed compatible distilled checkpoint or acceleration LoRA only when its exact recipe supports the requested task and conditioning. Examples: 4-step Klein, 8-step Qwen Turbo/Krea Turbo/FastH3, and matching LTX distilled graphs. Do not apply a 3/4/8-step label without the accompanying sampler/scheduler/guidance/sigma/strength contract.
- Preserve requested reference pixels, first/last frames, audio, masks, adapters and output requirements. An optimization that drops these is not equivalent.
- Store graph diffs and recipe provenance with every revision. Node movement, grouping, reroutes and note removal are **visual cleanup**, not compute optimization; only API-graph execution changes may be presented as computation changes.
- Label estimates as estimates. Measured speed requires a user-approved manual run and must record backend, model identity, resolution/frame count and recipe revision. Do not create or run benchmark suites automatically.
- Key parser/schema/model-option caches by backend ID + `objectInfoHash` + workflow revision. Invalidate verification on node-pack/ComfyUI changes, model identity changes, recipe edits or backend changes. Upload caches are content-hash + backend specific; never reuse an uploaded filename across nodes without proof.

## 8. Console Agent application tool surface

Implement tools as calls to named application actions, not mouse/keyboard automation. Start with this bounded surface:

| Tool/action | Behavior |
|---|---|
| `get_application_snapshot` | Active project, selection, panels, workflows/revisions, backends and current runs; redact credentials and unnecessary media data. |
| `inspect_backend` | Live selected-backend status, `object_info`, loader choices and capability record; refresh explicitly. |
| `search_workflow_sources` / `get_source_recipe` | Search the curated source index and return provenance, task compatibility and dependencies. |
| `prepare_workflow_revision` | Normalize/adapt a source graph and return a preview diff plus validation; does not execute. |
| `save_and_attach_workflow` | Await persistence, update live state and attach to a panel with revision/conflict checks. |
| `bind_media` / `set_panel_parameters` | Reuse existing upload/drop/parameter behavior; bind each selected backend explicitly and update panel state atomically. |
| `enhance_generation_prompt` | Use the same exact target/task/context preparation as Prompt Engineer or consume an explicit handoff. |
| `start_generation` | Require a scoped user run request (which already supplies authorization), validated workflow/dependencies and idempotency key; call the shared single/parallel action. Ask only when target, spend or material behavior falls outside that request. |
| `get_run` / `cancel_run` | Report existing progress phases/node names/prompt IDs/results. Prefer prompt-specific queued deletion; warn that running `/interrupt` is node-wide where that limitation applies. |
| `save_outputs` / `search_gallery` / `send_reference` | Reuse project auto-save, Gallery APIs and existing Gallery-to-Storyboard events/actions. |
| `plan_dependencies` / `start_install_job` / `get_install_job` | Produce exact per-backend instructions or request explicitly authorized provisioning; never start generation as a side effect. |

### Frontend bridge

- `StoryboardUI.tsx` registers a small action registry/bridge with the gateway over loopback-only, authenticated per-browser fetch/SSE, bound to the gateway session and bridge ID. Command results return through authenticated POSTs; WebSocket upgrades remain unsupported. Extract operations incrementally into `storyboard/actions/`; leave thin adapters rather than rewriting the component. The bridge has its own admission boundary; existing wildcard CPE CORS and lack of application authentication do not authenticate it.
- Trusted bootstrap: the launcher obtains a cryptographically random, short-lived single-use pairing token from a gateway-local control channel and delivers it to the intended local browser through a URL fragment, removed immediately before other navigation or requests. Never put it in query strings, ordinary logs, model context or durable browser storage. A manually opened tab uses the same local pairing flow. The gateway checks an exact configured application-origin allowlist, consumes the token once and issues an expiring connection-scoped credential; origin checking alone is insufficient. T1b/T5 own bootstrap and renewal. Pairing credentials are service credentials, not harness login tokens.
- Each admitted connection binds a unique tab/bridge ID and explicit project identity to one Console session. Tools target that binding, never whichever tab happened to connect last. Rebind requires explicit session action; stale, expired, disconnected, ambiguous and mismatched-project targets fail without mutation. Two tabs must not silently share command destinations. Version one supports browser and gateway on the same machine; remote browser clients receive an unsupported result until a separate authenticated transport is designed.
- Every action takes stable project identity + panel ID, workflow ID + revision and run ID where applicable. Reject stale expected revisions with a fresh snapshot; do not overwrite newer user edits.
- Uploads retain the existing data-URL/file validation and per-node upload behavior. Return content hash and per-backend bindings, not a fictional global filename.
- Reuse `GenerationRun`, parallel-job tracking, `GenerationProgress`, image history, auto-save and Gallery refresh events. The agent receives structured lifecycle updates but does not own a second progress store.
- All state-changing agent actions display command name, target, workflow/backend and result. Honor explicit user authorization already covering the action; do not ask again merely because a tool is being used. Installation, restart, destructive overwrite or node-wide cancellation outside the request requires clarification/authorization. Reads may be automatic.

### Explicit handoff

`Send to Console` stores an immutable handoff containing source Prompt Engineer session ID, final prompt, `GenerationSpec`, selected preset/style identifiers, actual media references/roles, optional source workflow/recipe and creation revision. Console receives it as a user-visible message in its own conversation. Subsequent Prompt Engineer edits do not mutate an old handoff; send a new one.

## 9. Credential and saved-project migration

1. Add separate non-secret settings keys for `agent_harness`, `agent_provider`, `agent_model`, `agent_thinking`, session references and `agent_migration_state`. Keep existing `active_provider`, `selected_model`, `target_model`, encrypted provider rows and localStorage migration data untouched.
2. On first launch, show a one-time migration panel. Detect legacy settings but do not infer that an old provider token authenticates Pi/Codex/Claude. Default to **Configure Pi**; offer an explicit **Use legacy direct provider** compatibility action until the user completes migration. No silent fallback.
3. Replace the main account/provider cards with harness connection status and harness-derived model choices. Keep legacy credentials available in a read-only migration/rollback view; no delete action is part of migration. Any future deletion requires a separate user request.
4. Preserve `target_model`, active cinematic config, presets, panels, workflows, parameter values and image history exactly. Add new agent/session/handoff fields as optional schema-versioned data so old projects load with defaults and new projects remain exportable.
5. Harness login is completed through the harness's official flow. Existing CPE encrypted credentials and Antigravity OAuth tokens are not copied into harness stores. Never log access tokens, refresh tokens, authorization headers or credential payloads.
6. Migration acceptance includes loading an old project and old settings, performing legacy enhancement if explicitly selected, configuring Pi separately, and verifying that neither path deletes or rewrites the other's saved data.

`agent_migration_state` is `unconfigured`, `legacy_explicit` or `harness_configured`. Old settings load as unconfigured without modifying their credentials. Only the user's explicit legacy choice enables legacy enhancement; only a valid harness/model selection enters harness_configured. Expired authentication or an unavailable selected model produces a reconnect/reselect state while preserving the selection and existing sessions, never a silent provider/model fallback. A selector change affects new turns after the current turn settles or is explicitly cancelled; previous sessions retain their original harness identity. Implementing additive migration source is authorized ordinary code work; executing migration against real private settings or modifying global/private configuration retains the applicable runtime boundary.

## 10. Ordered implementation and ownership

Parent confirms exact authenticated catalog identities/settings at execution time. Fable is confirmed to be Claude Fable and is excluded alongside Opus, Haiku and Sonnet while the no-Claude restriction applies. Astra is assigned review only. The user explicitly selected Luna xhigh for harder implementation too, including gateway, browser bridge and remote-installation integration. GLM5.3 Flash retains bounded assignments pending catalog confirmation. Parent handles plan corrections and integration review. Each implementation task retains its prerequisites and narrow ownership; this routing change does not enable unfinished Console mutation tools or authorize runtime provisioning.

| ID | Depends on | Owner | Narrow files/scope | Deliverable/contract |
|---|---|---|---|---|
| **T0** | none | Parent / Kimi K3.1 | No code; Kamino-3 reconnaissance | Verify the actual ComfyUI URL/port, browser HTTP/WS/CORS reachability, installation environment, model roots and service management. Remote access is supplied but unverified. Do not assume port 8188 or a disk layout. |
| **T1a** | none | Luna, xhigh | New `CinemaPromptEngineering/agent_gateway/` only | Pin SDK and Node support, manifest/lockfile, fixed selection/session contracts, scoped Pi adapter, streaming/abort/health, disabled-by-default tools and redacted errors. No launcher/UI integration, live sessions or mutation bridge yet. |
| **T1b** | T1a | Luna, xhigh | Gateway transport/bootstrap and `start.py` | Dependency setup, exact-origin admission/pairing, startup/health/shutdown, normal/backend-only disabled behavior. Verify SDK contracts pinned in T1a. |
| **T2** | T1a contract | Luna, xhigh | `api/providers/credential_storage.py`, settings models/routes, `frontend/src/components/Settings.tsx` | Additive versioned agent settings, explicit migration states and harness selector. No credential copying/deletion or real private-config changes. Sequence `main.py` edits before T3. |
| **T3** | T1b, T2 | Luna, xhigh | `api/providers/` prompt service, `api/main.py`, `frontend/src/api/client.ts`, the two existing enhancement callers | Shared prepare/validate path and harness enhancement without changing cinema rules. Own `PromptPreparation` and Storyboard enhancement edits until ownership transfers to T5. |
| **T4a** | T3 | Luna, xhigh | Existing model guides/profiles plus project `agent_resources/skills/` | One exact already-supported model/task recipe for Pi prompt acceptance; preserve existing profiles/aliases and other manual functionality. |
| **T4b** | T4a; independent of first Pi prompt acceptance | Luna, xhigh; GLM5.3 Flash for bounded resource indexing | Same resource scope, sequential ownership per file | Complete the requested model/task/adapter matrix with sourced skills; no unsupported combinations advertised. |
| **T5** | T1b, T3, T6 persistence contract | Luna, xhigh | New `storyboard/actions/`, `storyboard/services/application-bridge.ts`, thin `StoryboardUI.tsx` adapters | Secure targeted bridge, durable submission journal/correlation policy and both inline submit sites; no ambiguous POST retry. Take sole Storyboard ownership after T3. Integrate T6 writers and attachment saves. |
| **T6** | T1a fixed contracts | Luna, xhigh | `api/workflow_storage.py`, `storyboard/services/workflow-storage.ts`, workflow type definitions | Atomic record replacement, server record/collection revisions, explicit deletion/history isolation, body-level error handling and awaited saves. Coordinate T5 debounce writer integration before exposing agent mutations. |
| **T7** | T5, T6 | GLM5.3 Flash | New Console/Prompt Engineer chat components, `App.tsx`, scoped CSS, session handoff UI | Two conversations, shared selector consumption, explicit handoff and tool/action confirmation display. No generation logic. |
| **T8** | T0, T5 contract | Luna, xhigh | Orchestrator backend-capability/install-job modules and routes; `services/orchestrator.ts` only if needed | Backend capability record, remote/local provisioning and bounded comfy-cli reuse tool from section 6. No workflow YAML edits or implicit shared storage. |
| **T9** | T4a, T8 contract; expand with T4b | Luna, xhigh | Project `agent_resources/recipes/` and source index | Versioned recipes, exact dependency records, optimization provenance and fingerprints. Reuse upstream knowledge cache; no auto-download or benchmark. |
| **T10** | T1b, T5, T6, T7, T8, initial T9 recipe | Luna, xhigh | Gateway Console tools and project ComfyUI/application skills | Complete handoff/UI and bounded tool integration; retain frontend execution. Expand requested coverage with T4b/T9. |
| **T11** | Pi live acceptance | Luna, xhigh | `agent_gateway/` Codex adapter only | Official app-server stdio integration, model/thread/event/approval mapping; reuse contracts unchanged. |
| **T12** | T11 live acceptance | Luna, xhigh | `agent_gateway/` Claude Code adapter only | Future application support through official SDK; no Claude implementation agent and no live Claude model use under present restriction. |
| **T13** | T1a architecture; independent of later adapters | Parent | Antigravity assessment only | Verify official local SDK capabilities and auth mismatch; recommend implement/defer without speculative support. |

**Integration order:** T0 may run independently of local T1a. T1a unlocks T2 and T6 in non-overlapping files; T1b integrates startup/transport, then T3 and T4a deliver first Pi prompt acceptance without waiting for all-family curation. T3 hands Storyboard ownership to T5 only after its enhancement edits are complete. T5 consumes T6's persistence contract and completes writer integration; T7 waits for T5 and T6. T8 consumes the T5 action contract and T0 backend facts; T9 starts from T4a plus T8 and expands alongside T4b. T10 needs T7 handoff integration as well as the other listed prerequisites. Parent reviews each shared-checkout result. Codex T11 follows Pi acceptance, Claude application adapter T12 follows Codex acceptance; T13 assessment is independent. No unassigned hard task is launched by substituting Astra or another model implicitly.

## 11. Parent-led live acceptance (before any automated tests)

First live backend: **Kamino-3**, remote ComfyUI. User-supplied addresses are `192.158.100.152` and Tailscale `100.122.195.17`; preserve the first address verbatim. Parent handles all connection verification. Do not connect or provision during planning. The parent must discover the actual URL/port rather than infer one. Browser HTTP/WS access and remote installation access are separate checks and either may fail independently.

1. **Migration:** launch with existing settings/project; confirm legacy credentials and target generation model remain intact, Pi is the proposed new harness, and no silent provider fallback occurs.
2. **Pi/model selection:** complete user-managed Pi authentication, list only available models, select one supported reasoning model, and verify the same selection appears in Prompt Engineer and Console while their histories remain separate.
3. **Cinematic fidelity:** use a nontrivial saved preset/style override and confirm active config, preset and style appear in prepared context and the final model-specific prompt. Verify exact target/version and media roles survive handoff.
4. **Remote capability truth:** inspect Kamino-3 and display actual nodes/models/roots if management is available. Confirm a second backend's files are never inferred from Kamino-3 and a URL alone never enables install actions.
5. **Upload-to-result:** upload an image; have Console choose a compatible existing workflow or propose a sourced adaptation; validate controls, save the revision, attach it to a panel, reload and verify persistence; bind pixels to the correct input on Kamino-3.
6. **Direct run lifecycle:** after a scoped user run request, generate through the shared frontend direct path; observe journal/run ID/prompt ID, node phase and progress, results in panel/history and Gallery refresh. Cancel a separate approved run and report any node-wide interrupt limitation truthfully.
7. **Conditioning matrix:** manually exercise available/authorized recipes for image T2I/edit/multi-reference and video T2V/I2V/reference/first-last/V2V. Include LTX Ingredients and at least one other IC-LoRA only when its exact adapter is installed. Do not mark unsupported or uninstalled matrix rows as passed.
8. **Missing dependency:** select a recipe with a known missing file/node and verify exact authoritative URL, filename, actual loader root and version requirements. Without authorization, require manual instructions; with a gated model, report the credential/license requirement. Verify there is no local fallback.
9. **Optimization/provenance:** compare a source revision and a compatible optimized revision only with user-approved manual renders. Confirm conditioning/audio are preserved, visual-only edits are not called speedups, and measured versus estimated labels and cache invalidation are correct.
10. **Conflict/disconnect:** attempt stale workflow/project commands and verify conflicts, including an old bulk-save snapshot arriving after a revision save. Verify exact-origin admission, rejected expired/reused tokens, explicit two-tab/project targeting and disconnected rejection. In an approved controlled run, interrupt the submission response and reload; verify durable journal recovery using supported server correlation, or persistent submission_unknown with manual resolution when correlation is absent. No duplicate GPU submission and no unsupported recovery claim.
11. **Parent review:** inspect the final diff, generated workflows and live UI before requesting permission for any automated regression work. No automated test or benchmark is run in this phase.

## 12. Later user-gated regression phase

Only after the parent completes live verification and the user explicitly approves automated tests, add focused regression coverage for target alias migration, prompt composition equivalence, model/task validation, workflow control binding, stale revisions, install-job routing and ambiguous submission reconciliation. Add lint/typecheck/build checks according to the existing project workflow. GPU benchmarks remain a separate explicit approval, not an implied part of test approval.

## 13. Risks, blockers and essential open decisions

- **Kamino-3 facts are pending:** actual URL/port, HTTP/WS/CORS reachability, ComfyUI/node versions, installation/model roots and service environment. T0 resolves them; this does not block drafting or Pi prompt work.
- **Harness authentication/model:** the user must complete/authorize the harness flow and choose from models the harness reports available. Do not infer access from legacy provider settings.
- **Model authorization:** large/gated models and node installation require explicit download/license/install approval. Default to manual instructions when access is missing.
- **Remote execution limitations:** ComfyUI running-prompt cancellation can be node-wide; parallel runs require careful user confirmation. Unknown submission outcomes are never blindly retried.
- **Large frontend extraction:** `StoryboardUI.tsx` remains single-owner per task. Extract actions incrementally; avoid a broad rewrite.
- **Prompt capability drift:** source records can become outdated. Review exact official/model-author documentation when touching a family and retain canonical saved IDs.
- **Antigravity:** official SDK existence is verified, but adapter/auth/lifecycle compatibility is not. It remains unadvertised pending T13.
- **Team availability:** Fable is confirmed Claude and excluded with Opus/Haiku/Sonnet. Luna xhigh is confirmed and explicitly assigned both bounded and harder implementation tasks. GLM5.3 Flash still needs catalog confirmation; Astra remains review-only.

## 14. Official and model-author sources

### Harnesses

- Pi SDK: https://pi.dev/docs/latest/sdk
- Pi extensions/custom tools: https://pi.dev/docs/latest/extensions
- Pi skills: https://pi.dev/docs/latest/skills
- Pi models: https://pi.dev/docs/latest/models
- Pi MCP and SDK limitations: https://pi.dev/docs/latest/mcp
- Codex app-server: https://developers.openai.com/codex/app-server
- Codex SDK: https://developers.openai.com/codex/sdk
- Claude Agent SDK overview: https://code.claude.com/docs/en/agent-sdk/overview
- Claude custom tools: https://code.claude.com/docs/en/agent-sdk/custom-tools
- Claude sessions/models/skills: https://code.claude.com/docs/en/agent-sdk/sessions , https://code.claude.com/docs/en/agent-sdk/typescript , https://code.claude.com/docs/en/agent-sdk/skills
- Antigravity local SDK: https://antigravity.google/docs/sdk/overview/
- Antigravity managed agent and preview limitations: https://ai.google.dev/gemini-api/docs/antigravity-agent

### ComfyUI and sources

- Official Comfy MCP documentation: https://docs.comfy.org/agent-tools/mcp
- comfy-mcp remote/local limitations: https://github.com/Comfy-Org/comfy-mcp#driving-a-remote-comfyui
- comfy-cli: https://github.com/Comfy-Org/comfy-cli
- Official Comfy agent skill: https://github.com/Comfy-Org/comfy-cli/blob/main/comfy_cli/skills/comfy/SKILL.md
- Official workflow templates: https://github.com/Comfy-Org/workflow_templates
- ComfyUI routes: https://docs.comfy.org/development/comfyui-server/comms_routes
- ComfyUI model folders: https://docs.comfy.org/basic-concepts/models
- Comfy CLI getting started: https://docs.comfy.org/comfy-cli/getting-started

### Requested model families and recipes

- LTX ComfyUI node/workflows: https://github.com/Lightricks/ComfyUI-LTXVideo
- LTX model repository: https://github.com/Lightricks/LTX-2
- LTX-2.3 model files: https://github.com/Lightricks/LTX-2/blob/main/MODELS-LTX-2.3.md
- LTX-2.5 files: https://huggingface.co/Lightricks/LTX-2.5
- LTX IC-LoRA catalog and compatibility: https://docs.ltx.io/open-source-model/integration-tools/ic-lo-ra-adapters
- LTX-2.5 ComfyUI workflows: https://docs.comfy.org/tutorials/video/ltx/ltx-2-5
- MiniMax H3 model/prompt source: https://huggingface.co/MiniMaxAI/MiniMax-H3
- MiniMax H3 native ComfyUI recipes: https://docs.comfy.org/tutorials/video/minimax/minimax-h3-native
- FastH3 scope and recipe: https://docs.comfy.org/tutorials/video/minimax/minimax-h3-fastvideo
- Qwen-Image 2.1 model author: https://github.com/QwenLM/Qwen-Image-2.1
- Qwen-Image 2.1 ComfyUI files/schedules: https://docs.comfy.org/tutorials/image/qwen/qwen-image-2-1
- FLUX.2 Dev ComfyUI recipe: https://docs.comfy.org/tutorials/flux/flux-2-dev
- FLUX.2 Klein distilled/base recipe: https://docs.comfy.org/tutorials/flux/flux-2-klein
- Krea 2 model author: https://github.com/krea-ai/krea-2
- Krea 2 ComfyUI recipe: https://docs.comfy.org/tutorials/image/krea/krea-2
