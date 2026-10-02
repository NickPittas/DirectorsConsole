# Storyboard

[← Back to the README](../README.md)

Storyboard is the production canvas for turning loaded ComfyUI workflows into
repeatable image and video jobs. Cinema's text-oriented configuration helps
shape the prompt, while Storyboard builds and submits the selected workflow to
ComfyUI. Depending on the loaded workflow, custom nodes, and installed weights,
a panel can run image generation, image editing/reference work, upscaling, or
video generation. Storyboard does not promise that every panel supports every
media type.

## First shot

1. **Set the project destination.** Open **Project Settings**, choose the
   project/output folder, and decide on a naming template. Configure path
   mappings when a project or workflow uses a path from another operating
   system. Save the settings before generating if files should be copied to the
   project automatically.
2. **Import and select a workflow.** Choose a Storyboard category and route,
   then import a ComfyUI workflow JSON or select one already stored. The
   available controls come from that workflow's parsed schema. Use **Manage
   Workflow Categories** to classify a video workflow as Text to Video, Image to
   Video, or First/Last Frame to Video when appropriate.
3. **Select a panel and its parameters.** Select a panel on the canvas, assign
   its workflow, and edit its per-panel prompt, dimensions, sampler, model,
   seed, and other exposed controls. Switching workflows resets technical
   values to the new workflow defaults while preserving prompt and image-input
   values where they apply.
4. **Add inputs only where the workflow exposes them.** Upload an image or
   video through the matching parameter, drop an image from the canvas, or send
   a reference from Gallery. These are generation inputs, not a guarantee that
   the workflow has a usable image input: only parsed fields such as
   LoadImage-family inputs are available. A workflow can require a model or
   custom node without exposing a standalone image input.
