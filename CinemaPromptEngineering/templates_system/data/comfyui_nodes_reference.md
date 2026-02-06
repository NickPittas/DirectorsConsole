# ComfyUI Node Types Reference

This document catalogs all ComfyUI node types and their configurable properties discovered from workflow analysis.
It serves as a reference for the template system to properly extract and apply parameters.

## Node Categories

### 1. Model Loaders

#### CheckpointLoaderSimple
- **class_type**: `CheckpointLoaderSimple`
- **widgets_values**: `[checkpoint_name]`
- **outputs**: MODEL, CLIP, VAE

#### UNETLoader
- **class_type**: `UNETLoader`
- **widgets_values**: `[unet_name, weight_dtype]`
- **outputs**: MODEL

#### CLIPLoader
- **class_type**: `CLIPLoader`
- **widgets_values**: `[clip_name, type, device]`
- **outputs**: CLIP

#### DualCLIPLoader
- **class_type**: `DualCLIPLoader`
- **widgets_values**: `[clip_name1, clip_name2, type]`
- **outputs**: CLIP

#### VAELoader
- **class_type**: `VAELoader`
- **widgets_values**: `[vae_name]`
- **outputs**: VAE

#### LTXAVTextEncoderLoader (LTX Video)
- **class_type**: `LTXAVTextEncoderLoader`
- **widgets_values**: `[text_encoder, ckpt_name]`
- **outputs**: CLIP

#### LTXVAudioVAELoader (LTX Video Audio)
- **class_type**: `LTXVAudioVAELoader`
- **widgets_values**: `[ckpt_name]`
- **outputs**: Audio VAE

---

### 2. LoRA Loaders

#### LoraLoaderModelOnly
- **class_type**: `LoraLoaderModelOnly`
- **widgets_values**: `[lora_name, strength_model]`
- **inputs**: model
- **outputs**: MODEL
- **configurable**: `lora_name`, `strength_model` (0.0-2.0)

#### LoraLoader
- **class_type**: `LoraLoader`
- **widgets_values**: `[lora_name, strength_model, strength_clip]`
- **inputs**: model, clip
- **outputs**: MODEL, CLIP

---

### 3. Samplers

#### KSampler
- **class_type**: `KSampler`
- **widgets_values**: `[seed, control_after_generate, steps, cfg, sampler_name, scheduler, denoise]`
- **configurable parameters**:
  - `seed` (int): Random seed for generation
  - `steps` (int): Number of sampling steps (1-150)
  - `cfg` (float): Classifier-free guidance scale (1.0-30.0)
  - `sampler_name` (string): euler, euler_ancestral, heun, dpm_2, dpm_2_ancestral, lms, dpm_fast, dpm_adaptive, dpmpp_2s_ancestral, dpmpp_sde, dpmpp_2m, ddim, uni_pc, uni_pc_bh2
  - `scheduler` (string): normal, karras, exponential, sgm_uniform, simple, ddim_uniform, beta
  - `denoise` (float): Denoising strength (0.0-1.0)

#### KSamplerSelect
- **class_type**: `KSamplerSelect`
- **widgets_values**: `[sampler_name]`
- **outputs**: SAMPLER

#### SamplerCustomAdvanced
- **class_type**: `SamplerCustomAdvanced`
- **inputs**: noise, guider, sampler, sigmas, latent_image
- **outputs**: LATENT (output, denoised_output)

#### RandomNoise
- **class_type**: `RandomNoise`
- **widgets_values**: `[noise_seed, control_after_generate]`
- **outputs**: NOISE

---

### 4. Text Encoders

#### CLIPTextEncode
- **class_type**: `CLIPTextEncode`
- **widgets_values**: `[text]`
- **inputs**: clip
- **outputs**: CONDITIONING
- **configurable**: `text` (string prompt)

#### CLIPTextEncodeFlux
- **class_type**: `CLIPTextEncodeFlux`
- **widgets_values**: `[clip_l_text, t5xxl_text, guidance]`
- **inputs**: clip
- **outputs**: CONDITIONING
- **configurable**: 
  - `clip_l_text` (string)
  - `t5xxl_text` (string) 
  - `guidance` (float, typically 3.5-4.0)

