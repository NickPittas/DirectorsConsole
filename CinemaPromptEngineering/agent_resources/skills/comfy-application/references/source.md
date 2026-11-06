# comfy-cli source and operation contract

The gateway is pinned to Comfy-Org `comfy-cli` **1.22.0**, tag `v1.22.0`,
commit `1ae8f40`. The exact release check is `comfy --json --version` and runs
only when a bounded operation is invoked. The wrapper uses the official
GPL-3.0-only release source and its bundled skill:

- [Release](https://github.com/Comfy-Org/comfy-cli/releases/tag/v1.22.0)
- [Workflow command source](https://github.com/Comfy-Org/comfy-cli/blob/v1.22.0/comfy_cli/command/workflow.py)
- [Template command source](https://github.com/Comfy-Org/comfy-cli/blob/v1.22.0/comfy_cli/command/templates.py)
- [Knowledge command source](https://github.com/Comfy-Org/comfy-cli/blob/v1.22.0/comfy_cli/command/knowledge.py)
- [Bundled official skill](https://github.com/Comfy-Org/comfy-cli/blob/v1.22.0/comfy_cli/skills/comfy/SKILL.md)
- [Pinned package license declaration](https://github.com/Comfy-Org/comfy-cli/blob/v1.22.0/pyproject.toml)
- [Upstream license text](https://github.com/Comfy-Org/comfy-cli/blob/v1.22.0/LICENSE)

| Fixed operation | Pinned CLI syntax | Scope |
| --- | --- | --- |
| Template list | `comfy --json templates ls --gallery <CLI-cache-index> --limit N` plus fixed filters | Reads the comfy-cli gallery cache. `--gallery` avoids stale-cache background refresh. |
| Template details | `comfy --json templates show <validated-id> --gallery <CLI-cache-index>` | Reads cached gallery metadata. |
| Template export | `comfy --json templates fetch <validated-id> --gallery <CLI-cache-index> --out <temporary-file>` | Fetches only the selected curated workflow from Comfy-Org, validates it, and writes it to the fixed application recipe cache. The CLI does not expose the upstream commit; the manifest records `main`, retrieval time, CLI release, source URL, and workflow SHA-256. |
| Cached knowledge | `comfy --json knowledge resolve <query>` or `comfy --json knowledge pick [capability]` | Points the CLI at its existing knowledge cache file. A cache miss returns unavailable; the wrapper does not fetch knowledge. |
| Workflow slots | `comfy --json workflow slots <frontend-workflow> --input <saved-object-info>` | Runs offline with the currently selected backend's saved schema. |
| Workflow notes | `comfy --json workflow notes <frontend-workflow>` | Reads notes from an ID-resolved local saved workflow; no backend claim. |
| Workflow validation | `comfy --json workflow validate --workflow <workflow> --input <saved-object-info>` | Uses a saved selected-backend schema. The pinned CLI accepts API workflows and converts frontend workflows before validation. |

The workflow operations receive a validated workflow ID. The adapter accepts
only its own provenance-checked template recipe IDs or an object returned by
the T10 `getSavedApplicationWorkflow(id)` resolver; the resolver response is
bounded, fingerprinted, and staged without accepting a filesystem path. Slots
and validation additionally require the saved selected-backend schema hook.

The wrapper runs commands with `spawn` and an argument array (`shell: false`),
fixed command/argument shapes, per-operation version checking, bounded time and
output, temporary-file cleanup, and no caller-provided paths. It never invokes
Comfy MCP or infers that the application registered these operations.
