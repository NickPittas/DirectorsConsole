"""
Pydantic models for ComfyUI workflow parameters.

These models represent the structured data extracted from ComfyUI workflows.
"""

from typing import Optional, Any
from pydantic import BaseModel, Field


class KSamplerNode(BaseModel):
    """Represents a KSampler node with editable parameters."""
    
    node_id: str = Field(description="Unique node ID from workflow")
    title: Optional[str] = Field(default=None, description="Node title/label if set")
    seed: int = Field(description="Random seed for generation")
    steps: int = Field(description="Number of sampling steps")
    cfg: float = Field(description="Classifier-free guidance scale")
    sampler_name: Optional[str] = Field(default=None, description="Sampler algorithm name")
    scheduler: Optional[str] = Field(default=None, description="Scheduler type")
    denoise: Optional[float] = Field(default=None, description="Denoise strength")
    
    class Config:
        """Pydantic config."""
        json_schema_extra = {
            "example": {
                "node_id": "3",
                "title": "Main KSampler",
                "seed": 123456,
                "steps": 20,
                "cfg": 7.5,
                "sampler_name": "euler",
                "scheduler": "normal",
                "denoise": 1.0
            }
        }


class KSamplerAdvancedNode(BaseModel):
    """Represents a KSamplerAdvanced node with editable parameters."""
    
    node_id: str = Field(description="Unique node ID from workflow")
    title: Optional[str] = Field(default=None, description="Node title/label if set")
    seed: int = Field(description="Random seed for generation")
    steps: int = Field(description="Number of sampling steps")
    cfg: float = Field(description="Classifier-free guidance scale")
    sampler_name: Optional[str] = Field(default=None, description="Sampler algorithm name")
    scheduler: Optional[str] = Field(default=None, description="Scheduler type")
    add_noise: Optional[str] = Field(default=None, description="Add noise mode (enable/disable)")
    start_at_step: Optional[int] = Field(default=None, description="Starting step for sampling")
    end_at_step: Optional[int] = Field(default=None, description="Ending step for sampling")
    return_with_leftover_noise: Optional[str] = Field(default=None, description="Return with leftover noise")


class SamplerCustomNode(BaseModel):
    """Represents a SamplerCustom node."""
    
    node_id: str = Field(description="Unique node ID from workflow")
    title: Optional[str] = Field(default=None, description="Node title/label if set")
    cfg: Optional[float] = Field(default=None, description="CFG value if present")


class RandomNoiseNode(BaseModel):
    """Represents a RandomNoise node."""
    
    node_id: str = Field(description="Unique node ID from workflow")
    title: Optional[str] = Field(default=None, description="Node title/label if set")
    noise_seed: int = Field(description="Seed for noise generation")


class CLIPTextEncodeNode(BaseModel):
    """Represents a CLIPTextEncode node with prompt text."""
    
    node_id: str = Field(description="Unique node ID from workflow")
    title: Optional[str] = Field(default=None, description="Node title/label if set")
    text: str = Field(description="Prompt text for encoding")
    role: Optional[str] = Field(default=None, description="Inferred role (positive/negative)")
    
    class Config:
        """Pydantic config."""
        json_schema_extra = {
            "example": {
                "node_id": "6",
                "title": "Positive Prompt",
                "text": "a cinematic photograph of a hero standing dramatically",
                "role": "positive"
            }
        }


class CLIPTextEncodeSDXLNode(BaseModel):
    """Represents a CLIPTextEncodeSDXL node with dual text inputs."""
    
    node_id: str = Field(description="Unique node ID from workflow")
    title: Optional[str] = Field(default=None, description="Node title/label if set")
    text_g: str = Field(description="Text for CLIP G model")
    text_l: str = Field(description="Text for CLIP L model")
    role: Optional[str] = Field(default=None, description="Inferred role (positive/negative)")


class CLIPTextEncodeFluxNode(BaseModel):
    """Represents a CLIPTextEncodeFlux node."""
    
    node_id: str = Field(description="Unique node ID from workflow")
    title: Optional[str] = Field(default=None, description="Node title/label if set")
    t5xxl: str = Field(description="T5XXL text prompt")
    clip_l: Optional[str] = Field(default=None, description="CLIP L text prompt if present")
    guidance: Optional[float] = Field(default=None, description="Guidance scale")
    role: Optional[str] = Field(default=None, description="Inferred role (positive/negative)")


