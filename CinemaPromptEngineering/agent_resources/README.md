# CPE agent resources

`prompt_skills.json` and the Markdown files under `skills/` are read by the CPE prompt-enhancement resolver. The resolver injects only the local entry and task references for an exact selected model/version, task, dialect, and adapter. Catalog metadata is available at `GET /prompt-enhancement/skills`.

The shared agent also reads these resources independently through `GET /api/prompt-guidance` and its `get_prompt_guidance` tool. This writing-guidance path accepts exact model/version/task/dialect/adapter identities, with declared choices for incomplete selections, and requires no Prompt Engineer configuration, Console project or attached conditioning media. Missing media remains a generation prerequisite, not a barrier to reading guidance. Recipe metadata uses this same independent reader; actual enhancement and generation keep their own media validation.

`sources.json` remains discovery and provenance metadata; the recipe resolver returns referenced records but does not treat them as proof of executable dependencies. Its documented filenames are not a dependency list and do not prove that weights, nodes, or workflows exist on a render backend.

## Runtime boundary

- These resources supplement the existing `get_system_prompt`, cinematic prompt builder, target registry, video profiles, and image capability registry. They do not replace or rewrite those contracts.
- Missing task/version/dialect selections return `requires_selection`; unlisted combinations return `unsupported`. Only an exact `available` match injects skill text.
- Some documented LTX IC-LoRA adapters are packaged and cataloged as `unsupported` because the current validated video context cannot express their distinct control inputs without mislabeling them.
- Model targets and task guidance do not prove installation, endpoint access, graph support, or media binding. Existing image-byte validation and local H3 output validation remain authoritative.
- Qwen guidance returns generator prompt text. The Qwen PE JSON shape is not a declared output contract here.
- No runtime web access, downloads, model calls, shell tools, or workflow execution are used.

The prompt-skill resolver reads only relative Markdown paths allowlisted by `prompt_skills.json` under `skills/`. The recipe resolver reads only catalog-listed local graph assets and does not fetch upstream source URLs. Neither resolver loads the original local skill paths listed in the source index, so runtime does not depend on files under `/home`.

## Packaged guidance and provenance

The family resources are concise adaptations of the existing local MiniMax H3, LTX, and Qwen prompting guidance and the project's FLUX/Kontext/Krea model guides. Their source dates, primary documentation URLs, exact target matches, and packaged relative paths are recorded in `prompt_skills.json`. LTX adapter/version details retain the reviewed local model-card reference and the source index's stated verification limits; they do not claim a workflow is installed.

The local skill entrypoints link to only the supporting reference needed for that task. The shared system prompt stays authoritative for cinematic settings and existing output contracts. Adapter triggers and semantic requirements apply only to their exact match; aesthetic suggestions are not hard model limits.

## Source index (`sources.json`)

The source index is schema version 1 and records reviewed projects and task resources for MiniMax H3, LTX-2.3/2.5, Qwen-Image 2.1, FLUX/Kontext/Krea, and selected ComfyUI sources. Its verification snapshot is dated 2026-11-05 and records primary-source checks, known unknowns, licenses, source revisions, and distinctions such as FLUX.1 Krea vs Krea 2, H3 FL2VA vs Ref2VA, LTX Ingredients vs Union Control, and FLUX.2 Klein vs Dev.

This is not a runnable recipe or dependency manifest. `verifiedPrimary: false` and combined/placeholder documentation filenames remain discovery notes, never download requirements. The source index is refreshed during deliberate curation or when a model, adapter, or platform version changes; ordinary prompt requests do not fetch documents or repository heads.

## Curated workflow recipes

The read-only catalog is served at GET /api/workflow-recipes, with exact recipe resolution at GET /api/workflow-recipes/resolve and detail by stable ID at GET /api/workflow-recipes/{recipe_id}. Resolution matches target model, model version, task, dialect, and conditioning adapter exactly. It returns the cached upstream graph unchanged, a separately described application overlay, input/control proposals, immutable source provenance, graph/recipe/dependency fingerprints, and the corresponding local prompt-skill text and resource hashes.

Recipe graph paths come only from the catalog's fixed ID-to-resource mapping. The resolver applies size limits, verifies each graph against its pinned SHA-256, and performs no task-time network access or downloads. Source-index records are included only as discovery metadata; the explicit dependencyPlanRequest records are the recipe's publisher-sourced model requirements. Those retain exact filenames and loader categories. Backend-advertised subfolders, installed file identity, node schemas, and execution are unresolved until the dependency planner and live verification check them. No recipe is advertised as ready.

The initial source-backed recipes are the official LTX-2.3 distilled T2V graph and FLUX.2 Klein 4B distilled T2I graph. LTX keeps its source graph's 8-step plus 3-step sigma schedules, CFG 1, and version-matched distilled LoRA. Klein selects the separately wired official 4-step distilled subgraph through a minimal overlay while preserving the complete source artifact. Neither recipe claims a measured speedup or runtime acceptance.

The MiniMax H3 catalog entries keep FL2VA T2V, I2V, and first/last-frame FL2V separate from Ref2VA. They bind to the existing `minimax_h3` / `H3` / `local_h3` prompt skill and its exact `t2v`, `i2v`, `first_last`, and `reference` tasks. No hosted H3 dialect or PE JSON is sent to CLIP. The FL2V 8-step Lightning LoRA and Ref2V 4-step Lightning LoRA alternatives record their matching checkpoint, exact adapter, sampler, guidance, scheduler, sigma generation, steps, and publisher metadata; the Ref2V graph's optional switch is represented as an overlay, leaving the upstream artifact intact.

Execution remains blocked where the pinned graph cannot be used safely. The upstream T2V and I2V/FL2V templates contain UI subgraphs that the current frontend parser does not flatten, so those records require a supported upstream API export. The pinned T2V and I2V/FL2V graphs route their turbo branch to 6 steps, while the current official guide documents 8; those branches are marked unsupported until the publisher graph and guide agree. The plain Ref2VA UI graph has no subgraphs and uses the existing UI-to-API parser path, but its backend schema and installed artifacts remain unverified. FastH3 is a separate DMD2-distilled checkpoint, not a LoRA acceleration route; its documented T2V/first-last scope does not include Ref2VA. No 3-step H3 route is recorded.

The pinned LTX model cards expose a machine-readable license value of other while naming LTX-2 Community terms; those terms still need review. The Klein workflow's VAE source card similarly reports other while naming the FLUX-1 dev non-commercial license; review its linked terms before use.

## Limits

No packaged skill or source recipe establishes backend model availability, successful generation, or compatibility with an arbitrary graph. Unknown version/adapter combinations remain unselected or unsupported rather than borrowing another generation's instructions. Remaining recipe coverage includes LTX IC-LoRA tasks, Qwen image editing, and additional FLUX/Krea variants.
