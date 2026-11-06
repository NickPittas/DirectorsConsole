# Console enhancement independence map

Scope: static diagnosis of the named source only. No tests, runtime, endpoint implementation, or provider checks.

## Current contract
- `StoryboardUI.tsx` has no `manualConsoleEnhance` symbol: the handler is `handleEnhancePrompt` (4662), calls the helper at 4813, and is passed as `onEnhancePrompt` at 7993.
- It captures PE `projectType`, config, and preset refs (432-436, 780-792), submits them in `enhancementInput`, then compares them again before accepting a result.
- Shared `enhancePromptWithPi` serves Prompt Engineer, Storyboard, and later T7. It always calls CPE prepare/validate around `runPiPromptTurn`; its system text also declares PE cinematic config/preset authoritative.
- `runPiPromptTurn` uses the exact authenticated Pi selection and keys sessions by surface/project/model. `workspace` and `console` enable application tools; `prompt-engineer` is tool-free.
- The adapter accepts three surfaces. Only `prompt-engineer` may omit application scope; console/workspace require it. Session setup uses `noTools: "all"` and verifies active tools.
- The parent's `ConsoleNewProject` `resetSession` removal is already complete; no follow-up there.

## Preserve
- Keep `legacy_explicit` as the only legacy path. Missing Pi, guidance, or validation must error; never silently fall back.
- Keep workflow/target checks, video profile and `buildEnhancementContext` gates, real task derivation, and asset role/order/dialect data.
- Keep cancellation and stale-result guards for revision, actual project identity, panel, workflow, parameters, preferences, target/model, and media fingerprint. Remove only PE projectType/config/preset comparisons.

## Preferred small contract
- Add a Console-only helper in `prompt-enhancement-agent.ts` taking user prompt, exact target model, task, and optional real workflow media context. Use model/task guidance and response validation without CPE's PE-shaped prepare/validate input. Leave the shared helper intact for its existing callers.
- Derive task/context from the selected target and current workflow; pass only real asset roles/order from `buildEnhancementContext`. Omit PE projectType/config/preset and synthetic media.
- Give this path a distinct tool-free session purpose, `prompt-enhancement`. A separate surface key isolates it from PE and workspace histories; keep project binding absent. Do not use `workspace`, whose session is shared with the embedded agent and has application tools.
- Extend the session-ref surface check and expected-tool check in the gateway client; make the adapter explicitly accept this no-scope/no-tool purpose. Preserve its active-tool validation.
- Route `handleEnhancePrompt` through the new helper while retaining the selected Pi model gate and explicit legacy branch.
- The authenticated session-route surface rules and exact model/task guidance endpoint were outside this read allowlist; confirm those before naming backend edits.

## Tiny follow-up files
- `StoryboardUI.tsx`; `services/prompt-enhancement-agent.ts`
- `services/agent-gateway-client.ts`; `frontend/src/api/client.ts` (surface type)
- `agent_gateway/src/contracts.ts`; `agent_gateway/src/pi-adapter.ts`