class TextEncodeQwenNode(BaseModel):
    """Represents TextEncodeQwen/TextEncodeQwenImageEdit/TextEncodeQwenImageEditPlus nodes."""
    
    node_id: str = Field(description="Unique node ID from workflow")
    title: Optional[str] = Field(default=None, description="Node title/label if set")
    text: str = Field(description="Prompt text")
    role: Optional[str] = Field(default=None, description="Inferred role (positive/negative)")
    node_type: str = Field(description="Specific Qwen node type")


class PromptStylerNode(BaseModel):
    """Represents a PromptStyler node with dual positive/negative outputs."""
    
    node_id: str = Field(description="Unique node ID from workflow")
    title: Optional[str] = Field(default=None, description="Node title/label if set")
    text_positive: Optional[str] = Field(default=None, description="Positive prompt text")
    text_negative: Optional[str] = Field(default=None, description="Negative prompt text")


class ShowTextNode(BaseModel):
    """Represents a ShowText node."""
    
    node_id: str = Field(description="Unique node ID from workflow")
    title: Optional[str] = Field(default=None, description="Node title/label if set")
    text: str = Field(description="Display text")


class StringFunctionNode(BaseModel):
    """Represents a StringFunction node."""
    
    node_id: str = Field(description="Unique node ID from workflow")
    title: Optional[str] = Field(default=None, description="Node title/label if set")
    text: Optional[str] = Field(default=None, description="String text if present")


class CheckpointLoaderNode(BaseModel):
    """Represents a CheckpointLoaderSimple node."""
    
    node_id: str = Field(description="Unique node ID from workflow")
    title: Optional[str] = Field(default=None, description="Node title/label if set")
    ckpt_name: str = Field(description="Checkpoint/model filename")
    
    class Config:
        """Pydantic config."""
        json_schema_extra = {
            "example": {
                "node_id": "4",
                "title": "Main Checkpoint",
                "ckpt_name": "realisticVision_v51.safetensors"
            }
        }


class LoraLoaderNode(BaseModel):
    """Represents a LoraLoader node."""
    
    node_id: str = Field(description="Unique node ID from workflow")
    title: Optional[str] = Field(default=None, description="Node title/label if set")
    lora_name: str = Field(description="LoRA filename")
    strength_model: float = Field(description="LoRA strength for model")
    strength_clip: float = Field(description="LoRA strength for CLIP")
    
    class Config:
        """Pydantic config."""
        json_schema_extra = {
            "example": {
                "node_id": "10",
                "title": "Detail LoRA",
                "lora_name": "add_detail.safetensors",
                "strength_model": 1.0,
                "strength_clip": 1.0
            }
        }


class LoraLoaderModelOnlyNode(BaseModel):
    """Represents a LoraLoaderModelOnly node."""
    
    node_id: str = Field(description="Unique node ID from workflow")
    title: Optional[str] = Field(default=None, description="Node title/label if set")
    lora_name: str = Field(description="LoRA filename")
    strength_model: float = Field(description="LoRA strength for model")


class EmptyLatentImageNode(BaseModel):
    """Represents an EmptyLatentImage node."""
    
    node_id: str = Field(description="Unique node ID from workflow")
    title: Optional[str] = Field(default=None, description="Node title/label if set")
    width: int = Field(description="Latent image width")
    height: int = Field(description="Latent image height")
    batch_size: int = Field(default=1, description="Batch size for generation")


class EmptySD3LatentImageNode(BaseModel):
    """Represents an EmptySD3LatentImage node."""
    
    node_id: str = Field(description="Unique node ID from workflow")
    title: Optional[str] = Field(default=None, description="Node title/label if set")
    width: int = Field(description="Latent image width")
    height: int = Field(description="Latent image height")
    batch_size: int = Field(default=1, description="Batch size for generation")


class SD3EmptyLatentImageNode(BaseModel):
    """Represents an SD3EmptyLatentImage node."""
    
    node_id: str = Field(description="Unique node ID from workflow")
    title: Optional[str] = Field(default=None, description="Node title/label if set")
    width: int = Field(description="Latent image width")
    height: int = Field(description="Latent image height")
    batch_size: int = Field(default=1, description="Batch size for generation")


class EmptyLTXVLatentVideoNode(BaseModel):
    """Represents an EmptyLTXVLatentVideo node."""
    
    node_id: str = Field(description="Unique node ID from workflow")
    title: Optional[str] = Field(default=None, description="Node title/label if set")
    width: int = Field(description="Video width")
    height: int = Field(description="Video height")
    length: int = Field(description="Video length in frames")
    batch_size: int = Field(default=1, description="Batch size for generation")


