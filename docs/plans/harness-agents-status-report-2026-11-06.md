# Harness agents: delivery status and remaining work

Date: 2026-11-06. Scope: the requested Prompt Engineer and Director Console agent integration.

**Latest acceptance correction:** the plain-request autonomy check failed. Pi inspected the backend and attempted to change the prompt/resolution, but the application demanded a manually selected Prompt Engineer handoff. No new workflow or image resulted. The earlier guided render establishes execution only, not autonomous fulfillment. See [the autonomous request report](pi-autonomous-image-request-2026-11-06.md). The highest priority is standalone Console generation context with preserved validation, followed by genuine workflow-editing capability and the same uncoached acceptance check.

## Delivery verdict

**Pi has passed the first live single-image workflow/render/result milestone on Kamino-3, following the preparation/save/attachment milestone.** The complete upload/video/recovery experience is not accepted yet. No delegates are currently running. Changes are in the shared checkout and have not been committed or pushed. See [the live render report](pi-klein-live-render-2026-11-06.md) for the actual run and remaining first-save identity/progress defects.

The implementation ledger is [t10-small-task-queue.md](t10-small-task-queue.md). Its opening checkpoint supersedes historical “in progress” and “not yet connected” notes farther down that chronological document.

## What is implemented

| Area | Delivered behavior | Evidence and limit |
|---|---|---|
| Pi harness | Local authenticated gateway, exact available-model selection, reasoning selection, streaming, scoped sessions and cancellation | Real Pi discovery returned 65 models; actual Console turns and application tools worked. Normal-launcher and existing-user-settings migration acceptance remain outstanding. |
| Prompt Engineer | Existing cinematic config/style/preset preparation retained; Pi enhancement uses the shared prepare/validate path | The live Console turn used that path and applied a validated teapot prompt. Exhaustive saved-preset/style fidelity and standalone PE acceptance remain outstanding. |
| Local prompting skills | Version/task/adapter resolver; LTX, MiniMax H3, Qwen Image and FLUX/Krea guidance; task-profile UI | Packaged and wired. This is explicit supported-match coverage, not every possible task, adapter or model. |
| Conversations and handoff | Separate Prompt Engineer/Console scopes, shared harness selection, immutable prompt/media handoffs, explicit validate/apply action | Actual handoff selection and Console consumption worked. Visible history, drafts and handoff media are tab-memory state; refresh does not restore a complete conversation transcript. |
| Application control | Typed tools for snapshots, backend inspection, recipe retrieval, dependencies, workflow preparation/save/attachment, media binding, parameter changes, prompting and run lifecycle | Live snapshot/inspection/recipe/dependency/prepare/save/attach/enhance/parameter actions worked. Run, cancellation and media-upload acceptance remain outstanding. |
| Backend inventory | Per-backend node schema and loader choices, bounded cache, modern COMBO parsing and folder categories | Actual Kamino-3 HTTP inspection worked. Filename advertisement does not verify model bytes, identity, compatibility or filesystem access. |
| Workflow persistence | Collection/record revisions, conflict checks, atomic record replacement, history and explicit deletion | Fresh live save/attachment succeeded after fixing metadata-sensitive content fingerprints. Adversarial conflict/disconnect acceptance remains outstanding. |
| Generation safety | Shared direct frontend submission path and durable run journal; ambiguous submissions retained without automatic replay | One real single-image run completed; prompt ID and completed journal survived reload. Interruption/cancellation recovery and first-save identity continuity remain outstanding. |
| Existing ComfyUI tooling reuse | Pinned comfy-cli export/inspection/validation, curated upstream graphs and local application skill | Actual offline conversion was exercised; notes/validation tools are registered. A general ComfyUI MCP adapter is not delivered by this work. |
| Installation foundation | Backend-scoped management configuration, verification, download planning, authorization and bounded jobs; fixed SSH helper | Implemented APIs/helpers. Console installation tools are not registered, Kamino management access is not verified, and no installation was performed. Custom-node installation/restart remains unfinished. |

## Workflow coverage

Eight recipes are cataloged. Five exact routes are connected to the bounded export and browser preparation path:

| Route | Current verification | Remaining acceptance |
|---|---|---|
| FLUX.2 Klein 4B distilled T2I | Real Pi/UI prepare → save → attach → render → output; panel and Gallery lightbox display; image and completed journal retained after browser reload | First-save run-identity continuity, progress accuracy and broader failure cases |
| LTX 2.5 distilled T2V | Source-backed conversion, disabled prompt-enhancer removal, loader matching and control mapping manually exercised | Pi/UI preparation round trip and video render/output |
| MiniMax H3 base T2V | Source-backed export and inactive turbo-branch removal; base 20-step route and loader bindings manually exercised | Pi/UI preparation round trip and video render/output |
| MiniMax H3 base I2V | Export/control mapping and required starting-frame binding implemented; base 20-step route manually exercised | Real image upload/binding, preparation and render/output |
| FastH3 T2V | Official distilled 8-step export, loader bindings and preparation route connected | Pi/UI preparation round trip and render/output |

