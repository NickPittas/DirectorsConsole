# WorkflowParser - Complete Node Type Reference

Quick reference for all supported ComfyUI node types in WorkflowParser.

---

## 📚 Supported Node Types (30 Total)

### 🎲 Sampler Nodes (4 types)

| ComfyUI Class | Model | Key Parameters |
|---------------|-------|----------------|
| `KSampler` | `KSamplerNode` | seed, steps, cfg, sampler_name, scheduler, denoise |
| `KSamplerAdvanced` | `KSamplerAdvancedNode` | seed, steps, cfg, add_noise, start_at_step, end_at_step |
| `SamplerCustom` | `SamplerCustomNode` | cfg |
| `RandomNoise` | `RandomNoiseNode` | noise_seed |

**Access in manifest:**
```python
manifest.ksamplers
manifest.ksamplers_advanced
manifest.samplers_custom
manifest.random_noise
```

---

### 📝 Text Encoding Nodes (8 types)

| ComfyUI Class | Model | Key Parameters |
|---------------|-------|----------------|
| `CLIPTextEncode` | `CLIPTextEncodeNode` | text, role (auto-inferred) |
| `CLIPTextEncodeSDXL` | `CLIPTextEncodeSDXLNode` | text_g, text_l, role |
| `CLIPTextEncodeFlux` | `CLIPTextEncodeFluxNode` | t5xxl, clip_l, guidance, role |
| `TextEncodeQwen` | `TextEncodeQwenNode` | text, role, node_type |
| `TextEncodeQwenImageEdit` | `TextEncodeQwenNode` | text, role, node_type |
| `TextEncodeQwenImageEditPlus` | `TextEncodeQwenNode` | text, role, node_type |
| `PromptStyler` | `PromptStylerNode` | text_positive, text_negative |
| `ShowText` | `ShowTextNode` | text |
| `StringFunction` | `StringFunctionNode` | text |

**Access in manifest:**
```python
manifest.text_encoders              # CLIPTextEncode
manifest.text_encoders_sdxl         # SDXL
manifest.text_encoders_flux         # Flux
manifest.text_encoders_qwen         # All Qwen variants
manifest.prompt_stylers
manifest.show_text
manifest.string_functions
```

---

### 🏗️ Model Loading Nodes (3 types)

| ComfyUI Class | Model | Key Parameters |
|---------------|-------|----------------|
| `CheckpointLoaderSimple` | `CheckpointLoaderNode` | ckpt_name |
| `LoraLoader` | `LoraLoaderNode` | lora_name, strength_model, strength_clip |
| `LoraLoaderModelOnly` | `LoraLoaderModelOnlyNode` | lora_name, strength_model |

**Access in manifest:**
```python
manifest.checkpoints
manifest.loras
manifest.loras_model_only
```

---

### 🖼️ Latent/Resolution Nodes (4 types)

| ComfyUI Class | Model | Key Parameters |
|---------------|-------|----------------|
| `EmptyLatentImage` | `EmptyLatentImageNode` | width, height, batch_size |
| `EmptySD3LatentImage` | `EmptySD3LatentImageNode` | width, height, batch_size |
| `SD3EmptyLatentImage` | `SD3EmptyLatentImageNode` | width, height, batch_size |
| `EmptyLTXVLatentVideo` | `EmptyLTXVLatentVideoNode` | width, height, length, batch_size |

**Access in manifest:**
```python
manifest.empty_latents              # Standard
manifest.empty_sd3_latents          # SD3 variant 1
manifest.sd3_empty_latents          # SD3 variant 2
manifest.empty_ltxv_latent_videos   # Video
```

---

### ⚡ Flux-Specific Nodes (2 types)

| ComfyUI Class | Model | Key Parameters |
|---------------|-------|----------------|
| `CLIPTextEncodeFlux` | `CLIPTextEncodeFluxNode` | t5xxl, clip_l, guidance |
| `FluxGuidance` | `FluxGuidanceNode` | guidance |

**Access in manifest:**
```python
manifest.text_encoders_flux
manifest.flux_guidance
```

---

### 📥 Image Input Nodes (2 types)

| ComfyUI Class | Model | Key Parameters |
|---------------|-------|----------------|
| `LoadImage` | `LoadImageNode` | image (filename) |
| `LoadImageMask` | `LoadImageMaskNode` | image, channel |

**Access in manifest:**
```python
manifest.load_images
manifest.load_image_masks
```

---

### 💾 Save Nodes (5 types)

| ComfyUI Class | Model | Key Parameters |
|---------------|-------|----------------|
| `SaveImage` | `SaveImageNode` | filename_prefix |
| `SaveImageWebsocket` | `SaveImageWebsocketNode` | filename_prefix |
| `SaveAnimatedWEBP` | `SaveAnimatedWEBPNode` | filename_prefix |
| `SaveAnimatedPNG` | `SaveAnimatedPNGNode` | filename_prefix |
| `VHS_VideoCombine` | `VHSVideoCombineNode` | filename_prefix |

**Access in manifest:**
```python
manifest.save_images
manifest.save_images_websocket
manifest.save_animated_webp
manifest.save_animated_png
manifest.vhs_video_combine
```

---

### 🎨 Inpainting Nodes (3 types)

