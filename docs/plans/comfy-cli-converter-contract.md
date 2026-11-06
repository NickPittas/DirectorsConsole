# comfy-cli v1.22.0 UI-to-API converter contract

Source review only; conversion/import behavior was not runtime-tested. The pinned implementation is [`comfy_cli/workflow_to_api.py`](https://github.com/Comfy-Org/comfy-cli/blob/v1.22.0/comfy_cli/workflow_to_api.py), at the supplied `v1.22.0` / `1ae8f40` pin. The existing route research is [comfy-subgraph-export-route.md](comfy-subgraph-export-route.md).

## Call and result

Exact public-in-module signature:

```python
def convert_ui_to_api(workflow: dict, object_info: dict) -> dict:
```

With UI workflow JSON and the already-loaded saved `/object_info` mapping:

```python
from comfy_cli.workflow_to_api import convert_ui_to_api

api_prompt = convert_ui_to_api(ui_workflow, saved_object_info)
```

The result is the API prompt mapping `{node_id_string: {"class_type": ..., "inputs": {...}, "_meta": {"title": ...}}}`. Node IDs are strings. Every emitted node gets `_meta.title` from the UI title, else the schema display name, else its type. If the input already looks like API format, it is returned unchanged before `object_info` validation; UI input is deep-copied before conversion.

Explicit `WorkflowConversionError` cases:

- `"Workflow must be a JSON object"`
- `"Workflow is missing 'nodes' or 'links' list"`
- `"object_info must be a JSON object"`

There is no structured partial-error result. Exceptions while building one node are logged and that node is skipped; conversion continues, then orphaned link inputs are removed. Treat a returned mapping as potentially partial. [Implementation: signature, validation, assembly, and per-node recovery](https://github.com/Comfy-Org/comfy-cli/blob/v1.22.0/comfy_cli/workflow_to_api.py#L86-L164)

## Widget and link mapping

- For each node, schema `input_order` controls required then optional input order; absent order falls back to schema declaration order. `widgets_values` is positional over widget-owning inputs only. Connection inputs and `forceInput`/`defaultInput` inputs consume no slot; `widgetType`, `socketless`, list-combo, primitive scalar, and recognized DOM-widget inputs do. If there is no usable schema mapping, it falls back to saved widget markers/unconnected input names and may omit values it cannot name. [Schema ordering and widget detection](https://github.com/Comfy-Org/comfy-cli/blob/v1.22.0/comfy_cli/workflow_to_api.py#L970-L1034) [Pairing and fallback](https://github.com/Comfy-Org/comfy-cli/blob/v1.22.0/comfy_cli/workflow_to_api.py#L1091-L1235)
- A linked input is emitted as `[source_node_id_string, output_slot]`; the live connection wins over a widget value for the same input. List-valued widgets are wrapped as `{"__value__": [...]}` so a two-item list cannot be mistaken for a link. Schema defaults fill inputs still absent after widget, primitive, and link values. [Node assembly and list wrapping](https://github.com/Comfy-Org/comfy-cli/blob/v1.22.0/comfy_cli/workflow_to_api.py#L772-L779) [Input precedence](https://github.com/Comfy-Org/comfy-cli/blob/v1.22.0/comfy_cli/workflow_to_api.py#L891-L944)
- Seed values stay on `seed`/`noise_seed`; companion strings `fixed`, `increment`, `decrement`, and `randomize` are consumed, not emitted as API inputs. The schema’s explicit `control_after_generate` flag governs when present; otherwise exact `INT` inputs named `seed` or `noise_seed` use the frontend rule. The code also handles legacy seed-like markers cautiously to avoid eating a legitimate next combo/string value. [Companion handling](https://github.com/Comfy-Org/comfy-cli/blob/v1.22.0/comfy_cli/workflow_to_api.py#L1377-L1458)
- `PrimitiveNode` is not output: its first widget value is copied onto connected consumer inputs. `Reroute`, `GetNode`, and `SetNode` are also omitted and their links traced through. [UI-only list and primitive mapping](https://github.com/Comfy-Org/comfy-cli/blob/v1.22.0/comfy_cli/workflow_to_api.py#L35-L42) [Primitive/Get/Set and tracing](https://github.com/Comfy-Org/comfy-cli/blob/v1.22.0/comfy_cli/workflow_to_api.py#L558-L622)
- `COMFY_*COMBO*` dynamic combos are expanded from the selected `object_info` option into dotted input names; only widget-backed sub-inputs consume following values. A missing/renamed selector warns that later values may be misaligned; nested combo expansion stops at depth 16. The module contains no `COMFY_AUTOGROW` handling, so do not claim converter-side expansion for dynamic autogrow inputs. Text inputs marked `dynamicPrompts` resolve `{a|b}` alternatives randomly during conversion. [Dynamic combo pairing](https://github.com/Comfy-Org/comfy-cli/blob/v1.22.0/comfy_cli/workflow_to_api.py#L1053-L1081) [Warnings and nesting cap](https://github.com/Comfy-Org/comfy-cli/blob/v1.22.0/comfy_cli/workflow_to_api.py#L1182-L1235) [Dynamic prompt processing](https://github.com/Comfy-Org/comfy-cli/blob/v1.22.0/comfy_cli/workflow_to_api.py#L782-L794)

## Subgraphs and exclusions

Definitions come from `workflow.definitions.subgraphs`; instances are expanded when their `type` is a UUID matching a definition. Each interior node receives ID `outer_instance_id:inner_node_id` (nested instances add further colon-separated segments). Internal link IDs are remapped. Definition input `linkIds` map external input slots to interior target node/slots, and definition outputs map interior source node/slots back to external output slots. Promoted widget values are read positionally from the host instance and overlaid on their interior widget targets; a live external link wins. [Expansion and boundary rewriting](https://github.com/Comfy-Org/comfy-cli/blob/v1.22.0/comfy_cli/workflow_to_api.py#L262-L515) [Promoted host-value overlay](https://github.com/Comfy-Org/comfy-cli/blob/v1.22.0/comfy_cli/workflow_to_api.py#L167-L218)

Known unsupported or bounded cases:

- Legacy `extra.groupNodes` / `workflow>` / `workflow/` group nodes are warned about, not expanded. Subgraph expansion stops after 10 iterations; malformed/cyclic resolution is depth-capped. [Group-node warning and expansion cap](https://github.com/Comfy-Org/comfy-cli/blob/v1.22.0/comfy_cli/workflow_to_api.py#L130-L134) [Expansion loop](https://github.com/Comfy-Org/comfy-cli/blob/v1.22.0/comfy_cli/workflow_to_api.py#L280-L316)
- `Note`, `MarkdownNote`, `PrimitiveNode`, `GetNode`, `SetNode`, `Reroute`, `LoadImageOutput`, muted nodes, and bypassed nodes do not become API node entries; primitive and routing nodes are handled as described above. [Exclusion rules](https://github.com/Comfy-Org/comfy-cli/blob/v1.22.0/comfy_cli/workflow_to_api.py#L35-L42) [Modes and emission](https://github.com/Comfy-Org/comfy-cli/blob/v1.22.0/comfy_cli/workflow_to_api.py#L135-L164)
- A node with missing schema can still be emitted, but value-name recovery is heuristic. Per-node exceptions silently reduce the returned graph to a logged partial mapping. Dynamic autogrow expansion is not evidenced in this module.

## Import, provenance, and recommendation

The converter directly imports Python standard-library modules (`copy`, `logging`, `random`, `re`, `typing`) and `comfy_cli.cql.engine`; it imports `comfy_cli.cql.promoted` when overlaying promoted values. The engine imports additional `comfy_cli` internals. Thus the adapter needs the installed `comfy-cli` package at the same pin, not a new conversion dependency; source inspection does not establish the runtime import environment. [Converter imports](https://github.com/Comfy-Org/comfy-cli/blob/v1.22.0/comfy_cli/workflow_to_api.py#L16-L25) [Engine widget constants](https://github.com/Comfy-Org/comfy-cli/blob/v1.22.0/comfy_cli/cql/engine.py#L29-L59) [Promoted input model](https://github.com/Comfy-Org/comfy-cli/blob/v1.22.0/comfy_cli/cql/promoted.py#L0-L25)

The module header identifies this as a Python port of Seth A. Robinson’s `comfyui-workflow-to-api-converter-endpoint` (Unlicense). The pinned comfy-cli repository license is GPL-3.0. Keep this as an import of the pinned package helper rather than copying its implementation. [Pinned repository license](https://github.com/Comfy-Org/comfy-cli/blob/v1.22.0/LICENSE)

**Recommendation:** use the pinned internal helper for this narrow offline conversion. Concrete evidence: the helper accepts the same loaded UI JSON and saved schema directly and returns the API mapping; CLI `workflow validate` only returns a summary, while frontend `graphToPrompt` needs an initialized `LGraph` (documented in the linked route report). The stability limit is explicit: `comfy_cli.workflow_to_api` is an internal module, and pinning must be maintained; per-node recovery can return partial output, and unsupported group/autogrow cases remain. If the pin cannot be guaranteed, return unsupported instead of building another converter.

**Verification boundary:** the signature, branches, and mapping above are source-verified at the pinned tag. Importability and actual output on the target installation are not runtime-verified; no conversion was run.

## Proposed next small coding task

Add one fixed helper invocation that passes the already-loaded UI graph JSON and saved `object_info` to `convert_ui_to_api`, with only the narrow import/error boundary and pinned-version assumption documented. Limit edits to that helper’s existing adapter file and its caller; do not implement a second converter or expand the whole gateway operation surface.
