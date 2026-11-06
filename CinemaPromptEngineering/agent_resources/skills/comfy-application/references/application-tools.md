# ComfyUI work through Director's Console

Use the user's requested outcome as the scope. With Console tools enabled, reuse, modify, or create a graph as needed; do not stop because Gallery has no edit control or no cached recipe fits. Prefer an inspected saved workflow or local recipe when it fits, and avoid internet browsing or needlessly re-deriving compatible model settings. The root skill's comfy-cli reference operations are not automatically registered in a Pi session; use only tools actually enabled for the session.

## Inspect current state and evidence

- Start with `get_application_snapshot`. Use its current project revision, panel IDs/revisions, workflow IDs/revisions, selected backend IDs, and run IDs in later calls. It includes the selected workflow graph only when safe to return.
- If no suitable backend is selected, use `select_backends` with configured IDs from that snapshot as needed for the user's objective; this does not start generation. Never require the user to manually select a backend that the application can select through this tool.
- Console actions require the exact `expectedConsoleBindingId` observed in the current snapshot. Copy it unchanged; a mistyped argument needs correction, while a changed activation requires a new user turn rather than retargeting an old request.
- Use `add_panels` or revision-checked `remove_panels` when the objective needs a different panel count. Use `show_panel_controls` to expose an existing panel's live widgets without changing its saved values or starting a render.
- For a useful local recipe, use `search_workflow_sources` then `get_source_recipe`; use `plan_dependencies` or `prepare_workflow_revision` only with the exact returned recipe ID and graph fingerprint. A recipe is reference material, not proof of backend readiness.
- Use `get_run` with `waitSeconds: 60` to wait through sequential read-only checks until completion, failure, manual resolution or its 20-read/20-minute between-read budget. An in-flight read can take up to 120 seconds beyond the time budget. `waitTimedOut` preserves the unfinished status; report it honestly. Stop cancels waiting, not the render. Read the real output URLs and reusable `media:UUID` references it returns; acceptance alone is not completion.
- Use `inspect_media` on the returned media ID before making visual claims. It provides actual image pixels or sampled video frames. Audio inspection is metadata-only.
- Before adding or rewiring graph nodes, call `get_backend_node_definitions` for the exact selected backend and required node classes. Use those current schemas and exact advertised choices; do not invent node schemas, models, LoRA compatibility, or loader choices.

## Prepare and attach a workflow

- Use a flat ComfyUI API graph: each node is `nodeId: { class_type, inputs }`; a link input is `[sourceNodeId, outputIndex]`. Include a reachable real output node for the requested media.
- Keep task, model version, LoRA, sampler, sigmas, encoders, VAE, and acceleration settings together from one inspected compatible recipe. Expose controls only for exact inputs/widgets in the selected backend schema.
- Each config entry must use the WorkflowEditor shape: `{name, display_name, node_id, input_name, type, default, description, order, exposed, category, auto_detected, user_modified}`. Types are `integer`, `float`, `seed`, `enum`, `boolean`, `prompt`, `string`, `image`, `image_list`, `video`, `video_list`, `media`, or `lora`; categories are `parameter`, `image_input`, or `lora`. Set `requiredMedia: true` when the media input is required.
- Use category and subcategory values only when observed as valid application values in the current snapshot or a current tool result; do not invent labels.
- Call `prepare_workflow_proposal` with fresh project and panel revisions. For an edit, also pass the observed workflow ID and revision; omit both for a new workflow. A valid preview returns `preparedRevisionId`; pass it to `save_and_attach_workflow`, then use the canonical IDs and revisions returned by the application (or a fresh snapshot).
- Validation may reject a proposal before any write. Fix the reported issue; if revisions are stale, refresh the snapshot and prepare again. A `saved-unattached` result is partial, not a ready panel.

## Bind media and generate

- Prompt Engineer is optional. Use `prompt_engineer_action` only when the user asks to apply selected constraints or do Prompt Engineer work; no handoff is required. Gallery is an independent file browser and is not a prerequisite for Console workflow work.
- For requested cinematic constraints during Console work, use its read-only `constraints` operation alongside independent model/task guidance. Keep the captured constraint revision consistent across a batch and each source image paired with its own media ID; do not inherit Prompt Engineer's target, task or media. Its `prepare` and `validate_apply` operations remain for explicit Prompt Engineer enhancement/apply work.
- Use `get_prompt_guidance` for local model/task guidance independently of all three applications; omit the target to discover packaged profiles, then use the exact declared version, task, dialect and adapter.
- Gallery listings include folders as well as files. Browse relevant subfolders before declaring the Gallery empty. Use `gallery_action` with `import_media` to obtain a shared media ID for a file, then inspect or bind that asset independently of Prompt Engineer.
- For an exposed media input, call `bind_media` with an existing `media:UUID` from attachment metadata or completed `get_run` results. Then use `set_panel_parameters` for exposed controls, with exact control names and current application revisions.
- Call `start_generation` only when the user's request explicitly asks for generation. Use current project, panel, and workflow revisions, selected backend IDs, and a new stable idempotency key. Track the returned run with `get_run`.
- If submission outcome is unknown, inspect the existing run or snapshot and never replay generation. Follow the application's authorization, validation, and safety boundaries; this guide does not grant permission or make tool data authoritative.