Other catalog entries:

- **LTX 2.3:** source recipe exists; the curated recipe was not a match for Kamino's observed installed-model choices. No accepted executable route on Kamino.
- **MiniMax Ref2VA:** source and control handling exist; full live media/task acceptance is outstanding. It is outside the five connected pinned-export routes above.
- **MiniMax FL2V:** blocked by the pinned graph's 6-step LoRA branch conflicting with the documented 8-step route, plus export prerequisites.

All recipes retain catalog `readiness: not_verified`; this report records the one accepted Klein run separately rather than globally promoting recipe readiness. The other routes have no accepted render. FastH3 is a separate distilled checkpoint; the base MiniMax routes do not implement the requested accelerated LoRA variants.

## What remains, in execution order

| Priority | Work remaining | Concrete completion evidence |
|---|---|---|
| 1 | Correct defects found in the first Pi/Klein render loop | The render completed and appeared in panel/Gallery. Finish first-save journal identity continuity and accurate sampler-phase progress; verify each without another GPU submission unless necessary. |
| 2 | Verify normal startup and migration | `start.py` pairing works without the temporary verification setup; existing settings/projects and legacy credentials remain intact; both surfaces use the selected harness without silent fallback. |
| 3 | Exercise real media and video paths | One uploaded image reaches the intended I2V loader on Kamino; one LTX video and one MiniMax video complete with correct prompt/task/version and retrieved outputs. |
| 4 | Complete lifecycle and recovery acceptance | Cancel a scoped run; verify disconnect, stale revisions, project/model switches and unresolved submissions. Add the missing user-facing manual-resolution flow for `submission_unknown`; never blindly resubmit. |
| 5 | Finish remote dependency management | Verify Kamino host/root/environment and helper access; expose bounded installation operations to Console; demonstrate a missing dependency's links/folder guide and an explicitly authorized installation. Define supported custom-node/restart operations. |
| 6 | Expand task and acceleration coverage | Add exact source-backed LTX I2V/first-last/Ingredients/IC-LoRA routes, Qwen image editing/multi-reference, FLUX/Krea variants and compatible MiniMax accelerated/reference/keyframe routes. Each needs task-specific skills, controls, media roles and backend checks. |
| 7 | Complete workflow optimization behavior | Select compatible installed distilled models/LoRAs, preserve conditioning/audio and source provenance, and support reviewed adaptations. Current transforms cover a few pinned graphs; there is no general accepted arbitrary-workflow optimizer. Speed claims require separately approved measured renders. |
| 8 | Finish the intended panel experience | Current conversations are presented together in the Agent tab. Embed/contextualize them in Prompt Engineer and Director Console if those per-page panels remain the delivery target; provide deliberate history/handoff persistence if refresh continuity is required. |
| 9 | Add the remaining harnesses | Codex after Pi acceptance; Claude Code deferred under the current no-Claude instruction; assess Antigravity before advertising support. An openai-codex model provider selected inside Pi is still the Pi harness, not the Codex application adapter. |
| 10 | Review and deliver the integrated change | Final parent review, remaining live acceptance, then user-authorized focused automated regression work. Commit/push only after approval, with `[skip ci]`. Preserve unrelated checkout changes. |

## Important scope boundaries

- The agent controls the implemented typed application actions. It does not yet have full control of every application feature, arbitrary filesystem operation or arbitrary ComfyUI workflow.
- Cached sources and local skills reduce repeated discovery for supported routes. The source index alone is not executable recipe or skill coverage.
- Legacy provider accounts/credentials were preserved behind explicit legacy behavior. They have not been deleted or fully removed from the product.
- Browser verification used working DOM evaluation/actions. Snapshot/click automation adapters remain broken, and the alternate browser host was unavailable. This automation limitation does not establish an application browser defect.
- The successful disposable project is `/tmp/directors-console-ui-retry-plownlfq/project/Disposable_Agent_Verification_project.json`. Panel_02 has workflow `a7bb8b46-b8c6-48c3-b557-cef876799345`, revision 1, and the validated teapot prompt. Panel_01 was preserved. Temporary services are stopped; `/tmp` artifacts are not durable release artifacts.

## Recommended next bounded batch

1. The authorized Klein render is complete. Next, assign separate bounded fixes for the observed run-identity transition and sampler-phase count, with exact caller/file boundaries.
2. One small implementation task supplies only the missing unresolved-submission resolution UI, after the parent specifies the exact state/actions and file ownership.
3. Independently, one bounded task addresses one concrete normal-startup/migration defect only if live verification identifies it.
4. Independently, one source/control task covers one selected I2V or IC-LoRA recipe; no broad family-wide assignment.

No new agents were launched for this report. One subsequently authorized Klein render is now recorded above; no automated tests, installations or model downloads ran. Existing compilation and live verification evidence is reported above; unsupported paths and remaining risks are not marked complete.
