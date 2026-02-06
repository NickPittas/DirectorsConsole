"""
ComfyUI Workflow Parser - Extract editable parameters from workflow JSON.

This module provides the WorkflowParser class that analyzes ComfyUI API-format
workflow files and extracts all editable parameters into structured models.
"""

from typing import Any, Optional
import logging

try:
    from .models import (
        WorkflowManifest,
        KSamplerNode,
        KSamplerAdvancedNode,
        SamplerCustomNode,
        RandomNoiseNode,
        CLIPTextEncodeNode,
        CLIPTextEncodeSDXLNode,
        CLIPTextEncodeFluxNode,
        TextEncodeQwenNode,
        PromptStylerNode,
        ShowTextNode,
        StringFunctionNode,
        CheckpointLoaderNode,
        LoraLoaderNode,
        LoraLoaderModelOnlyNode,
        EmptyLatentImageNode,
        EmptySD3LatentImageNode,
        SD3EmptyLatentImageNode,
        EmptyLTXVLatentVideoNode,
        FluxGuidanceNode,
        LoadImageNode,
        LoadImageMaskNode,
        SaveImageNode,
        SaveImageWebsocketNode,
        SaveAnimatedWEBPNode,
        SaveAnimatedPNGNode,
        VHSVideoCombineNode,
        VAEEncodeForInpaintNode,
        InpaintModelConditioningNode,
        InpaintNode,
        ModelSamplingAuraFlowNode,
        CFGGuiderNode,
    )
except ImportError:
    from models import (
        WorkflowManifest,
        KSamplerNode,
        KSamplerAdvancedNode,
        SamplerCustomNode,
        RandomNoiseNode,
        CLIPTextEncodeNode,
        CLIPTextEncodeSDXLNode,
        CLIPTextEncodeFluxNode,
        TextEncodeQwenNode,
        PromptStylerNode,
        ShowTextNode,
        StringFunctionNode,
        CheckpointLoaderNode,
        LoraLoaderNode,
        LoraLoaderModelOnlyNode,
        EmptyLatentImageNode,
        EmptySD3LatentImageNode,
        SD3EmptyLatentImageNode,
        EmptyLTXVLatentVideoNode,
        FluxGuidanceNode,
        LoadImageNode,
        LoadImageMaskNode,
        SaveImageNode,
        SaveImageWebsocketNode,
        SaveAnimatedWEBPNode,
        SaveAnimatedPNGNode,
        VHSVideoCombineNode,
        VAEEncodeForInpaintNode,
        InpaintModelConditioningNode,
        InpaintNode,
        ModelSamplingAuraFlowNode,
        CFGGuiderNode,
    )

logger = logging.getLogger(__name__)


