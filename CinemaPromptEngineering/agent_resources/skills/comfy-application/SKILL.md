---
name: comfy-application
description: Use Director's Console's bounded comfy-cli reference operations and existing ComfyUI application actions safely.
license: GPL-3.0-only
---

# ComfyUI in Director's Console

Adapted from Comfy-Org's official comfy-cli agent skill at `v1.22.0` (commit
`1ae8f40`), `comfy_cli/skills/comfy/SKILL.md`. The upstream skill and CLI are
licensed GPL-3.0-only; this rewritten application guide is GPL-3.0-only too.
The wrapper's command provenance is in [the source note](references/source.md).

## Keep the application in control

- Use the fixed comfy-cli reference operations for curated template discovery,
  template details/export, cached Comfy knowledge, and supported workflow
  inspection. They are optional and may return `unavailable` when the exact CLI
  release or its cache is missing. Never install or switch the CLI automatically.
- Separate CLI reuse capability from installation/readiness: a supported
  wrapper operation means the pinned CLI can inspect a reference; it does not
  prove a template is installed or runnable on any backend.
- Local comfy-cli inspection describes its own cache or files. It does not show
  which models, LoRAs, custom nodes, or files exist on a selected remote backend.
  Use the selected backend's saved schema and exact advertised model choices for
  that backend; when no current saved schema is available, explain the gap and
  use manual review. Do not use the local CLI default as a remote backend.
- Treat template metadata and graph filenames as requirements to inspect, not
  proof that a backend has those assets. Keep task, model version, LoRA, sampler,
  sigmas, encoders, VAE, and other acceleration settings together from one
  compatible inspected recipe. Do not mix parts of different acceleration
  recipes.
- A cached/exported workflow is saved reference material, not a Storyboard
  revision or panel attachment. Use the named application workflow action to
  prepare, save, and attach a workflow; report an unattached save as unattached.
- Generation goes only through the named application `start_generation` action,
  which owns panel state, media bindings, run IDs, persistence, and the direct
  frontend-to-ComfyUI path. Never call comfy-cli run, jobs, queue, download,
  install, restart, lifecycle, or execution commands.
- If submission status is unknown, inspect the existing run with `get_run` or
  ask for manual resolution. Never retry an ambiguous submission automatically.

## Limits and fallbacks

- Workflow inspection accepts a stable workflow ID. The adapter resolves
  comfy-cli template exports from its own cache or asks T10's injected
  `getSavedApplicationWorkflow(workflowId)` hook for an application-owned
  revision; it never accepts a caller path. Saved application workflows are
  staged in a private temporary directory and removed after inspection.
- `workflow slots` and `workflow validate` use only a saved schema for the
  currently selected backend, passed to comfy-cli as an offline schema input.
  They make no live backend query. T10 must supply
  `getSavedSelectedBackendSchema()` with the backend ID, capture time, and
  matching object-info fingerprint. If the adapter cannot supply that
  snapshot, return the manual fallback; do not infer remote support from local
  data.
- `workflow slots` and `workflow notes` inspect frontend-format workflows.
  `workflow validate` uses the pinned CLI's API validator; that release also
  converts frontend-format workflows before checking them against the saved
  selected-backend schema. Keep the existing application parser authoritative.
- Do not ask the agent to provide filesystem paths or commands. Recipe IDs and
  template IDs are validated by the wrapper; exports go to its fixed private
  application cache. Do not expose arbitrary filesystem, shell, network-fetch,
  Comfy MCP, or lifecycle tools.
- This module exports a narrow adapter only. Pi does not inherit these methods
  automatically; T10 must register the fixed operations explicitly and pass
  resolvers backed by application-saved workflows and the currently selected
  backend's saved schema.