#### TextEncodeQwenImageEditPlus
- **class_type**: `TextEncodeQwenImageEditPlus`
- **widgets_values**: `[prompt]`
- **inputs**: clip, vae, image1, image2, image3 (optional)
- **outputs**: CONDITIONING

---

### 5. Latent Operations

#### EmptyLatentImage
- **class_type**: `EmptyLatentImage`
- **widgets_values**: `[width, height, batch_size]`
- **outputs**: LATENT

#### EmptySD3LatentImage
- **class_type**: `EmptySD3LatentImage`
- **widgets_values**: `[width, height, batch_size]`
- **outputs**: LATENT

#### EmptyLTXVLatentVideo (Video)
- **class_type**: `EmptyLTXVLatentVideo`
- **widgets_values**: `[width, height, length, batch_size]`
- **outputs**: LATENT

#### VAEEncode
- **class_type**: `VAEEncode`
- **inputs**: pixels (IMAGE), vae
- **outputs**: LATENT

#### VAEDecode
- **class_type**: `VAEDecode`
- **inputs**: samples (LATENT), vae
- **outputs**: IMAGE

#### VAEDecodeTiled
- **class_type**: `VAEDecodeTiled`
- **widgets_values**: `[tile_size, overlap, temporal_size, temporal_overlap]`
- **inputs**: samples, vae
- **outputs**: IMAGE

#### LatentUpscaleModelLoader
- **class_type**: `LatentUpscaleModelLoader`
- **widgets_values**: `[model_name]`
- **outputs**: LATENT_UPSCALE_MODEL

---

### 6. Image Operations

#### LoadImage
- **class_type**: `LoadImage`
- **widgets_values**: `[image_filename, upload_type]`
- **outputs**: IMAGE, MASK

#### LoadImageOutput
- **class_type**: `LoadImageOutput`
- **widgets_values**: `[title, subpath, sort_by, title_filter, allow_any_filename, include_subdirectories, load_cap, start_index, allow_url_input, url_index, use_reference_output_folder, image_type, filename]`
- **outputs**: IMAGE, MASK

#### SaveImage
- **class_type**: `SaveImage`
- **widgets_values**: `[filename_prefix]`
- **inputs**: images

#### PreviewImage
- **class_type**: `PreviewImage`
- **inputs**: images

#### ImageScaleToTotalPixels
- **class_type**: `ImageScaleToTotalPixels`
- **widgets_values**: `[upscale_method, megapixels]`
- **inputs**: image
- **outputs**: IMAGE

#### ImageScaleBy
- **class_type**: `ImageScaleBy`
- **widgets_values**: `[upscale_method, scale_by]`
- **inputs**: image
- **outputs**: IMAGE

#### ImageStitch
- **class_type**: `ImageStitch`
- **widgets_values**: `[direction]`
- **inputs**: image1, image2
- **outputs**: IMAGE

#### ImageConcanate (KJNodes)
- **class_type**: `ImageConcanate`
- **widgets_values**: `[direction, match_image_size]`
- **inputs**: image1, image2
- **outputs**: IMAGE

#### ImageResizeKJv2 (KJNodes)
- **class_type**: `ImageResizeKJv2`
- **widgets_values**: `[width, height, upscale_method, keep_proportion, pad_color, crop_position, divisible_by, device]`
- **inputs**: image, mask
- **outputs**: IMAGE, width, height, mask

---

### 7. Conditioning & Guidance

#### ConditioningZeroOut
- **class_type**: `ConditioningZeroOut`
- **inputs**: conditioning
- **outputs**: CONDITIONING

#### InpaintModelConditioning
- **class_type**: `InpaintModelConditioning`
- **inputs**: positive, negative, vae, pixels, mask
- **outputs**: positive, negative, latent

#### InstructPixToPixConditioning
- **class_type**: `InstructPixToPixConditioning`
- **inputs**: positive, negative, vae, pixels
- **outputs**: positive, negative, latent

