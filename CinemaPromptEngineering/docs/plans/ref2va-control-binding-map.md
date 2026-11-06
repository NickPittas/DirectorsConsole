# MiniMax H3 Ref2VA control binding map

Verified against `agent_resources/recipes/minimax-h3-ref2va-reference/workflow.json` and the current `WorkflowParser` implementation. Node IDs below are graph node IDs; `ref_images.ref_image_0` and `_1` are target input names on node 136.

| Control | Actual editable source | Graph connection / destination | Existing parser output and exact fields | Can the current parser represent it? |
|---|---|---|---|---|
| Prompt | Node **138**, `PrimitiveStringMultiline`, `widgets_values[0]` (`widgets_values_named.value`) | STRING output → node **136** `prompt`, link **279** | Expected `parameters[]`: `node_id="138"`, `input_name="value"`, `default=<widget 0>` | **No.** `_getWidgetNames` has no `PrimitiveStringMultiline` entry, so normalization leaves this widget out of `inputs`; prompt detection does not recognize this class. |
| Required reference image | Node **137**, `LoadImage`, filename at `widgets_values[0]` (`image`), upload mode at `[1]` (`upload`) | IMAGE output → node **136** `ref_images.ref_image_0`, link **278** | `image_inputs[]`: `name="reference_image_1"`, `node_id="137"`, `input_name="image"`, `type="image"`, `required=false` | **Partly.** It emits the LoadImage source as an image input, but does not retain the destination socket or this recipe binding's required status. The `required` value emitted by the generic helper is false. |
| Optional reference image | Node **139**, `LoadImage`, filename at `widgets_values[0]` (`image`), upload mode at `[1]` (`upload`) | IMAGE output → node **136** `ref_images.ref_image_1`, link **282** | `image_inputs[]`: `name="reference_image_2"`, `node_id="139"`, `input_name="image"`, `type="image"`, `required=false` | **Partly.** It emits the source image input, but does not retain its destination socket. Its generic optional state happens to be false. |
| Resolution | Node **115**, `ResolutionSelector`: `widgets_values[0]`=`aspect_ratio` (`"16:9 (Widescreen)"`), `[1]`=`megapixels` (`0.4`), `[2]`=`multiple` (`32`) | Output **0** `width` → node **136** `width`, link **276**; output **1** `height` → node **136** `height`, link **277** | One enum-style `parameters[]` binding can be `node_id="115"`, `input_name="aspect_ratio"`, `default="16:9 (Widescreen)"`. | **No, currently.** `_getWidgetNames` has no `ResolutionSelector` entry. The graph has one selector producing both dimensions, not independent width and height controls. `megapixels` and `multiple` also affect the generated dimensions; leave their current values fixed unless the requested UI exposes them too. |
| Duration | Node **132**, `PrimitiveFloat`, `widgets_values[0]` (`widgets_values_named.value`), current value `5` | FLOAT output → node **136** `length`, link **261** | Expected `parameters[]`: `node_id="132"`, `input_name="value"`, `default=5` | **No.** `_getWidgetNames` has no `PrimitiveFloat` entry, so the widget is not extracted as a parameter. |

## Existing parser helpers

For media, reuse `WorkflowParser._extractImageInputs` in [workflow-parser.ts](/home/npittas/DirectorsConsole/CinemaPromptEngineering/frontend/src/storyboard/services/workflow-parser.ts:736), which already emits the source nodes into `image_inputs`:

```ts
if (class_type === 'LoadImage' || class_type === 'LoadImageOutput') {
  inputCount++;
  inputs.push({
    name: `reference_image_${inputCount}`,
    display_name: `Reference Image ${inputCount}`,
    node_id,
    input_name: 'image',
    type: 'image',
    required: false,
```

For widget-backed scalar values, `_normalizeNode` calls the existing `_getWidgetNames(class_type)` helper at [workflow-parser.ts:302](/home/npittas/DirectorsConsole/CinemaPromptEngineering/frontend/src/storyboard/services/workflow-parser.ts:302); that same helper is used when converting widget values back to API inputs at lines 1241–1252. Its map is at lines 316–383. It currently maps `LoadImage` and `LoadImageOutput`, but not the three widget node classes above.

The existing enum resolver is `resolveEnumConfig` in [workflow-editor-options.ts:107](/home/npittas/DirectorsConsole/CinemaPromptEngineering/frontend/src/storyboard/services/workflow-editor-options.ts:107). Use it for a single `115/aspect_ratio` control; do not invent separate width and height bindings. The imported graph supplies the selected aspect ratio, but the full option list is not present in this workflow, so it must come from the existing live schema/options path.

## Minimal follow-up edits

1. In `WorkflowParser._getWidgetNames()` only, add the widget-name mappings `PrimitiveStringMultiline: ['value']`, `PrimitiveFloat: ['value']`, and `ResolutionSelector: ['aspect_ratio']`. This exposes the prompt, duration, and single resolution enum through the existing `parameters[]` path while preserving the selector's other widget defaults.
2. In the existing Storyboard input-binding handler only (its file and function were not inspected under this task's read allowlist), resolve image bindings from `parsed.image_inputs` by source `(node_id, input_name)` and keep required/optional semantics from the recipe binding. Do not require either image to appear in `parsed.parameters`.

No node schemas, backend options, runtime compatibility, or generation behavior were checked. This map establishes graph bindings and static parser behavior only.
