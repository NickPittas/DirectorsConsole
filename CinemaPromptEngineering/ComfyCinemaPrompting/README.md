# ComfyCinemaPrompting node

`CinemaPromptEngineering/cinema_rules/` is the authoritative in-repository rules
package. The node prefers that package while running from this checkout. A
standalone node copy uses the generated `cinema_rules/` directory bundled beside
`__init__.py`.

## Copy or archive the node

Run this from the repository root before copying or zipping the node directory:

```bash
python scripts/sync_comfy_node.py
```

Then distribute `CinemaPromptEngineering/ComfyCinemaPrompting/` as the
ComfyUI custom node directory. The helper replaces only its generated
`cinema_rules/` directory, removes stale files, and excludes Python caches and
bytecode. Do not edit that generated copy; edit the canonical package and run
the helper again.

The live ComfyUI frontend build is `web/app/`; `js/` is the node extension directory. The old `webapp/` tree is not part of the node distribution.

## Canonical preset wording

The owner approved the canonical preset wording and dropdown/value corrections. The CPE configuration screen uses the main `/options` endpoint; this bundled ComfyUI frontend uses `/cinema_prompt/api/options` for its Composition, Lighting Source, and Lighting Style dropdowns. Applying a preset uses canonical values for newly generated prompts. Existing media, cached prompt overrides, and saved workflows are not rewritten; this wording-only correction does not guarantee visual improvement. Phase 4 independent review, live provider/account checks, and live ComfyUI image/video/two-node checks remain pending.