class FluxGuidanceNode(BaseModel):
    """Represents a FluxGuidance node."""
    
    node_id: str = Field(description="Unique node ID from workflow")
    title: Optional[str] = Field(default=None, description="Node title/label if set")
    guidance: float = Field(description="Guidance scale for Flux models")


class LoadImageNode(BaseModel):
    """Represents a LoadImage node."""
    
    node_id: str = Field(description="Unique node ID from workflow")
    title: Optional[str] = Field(default=None, description="Node title/label if set")
    image: str = Field(description="Image filename or path")


class LoadImageMaskNode(BaseModel):
    """Represents a LoadImageMask node."""
    
    node_id: str = Field(description="Unique node ID from workflow")
    title: Optional[str] = Field(default=None, description="Node title/label if set")
    image: str = Field(description="Image filename or path")
    channel: Optional[str] = Field(default=None, description="Channel to use as mask")


class SaveImageNode(BaseModel):
    """Represents a SaveImage node."""
    
    node_id: str = Field(description="Unique node ID from workflow")
    title: Optional[str] = Field(default=None, description="Node title/label if set")
    filename_prefix: str = Field(description="Prefix for saved image filenames")


class SaveImageWebsocketNode(BaseModel):
    """Represents a SaveImageWebsocket node."""
    
    node_id: str = Field(description="Unique node ID from workflow")
    title: Optional[str] = Field(default=None, description="Node title/label if set")
    filename_prefix: Optional[str] = Field(default=None, description="Prefix for saved image filenames")


class SaveAnimatedWEBPNode(BaseModel):
    """Represents a SaveAnimatedWEBP node."""
    
    node_id: str = Field(description="Unique node ID from workflow")
    title: Optional[str] = Field(default=None, description="Node title/label if set")
    filename_prefix: str = Field(description="Prefix for saved animation filenames")


class SaveAnimatedPNGNode(BaseModel):
    """Represents a SaveAnimatedPNG node."""
    
    node_id: str = Field(description="Unique node ID from workflow")
    title: Optional[str] = Field(default=None, description="Node title/label if set")
    filename_prefix: str = Field(description="Prefix for saved animation filenames")


class VHSVideoCombineNode(BaseModel):
    """Represents a VHS_VideoCombine node."""
    
    node_id: str = Field(description="Unique node ID from workflow")
    title: Optional[str] = Field(default=None, description="Node title/label if set")
    filename_prefix: str = Field(description="Prefix for saved video filenames")


class VAEEncodeForInpaintNode(BaseModel):
    """Represents a VAEEncodeForInpaint node."""
    
    node_id: str = Field(description="Unique node ID from workflow")
    title: Optional[str] = Field(default=None, description="Node title/label if set")
    grow_mask_by: Optional[int] = Field(default=None, description="Pixels to grow mask by")


class InpaintModelConditioningNode(BaseModel):
    """Represents an InpaintModelConditioning node."""
    
    node_id: str = Field(description="Unique node ID from workflow")
    title: Optional[str] = Field(default=None, description="Node title/label if set")


class InpaintNode(BaseModel):
    """Represents an Inpaint node."""
    
    node_id: str = Field(description="Unique node ID from workflow")
    title: Optional[str] = Field(default=None, description="Node title/label if set")


class ModelSamplingAuraFlowNode(BaseModel):
    """Represents a ModelSamplingAuraFlow node."""
    
    node_id: str = Field(description="Unique node ID from workflow")
    title: Optional[str] = Field(default=None, description="Node title/label if set")
    shift: float = Field(description="Shift parameter for AuraFlow sampling")


class CFGGuiderNode(BaseModel):
    """Represents a CFGGuider node."""
    
    node_id: str = Field(description="Unique node ID from workflow")
    title: Optional[str] = Field(default=None, description="Node title/label if set")
    cfg: float = Field(description="CFG scale for guidance")


