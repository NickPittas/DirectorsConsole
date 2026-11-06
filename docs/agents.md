# Embedded agents

[← Back to the README](../README.md) · [Verification status](plans/agent-integration-live-status-2026-11-06.md)

Director's Console has three independent applications: Cinema Prompt Engineering,
Storyboard (Console), and Gallery. The shared agent chat stays in a persistent
right sidebar beside any application. Console and Gallery do not require a handoff
through Prompt Engineer. Existing human workflows remain available as before.

## Setup

The optional agent gateway needs Node.js **22.19+** on the 22.x line, or **24+**.
The native Codex CLI is pinned to **0.166.0**. The frontend has a separate Node.js
requirement; see [installation](../README.md#installation-and-quick-start).

Pi uses its existing profile at `~/.pi/agent`, or `PI_CODING_AGENT_DIR` when set.
Codex uses `DC_CODEX_HOME` when set, then `CODEX_HOME`, then `~/.codex`. The
gateway reuses the selected harness's local login; a second account is not needed
when that harness is already authenticated. It does not copy login secrets into
Director's Console.

From the project root, run:

```sh
python start.py --setup
python start.py
```

`--setup` is optional when the gateway dependencies are already configured. It
sets up the gateway and exits; run `python start.py` afterward to launch the app.
Gateway pairing is created by the launcher. After gateway changes, restart the
launcher and pair a fresh browser tab; each launch provides a single-use pairing
token.

## Choose a harness and model

Open **Settings → Agent harness and model**, choose **Pi** or **Codex**, refresh
the model inventory, select the exact model and optional thinking level, then
click **Save**. The selected model writes prompts and operates the application;
the media-generation target is a separate setting. Harnesses do not silently
switch providers or models when authentication or a request fails.

Thinking appears inline in one expandable section per reply. Raw tool arguments
and results are not shown in a separate results panel. **Application actions** and
the information/help sections start collapsed.

**New conversation** creates a fresh harness session and resets the visible chat,
draft, and activity feed. It is not a full conversation browser or a way to recover
the prior visible chat after a reload.

## What the agent can do

Ask for an outcome, such as preparing a workflow, setting its exposed controls,
or generating and reviewing a result. Available actions let the agent inspect the
selected backend, find a curated recipe or propose a custom flat workflow, save
and attach a workflow, set exposed widgets, bind media, start a run, inspect run
status and outputs, or cancel a run.

Curated preparation covers exact compatible routes in the LTX 2.3/2.5, Klein,
MiniMax base, FastH3, and Ref2VA families. Task, model version, workflow schema,
backend, and installed dependencies still have to match; a family name does not
promise universal compatibility or backend readiness. If something is missing,
the agent can give manual setup guidance. Installation APIs exist, but agent
installation tools are not wired in; the agent does not fetch arbitrary downloads.

ComfyUI execution still goes directly from the frontend to the selected backend
over REST and WebSocket. The gateway uses HTTP/SSE for agent chat and activity.
The agent does not replace the human workflow or route generation through the
Orchestrator.

Prompt Engineer cinematic constraints are optional: ask for them when wanted.
Ordinary Console prompts and Gallery actions do not inherit Prompt Engineer
settings. Target-model guidance and task-specific skills are separate from those
cinematic constraints.

## Attachments and current limits

- Image attachments provide pixels to a compatible selected harness model.
- Video perception uses up to three sampled frames, not the full video or its
  sound. Audio attachments expose metadata only; audio is not analyzed or
  transcribed.
- Attachments are held in memory for the active chat. Reloading the page loses
  them; attach the media again afterward.
- Pi has documented manual workflow, rendering, media, and project-operation
  evidence. Codex native `0.166.0` installed-login discovery and its eight-model
  catalog were verified, but authenticated application turns and restart recovery
  were not. Catalog visibility alone does not prove an authenticated turn.
- Claude Code is deferred. Antigravity harness support has not been assessed; its
  legacy OAuth provider is a separate integration.
- No automated tests were run for this documentation update. See the [live
  status report](plans/agent-integration-live-status-2026-11-06.md) for evidence
  and remaining acceptance work.

## Troubleshooting

If the model inventory is empty or stale, refresh it and confirm the selected
harness is authenticated. For Codex, let the gateway reuse the existing Codex
login; do not force an additional login when that account is already configured.
After a gateway change, restart `python start.py` and pair the newly opened tab.
Older-checkout model discovery failures involving browser CORS preflight or Codex
`mise` shims are fixed in the current source.

For provider setup, explicitly chosen legacy provider behavior, and credential
handling, see [Providers](providers.md). For network exposure and deployment
limits, see [Security & Deployment](../README.md#security--deployment). For the
product overview and application guides, see the [README](../README.md).