class WorkflowParser:
    """
    Parser for ComfyUI workflow files (API format).
    
    This class analyzes ComfyUI workflow JSON structures and extracts
    editable parameters, organizing them into a WorkflowManifest.
    
    The parser handles:
    - Multiple nodes of the same type
    - Node identification by ID and title
    - Inference of prompt roles (positive/negative)
    - Safe extraction with error handling
    - All major ComfyUI node types
    
    Example:
        >>> parser = WorkflowParser(workflow_dict)
        >>> manifest = parser.parse()
        >>> print(f"Found {len(manifest.ksamplers)} KSamplers")
    """
    
    # Node class names as they appear in ComfyUI workflows
    NODE_TYPES = {
        "KSAMPLER": "KSampler",
        "KSAMPLER_ADVANCED": "KSamplerAdvanced",
        "SAMPLER_CUSTOM": "SamplerCustom",
        "RANDOM_NOISE": "RandomNoise",
        "CLIP_TEXT_ENCODE": "CLIPTextEncode",
        "CLIP_TEXT_ENCODE_SDXL": "CLIPTextEncodeSDXL",
        "CLIP_TEXT_ENCODE_FLUX": "CLIPTextEncodeFlux",
        "TEXT_ENCODE_QWEN": "TextEncodeQwen",
        "TEXT_ENCODE_QWEN_IMAGE_EDIT": "TextEncodeQwenImageEdit",
        "TEXT_ENCODE_QWEN_IMAGE_EDIT_PLUS": "TextEncodeQwenImageEditPlus",
        "PROMPT_STYLER": "PromptStyler",
        "SHOW_TEXT": "ShowText",
        "STRING_FUNCTION": "StringFunction",
        "CHECKPOINT_LOADER": "CheckpointLoaderSimple",
        "LORA_LOADER": "LoraLoader",
        "LORA_LOADER_MODEL_ONLY": "LoraLoaderModelOnly",
        "EMPTY_LATENT_IMAGE": "EmptyLatentImage",
        "EMPTY_SD3_LATENT_IMAGE": "EmptySD3LatentImage",
        "SD3_EMPTY_LATENT_IMAGE": "SD3EmptyLatentImage",
        "EMPTY_LTXV_LATENT_VIDEO": "EmptyLTXVLatentVideo",
        "FLUX_GUIDANCE": "FluxGuidance",
        "LOAD_IMAGE": "LoadImage",
        "LOAD_IMAGE_MASK": "LoadImageMask",
        "SAVE_IMAGE": "SaveImage",
        "SAVE_IMAGE_WEBSOCKET": "SaveImageWebsocket",
        "SAVE_ANIMATED_WEBP": "SaveAnimatedWEBP",
        "SAVE_ANIMATED_PNG": "SaveAnimatedPNG",
        "VHS_VIDEO_COMBINE": "VHS_VideoCombine",
        "VAE_ENCODE_INPAINT": "VAEEncodeForInpaint",
        "INPAINT_MODEL_CONDITIONING": "InpaintModelConditioning",
        "INPAINT": "Inpaint",
        "MODEL_SAMPLING_AURAFLOW": "ModelSamplingAuraFlow",
        "CFG_GUIDER": "CFGGuider",
    }
    
    def __init__(self, workflow: dict[str, Any]):
        """
        Initialize the parser with a workflow dictionary.
        
        Args:
            workflow: ComfyUI workflow in API format (dict with node IDs as keys)
        
        Raises:
            ValueError: If workflow is not a valid dictionary
        """
        if not isinstance(workflow, dict):
            raise ValueError(f"Workflow must be a dictionary, got {type(workflow)}")
        
        self.workflow = workflow
        self._node_connections: dict[str, list[str]] = {}
        self._analyze_connections()
    
    def _analyze_connections(self) -> None:
        """
        Analyze node connections to infer relationships (e.g., positive/negative prompts).
        
        Builds a mapping of which nodes feed into which other nodes.
        """
        for node_id, node_data in self.workflow.items():
            if not isinstance(node_data, dict):
                continue
            
            inputs = node_data.get("inputs", {})
            if not isinstance(inputs, dict):
                continue
            
            # Track what this node receives from
            for input_name, input_value in inputs.items():
                # ComfyUI format: [source_node_id, output_slot]
                if isinstance(input_value, list) and len(input_value) >= 1:
                    source_node_id = str(input_value[0])
                    
                    if source_node_id not in self._node_connections:
                        self._node_connections[source_node_id] = []
                    
                    self._node_connections[source_node_id].append(node_id)
    
    def _get_node_title(self, node_id: str, node_data: dict[str, Any]) -> Optional[str]:
        """
        Extract the title/label from a node if present.
        
        Args:
            node_id: The node ID
            node_data: The node data dictionary
            
        Returns:
            The node title if found, None otherwise
        """
        # Check common locations for titles
        title = node_data.get("_meta", {}).get("title")
        if title:
            return str(title)
        
        # Some workflows store title directly
        if "title" in node_data:
            return str(node_data["title"])
        
        return None
    
    def _infer_prompt_role(self, node_id: str, text: str) -> Optional[str]:
        """
        Infer whether a CLIPTextEncode node is positive or negative.
        
        Uses heuristics:
        1. Node title contains "negative", "neg", "bad"
        2. Text content suggests negative prompt
        3. Connection analysis (nodes feeding into negative conditioning)
        
        Args:
            node_id: The node ID
            text: The prompt text
            
        Returns:
            "positive", "negative", or None if uncertain
        """
        node_data = self.workflow.get(node_id, {})
        title = self._get_node_title(node_id, node_data)
        
        # Check title
        if title:
            title_lower = title.lower()
            if any(word in title_lower for word in ["negative", "neg", "bad"]):
                return "negative"
            if any(word in title_lower for word in ["positive", "pos", "main"]):
                return "positive"
        
        # Check text content for common negative keywords
        text_lower = text.lower()
        negative_keywords = [
            "worst quality", "low quality", "blurry", "bad anatomy",
            "ugly", "deformed", "disfigured", "mutation", "mutated",
            "watermark", "text", "signature"
        ]
        
        # Count negative indicators
        negative_count = sum(1 for keyword in negative_keywords if keyword in text_lower)
        
        # If many negative keywords, likely negative prompt
        if negative_count >= 2:
            return "negative"
        
        # Check connections - if this feeds into a KSampler's "negative" input
        for target_node_id in self._node_connections.get(node_id, []):
            target_node = self.workflow.get(target_node_id, {})
            target_class = target_node.get("class_type", "")
            
            if target_class == self.NODE_TYPES["KSAMPLER"]:
                target_inputs = target_node.get("inputs", {})
                
                # Check if our node connects to the negative conditioning
                for input_name, input_value in target_inputs.items():
                    if isinstance(input_value, list) and len(input_value) >= 1:
                        if str(input_value[0]) == node_id and "negative" in input_name.lower():
                            return "negative"
                        if str(input_value[0]) == node_id and "positive" in input_name.lower():
                            return "positive"
        
        # Default to positive if uncertain (most prompts are positive)
        return "positive"
    
    def _parse_ksamplers(self) -> list[KSamplerNode]:
        """
        Extract all KSampler nodes from the workflow.
        
        Returns:
            List of KSamplerNode objects
        """
        ksamplers = []
        
        for node_id, node_data in self.workflow.items():
            if not isinstance(node_data, dict):
                continue
            
            class_type = node_data.get("class_type", "")
            if class_type != self.NODE_TYPES["KSAMPLER"]:
                continue
            
            inputs = node_data.get("inputs", {})
            if not isinstance(inputs, dict):
                logger.warning(f"KSampler node {node_id} has invalid inputs")
                continue
            
            try:
                ksampler = KSamplerNode(
                    node_id=str(node_id),
                    title=self._get_node_title(node_id, node_data),
                    seed=int(inputs.get("seed", 0)),
                    steps=int(inputs.get("steps", 20)),
                    cfg=float(inputs.get("cfg", 7.0)),
                    sampler_name=inputs.get("sampler_name"),
                    scheduler=inputs.get("scheduler"),
                    denoise=float(inputs["denoise"]) if "denoise" in inputs else None,
                )
                ksamplers.append(ksampler)
                logger.debug(f"Parsed KSampler: {node_id} ({ksampler.title or 'untitled'})")
                
            except (ValueError, TypeError, KeyError) as e:
                logger.error(f"Failed to parse KSampler node {node_id}: {e}")
        
        return ksamplers
    
    def _parse_text_encoders(self) -> list[CLIPTextEncodeNode]:
        """
        Extract all CLIPTextEncode nodes from the workflow.
        
        Returns:
            List of CLIPTextEncodeNode objects
        """
        text_encoders = []
        
        for node_id, node_data in self.workflow.items():
            if not isinstance(node_data, dict):
                continue
            
            class_type = node_data.get("class_type", "")
            if class_type != self.NODE_TYPES["CLIP_TEXT_ENCODE"]:
                continue
            
            inputs = node_data.get("inputs", {})
            if not isinstance(inputs, dict):
                logger.warning(f"CLIPTextEncode node {node_id} has invalid inputs")
                continue
            
            text = inputs.get("text", "")
            if not isinstance(text, str):
                logger.warning(f"CLIPTextEncode node {node_id} has non-string text")
                text = str(text)
            
            try:
                role = self._infer_prompt_role(node_id, text)
                
                encoder = CLIPTextEncodeNode(
                    node_id=str(node_id),
                    title=self._get_node_title(node_id, node_data),
                    text=text,
                    role=role,
                )
                text_encoders.append(encoder)
                logger.debug(f"Parsed CLIPTextEncode: {node_id} ({role})")
                
            except (ValueError, TypeError) as e:
                logger.error(f"Failed to parse CLIPTextEncode node {node_id}: {e}")
        
        return text_encoders
    
    def _parse_checkpoints(self) -> list[CheckpointLoaderNode]:
        """
        Extract all CheckpointLoaderSimple nodes from the workflow.
        
        Returns:
            List of CheckpointLoaderNode objects
        """
        checkpoints = []
        
        for node_id, node_data in self.workflow.items():
            if not isinstance(node_data, dict):
                continue
            
            class_type = node_data.get("class_type", "")
            if class_type != self.NODE_TYPES["CHECKPOINT_LOADER"]:
                continue
            
            inputs = node_data.get("inputs", {})
            if not isinstance(inputs, dict):
                logger.warning(f"CheckpointLoader node {node_id} has invalid inputs")
                continue
            
            ckpt_name = inputs.get("ckpt_name", "")
            if not ckpt_name:
                logger.warning(f"CheckpointLoader node {node_id} has no ckpt_name")
                continue
            
            try:
                checkpoint = CheckpointLoaderNode(
                    node_id=str(node_id),
                    title=self._get_node_title(node_id, node_data),
                    ckpt_name=str(ckpt_name),
                )
                checkpoints.append(checkpoint)
                logger.debug(f"Parsed CheckpointLoader: {node_id}")
                
            except (ValueError, TypeError) as e:
                logger.error(f"Failed to parse CheckpointLoader node {node_id}: {e}")
        
        return checkpoints
    
    def _parse_loras(self) -> list[LoraLoaderNode]:
        """
        Extract all LoraLoader nodes from the workflow.
        
        Returns:
            List of LoraLoaderNode objects
        """
        loras = []
        
        for node_id, node_data in self.workflow.items():
            if not isinstance(node_data, dict):
                continue
            
            class_type = node_data.get("class_type", "")
            if class_type != self.NODE_TYPES["LORA_LOADER"]:
                continue
            
            inputs = node_data.get("inputs", {})
            if not isinstance(inputs, dict):
                logger.warning(f"LoraLoader node {node_id} has invalid inputs")
                continue
            
            lora_name = inputs.get("lora_name", "")
            if not lora_name:
                logger.warning(f"LoraLoader node {node_id} has no lora_name")
                continue
            
            try:
                lora = LoraLoaderNode(
                    node_id=str(node_id),
                    title=self._get_node_title(node_id, node_data),
                    lora_name=str(lora_name),
                    strength_model=float(inputs.get("strength_model", 1.0)),
                    strength_clip=float(inputs.get("strength_clip", 1.0)),
                )
                loras.append(lora)
                logger.debug(f"Parsed LoraLoader: {node_id}")
                
            except (ValueError, TypeError, KeyError) as e:
                logger.error(f"Failed to parse LoraLoader node {node_id}: {e}")
        
        return loras
    
    def _parse_ksamplers_advanced(self) -> list[KSamplerAdvancedNode]:
        """Extract all KSamplerAdvanced nodes."""
        nodes = []
        for node_id, node_data in self.workflow.items():
            if not isinstance(node_data, dict):
                continue
            if node_data.get("class_type", "") != self.NODE_TYPES["KSAMPLER_ADVANCED"]:
                continue
            
            inputs = node_data.get("inputs", {})
            if not isinstance(inputs, dict):
                continue
            
            try:
                node = KSamplerAdvancedNode(
                    node_id=str(node_id),
                    title=self._get_node_title(node_id, node_data),
                    seed=int(inputs.get("seed", 0)),
                    steps=int(inputs.get("steps", 20)),
                    cfg=float(inputs.get("cfg", 7.0)),
                    sampler_name=inputs.get("sampler_name"),
                    scheduler=inputs.get("scheduler"),
                    add_noise=inputs.get("add_noise"),
                    start_at_step=int(inputs["start_at_step"]) if "start_at_step" in inputs else None,
                    end_at_step=int(inputs["end_at_step"]) if "end_at_step" in inputs else None,
                    return_with_leftover_noise=inputs.get("return_with_leftover_noise"),
                )
                nodes.append(node)
                logger.debug(f"Parsed KSamplerAdvanced: {node_id}")
            except (ValueError, TypeError, KeyError) as e:
                logger.error(f"Failed to parse KSamplerAdvanced node {node_id}: {e}")
        return nodes
    
    def _parse_samplers_custom(self) -> list[SamplerCustomNode]:
        """Extract all SamplerCustom nodes."""
        nodes = []
        for node_id, node_data in self.workflow.items():
            if not isinstance(node_data, dict):
                continue
            if node_data.get("class_type", "") != self.NODE_TYPES["SAMPLER_CUSTOM"]:
                continue
            
            inputs = node_data.get("inputs", {})
            try:
                node = SamplerCustomNode(
                    node_id=str(node_id),
                    title=self._get_node_title(node_id, node_data),
                    cfg=float(inputs["cfg"]) if isinstance(inputs, dict) and "cfg" in inputs else None,
                )
                nodes.append(node)
                logger.debug(f"Parsed SamplerCustom: {node_id}")
            except (ValueError, TypeError) as e:
                logger.error(f"Failed to parse SamplerCustom node {node_id}: {e}")
        return nodes
    
    def _parse_random_noise(self) -> list[RandomNoiseNode]:
        """Extract all RandomNoise nodes."""
        nodes = []
        for node_id, node_data in self.workflow.items():
            if not isinstance(node_data, dict):
                continue
            if node_data.get("class_type", "") != self.NODE_TYPES["RANDOM_NOISE"]:
                continue
            
            inputs = node_data.get("inputs", {})
            if not isinstance(inputs, dict):
                continue
            
            try:
                node = RandomNoiseNode(
                    node_id=str(node_id),
                    title=self._get_node_title(node_id, node_data),
                    noise_seed=int(inputs.get("noise_seed", 0)),
                )
                nodes.append(node)
                logger.debug(f"Parsed RandomNoise: {node_id}")
            except (ValueError, TypeError) as e:
                logger.error(f"Failed to parse RandomNoise node {node_id}: {e}")
        return nodes
    
    def _parse_text_encoders_sdxl(self) -> list[CLIPTextEncodeSDXLNode]:
        """Extract all CLIPTextEncodeSDXL nodes."""
        nodes = []
        for node_id, node_data in self.workflow.items():
            if not isinstance(node_data, dict):
                continue
            if node_data.get("class_type", "") != self.NODE_TYPES["CLIP_TEXT_ENCODE_SDXL"]:
                continue
            
            inputs = node_data.get("inputs", {})
            if not isinstance(inputs, dict):
                continue
            
            try:
                text_g = str(inputs.get("text_g", ""))
                text_l = str(inputs.get("text_l", ""))
                role = self._infer_prompt_role(node_id, text_g + " " + text_l)
                
                node = CLIPTextEncodeSDXLNode(
                    node_id=str(node_id),
                    title=self._get_node_title(node_id, node_data),
                    text_g=text_g,
                    text_l=text_l,
                    role=role,
                )
                nodes.append(node)
                logger.debug(f"Parsed CLIPTextEncodeSDXL: {node_id} ({role})")
            except (ValueError, TypeError) as e:
                logger.error(f"Failed to parse CLIPTextEncodeSDXL node {node_id}: {e}")
        return nodes
    
    def _parse_text_encoders_flux(self) -> list[CLIPTextEncodeFluxNode]:
        """Extract all CLIPTextEncodeFlux nodes."""
        nodes = []
        for node_id, node_data in self.workflow.items():
            if not isinstance(node_data, dict):
                continue
            if node_data.get("class_type", "") != self.NODE_TYPES["CLIP_TEXT_ENCODE_FLUX"]:
                continue
            
            inputs = node_data.get("inputs", {})
            if not isinstance(inputs, dict):
                continue
            
            try:
                t5xxl = str(inputs.get("t5xxl", ""))
                clip_l = str(inputs.get("clip_l", "")) if "clip_l" in inputs else None
                guidance = float(inputs["guidance"]) if "guidance" in inputs else None
                role = self._infer_prompt_role(node_id, t5xxl)
                
                node = CLIPTextEncodeFluxNode(
                    node_id=str(node_id),
                    title=self._get_node_title(node_id, node_data),
                    t5xxl=t5xxl,
                    clip_l=clip_l,
                    guidance=guidance,
                    role=role,
                )
                nodes.append(node)
                logger.debug(f"Parsed CLIPTextEncodeFlux: {node_id} ({role})")
            except (ValueError, TypeError) as e:
                logger.error(f"Failed to parse CLIPTextEncodeFlux node {node_id}: {e}")
        return nodes
    
    def _parse_text_encoders_qwen(self) -> list[TextEncodeQwenNode]:
        """Extract all TextEncodeQwen* nodes."""
        nodes = []
        qwen_types = [
            self.NODE_TYPES["TEXT_ENCODE_QWEN"],
            self.NODE_TYPES["TEXT_ENCODE_QWEN_IMAGE_EDIT"],
            self.NODE_TYPES["TEXT_ENCODE_QWEN_IMAGE_EDIT_PLUS"]
        ]
        
        for node_id, node_data in self.workflow.items():
            if not isinstance(node_data, dict):
                continue
            
            class_type = node_data.get("class_type", "")
            if class_type not in qwen_types:
                continue
            
            inputs = node_data.get("inputs", {})
            if not isinstance(inputs, dict):
                continue
            
            try:
                text = str(inputs.get("text", ""))
                role = self._infer_prompt_role(node_id, text)
                
                node = TextEncodeQwenNode(
                    node_id=str(node_id),
                    title=self._get_node_title(node_id, node_data),
                    text=text,
                    role=role,
                    node_type=class_type,
                )
                nodes.append(node)
                logger.debug(f"Parsed {class_type}: {node_id} ({role})")
            except (ValueError, TypeError) as e:
                logger.error(f"Failed to parse {class_type} node {node_id}: {e}")
        return nodes
    
    def _parse_prompt_stylers(self) -> list[PromptStylerNode]:
        """Extract all PromptStyler nodes."""
        nodes = []
        for node_id, node_data in self.workflow.items():
            if not isinstance(node_data, dict):
                continue
            if node_data.get("class_type", "") != self.NODE_TYPES["PROMPT_STYLER"]:
                continue
            
            inputs = node_data.get("inputs", {})
            if not isinstance(inputs, dict):
                continue
            
            try:
                node = PromptStylerNode(
                    node_id=str(node_id),
                    title=self._get_node_title(node_id, node_data),
                    text_positive=str(inputs["text_positive"]) if "text_positive" in inputs else None,
                    text_negative=str(inputs["text_negative"]) if "text_negative" in inputs else None,
                )
                nodes.append(node)
                logger.debug(f"Parsed PromptStyler: {node_id}")
            except (ValueError, TypeError) as e:
                logger.error(f"Failed to parse PromptStyler node {node_id}: {e}")
        return nodes
    
    def _parse_show_text(self) -> list[ShowTextNode]:
        """Extract all ShowText nodes."""
        nodes = []
        for node_id, node_data in self.workflow.items():
            if not isinstance(node_data, dict):
                continue
            if node_data.get("class_type", "") != self.NODE_TYPES["SHOW_TEXT"]:
                continue
            
            inputs = node_data.get("inputs", {})
            if not isinstance(inputs, dict):
                continue
            
            try:
                node = ShowTextNode(
                    node_id=str(node_id),
                    title=self._get_node_title(node_id, node_data),
                    text=str(inputs.get("text", "")),
                )
                nodes.append(node)
                logger.debug(f"Parsed ShowText: {node_id}")
            except (ValueError, TypeError) as e:
                logger.error(f"Failed to parse ShowText node {node_id}: {e}")
        return nodes
    
    def _parse_string_functions(self) -> list[StringFunctionNode]:
        """Extract all StringFunction nodes."""
        nodes = []
        for node_id, node_data in self.workflow.items():
            if not isinstance(node_data, dict):
                continue
            if node_data.get("class_type", "") != self.NODE_TYPES["STRING_FUNCTION"]:
                continue
            
            inputs = node_data.get("inputs", {})
            try:
                node = StringFunctionNode(
                    node_id=str(node_id),
                    title=self._get_node_title(node_id, node_data),
                    text=str(inputs["text"]) if isinstance(inputs, dict) and "text" in inputs else None,
                )
                nodes.append(node)
                logger.debug(f"Parsed StringFunction: {node_id}")
            except (ValueError, TypeError) as e:
                logger.error(f"Failed to parse StringFunction node {node_id}: {e}")
        return nodes
    
    def _parse_loras_model_only(self) -> list[LoraLoaderModelOnlyNode]:
        """Extract all LoraLoaderModelOnly nodes."""
        nodes = []
        for node_id, node_data in self.workflow.items():
            if not isinstance(node_data, dict):
                continue
            if node_data.get("class_type", "") != self.NODE_TYPES["LORA_LOADER_MODEL_ONLY"]:
                continue
            
            inputs = node_data.get("inputs", {})
            if not isinstance(inputs, dict):
                continue
            
            lora_name = inputs.get("lora_name", "")
            if not lora_name:
                continue
            
            try:
                node = LoraLoaderModelOnlyNode(
                    node_id=str(node_id),
                    title=self._get_node_title(node_id, node_data),
                    lora_name=str(lora_name),
                    strength_model=float(inputs.get("strength_model", 1.0)),
                )
                nodes.append(node)
                logger.debug(f"Parsed LoraLoaderModelOnly: {node_id}")
            except (ValueError, TypeError, KeyError) as e:
                logger.error(f"Failed to parse LoraLoaderModelOnly node {node_id}: {e}")
        return nodes
    
    def _parse_empty_latents(self) -> list[EmptyLatentImageNode]:
        """Extract all EmptyLatentImage nodes."""
        nodes = []
        for node_id, node_data in self.workflow.items():
            if not isinstance(node_data, dict):
                continue
            if node_data.get("class_type", "") != self.NODE_TYPES["EMPTY_LATENT_IMAGE"]:
                continue
            
            inputs = node_data.get("inputs", {})
            if not isinstance(inputs, dict):
                continue
            
            try:
                node = EmptyLatentImageNode(
                    node_id=str(node_id),
                    title=self._get_node_title(node_id, node_data),
                    width=int(inputs.get("width", 512)),
                    height=int(inputs.get("height", 512)),
                    batch_size=int(inputs.get("batch_size", 1)),
                )
                nodes.append(node)
                logger.debug(f"Parsed EmptyLatentImage: {node_id}")
            except (ValueError, TypeError) as e:
                logger.error(f"Failed to parse EmptyLatentImage node {node_id}: {e}")
        return nodes
    
    def _parse_empty_sd3_latents(self) -> list[EmptySD3LatentImageNode]:
        """Extract all EmptySD3LatentImage nodes."""
        nodes = []
        for node_id, node_data in self.workflow.items():
            if not isinstance(node_data, dict):
                continue
            if node_data.get("class_type", "") != self.NODE_TYPES["EMPTY_SD3_LATENT_IMAGE"]:
                continue
            
            inputs = node_data.get("inputs", {})
            if not isinstance(inputs, dict):
                continue
            
            try:
                node = EmptySD3LatentImageNode(
                    node_id=str(node_id),
                    title=self._get_node_title(node_id, node_data),
                    width=int(inputs.get("width", 1024)),
                    height=int(inputs.get("height", 1024)),
                    batch_size=int(inputs.get("batch_size", 1)),
                )
                nodes.append(node)
                logger.debug(f"Parsed EmptySD3LatentImage: {node_id}")
            except (ValueError, TypeError) as e:
                logger.error(f"Failed to parse EmptySD3LatentImage node {node_id}: {e}")
        return nodes
    
    def _parse_sd3_empty_latents(self) -> list[SD3EmptyLatentImageNode]:
        """Extract all SD3EmptyLatentImage nodes."""
        nodes = []
        for node_id, node_data in self.workflow.items():
            if not isinstance(node_data, dict):
                continue
            if node_data.get("class_type", "") != self.NODE_TYPES["SD3_EMPTY_LATENT_IMAGE"]:
                continue
            
            inputs = node_data.get("inputs", {})
            if not isinstance(inputs, dict):
                continue
            
            try:
                node = SD3EmptyLatentImageNode(
                    node_id=str(node_id),
                    title=self._get_node_title(node_id, node_data),
                    width=int(inputs.get("width", 1024)),
                    height=int(inputs.get("height", 1024)),
                    batch_size=int(inputs.get("batch_size", 1)),
                )
                nodes.append(node)
                logger.debug(f"Parsed SD3EmptyLatentImage: {node_id}")
            except (ValueError, TypeError) as e:
                logger.error(f"Failed to parse SD3EmptyLatentImage node {node_id}: {e}")
        return nodes
    
    def _parse_empty_ltxv_latent_videos(self) -> list[EmptyLTXVLatentVideoNode]:
        """Extract all EmptyLTXVLatentVideo nodes."""
        nodes = []
        for node_id, node_data in self.workflow.items():
            if not isinstance(node_data, dict):
                continue
            if node_data.get("class_type", "") != self.NODE_TYPES["EMPTY_LTXV_LATENT_VIDEO"]:
                continue
            
            inputs = node_data.get("inputs", {})
            if not isinstance(inputs, dict):
                continue
            
            try:
                node = EmptyLTXVLatentVideoNode(
                    node_id=str(node_id),
                    title=self._get_node_title(node_id, node_data),
                    width=int(inputs.get("width", 512)),
                    height=int(inputs.get("height", 512)),
                    length=int(inputs.get("length", 1)),
                    batch_size=int(inputs.get("batch_size", 1)),
                )
                nodes.append(node)
                logger.debug(f"Parsed EmptyLTXVLatentVideo: {node_id}")
            except (ValueError, TypeError) as e:
                logger.error(f"Failed to parse EmptyLTXVLatentVideo node {node_id}: {e}")
        return nodes
    
    def _parse_flux_guidance(self) -> list[FluxGuidanceNode]:
        """Extract all FluxGuidance nodes."""
        nodes = []
        for node_id, node_data in self.workflow.items():
            if not isinstance(node_data, dict):
                continue
            if node_data.get("class_type", "") != self.NODE_TYPES["FLUX_GUIDANCE"]:
                continue
            
            inputs = node_data.get("inputs", {})
            if not isinstance(inputs, dict):
                continue
            
            try:
                node = FluxGuidanceNode(
                    node_id=str(node_id),
                    title=self._get_node_title(node_id, node_data),
                    guidance=float(inputs.get("guidance", 3.5)),
                )
                nodes.append(node)
                logger.debug(f"Parsed FluxGuidance: {node_id}")
            except (ValueError, TypeError) as e:
                logger.error(f"Failed to parse FluxGuidance node {node_id}: {e}")
        return nodes
    
    def _parse_load_images(self) -> list[LoadImageNode]:
        """Extract all LoadImage nodes."""
        nodes = []
        for node_id, node_data in self.workflow.items():
            if not isinstance(node_data, dict):
                continue
            if node_data.get("class_type", "") != self.NODE_TYPES["LOAD_IMAGE"]:
                continue
            
            inputs = node_data.get("inputs", {})
            if not isinstance(inputs, dict):
                continue
            
            try:
                node = LoadImageNode(
                    node_id=str(node_id),
                    title=self._get_node_title(node_id, node_data),
                    image=str(inputs.get("image", "")),
                )
                nodes.append(node)
                logger.debug(f"Parsed LoadImage: {node_id}")
            except (ValueError, TypeError) as e:
                logger.error(f"Failed to parse LoadImage node {node_id}: {e}")
        return nodes
    
    def _parse_load_image_masks(self) -> list[LoadImageMaskNode]:
        """Extract all LoadImageMask nodes."""
        nodes = []
        for node_id, node_data in self.workflow.items():
            if not isinstance(node_data, dict):
                continue
            if node_data.get("class_type", "") != self.NODE_TYPES["LOAD_IMAGE_MASK"]:
                continue
            
            inputs = node_data.get("inputs", {})
            if not isinstance(inputs, dict):
                continue
            
            try:
                node = LoadImageMaskNode(
                    node_id=str(node_id),
                    title=self._get_node_title(node_id, node_data),
                    image=str(inputs.get("image", "")),
                    channel=str(inputs["channel"]) if "channel" in inputs else None,
                )
                nodes.append(node)
                logger.debug(f"Parsed LoadImageMask: {node_id}")
            except (ValueError, TypeError) as e:
                logger.error(f"Failed to parse LoadImageMask node {node_id}: {e}")
        return nodes
    
    def _parse_save_images(self) -> list[SaveImageNode]:
        """Extract all SaveImage nodes."""
        nodes = []
        for node_id, node_data in self.workflow.items():
            if not isinstance(node_data, dict):
                continue
            if node_data.get("class_type", "") != self.NODE_TYPES["SAVE_IMAGE"]:
                continue
            
            inputs = node_data.get("inputs", {})
            if not isinstance(inputs, dict):
                continue
            
            try:
                node = SaveImageNode(
                    node_id=str(node_id),
                    title=self._get_node_title(node_id, node_data),
                    filename_prefix=str(inputs.get("filename_prefix", "ComfyUI")),
                )
                nodes.append(node)
                logger.debug(f"Parsed SaveImage: {node_id}")
            except (ValueError, TypeError) as e:
                logger.error(f"Failed to parse SaveImage node {node_id}: {e}")
        return nodes
    
    def _parse_save_images_websocket(self) -> list[SaveImageWebsocketNode]:
        """Extract all SaveImageWebsocket nodes."""
        nodes = []
        for node_id, node_data in self.workflow.items():
            if not isinstance(node_data, dict):
                continue
            if node_data.get("class_type", "") != self.NODE_TYPES["SAVE_IMAGE_WEBSOCKET"]:
                continue
            
            inputs = node_data.get("inputs", {})
            try:
                node = SaveImageWebsocketNode(
                    node_id=str(node_id),
                    title=self._get_node_title(node_id, node_data),
                    filename_prefix=str(inputs["filename_prefix"]) if isinstance(inputs, dict) and "filename_prefix" in inputs else None,
                )
                nodes.append(node)
                logger.debug(f"Parsed SaveImageWebsocket: {node_id}")
            except (ValueError, TypeError) as e:
                logger.error(f"Failed to parse SaveImageWebsocket node {node_id}: {e}")
        return nodes
    
    def _parse_save_animated_webp(self) -> list[SaveAnimatedWEBPNode]:
        """Extract all SaveAnimatedWEBP nodes."""
        nodes = []
        for node_id, node_data in self.workflow.items():
            if not isinstance(node_data, dict):
                continue
            if node_data.get("class_type", "") != self.NODE_TYPES["SAVE_ANIMATED_WEBP"]:
                continue
            
            inputs = node_data.get("inputs", {})
            if not isinstance(inputs, dict):
                continue
            
            try:
                node = SaveAnimatedWEBPNode(
                    node_id=str(node_id),
                    title=self._get_node_title(node_id, node_data),
                    filename_prefix=str(inputs.get("filename_prefix", "ComfyUI")),
                )
                nodes.append(node)
                logger.debug(f"Parsed SaveAnimatedWEBP: {node_id}")
            except (ValueError, TypeError) as e:
                logger.error(f"Failed to parse SaveAnimatedWEBP node {node_id}: {e}")
        return nodes
    
    def _parse_save_animated_png(self) -> list[SaveAnimatedPNGNode]:
        """Extract all SaveAnimatedPNG nodes."""
        nodes = []
        for node_id, node_data in self.workflow.items():
            if not isinstance(node_data, dict):
                continue
            if node_data.get("class_type", "") != self.NODE_TYPES["SAVE_ANIMATED_PNG"]:
                continue
            
            inputs = node_data.get("inputs", {})
            if not isinstance(inputs, dict):
                continue
            
            try:
                node = SaveAnimatedPNGNode(
                    node_id=str(node_id),
                    title=self._get_node_title(node_id, node_data),
                    filename_prefix=str(inputs.get("filename_prefix", "ComfyUI")),
                )
                nodes.append(node)
                logger.debug(f"Parsed SaveAnimatedPNG: {node_id}")
            except (ValueError, TypeError) as e:
                logger.error(f"Failed to parse SaveAnimatedPNG node {node_id}: {e}")
        return nodes
    
    def _parse_vhs_video_combine(self) -> list[VHSVideoCombineNode]:
        """Extract all VHS_VideoCombine nodes."""
        nodes = []
        for node_id, node_data in self.workflow.items():
            if not isinstance(node_data, dict):
                continue
            if node_data.get("class_type", "") != self.NODE_TYPES["VHS_VIDEO_COMBINE"]:
                continue
            
            inputs = node_data.get("inputs", {})
            if not isinstance(inputs, dict):
                continue
            
            try:
                node = VHSVideoCombineNode(
                    node_id=str(node_id),
                    title=self._get_node_title(node_id, node_data),
                    filename_prefix=str(inputs.get("filename_prefix", "ComfyUI")),
                )
                nodes.append(node)
                logger.debug(f"Parsed VHS_VideoCombine: {node_id}")
            except (ValueError, TypeError) as e:
                logger.error(f"Failed to parse VHS_VideoCombine node {node_id}: {e}")
        return nodes
    
    def _parse_vae_encode_inpaint(self) -> list[VAEEncodeForInpaintNode]:
        """Extract all VAEEncodeForInpaint nodes."""
        nodes = []
        for node_id, node_data in self.workflow.items():
            if not isinstance(node_data, dict):
                continue
            if node_data.get("class_type", "") != self.NODE_TYPES["VAE_ENCODE_INPAINT"]:
                continue
            
            inputs = node_data.get("inputs", {})
            try:
                node = VAEEncodeForInpaintNode(
                    node_id=str(node_id),
                    title=self._get_node_title(node_id, node_data),
                    grow_mask_by=int(inputs["grow_mask_by"]) if isinstance(inputs, dict) and "grow_mask_by" in inputs else None,
                )
                nodes.append(node)
                logger.debug(f"Parsed VAEEncodeForInpaint: {node_id}")
            except (ValueError, TypeError) as e:
                logger.error(f"Failed to parse VAEEncodeForInpaint node {node_id}: {e}")
        return nodes
    
    def _parse_inpaint_model_conditioning(self) -> list[InpaintModelConditioningNode]:
        """Extract all InpaintModelConditioning nodes."""
        nodes = []
        for node_id, node_data in self.workflow.items():
            if not isinstance(node_data, dict):
                continue
            if node_data.get("class_type", "") != self.NODE_TYPES["INPAINT_MODEL_CONDITIONING"]:
                continue
            
            try:
                node = InpaintModelConditioningNode(
                    node_id=str(node_id),
                    title=self._get_node_title(node_id, node_data),
                )
                nodes.append(node)
                logger.debug(f"Parsed InpaintModelConditioning: {node_id}")
            except (ValueError, TypeError) as e:
                logger.error(f"Failed to parse InpaintModelConditioning node {node_id}: {e}")
        return nodes
    
    def _parse_inpaint(self) -> list[InpaintNode]:
        """Extract all Inpaint nodes."""
        nodes = []
        for node_id, node_data in self.workflow.items():
            if not isinstance(node_data, dict):
                continue
            if node_data.get("class_type", "") != self.NODE_TYPES["INPAINT"]:
                continue
            
            try:
                node = InpaintNode(
                    node_id=str(node_id),
                    title=self._get_node_title(node_id, node_data),
                )
                nodes.append(node)
                logger.debug(f"Parsed Inpaint: {node_id}")
            except (ValueError, TypeError) as e:
                logger.error(f"Failed to parse Inpaint node {node_id}: {e}")
        return nodes
    
    def _parse_model_sampling_auraflow(self) -> list[ModelSamplingAuraFlowNode]:
        """Extract all ModelSamplingAuraFlow nodes."""
        nodes = []
        for node_id, node_data in self.workflow.items():
            if not isinstance(node_data, dict):
                continue
            if node_data.get("class_type", "") != self.NODE_TYPES["MODEL_SAMPLING_AURAFLOW"]:
                continue
            
            inputs = node_data.get("inputs", {})
            if not isinstance(inputs, dict):
                continue
            
            try:
                node = ModelSamplingAuraFlowNode(
                    node_id=str(node_id),
                    title=self._get_node_title(node_id, node_data),
                    shift=float(inputs.get("shift", 1.0)),
                )
                nodes.append(node)
                logger.debug(f"Parsed ModelSamplingAuraFlow: {node_id}")
            except (ValueError, TypeError) as e:
                logger.error(f"Failed to parse ModelSamplingAuraFlow node {node_id}: {e}")
        return nodes
    
    def _parse_cfg_guider(self) -> list[CFGGuiderNode]:
        """Extract all CFGGuider nodes."""
        nodes = []
        for node_id, node_data in self.workflow.items():
            if not isinstance(node_data, dict):
                continue
            if node_data.get("class_type", "") != self.NODE_TYPES["CFG_GUIDER"]:
                continue
            
            inputs = node_data.get("inputs", {})
            if not isinstance(inputs, dict):
                continue
            
            try:
                node = CFGGuiderNode(
                    node_id=str(node_id),
                    title=self._get_node_title(node_id, node_data),
                    cfg=float(inputs.get("cfg", 7.0)),
                )
                nodes.append(node)
                logger.debug(f"Parsed CFGGuider: {node_id}")
            except (ValueError, TypeError) as e:
                logger.error(f"Failed to parse CFGGuider node {node_id}: {e}")
        return nodes
    
    def parse(self, include_raw_workflow: bool = False) -> WorkflowManifest:
        """
        Parse the workflow and extract all editable parameters.
        
        Args:
            include_raw_workflow: Whether to include the raw workflow in the manifest
        
        Returns:
            WorkflowManifest containing all extracted parameters
        
        Example:
            >>> parser = WorkflowParser(workflow_dict)
            >>> manifest = parser.parse()
            >>> for ksampler in manifest.ksamplers:
            ...     print(f"KSampler {ksampler.node_id}: {ksampler.steps} steps")
        """
        logger.info(f"Parsing workflow with {len(self.workflow)} nodes")
        
        # Parse all node types
        manifest = WorkflowManifest(
            # Sampler nodes
            ksamplers=self._parse_ksamplers(),
            ksamplers_advanced=self._parse_ksamplers_advanced(),
            samplers_custom=self._parse_samplers_custom(),
            random_noise=self._parse_random_noise(),
            
            # Text encoding nodes
            text_encoders=self._parse_text_encoders(),
            text_encoders_sdxl=self._parse_text_encoders_sdxl(),
            text_encoders_flux=self._parse_text_encoders_flux(),
            text_encoders_qwen=self._parse_text_encoders_qwen(),
            prompt_stylers=self._parse_prompt_stylers(),
            show_text=self._parse_show_text(),
            string_functions=self._parse_string_functions(),
            
            # Model loading nodes
            checkpoints=self._parse_checkpoints(),
            loras=self._parse_loras(),
            loras_model_only=self._parse_loras_model_only(),
            
            # Latent/resolution nodes
            empty_latents=self._parse_empty_latents(),
            empty_sd3_latents=self._parse_empty_sd3_latents(),
            sd3_empty_latents=self._parse_sd3_empty_latents(),
            empty_ltxv_latent_videos=self._parse_empty_ltxv_latent_videos(),
            
            # Flux-specific nodes
            flux_guidance=self._parse_flux_guidance(),
            
            # Image input nodes
            load_images=self._parse_load_images(),
            load_image_masks=self._parse_load_image_masks(),
            
            # Save nodes
            save_images=self._parse_save_images(),
            save_images_websocket=self._parse_save_images_websocket(),
            save_animated_webp=self._parse_save_animated_webp(),
            save_animated_png=self._parse_save_animated_png(),
            vhs_video_combine=self._parse_vhs_video_combine(),
            
            # Inpainting nodes
            vae_encode_inpaint=self._parse_vae_encode_inpaint(),
            inpaint_model_conditioning=self._parse_inpaint_model_conditioning(),
            inpaint=self._parse_inpaint(),
            
            # Other specialized nodes
            model_sampling_auraflow=self._parse_model_sampling_auraflow(),
            cfg_guider=self._parse_cfg_guider(),
            
            raw_workflow=self.workflow if include_raw_workflow else None,
        )
        
        summary = manifest.summary()
        logger.info(f"Parsing complete: {summary}")
        
        return manifest
    
    @classmethod
    def from_file(cls, filepath: str) -> "WorkflowParser":
        """
        Create a parser from a workflow JSON file.
        
        Args:
            filepath: Path to the workflow JSON file
        
        Returns:
            WorkflowParser instance
        
        Raises:
            FileNotFoundError: If file doesn't exist
            ValueError: If file contains invalid JSON
        """
        import json
        
        with open(filepath, 'r', encoding='utf-8') as f:
            workflow = json.load(f)
        
        return cls(workflow)