class WorkflowManifest(BaseModel):
    """
    Structured manifest of all editable parameters from a ComfyUI workflow.
    
    This model represents all the parameters that can be edited in a workflow,
    organized by node type. All lists preserve the order of nodes in the workflow.
    """
    
    # Sampler nodes
    ksamplers: list[KSamplerNode] = Field(
        default_factory=list,
        description="All KSampler nodes found in the workflow"
    )
    
    ksamplers_advanced: list[KSamplerAdvancedNode] = Field(
        default_factory=list,
        description="All KSamplerAdvanced nodes"
    )
    
    samplers_custom: list[SamplerCustomNode] = Field(
        default_factory=list,
        description="All SamplerCustom nodes"
    )
    
    random_noise: list[RandomNoiseNode] = Field(
        default_factory=list,
        description="All RandomNoise nodes"
    )
    
    # Text encoding nodes
    text_encoders: list[CLIPTextEncodeNode] = Field(
        default_factory=list,
        description="All CLIPTextEncode nodes (prompts)"
    )
    
    text_encoders_sdxl: list[CLIPTextEncodeSDXLNode] = Field(
        default_factory=list,
        description="All CLIPTextEncodeSDXL nodes"
    )
    
    text_encoders_flux: list[CLIPTextEncodeFluxNode] = Field(
        default_factory=list,
        description="All CLIPTextEncodeFlux nodes"
    )
    
    text_encoders_qwen: list[TextEncodeQwenNode] = Field(
        default_factory=list,
        description="All TextEncodeQwen* nodes"
    )
    
    prompt_stylers: list[PromptStylerNode] = Field(
        default_factory=list,
        description="All PromptStyler nodes"
    )
    
    show_text: list[ShowTextNode] = Field(
        default_factory=list,
        description="All ShowText nodes"
    )
    
    string_functions: list[StringFunctionNode] = Field(
        default_factory=list,
        description="All StringFunction nodes"
    )
    
    # Model loading nodes
    checkpoints: list[CheckpointLoaderNode] = Field(
        default_factory=list,
        description="All CheckpointLoaderSimple nodes"
    )
    
    loras: list[LoraLoaderNode] = Field(
        default_factory=list,
        description="All LoraLoader nodes"
    )
    
    loras_model_only: list[LoraLoaderModelOnlyNode] = Field(
        default_factory=list,
        description="All LoraLoaderModelOnly nodes"
    )
    
    # Latent/resolution nodes
    empty_latents: list[EmptyLatentImageNode] = Field(
        default_factory=list,
        description="All EmptyLatentImage nodes"
    )
    
    empty_sd3_latents: list[EmptySD3LatentImageNode] = Field(
        default_factory=list,
        description="All EmptySD3LatentImage nodes"
    )
    
    sd3_empty_latents: list[SD3EmptyLatentImageNode] = Field(
        default_factory=list,
        description="All SD3EmptyLatentImage nodes"
    )
    
    empty_ltxv_latent_videos: list[EmptyLTXVLatentVideoNode] = Field(
        default_factory=list,
        description="All EmptyLTXVLatentVideo nodes"
    )
    
    # Flux-specific nodes
    flux_guidance: list[FluxGuidanceNode] = Field(
        default_factory=list,
        description="All FluxGuidance nodes"
    )
    
    # Image input nodes
    load_images: list[LoadImageNode] = Field(
        default_factory=list,
        description="All LoadImage nodes"
    )
    
    load_image_masks: list[LoadImageMaskNode] = Field(
        default_factory=list,
        description="All LoadImageMask nodes"
    )
    
    # Save nodes
    save_images: list[SaveImageNode] = Field(
        default_factory=list,
        description="All SaveImage nodes"
    )
    
    save_images_websocket: list[SaveImageWebsocketNode] = Field(
        default_factory=list,
        description="All SaveImageWebsocket nodes"
    )
    
    save_animated_webp: list[SaveAnimatedWEBPNode] = Field(
        default_factory=list,
        description="All SaveAnimatedWEBP nodes"
    )
    
    save_animated_png: list[SaveAnimatedPNGNode] = Field(
        default_factory=list,
        description="All SaveAnimatedPNG nodes"
    )
    
    vhs_video_combine: list[VHSVideoCombineNode] = Field(
        default_factory=list,
        description="All VHS_VideoCombine nodes"
    )
    
    # Inpainting nodes
    vae_encode_inpaint: list[VAEEncodeForInpaintNode] = Field(
        default_factory=list,
        description="All VAEEncodeForInpaint nodes"
    )
    
    inpaint_model_conditioning: list[InpaintModelConditioningNode] = Field(
        default_factory=list,
        description="All InpaintModelConditioning nodes"
    )
    
    inpaint: list[InpaintNode] = Field(
        default_factory=list,
        description="All Inpaint nodes"
    )
    
    # Other specialized nodes
    model_sampling_auraflow: list[ModelSamplingAuraFlowNode] = Field(
        default_factory=list,
        description="All ModelSamplingAuraFlow nodes"
    )
    
    cfg_guider: list[CFGGuiderNode] = Field(
        default_factory=list,
        description="All CFGGuider nodes"
    )
    
    raw_workflow: Optional[dict[str, Any]] = Field(
        default=None,
        description="Original workflow JSON for reference",
        exclude=True  # Don't include in JSON serialization by default
    )
    
    class Config:
        """Pydantic config."""
        json_schema_extra = {
            "example": {
                "ksamplers": [
                    {
                        "node_id": "3",
                        "seed": 123456,
                        "steps": 20,
                        "cfg": 7.5
                    }
                ],
                "text_encoders": [
                    {
                        "node_id": "6",
                        "text": "beautiful landscape, highly detailed",
                        "role": "positive"
                    }
                ],
                "empty_latents": [
                    {
                        "node_id": "5",
                        "width": 1024,
                        "height": 1024,
                        "batch_size": 1
                    }
                ]
            }
        }
    
    def get_node_by_id(self, node_id: str) -> Optional[BaseModel]:
        """
        Get any node by its ID, searching across all node types.
        
        Args:
            node_id: The node ID to search for
            
        Returns:
            The node model if found, None otherwise
        """
        all_nodes = (
            self.ksamplers + self.ksamplers_advanced + self.samplers_custom + 
            self.random_noise + self.text_encoders + self.text_encoders_sdxl +
            self.text_encoders_flux + self.text_encoders_qwen + self.prompt_stylers +
            self.show_text + self.string_functions + self.checkpoints + self.loras +
            self.loras_model_only + self.empty_latents + self.empty_sd3_latents +
            self.sd3_empty_latents + self.empty_ltxv_latent_videos + self.flux_guidance +
            self.load_images + self.load_image_masks + self.save_images +
            self.save_images_websocket + self.save_animated_webp + self.save_animated_png +
            self.vhs_video_combine + self.vae_encode_inpaint + self.inpaint_model_conditioning +
            self.inpaint + self.model_sampling_auraflow + self.cfg_guider
        )
        
        for node in all_nodes:
            if node.node_id == node_id:
                return node
        return None
    
    def get_positive_prompts(self) -> list[CLIPTextEncodeNode]:
        """Get all text encoders marked as positive prompts."""
        return [node for node in self.text_encoders if node.role == "positive"]
    
    def get_negative_prompts(self) -> list[CLIPTextEncodeNode]:
        """Get all text encoders marked as negative prompts."""
        return [node for node in self.text_encoders if node.role == "negative"]
    
    def summary(self) -> dict[str, int]:
        """
        Get a count summary of all node types.
        
        Returns:
            Dictionary with counts for each node type
        """
        counts = {
            "ksamplers": len(self.ksamplers),
            "ksamplers_advanced": len(self.ksamplers_advanced),
            "samplers_custom": len(self.samplers_custom),
            "random_noise": len(self.random_noise),
            "text_encoders": len(self.text_encoders),
            "text_encoders_sdxl": len(self.text_encoders_sdxl),
            "text_encoders_flux": len(self.text_encoders_flux),
            "text_encoders_qwen": len(self.text_encoders_qwen),
            "prompt_stylers": len(self.prompt_stylers),
            "show_text": len(self.show_text),
            "string_functions": len(self.string_functions),
            "checkpoints": len(self.checkpoints),
            "loras": len(self.loras),
            "loras_model_only": len(self.loras_model_only),
            "empty_latents": len(self.empty_latents),
            "empty_sd3_latents": len(self.empty_sd3_latents),
            "sd3_empty_latents": len(self.sd3_empty_latents),
            "empty_ltxv_latent_videos": len(self.empty_ltxv_latent_videos),
            "flux_guidance": len(self.flux_guidance),
            "load_images": len(self.load_images),
            "load_image_masks": len(self.load_image_masks),
            "save_images": len(self.save_images),
            "save_images_websocket": len(self.save_images_websocket),
            "save_animated_webp": len(self.save_animated_webp),
            "save_animated_png": len(self.save_animated_png),
            "vhs_video_combine": len(self.vhs_video_combine),
            "vae_encode_inpaint": len(self.vae_encode_inpaint),
            "inpaint_model_conditioning": len(self.inpaint_model_conditioning),
            "inpaint": len(self.inpaint),
            "model_sampling_auraflow": len(self.model_sampling_auraflow),
            "cfg_guider": len(self.cfg_guider),
        }
        counts["total_nodes"] = sum(counts.values())
        return counts
