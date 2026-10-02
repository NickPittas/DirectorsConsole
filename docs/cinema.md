# Cinema Prompt Engineering

[← Back to the project README](../README.md)

Cinema Prompt Engineering (CPE) turns a structured cinematography or animation
configuration into prompt text. It is a prompt-writing tool, not a renderer:
CPE does **not** render an image or video, upload a prompt to a generator, or
run a ComfyUI workflow. Use [Storyboard](storyboard.md) when you are ready to
execute a workflow.

## Four-step start

1. **Choose a discipline.** Select **Live-Action Cinema** or **Animation**.
2. **Choose a preset.** Open the preset panel, search if needed, and select a
   film or animation preset. Applying a preset fills a compatible starting
   configuration; you can still tune it.
3. **Tune the configuration.** Adjust the fields for the shot or style.
4. **Choose a target and generate.** Select a generation target, then choose
   **Generate** for rule-based prompt text or **Enhance with AI** for LLM-written
   text. Send the version you want to Storyboard.

The interface validates combinations as you work. Invalid choices may be
filtered or disabled, with messages explaining conflicts.

## Live-action configuration

Live-action settings cover **Camera** (body, film stock, aspect ratio),
**Lens** (family, focal length, anamorphic), **Movement** (equipment and type),
**Lighting**, and **Visual Grammar** (shot size, composition, mood, and color).

Pick a preset first for a coherent historical or stylistic baseline, then
change individual fields. The rules engine checks physical, historical,
optical, and stylistic compatibility; hard conflicts prevent generation.

## Animation configuration

Animation uses its own fields rather than a real camera package. Tune
**Style**, **Rendering**, **Motion**, and **Visual Grammar**: medium, domain,
line/color treatment, lighting, surface detail, motion, virtual camera, shot
size, mood, and color tone.

Presets provide a visual language—such as anime, manga, 3D animation, or
illustration—and keep options consistent; some styles require a static camera.

## Preset panel: Browser and Info

The right-hand preset panel has two tabs:

- **Browser** searches and lists the available film or animation presets. Select
  a card to apply it.
- **Info** shows the active preset's metadata and, where available, its
  cinematography or style details and reference image.

![Film preset Info panel](../Images/CPE%20Movies%20Information.png)

*The Film Presets **Info** view for Seven Samurai, showing its era,
cinematographer, camera, film stock, aspect ratio, lenses, lighting signature,
color palette, techniques, and movement style.*

![Animation preset Browser and configuration](../Images/CPE%20Animation%20Presets.png)

*The Animation Presets **Browser** alongside the configuration panels and
prompt output, with animation preset cards such as Studio Ghibli and Akira.*

These retained screenshots illustrate the configuration panels and preset browser/info experience; the newer attachment composer below is not pictured.

## Generate or enhance

The target selector is the generation **TARGET** for the prompt format, not an execution control. It can be an image or video prompt profile, but selecting one does not call that generator.

- **Generate** creates the simple, rule-based prompt from the active settings.
  It is useful when you want predictable text that directly reflects the
  configuration.
- **Enhance with AI** sends the active prompt and context to the selected LLM
  provider. The LLM can expand the description into richer, professional
  prompt prose. It requires a configured provider/model and a provider that
  supports the requested input, including image input when images are attached.

Each output has **Send to Storyboard**. Send the version you want to continue
with; CPE itself does not render the result.

## Image enhancement

The prompt composer accepts **PNG, JPEG, and WebP** still images. Click **+**
to choose files, or drop images from the file manager onto the composer.
Thumbnails keep stable aliases such as `@img1` (profiles may describe the same
alias as `@image1`); removing an image does not renumber the remaining aliases.
You can enhance text only, images only, or text plus images.

Choose the image-use mode when attachments are present:

- **Describe image** is the default: describe one image as standalone prompt
  text, without treating it as a workflow reference.
- **Use as reference** supplies a reference/workflow variant when the selected
  target supports one. The variant controls how the reference is described; it
  is not an automatic generator invocation.
- **Use as starting image** is for a supported video starting frame or still
  image edit/init input. It is not the same as a general reference image.

There is one contextual variant selector, shown only when choices exist; it is
not a second target selector. If a target, variant, or mode change conflicts
with attachments, CPE preserves them and blocks enhancement until resolved.

When **Enhance with AI** runs, CPE sends the full active configuration,
selected preset/style JSON, and motion context, including current fields that
are empty, future-facing, or arrays. Explicit edit instructions take priority
over a pictured pose, but that is an instruction to the enhancer, not a
promise that the model will obey it.

Image pixels go only to the chosen enhancement LLM when Enhance is clicked;
it must support image input. This implies no target-generator execution/upload,
contact-sheet or Element registration, generator invocation, or universal
reference-generation workflow.

Example: attach a photo of a person and write, “Keep the same person lying
down.” This requests a pose change; it does not claim the photographed person
was already lying down.

## Related guides

- [Prompt enhancement profiles](../Documentation/PROMPT_ENHANCEMENT_PROFILES.md)
  — limits, aliases, image modes, and target markers.
- [Provider setup](providers.md) — configure a vision-capable enhancement
  provider when using image input.
- [Storyboard workflow execution](storyboard.md) — send prompts into an
  actual workflow.
- [Cinema presets](cinema-presets.md) — extracted preset tables.
- [Cinematography reference](cinematography-reference.md) — extracted camera,
  lens, movement, and lighting tables.
