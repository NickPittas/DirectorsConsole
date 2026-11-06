# ComfyUI UI workflow to API prompt

## Finding

The supported ComfyUI frontend conversion is `graphToPrompt(graph, options?)` in [`ComfyUI_frontend/src/utils/executionUtil.ts`](https://github.com/Comfy-Org/ComfyUI_frontend/blob/main/src/utils/executionUtil.ts#L46-L58). Its signature is:

```ts
graphToPrompt(
  graph: LGraph,
  options: { sortNodes?: boolean } = {}
): Promise<{ workflow: ComfyWorkflowJSON; output: ComfyApiWorkflow }>
```

Use the returned `output` as the API prompt JSON; `workflow` is the serialized frontend workflow. The converter traverses [executable inner nodes from subgraphs](https://github.com/Comfy-Org/ComfyUI_frontend/blob/main/src/utils/executionUtil.ts#L85-L105), collects [widget values](https://github.com/Comfy-Org/ComfyUI_frontend/blob/main/src/utils/executionUtil.ts#L118-L153) using `serializeValue(node, index)` or `widget.value`, and emits [API nodes keyed by ID](https://github.com/Comfy-Org/ComfyUI_frontend/blob/main/src/utils/executionUtil.ts#L164-L176) with `inputs`, `class_type`, and `_meta`. Widgets with `options.serialize === false` are intentionally omitted.

This is a live frontend operation, not a function that accepts saved UI-workflow JSON. It needs the ComfyUI frontend's initialized `LGraph`, including instantiated node/widget implementations and registered subgraph definitions. The converter takes no `object_info` argument. The inspected source is frontend `main`, not a separately pinned frontend package release; it stamps the build's `__COMFYUI_FRONTEND_VERSION__` into the workflow.

## CLI boundary

The local gateway pins Comfy-Org `comfy-cli` 1.22.0 (`v1.22.0`, commit `1ae8f40`) and supports only `workflow.slots`, `workflow.notes`, and `workflow.validate` in its operation union ([local adapter lines 38–54](../../CinemaPromptEngineering/agent_gateway/src/comfy-cli.ts#L38-L54)). Its validate invocation is `comfy --json workflow validate --workflow <workflow.json> --input <saved-object-info.json>` ([adapter lines 765–781](../../CinemaPromptEngineering/agent_gateway/src/comfy-cli.ts#L765-L781)).

In the pinned CLI source, `validate_api_workflow` imports `comfy_cli.workflow_to_api.convert_ui_to_api` and calls it as `convert_ui_to_api(wf_data, graph.object_info)` ([import and signature](https://github.com/Comfy-Org/comfy-cli/blob/v1.22.0/comfy_cli/command/workflow.py#L1452-L1473), [conversion call and subgraph ID note](https://github.com/Comfy-Org/comfy-cli/blob/v1.22.0/comfy_cli/command/workflow.py#L1583-L1629)). `--input <object_info.json>` allows that validation path to load a saved schema offline. The command then validates the converted mapping and emits a validation summary (`valid`, errors/warnings, and `converted_from_ui` / `converted_node_count`), not the API prompt JSON ([summary](https://github.com/Comfy-Org/comfy-cli/blob/v1.22.0/comfy_cli/command/workflow.py#L1623-L1671); [command signature](https://github.com/Comfy-Org/comfy-cli/blob/v1.22.0/comfy_cli/command/workflow.py#L1777-L1807)).

Therefore, the inspected pinned workflow command provides no supported offline operation that returns the converted prompt. It does reveal an internal helper and call shape, but the helper implementation is in `comfy_cli/workflow_to_api.py`, outside the permitted source scope; its return contract and widget-value behavior cannot be established here. Do not treat `workflow.validate` as a converter result.

The official server documentation lists `/prompt` as the route that accepts a prompt for queueing and `/object_info` as the node-schema route; it documents no UI-to-API conversion endpoint ([ComfyUI server routes, lines 30–63](https://docs.comfy.org/development/comfyui-server/comms_routes#routes)).

## Sources

- Local adapter: [`comfy-cli.ts`](../../CinemaPromptEngineering/agent_gateway/src/comfy-cli.ts#L38-L54), [`source.md`](../../CinemaPromptEngineering/agent_resources/skills/comfy-application/references/source.md#L1-L24)
- Pinned CLI source: [Comfy-Org/comfy-cli v1.22.0 `workflow.py`](https://github.com/Comfy-Org/comfy-cli/blob/v1.22.0/comfy_cli/command/workflow.py)
- Frontend converter: [Comfy-Org/ComfyUI_frontend `executionUtil.ts`](https://github.com/Comfy-Org/ComfyUI_frontend/blob/main/src/utils/executionUtil.ts)
- Server API docs: [ComfyUI server routes](https://docs.comfy.org/development/comfyui-server/comms_routes)