#### ReferenceLatent
- **class_type**: `ReferenceLatent`
- **widgets_values**: `[timestep_zero_fill]`
- **inputs**: vae, image, mask
- **outputs**: CONDITIONING

#### FluxGuidance
- **class_type**: `FluxGuidance`
- **widgets_values**: `[guidance]`
- **inputs**: conditioning
- **outputs**: CONDITIONING

#### CFGGuider
- **class_type**: `CFGGuider`
- **widgets_values**: `[cfg]`
- **inputs**: model, positive, negative
- **outputs**: GUIDER

#### LTXVConditioning (LTX Video)
- **class_type**: `LTXVConditioning`
- **widgets_values**: `[frame_rate]`
- **inputs**: positive, negative
- **outputs**: positive, negative

---

### 8. Model Modifiers

#### ModelSamplingAuraFlow
- **class_type**: `ModelSamplingAuraFlow`
- **widgets_values**: `[shift]`
- **inputs**: model
- **outputs**: MODEL
- **configurable**: `shift` (float, typically 1.0)

#### CFGNorm
- **class_type**: `CFGNorm`
- **widgets_values**: `[strength]`
- **inputs**: model
- **outputs**: patched_model

#### DifferentialDiffusion
- **class_type**: `DifferentialDiffusion`
- **inputs**: model
- **outputs**: MODEL

---

### 9. ControlNet

#### ControlNetLoader
- **class_type**: `ControlNetLoader`
- **widgets_values**: `[control_net_name]`
- **outputs**: CONTROL_NET

#### ControlNetApplyAdvanced
- **class_type**: `ControlNetApplyAdvanced`
- **widgets_values**: `[strength, start_percent, end_percent]`
- **inputs**: positive, negative, control_net, image, vae
- **outputs**: positive, negative

#### Canny (Preprocessor)
- **class_type**: `Canny`
- **widgets_values**: `[low_threshold, high_threshold]`
- **inputs**: image
- **outputs**: IMAGE

---

### 10. Masking & Segmentation

#### SAM3Segmentation
- **class_type**: `SAM3Segmentation`
- **widgets_values**: `[threshold, text_prompt, max_masks]`
- **inputs**: sam3_model, image, positive_boxes, negative_boxes, mask_prompt, positive_points, negative_points
- **outputs**: masks, visualization, boxes, scores

#### LoadSAM3Model
- **class_type**: `LoadSAM3Model`
- **widgets_values**: `[model_name]`
- **outputs**: SAM3_MODEL

#### MaskPreview
- **class_type**: `MaskPreview`
- **inputs**: mask

---

### 11. Video-Specific Nodes (LTX, Wan, etc.)

#### SaveVideo
- **class_type**: `SaveVideo`
- **widgets_values**: `[filename_prefix, format, codec]`
- **inputs**: video

#### CreateVideo
- **class_type**: `CreateVideo`
- **widgets_values**: `[fps]`
- **inputs**: images, audio
- **outputs**: VIDEO

#### LTXVConcatAVLatent
- **class_type**: `LTXVConcatAVLatent`
- **inputs**: video_latent, audio_latent
- **outputs**: latent

#### LTXVSeparateAVLatent
- **class_type**: `LTXVSeparateAVLatent`
- **inputs**: av_latent
- **outputs**: video_latent, audio_latent

#### LTXVEmptyLatentAudio
- **class_type**: `LTXVEmptyLatentAudio`
- **widgets_values**: `[frames_number, frame_rate, batch_size]`
- **inputs**: audio_vae
- **outputs**: Latent

#### LTXVAudioVAEDecode
- **class_type**: `LTXVAudioVAEDecode`
- **inputs**: samples, audio_vae
- **outputs**: Audio

#### LTXVLatentUpsampler
- **class_type**: `LTXVLatentUpsampler`
- **inputs**: samples, upscale_model, vae
- **outputs**: LATENT

---

### 12. Utility Nodes

#### Note
- **class_type**: `Note`
- **widgets_values**: `[text]`
- Documentation/comment node

#### MarkdownNote
- **class_type**: `MarkdownNote`
- **widgets_values**: `[markdown_text]`
- Rich documentation node

