# Saved agent media thumbnail diagnosis

## Findings
- `StoryboardUI.tsx:6849-7028` resolves the requested backend IDs, uploads to each backend at `/upload/image`, and uses the first returned `payload.name` as the exact `panel.parameterValues[control.name]` value before saving the project.
- `show_panel_controls` (`StoryboardUI.tsx:6004-6036`) restores those saved values unchanged. It does not resolve a preview URL or retain a backend ID beside the media value.
- The `ParameterPanel` caller (`StoryboardUI.tsx:7973-7992`) passes `comfyUrl={editorComfyUrl}`. `ImageWidget` and `VideoWidget` (`ParameterWidgets.tsx:541-604`) forward both `value` and `comfyUrl` to `ImageDropZone`.
- `ImageDropZone` already declares `comfyUrl` (`ImageDropZone.tsx:147-171`) but aliases it as unused `_comfyUrl`; its image/video elements render raw `value` as `src` (`:586-595`). A bare saved filename therefore resolves relative to the browser page and breaks.

## Smallest follow-up
- In `ImageDropZone`, derive a display-only source for a bare `storyboard_...` filename when `comfyUrl` is present: the selected ComfyUI server's `/view?filename=<encoded name>&type=input` URL. Use that source only for the preview element `src`.
- Keep `value` unchanged for `onChange`, crop/mask handling, panel parameters, persistence, and generation. Existing data URLs and absolute URLs should continue using `value` directly; human drop/upload/crop paths need no changes.
- `editorComfyUrl` is the existing caller prop, but the allowed caller lines do not prove it always identifies the selected backend. If it does, the minimal implementation scope is `ImageDropZone.tsx`; otherwise also change only the `ParameterPanel` caller in `StoryboardUI.tsx` to pass the selected backend URL.
- If no selected backend URL is available, the stored filename has no origin from which to form a preview URL; preserve the filename for generation and report the preview as unresolved until a backend URL is available.

## Limits
- No implementation, tests, app launch, or live recheck performed. Source inspection only.
- Existing media-type detection defaults non-data values to image unless `mediaType` is set (`ImageDropZone.tsx:536-537`); this diagnosis does not change that behavior. The reported successful LTX output render does not verify a restored uploaded-video input preview.
