"""Workflow builder for Storyboard Maker.

Constructs ComfyUI workflows from templates and user settings.
"""

import copy
import logging
from pathlib import Path
from typing import Any

from ..models import Template, Parameter, LoraSlot, ImageInput

logger = logging.getLogger(__name__)


class WorkflowBuildError(Exception):
    """Raised when workflow construction fails."""
    pass


class WorkflowBuilder:
    """Builds ComfyUI workflows from templates.

    Takes a template and applies parameters, LoRAs, prompts,
    and seeds to construct a complete workflow for submission.

    Attributes:
        template: The template to build from.
    """

    def __init__(self, template: Template) -> None:
        """Initialize the workflow builder.

        Args:
            template: The template to build from.
        """
        self.template = template

    def build(
        self,
        parameter_values: dict[str, Any] | None = None,
        lora_settings: dict[str, dict[str, Any]] | None = None,
        prompt_values: dict[str, str] | None = None,
        image_paths: dict[str, Path] | None = None,
        filename_prefix: str | None = None,
    ) -> dict[str, Any]:
        """Build a complete workflow for submission.

        Args:
            parameter_values: Dictionary of parameter name to value (including seed).
            lora_settings: Dictionary of LoRA name to settings.
            prompt_values: Dictionary of prompt input name to text.
            image_paths: Dictionary of input name to image file path.
            filename_prefix: Custom filename prefix for SaveImage nodes.

        Returns:
            Complete workflow dictionary for ComfyUI.

        Raises:
            WorkflowBuildError: If construction fails.
        """
        # Deep copy the template workflow
        workflow = copy.deepcopy(self.template.workflow)

        # DEBUG: Log incoming values
        logger.info(f"WorkflowBuilder.build() called with:")
        logger.info(f"  parameter_values: {parameter_values}")
        logger.info(f"  prompt_values: {prompt_values}")
        logger.info(f"  lora_settings: {lora_settings}")

        # Apply parameters (including seed)
        if parameter_values:
            self._apply_parameters(workflow, parameter_values)

        # Apply LoRAs
        if lora_settings:
            self._apply_loras(workflow, lora_settings)

        # Apply prompts
        if prompt_values:
            self._apply_prompts(workflow, prompt_values)

        # Handle image inputs
        if image_paths:
            self._apply_image_inputs(workflow, image_paths)

        # Apply custom filename prefix to SaveImage nodes
        if filename_prefix:
            self._apply_filename_prefix(workflow, filename_prefix)

        # DEBUG: Log final workflow values for KSampler and prompt nodes
        for node_id, node in workflow.items():
            if node_id == "meta" or not isinstance(node, dict):
                continue
            inputs = node.get("inputs", {})
            class_type = node.get("class_type", "")
            if class_type == "KSampler":
                logger.info(f"Final KSampler node {node_id}: seed={inputs.get('seed')}, steps={inputs.get('steps')}, cfg={inputs.get('cfg')}")
            if class_type == "CLIPTextEncode":
                text = inputs.get("text", "")
                logger.info(f"Final CLIPTextEncode node {node_id}: text={text[:100] if text else 'empty'}...")

        # DEBUG: Save final workflow to file
        import json
        import tempfile
        debug_file = Path(tempfile.gettempdir()) / "workflow_builder_output.json"
        with open(debug_file, "w") as f:
            json.dump(workflow, f, indent=2, default=str)
        logger.info(f"DEBUG: Saved built workflow to {debug_file}")

        return workflow

    def _apply_parameters(
        self,
        workflow: dict[str, Any],
        parameter_values: dict[str, Any],
    ) -> None:
        """Apply parameter values to the workflow.

        Args:
            workflow: Workflow dictionary (modified in place).
            parameter_values: Parameter name to value mapping.
        """
        # ComfyUI workflows use integer node IDs as keys
        # Filter out non-node keys like "meta"
        nodes = {k: v for k, v in workflow.items() 
                 if k != "meta" and isinstance(v, dict) and "inputs" in v}

        for param in self.template.parameters:
            if param.name in parameter_values:
                value = parameter_values[param.name]
                node_id = param.node_id
                input_name = param.input_name

                if node_id in nodes:
                    old_value = nodes[node_id]["inputs"].get(input_name)
                    nodes[node_id]["inputs"][input_name] = value
                    logger.info(f"Applied param '{param.name}': node={node_id}, input={input_name}, old={old_value}, new={value}")
                else:
                    logger.warning(
                        f"Node {node_id} not found in workflow for param '{param.name}'"
                    )

    def _apply_loras(
        self,
        workflow: dict[str, Any],
        lora_settings: dict[str, dict[str, Any]],
    ) -> None:
        """Apply LoRA settings to the workflow.

        Args:
            workflow: Workflow dictionary (modified in place).
            lora_settings: LoRA name to settings mapping.
        """
        # ComfyUI workflows use integer node IDs as keys
        nodes = {k: v for k, v in workflow.items() 
                 if k != "meta" and isinstance(v, dict) and "inputs" in v}

        for lora in self.template.loras:
            if lora.name in lora_settings:
                settings = lora_settings[lora.name]

                if not settings.get("enabled", False):
                    # Disable LoRA by setting strengths to 0
                    self._disable_lora(nodes, lora)
                else:
                    # Apply LoRA with specified settings
                    # Use the stored lora_name from the template for embedded Loras
                    filename = settings.get("filename", lora.lora_name)
                    self._apply_lora_to_node(
                        nodes,
                        lora,
                        filename,
                        settings.get("strength", lora.default_strength),
                    )

    def _disable_lora(
        self,
        nodes: dict[str, Any],
        lora: LoraSlot,
    ) -> None:
        """Disable a LoRA by setting strengths to zero.

        Args:
            nodes: Workflow nodes dictionary.
            lora: LoRA slot definition.
        """
        node_id = lora.node_id
        if node_id in nodes:
            nodes[node_id]["inputs"][lora.model_strength_input] = 0.0
            nodes[node_id]["inputs"][lora.clip_strength_input] = 0.0

    def _apply_lora_to_node(
        self,
        nodes: dict[str, Any],
        lora: LoraSlot,
        filename: str,
        strength: float,
    ) -> None:
        """Apply a LoRA to a specific node.

        Args:
            nodes: Workflow nodes dictionary.
            lora: LoRA slot definition.
            filename: LoRA filename to apply. If empty, lora_name is not modified.
            strength: Strength value to set.
        """
        node_id = lora.node_id
        if node_id in nodes:
            # Only update lora_name if filename is provided (non-embedded Loras)
            if filename:
                nodes[node_id]["inputs"]["lora_name"] = filename
            # Always update strengths
            nodes[node_id]["inputs"][lora.model_strength_input] = strength
            nodes[node_id]["inputs"][lora.clip_strength_input] = strength

    def _apply_prompts(
        self,
        workflow: dict[str, Any],
        prompt_values: dict[str, str],
    ) -> None:
        """Apply prompt text values to the workflow.

        Args:
            workflow: Workflow dictionary (modified in place).
            prompt_values: Prompt input name to text mapping.
        """
        logger.info(f"_apply_prompts called with prompt_values: {prompt_values}")
        
        # ComfyUI workflows use string node IDs as keys directly (not nested under "nodes")
        nodes = {k: v for k, v in workflow.items()
                 if k != "meta" and isinstance(v, dict) and "inputs" in v}

        logger.info(f"_apply_prompts: Available nodes: {list(nodes.keys())}")

        for param in self.template.parameters:
            if param.type == "prompt" and param.name in prompt_values:
                node_id = param.node_id
                input_name = param.input_name
                new_value = prompt_values[param.name]

                logger.info(f"_apply_prompts: Processing param '{param.name}' -> node={node_id}, input={input_name}")

                if node_id in nodes:
                    old_value = nodes[node_id]["inputs"].get(input_name, "NOT_SET")
                    nodes[node_id]["inputs"][input_name] = new_value
                    logger.info(f"_apply_prompts: Set node {node_id} input '{input_name}':")
                    logger.info(f"  OLD: {old_value[:80] if isinstance(old_value, str) else old_value}...")
                    logger.info(f"  NEW: {new_value[:80] if isinstance(new_value, str) else new_value}...")
                else:
                    logger.warning(
                        f"Node {node_id} not found in workflow for prompt {param.name}"
                    )

    def _apply_seed(self, workflow: dict[str, Any], seed: int) -> None:
        """Apply seed value to the workflow.

        Args:
            workflow: Workflow dictionary (modified in place).
            seed: Seed value (-1 for random).
        """
        # ComfyUI workflows use string node IDs as keys directly (not nested under "nodes")
        nodes = {k: v for k, v in workflow.items()
                 if k != "meta" and isinstance(v, dict) and "inputs" in v}

        # Find seed parameters and update them
        for param in self.template.parameters:
            if param.type == "seed":
                node_id = param.node_id
                input_name = param.input_name

                if node_id in nodes:
                    nodes[node_id]["inputs"][input_name] = seed
                else:
                    logger.warning(
                        f"Node {node_id} not found in workflow for seed"
                    )

    def _apply_image_inputs(
        self,
        workflow: dict[str, Any],
        image_paths: dict[str, Path],
    ) -> None:
        """Apply image input paths to the workflow.

        Note: This method sets the image filename. The images must be 
        uploaded to ComfyUI first using ComfyUIClient.upload_image().
        The caller should upload images and pass the returned filenames
        as values in image_paths.
        
        Masks are embedded in the image alpha channel before upload,
        so LoadImage nodes will output both IMAGE and MASK automatically.

        Args:
            workflow: Workflow dictionary (modified in place).
            image_paths: Input name to file path or uploaded filename mapping.
        """
        # ComfyUI workflows use string node IDs as keys directly (not nested under "nodes")
        nodes = {k: v for k, v in workflow.items()
                 if k != "meta" and isinstance(v, dict) and "inputs" in v}
        
        logger.info(f"DEBUG _apply_image_inputs: Available node IDs in workflow: {list(nodes.keys())}")
        logger.info(f"DEBUG _apply_image_inputs: image_paths received: {image_paths}")
        logger.info(f"DEBUG _apply_image_inputs: Template inputs: {[(i.name, i.node_id) for i in self.template.inputs]}")

        # Apply template-defined image inputs
        for inp in self.template.inputs:
            logger.info(f"DEBUG: Checking input '{inp.name}' (node_id={inp.node_id}) - in image_paths: {inp.name in image_paths}")
            if inp.name in image_paths:
                node_id = inp.node_id
                input_name = inp.input_name
                
                logger.info(f"DEBUG: Looking for node_id '{node_id}' (type={type(node_id)}) in nodes keys: {list(nodes.keys())[:5]}...")

                if node_id in nodes:
                    image_value = image_paths[inp.name]
                    # If it's a Path, convert to string (just the filename)
                    # The image should already be uploaded to ComfyUI
                    if isinstance(image_value, Path):
                        # Use just the filename - the image must already be in ComfyUI's input folder
                        filename = image_value.name
                        logger.warning(
                            f"Image path '{image_value}' used directly. "
                            f"Images should be uploaded to ComfyUI first. Using filename: {filename}"
                        )
                        nodes[node_id]["inputs"][input_name] = filename
                    else:
                        # Already a string (uploaded filename)
                        nodes[node_id]["inputs"][input_name] = str(image_value)
                    
                    logger.info(f"Set image input for node {node_id}.{input_name} = {nodes[node_id]['inputs'][input_name]}")
                else:
                    logger.warning(
                        f"Node {node_id} not found in workflow for image input {inp.name}"
                    )

    def _apply_filename_prefix(
        self,
        workflow: dict[str, Any],
        filename_prefix: str,
    ) -> None:
        """Apply custom filename prefix to SaveImage nodes.

        Args:
            workflow: Workflow dictionary (modified in place).
            filename_prefix: Custom filename prefix for output images.
        """
        # Find all SaveImage nodes and update their filename_prefix
        for node_id, node in workflow.items():
            if node_id == "meta" or not isinstance(node, dict):
                continue
            
            class_type = node.get("class_type", "")
            # Handle various save image node types
            if class_type in ("SaveImage", "SaveImageWebsocket", "SaveAnimatedWEBP", 
                              "SaveAnimatedPNG", "VHS_VideoCombine"):
                inputs = node.get("inputs", {})
                if "filename_prefix" in inputs:
                    old_prefix = inputs["filename_prefix"]
                    inputs["filename_prefix"] = filename_prefix
                    logger.info(f"Updated SaveImage node {node_id}: filename_prefix '{old_prefix}' -> '{filename_prefix}'")

    def build_with_overrides(
        self,
        base_values: dict[str, Any],
        **overrides: Any,
    ) -> dict[str, Any]:
        """Build workflow with some values overridden.

        Args:
            base_values: Base dictionary of values.
            **overrides: Specific values to override.

        Returns:
            Complete workflow dictionary.
        """
        merged = copy.deepcopy(base_values)
        merged.update(overrides)
        return self.build(parameter_values=merged)

    def get_required_inputs(self) -> list[ImageInput]:
        """Get list of required image inputs.

        Returns:
            List of required ImageInput definitions.
        """
        return [inp for inp in self.template.inputs if inp.required]

    def get_optional_inputs(self) -> list[ImageInput]:
        """Get list of optional image inputs.

        Returns:
            List of optional ImageInput definitions.
        """
        return [inp for inp in self.template.inputs if not inp.required]

    def validate_workflow(self, workflow: dict[str, Any]) -> bool:
        """Validate that a workflow has all required nodes and connections.

        Args:
            workflow: Workflow dictionary to validate.

        Returns:
            True if valid, False otherwise.
        """
        # Check that template nodes exist
        template_node_ids = {
            param.node_id for param in self.template.parameters
        }
        template_node_ids.update(lora.node_id for lora in self.template.loras)
        template_node_ids.update(inp.node_id for inp in self.template.inputs)

        workflow_nodes = workflow.get("nodes", {})

        for node_id in template_node_ids:
            if node_id not in workflow_nodes:
                logger.error(f"Missing required node: {node_id}")
                return False

        return True