| ComfyUI Class | Model | Key Parameters |
|---------------|-------|----------------|
| `VAEEncodeForInpaint` | `VAEEncodeForInpaintNode` | grow_mask_by |
| `InpaintModelConditioning` | `InpaintModelConditioningNode` | (no editable params) |
| `Inpaint` | `InpaintNode` | (no editable params) |

**Access in manifest:**
```python
manifest.vae_encode_inpaint
manifest.inpaint_model_conditioning
manifest.inpaint
```

---

### 🔧 Other Specialized Nodes (2 types)

| ComfyUI Class | Model | Key Parameters |
|---------------|-------|----------------|
| `ModelSamplingAuraFlow` | `ModelSamplingAuraFlowNode` | shift |
| `CFGGuider` | `CFGGuiderNode` | cfg |

**Access in manifest:**
```python
manifest.model_sampling_auraflow
manifest.cfg_guider
```

---

## 🔍 Quick Usage Examples

### Basic Parsing
```python
from workflow_parser import WorkflowParser

parser = WorkflowParser.from_file("workflow.json")
manifest = parser.parse()

# Get summary
summary = manifest.summary()
print(f"Total nodes: {summary['total_nodes']}")
```

### Access Specific Node Types
```python
# Get all latent generators
for latent in manifest.empty_latents:
    print(f"{latent.node_id}: {latent.width}x{latent.height}")

# Get positive prompts
for prompt in manifest.get_positive_prompts():
    print(f"Positive: {prompt.text}")

# Get all Flux text encoders
for flux_prompt in manifest.text_encoders_flux:
    print(f"Flux ({flux_prompt.guidance}): {flux_prompt.t5xxl}")
```

### Find Node by ID
```python
node = manifest.get_node_by_id("23")
if node:
    print(f"Found: {type(node).__name__}")
```

### Iterate All Samplers
```python
all_samplers = (
    manifest.ksamplers + 
    manifest.ksamplers_advanced + 
    manifest.samplers_custom
)
for sampler in all_samplers:
    print(f"Sampler {sampler.node_id}: {sampler.steps} steps")
```

---

## 📊 Manifest Summary

The `summary()` method returns counts for all node types:

```python
{
    'ksamplers': 1,
    'ksamplers_advanced': 0,
    'samplers_custom': 0,
    'random_noise': 1,
    'text_encoders': 2,
    'text_encoders_sdxl': 1,
    'text_encoders_flux': 0,
    'text_encoders_qwen': 0,
    'prompt_stylers': 0,
    'show_text': 0,
    'string_functions': 0,
    'checkpoints': 1,
    'loras': 2,
    'loras_model_only': 0,
    'empty_latents': 1,
    'empty_sd3_latents': 0,
    'sd3_empty_latents': 0,
    'empty_ltxv_latent_videos': 0,
    'flux_guidance': 0,
    'load_images': 0,
    'load_image_masks': 0,
    'save_images': 1,
    'save_images_websocket': 0,
    'save_animated_webp': 0,
    'save_animated_png': 0,
    'vhs_video_combine': 0,
    'vae_encode_inpaint': 0,
    'inpaint_model_conditioning': 0,
    'inpaint': 0,
    'model_sampling_auraflow': 0,
    'cfg_guider': 0,
    'total_nodes': 10
}
```

---

## 🏷️ Common Patterns

### Prompt Role Inference

The parser automatically infers whether text encoders are positive or negative based on:

1. **Node title** - Keywords like "negative", "neg", "positive", "pos"
2. **Text content** - Presence of negative keywords (e.g., "blurry", "low quality")
3. **Connection analysis** - Which KSampler input the node connects to

**Override if needed:**
```python
# Prompts have 'role' field set to "positive", "negative", or None
for prompt in manifest.text_encoders:
    if prompt.role == "negative":
        print(f"Negative: {prompt.text}")
```

### All Common Node Fields

Every node model has these fields:
- `node_id: str` - Unique ID from workflow
- `title: Optional[str]` - Node title/label if set

Additional fields are node-type specific.

---

## 🧪 Testing

Run the comprehensive test:

```bash
cd workflow_parser/
python3 test_all_nodes.py
```

Expected output:
```
🎉 ALL TESTS PASSED! All 25+ node types implemented correctly.
```

---

## 📝 Adding New Node Types

To add a new node type:

1. **Add model to `models.py`:**
   ```python
   class MyNewNode(BaseModel):
       node_id: str
       title: Optional[str] = None
       my_param: int
   ```

2. **Add to `WorkflowManifest`:**
   ```python
   my_new_nodes: list[MyNewNode] = Field(default_factory=list)
   ```

3. **Add NODE_TYPE constant to `parser.py`:**
   ```python
   "MY_NEW_NODE": "MyNewNodeClass",
   ```

4. **Add parsing method to `parser.py`:**
   ```python
   def _parse_my_new_nodes(self) -> list[MyNewNode]:
       nodes = []
       for node_id, node_data in self.workflow.items():
           if node_data.get("class_type") != self.NODE_TYPES["MY_NEW_NODE"]:
               continue
           # ... extract and create node
       return nodes
   ```

5. **Call in `parse()` method:**
   ```python
   my_new_nodes=self._parse_my_new_nodes(),
   ```

---

**Last Updated:** 2025-01-28  
**Version:** 2.0 (Complete Implementation)
