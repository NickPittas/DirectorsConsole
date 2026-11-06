# LTX-2.5 distilled T2V control bindings

Source: `CinemaPromptEngineering/agent_resources/recipes/ltx-2.5-distilled-t2v/workflow.json` (116,505 bytes; pinned SHA-256 `eb1a415a467a2ef1ea63cdb4e79a35315e29c971b1e4f7646ed149a2971fdbd7`). Host node `405` is subgraph `8b4f085c-1bb3-4ecd-aeed-603a8d6d3970` (“Text to Video (LTX-2.5)”). Export evidence is `/tmp/directors-console-ltx25-export.json` → `workflow` (44 API nodes, export version 1.22.0, readiness `not_verified`).

| Catalog role | Source root/promoted widget | Source interior target | Export API target and effective default | Graph evidence |
| --- | --- | --- | --- | --- |
| `prompt` | Host `405`, label `prompt`, input `text`; populated example prompt (omitted) | `376` `PrimitiveStringMultiline.value` | `405:376.value` = host prompt (omitted) | Subgraph interface `text`, link `776` → node `376` input slot 0. Export value matches host; interior widget text differs. |
| `prompt_enhancement` | Host `405`, label `prompt_enhance`, input `value`; `false` | `383` `PrimitiveBoolean.value`; its output feeds `382` `ComfySwitchNode.switch` | `405:383.value` = `false` | Interface link `779` → `383.value`; interior output link `722` → `382.switch`. Host false overrides interior widget `true`. |
| `duration_seconds` | Host `405`, label `duration`, input `value_1`; `5` | `362` `PrimitiveInt.value` | `405:362.value` = `5` | Interface link `780` → `362.value`; node `362` feeds `378` duration/frame math (`a * b + 1`). |
| `fps` | Host `405`, label `frame_rate`, input `value_4`; `24` | `361` `PrimitiveInt.value` | `405:361.value` = `24` | Interface link `785` → `361.value`; node `361` feeds frame-rate consumers. |
| `seed` | Host `405`, label `seed`, input `noise_seed`; `558811532553686` | `339` `RandomNoise.noise_seed` | `405:339.noise_seed` = `558811532553686` | Interface link `784` → `339.noise_seed`. Interior widget seed `926314962774309` is overridden by host; export uses host value. |
| `aspect_ratio` | Root node `409` `ResolutionSelector.aspect_ratio`; `16:9 (Widescreen)` | No subgraph interior node: this is a root-level selector widget | `409.aspect_ratio` = `16:9 (Widescreen)` | Root links `792`/`793` route selector outputs 0/1 to host `405` width/height inputs; promoted links `781`/`782` route to interior `372`/`360` `PrimitiveInt.value`. Export preserves those dimensions as links from `409` outputs. |

## Binding notes and blockers

- Bind `aspect_ratio` at root node `409`; do not invent independent width/height catalog bindings. The selector’s other exported inputs are `megapixels: 0.9` and `multiple: 32`; they are outside this requested mapping.
- Host `405` stores width/height widget values `1280`/`720`, but the linked `ResolutionSelector` outputs supply the effective values. The export confirms `405:372.value` links to `409` output 0 and `405:360.value` to output 1.
- The exported host values resolve the source conflicts: prompt uses host text (not reproduced), prompt enhancement uses `false` despite interior `true`, and seed uses the host seed rather than the interior widget seed.
- All six requested routes are established by these files. No unresolved mapping blocker; `prompt_enhancement` is the catalog role for source field `prompt_enhance`.
- This is source-graph and offline-export mapping only. The export envelope itself marks readiness `not_verified`; no runtime behavior or render readiness is established here.