#### PrimitiveNode
- **class_type**: `PrimitiveNode`
- **widgets_values**: `[value, control_after_generate, ...]`
- Generic value provider

#### PrimitiveInt
- **class_type**: `PrimitiveInt`
- **widgets_values**: `[value, control_after_generate]`
- **outputs**: INT

#### PrimitiveFloat
- **class_type**: `PrimitiveFloat`
- **widgets_values**: `[value]`
- **outputs**: FLOAT

#### PrimitiveStringMultiline
- **class_type**: `PrimitiveStringMultiline`
- **widgets_values**: `[value]`
- **outputs**: STRING

#### ManualSigmas
- **class_type**: `ManualSigmas`
- **widgets_values**: `[sigmas_string]`
- **outputs**: SIGMAS

#### Reroute
- **class_type**: `Reroute`
- Wire routing node, no widgets

#### GetImageSize
- **class_type**: `GetImageSize`
- **inputs**: image
- **outputs**: width, height, batch_size

#### EmptyImage
- **class_type**: `EmptyImage`
- **widgets_values**: `[width, height, batch_size, color]`
- **outputs**: IMAGE

---

## Parameter Mapping Strategy

### Standard Widget Mapping

| Node Type | Widget Index | Parameter Name | Type |
|-----------|--------------|----------------|------|
| KSampler | 0 | seed | int |
| KSampler | 2 | steps | int |
| KSampler | 3 | cfg | float |
| KSampler | 4 | sampler_name | string |
| KSampler | 5 | scheduler | string |
| KSampler | 6 | denoise | float |
| CLIPTextEncode | 0 | text | string |
| LoraLoaderModelOnly | 0 | lora_name | string |
| LoraLoaderModelOnly | 1 | strength_model | float |
| EmptyLatentImage | 0 | width | int |
| EmptyLatentImage | 1 | height | int |
| EmptyLatentImage | 2 | batch_size | int |
| ModelSamplingAuraFlow | 0 | shift | float |
| FluxGuidance | 0 | guidance | float |

### Input Connection Mapping

Some parameters are set via input connections rather than widgets:
- `positive` → CLIPTextEncode (positive prompt)
- `negative` → CLIPTextEncode (negative prompt)
- `latent_image` → EmptyLatentImage or VAEEncode
- `model` → CheckpointLoaderSimple or UNETLoader

---

## Detection Heuristics

### Identifying Prompt Nodes
1. Look for `CLIPTextEncode` nodes
2. Check `_meta.title` for hints: "positive", "negative", "prompt"
3. Check node position/order in workflow
4. Trace connections to KSampler positive/negative inputs

### Identifying Seed Nodes
1. Look for `KSampler` or `RandomNoise` nodes
2. Seed is typically widgets_values[0] or has widget name "seed"/"noise_seed"

### Identifying Image Input Nodes
1. Look for `LoadImage`, `LoadImageOutput` nodes
2. Also check `VAEEncode` nodes that connect images to latent space

### Identifying LoRA Nodes
1. Look for `LoraLoaderModelOnly` or `LoraLoader` class_type
2. Extract lora_name from widgets_values[0]
3. Extract strength from widgets_values[1]

---

## Workflow Format Notes

### API Format (for execution)
Nodes stored as top-level keys (string IDs like "44", "45"):
```json
{
  "44": {
    "class_type": "KSampler",
    "inputs": {...},
    "_meta": {"title": "KSampler"}
  }
}
```

### Frontend Format (for UI/editing)
Nodes stored in a "nodes" array with visual properties:
```json
{
  "nodes": [
    {
      "id": 44,
      "type": "KSampler",
      "pos": [x, y],
      "widgets_values": [...],
      "inputs": [...],
      "outputs": [...]
    }
  ]
}
```

### Important: Workflow Builder must handle API format
- Do NOT use `workflow.get("nodes", {})` - this returns empty dict
- Instead filter: `{k: v for k, v in workflow.items() if k != "meta" and isinstance(v, dict) and "inputs" in v}`