5. **Choose render nodes and generate.** Select target nodes in Render Nodes,
   click **Generate** (or a panel's play button), and watch the progress state.
   Completed outputs become versions in the panel's image/video history; use
   the history controls, viewer, or Gallery to inspect and manage them.

The frontend sends the workflow directly to each ComfyUI node's REST API and
tracks execution with its WebSocket. The Orchestrator supports project/file
operations, Gallery operations, backend status, and job groups; it is not the
workflow-execution proxy.

## Project Settings

Open **Project Settings** from the main menu (or `Ctrl+,`). The dialog provides:

- project name and output folder path;
- the Orchestrator URL used for filesystem/project operations;
- filename templates and a live preview;
- auto-save on generation completion.

Useful template tokens include `{project}`, `{panel}`, `{version}`, `{date}`,
`{timestamp}`, `{time}`, `{seed}`, and `{workflow}`. A panel name can also
organize results into per-panel folders. Use **Path Mappings** for Windows,
Linux, or macOS prefixes that refer to the same storage.

![Storyboard Project Settings](../Images/Storyboard%20Project%20Settings.png)

*Project Settings: output path, naming template, preview, and auto-save. This earlier capture uses port 8020; the current default Orchestrator URL is `http://localhost:9820`.*

Project/session recovery is best-effort draft recovery, not a promise that the
last keystroke or an interrupted generation will be restored. See
[session recovery](session-recovery.md) for the recovery boundary.

## Canvas

The canvas is a free-floating workspace. Click a panel to select it; drag an
empty area to pan, and use the wheel to zoom around the pointer. Panels can be
moved, resized, multi-selected with `Ctrl`/`Cmd`-click, or marquee-selected.
Hold `Shift` while arranging to use snap guides and the alignment controls.
`Ctrl/Cmd+S` saves the project and `Ctrl/Cmd+P` opens storyboard printing.

## Panels

A panel is an independent production unit. Its header supports a custom name,
dragging, a lock indicator, and selection. A locked panel protects its name and
folder relationship when generated files exist; unlock it before renaming when
the UI requires that protection.

Each panel stores its own:

- workflow assignment and parameter values;
- status, progress, selected render-node assignment, and generated history;
- star rating and editable Markdown notes;
- image/video history with previous/next version navigation.

The panel's **Restore Parameters** action can restore workflow values from
compatible generation metadata. It does not turn an arbitrary file into a
supported workflow or guarantee that all model inputs are available.

![Panel ratings, notes, and node selection](../Images/Storyboard%20Panel%20Ratings-Notes-Node%20Selection.png)

*Panel card showing its name/lock, rating, notes, history controls, and node selection (earlier layout reference).*

## Workflows and parameters

The toolbar separates **Image Generation**, **Image Editing**, **Upscaling**,
and **Video Generation**. These are routes for organizing imported workflows,
not promises of a built-in generator. Import a ComfyUI workflow, review the
parsed controls, and assign it to the panel that will execute it.

Workflow parameters and custom categories are managed from the workflow
controls. The parser exposes controls it can identify, including prompts,
image/video inputs, dimensions, model choices, steps, CFG, samplers, and seeds.
Custom parameter configuration can name and type additional workflow inputs.
The resulting controls are schema-aware; arbitrary hidden node inputs are not
silently treated as universal settings.

For multiple backends, see [Multi-node generation](MULTI_NODE_GENERATION.md)
for seed strategies and detailed farm configuration. This guide intentionally
does not repeat its tables.

## Images, references, and Gallery

Generation uploads belong to the active workflow: use its visible image/video
parameter, drag from another canvas panel, or use Gallery's **Send to Storyboard**
action. Gallery can also restore a compatible workflow and parameters
from ComfyUI metadata. The selected workflow still determines what can be
submitted.

Do not confuse those workflow media uploads with **Enhance with AI**. The
Storyboard enhancement composer sends the active CPE configuration, preset,
and style context to the enhancer. For video targets it also sends the
confirmed dialect/task and confirmed media binding roles, order, and per-kind
ordinal labels. It sends metadata only: no image pixels, video frames, audio,
path, URL, or data URL is passed to the LLM. The enhancer does not inspect the
source asset and does not execute the ComfyUI workflow. It uses the caller's
confirmed mapping rather than inventing identity or first-frame support.

See [Prompt enhancement profiles](../Documentation/PROMPT_ENHANCEMENT_PROFILES.md)
for target and video-task details. Provider setup is in [providers.md](providers.md).
The wider media browser is documented in [gallery.md](gallery.md), and Cinema
text/configuration concepts in [cinema.md](cinema.md).

## Image viewer and compare

Select a result to open the Image Viewer. It provides version navigation,
zoom/pan, metadata, and the current prompt/workflow details when available.
Video results use the native video viewer controls when the output is a video.

![Storyboard Image Viewer](../Images/Storyboard%20Image%20Viewer.png)

*Image Viewer with version history, metadata, and prompt details (earlier layout reference).*

Use **Compare Mode** to select another history version. The viewer presents a
wipe slider so the current and comparison versions can be evaluated without
leaving the panel.

![Storyboard Image Compare](../Images/Storyboard%20Image%20Compare.png)

*Compare Mode showing version selection and the comparison wipe (earlier layout reference).*

## Render Node Manager and progress

Open **Render Nodes** to add ComfyUI URLs, start monitoring, inspect online
status and GPU/VRAM metrics, remove nodes, and select nodes for rendering. A
panel can target one or more available nodes. Multi-node generation creates
parallel variations using the same built workflow with node-specific seeds.

![Storyboard Render Nodes](../Images/Storyboard%20Node%20Manager.png)

*Render Nodes lists monitored ComfyUI backends and their status/metrics (earlier layout reference).*

The target-node area shows the nodes selected for the active render and live
resource cards. During execution, the progress sidebar reports the current
workflow node, phase, and step count; video workflows with multiple samplers
can show phases such as `1/2`. Use the global **Cancel** action to interrupt
busy generations rather than submitting a replacement job.

![Storyboard Node Metrics and Selection](../Images/Storyboard%20Node%20Metrics%20and%20Selection.png)

*Target Nodes and metrics show selected backends and current resource readings (earlier layout reference).*

## Related documentation

- [Multi-node generation](MULTI_NODE_GENERATION.md) — parallel rendering,
  seed strategies, failures, and farm configuration.
- [Session recovery](session-recovery.md) — draft persistence and interruption
  behavior.
- [Prompt enhancement profiles](../Documentation/PROMPT_ENHANCEMENT_PROFILES.md)
  — confirmed image/video enhancement mappings.
- [Providers](providers.md), [Gallery](gallery.md), and [Cinema](cinema.md) —
  related application guides.
