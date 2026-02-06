"""Template data model for Storyboard Maker.

Defines the structure for workflow templates loaded from JSON files.
"""

from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Any, Optional

from .image_input import ImageInput
from .lora import LoraSlot

if TYPE_CHECKING:
    from .parameter import Parameter
from .parameter import Parameter


@dataclass
class TemplateMeta:
    """Template metadata section.

    Attributes:
        name: Human-readable template name.
        version: Template version string (e.g., "1.0.0").
        author: Template author name.
        description: Brief description of the template.
        engine: Generation engine identifier (e.g., "qwen", "z_image", "flux", "sd").
        categories: List of template categories (e.g., ["generation", "img2img"]).
        supports_angles: Whether template supports camera angle tokens.
        supports_next_scene: Whether template supports narrative continuity.
        requires_images: Whether template requires reference images.
    """
    name: str
    version: str = "1.0.0"
    author: str = ""
    description: str = ""
    engine: str = "other"
    categories: list[str] = field(default_factory=lambda: ["generation"])
    supports_angles: bool = False
    supports_next_scene: bool = False
    requires_images: bool = False

    @property
    def category(self) -> str:
        """Get the primary category (first in list)."""
        return self.categories[0] if self.categories else "generation"

    @category.setter
    def category(self, value: str) -> None:
        """Set the primary category (adds to list if not present)."""
        if value not in self.categories:
            self.categories.append(value)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "TemplateMeta":
        """Create TemplateMeta from dictionary.

        Args:
            data: Dictionary containing meta fields.

        Returns:
            TemplateMeta instance.
        """
        # Handle both old format (single category) and new format (categories list)
        categories_data = data.get("categories", [])
        if isinstance(categories_data, str):
            categories_data = [categories_data]
        elif not categories_data:
            # Fall back to old single category field
            categories_data = [data.get("category", "generation")]

        return cls(
            name=data.get("name", "Untitled"),
            version=data.get("version", "1.0.0"),
            author=data.get("author", ""),
            description=data.get("description", ""),
            engine=data.get("engine", "other"),
            categories=categories_data,
            supports_angles=data.get("supports_angles", False),
            supports_next_scene=data.get("supports_next_scene", False),
            requires_images=data.get("requires_images", False),
        )

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary.

        Returns:
            Dictionary representation.
        """
        return {
            "name": self.name,
            "version": self.version,
            "author": self.author,
            "description": self.description,
            "engine": self.engine,
            "categories": self.categories,
            "supports_angles": self.supports_angles,
            "supports_next_scene": self.supports_next_scene,
            "requires_images": self.requires_images,
        }


@dataclass
class Template:
    """Workflow template data model.

    A template contains metadata and a ComfyUI workflow definition
    that can be used to generate storyboard panels.

    Attributes:
        meta: Template metadata.
        parameters: List of adjustable parameters.
        loras: List of LoRA slot definitions.
        inputs: List of image input configurations.
        workflow: ComfyUI workflow dictionary.
        path: Path to the template file (set by loader).
    """
    meta: TemplateMeta
    parameters: list[Parameter] = field(default_factory=list)
    loras: list[LoraSlot] = field(default_factory=list)
    inputs: list[ImageInput] = field(default_factory=list)
    workflow: dict[str, Any] = field(default_factory=dict)
    path: Optional[Path] = None

    @property
    def name(self) -> str:
        """Get the template name.

        Returns:
            Template name from metadata.
        """
        return self.meta.name

    @property
    def engine(self) -> str:
        """Get the template engine.

        Returns:
            Engine identifier from metadata.
        """
        return self.meta.engine

    @property
    def category(self) -> str:
        """Get the template's primary category.

        Returns:
            Primary category from metadata.
        """
        return self.meta.category

    @category.setter
    def category(self, value: str) -> None:
        """Set the template's primary category.

        Args:
            value: Category to set.
        """
        self.meta.category = value

    @property
    def categories(self) -> list[str]:
        """Get all template categories.

        Returns:
            List of categories from metadata.
        """
        return self.meta.categories

    @categories.setter
    def categories(self, value: list[str]) -> None:
        """Set all template categories.

        Args:
            value: List of categories.
        """
        self.meta.categories = value

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Template":
        """Create Template from dictionary.

        Args:
            data: Dictionary containing template data.

        Returns:
            Template instance.

        Raises:
            ValueError: If required fields are missing.
        """
        if "meta" not in data:
            raise ValueError("Template missing required 'meta' section")

        meta = TemplateMeta.from_dict(data["meta"])

        parameters = [
            Parameter.from_dict(p) for p in data.get("parameters", [])
        ]

        workflow = data.get("workflow", {})

        # Auto-extract width/height from workflow if not present
        existing_param_names = {p.name for p in parameters}
        if "width" not in existing_param_names or "height" not in existing_param_names:
            extracted_params = cls._extract_parameters_from_workflow(workflow)
            for param in extracted_params:
                if param.name not in existing_param_names:
                    parameters.append(param)

        # Load loras and extract lora_name from workflow if not present
        loras = []
        for lora_dict in data.get("loras", []):
            lora = LoraSlot.from_dict(lora_dict)
            # If lora_name is not set, look it up from the workflow
            if not lora.lora_name and lora.node_id:
                node = workflow.get(lora.node_id)
                if node and isinstance(node, dict):
                    inputs = node.get("inputs", {})
                    lora_name = inputs.get("lora_name", "")
                    if lora_name:
                        # Create a new LoraSlot with the lora_name
                        lora = LoraSlot(
                            name=lora.name,
                            display_name=lora.display_name,
                            node_id=lora.node_id,
                            strength_inputs=lora.strength_inputs,
                            compatible_patterns=lora.compatible_patterns,
                            default_enabled=lora.default_enabled,
                            default_strength=lora.default_strength,
                            required=lora.required,
                            lora_name=lora_name,
                        )
            loras.append(lora)

        inputs = [ImageInput.from_dict(i) for i in data.get("inputs", [])]

        return cls(
            meta=meta,
            parameters=parameters,
            loras=loras,
            inputs=inputs,
            workflow=workflow,
        )

    @staticmethod
    def _extract_parameters_from_workflow(workflow: dict[str, Any]) -> list["Parameter"]:
        """Extract parameters from workflow nodes.

        Automatically detects common ComfyUI node types and extracts their
        configurable parameters. This provides sensible defaults for templates
        that don't have explicit parameter definitions.

        Args:
            workflow: ComfyUI workflow dictionary.

        Returns:
            List of extracted Parameter objects.
        """
        from .parameter import Parameter, ParameterConstraints

        parameters: list[Parameter] = []
        found_params: set[str] = set()  # Track parameter names to avoid duplicates

        # Node type -> extraction configuration
        # Maps class_type to a list of (input_name, param_name, param_type, constraints, description)
        latent_nodes = {
            "EmptyLatentImage": {"width": 512, "height": 512},
            "EmptySD3LatentImage": {"width": 1024, "height": 1024},
            "SD3EmptyLatentImage": {"width": 1024, "height": 1024},
            "EmptyLTXVLatentVideo": {"width": 768, "height": 512, "length": 97},
        }

        for node_id, node in workflow.items():
            if node_id == "meta" or not isinstance(node, dict):
                continue

            class_type = node.get("class_type", "")
            inputs = node.get("inputs", {})
            meta = node.get("_meta", {})
            node_title = meta.get("title", "").lower()

            # Extract from latent image nodes (width, height)
            if class_type in latent_nodes:
                defaults = latent_nodes[class_type]
                if "width" not in found_params and "width" in inputs:
                    parameters.append(Parameter(
                        name="width",
                        display_name="Width",
                        type="integer",
                        node_id=node_id,
                        input_name="width",
                        default=inputs.get("width", defaults.get("width", 512)),
                        constraints=ParameterConstraints.from_dict({"min": 256, "max": 4096, "step": 64}),
                        description="Output image width"
                    ))
                    found_params.add("width")

                if "height" not in found_params and "height" in inputs:
                    parameters.append(Parameter(
                        name="height",
                        display_name="Height",
                        type="integer",
                        node_id=node_id,
                        input_name="height",
                        default=inputs.get("height", defaults.get("height", 512)),
                        constraints=ParameterConstraints.from_dict({"min": 256, "max": 4096, "step": 64}),
                        description="Output image height"
                    ))
                    found_params.add("height")

                if "length" not in found_params and "length" in inputs:
                    parameters.append(Parameter(
                        name="frame_count",
                        display_name="Frame Count",
                        type="integer",
                        node_id=node_id,
                        input_name="length",
                        default=inputs.get("length", defaults.get("length", 97)),
                        constraints=ParameterConstraints.from_dict({"min": 9, "max": 257, "step": 8}),
                        description="Number of video frames"
                    ))
                    found_params.add("length")

                if "batch_size" not in found_params and "batch_size" in inputs:
                    parameters.append(Parameter(
                        name="batch_size",
                        display_name="Batch Size",
                        type="integer",
                        node_id=node_id,
                        input_name="batch_size",
                        default=inputs.get("batch_size", 1),
                        constraints=ParameterConstraints.from_dict({"min": 1, "max": 16, "step": 1}),
                        description="Number of images to generate"
                    ))
                    found_params.add("batch_size")

            # Extract from KSampler nodes
            if class_type == "KSampler":
                if "seed" not in found_params and "seed" in inputs:
                    parameters.append(Parameter(
                        name="seed",
                        display_name="Seed",
                        type="seed",
                        node_id=node_id,
                        input_name="seed",
                        default=inputs.get("seed", -1),
                        description="Random seed (-1 for random)"
                    ))
                    found_params.add("seed")

                if "steps" not in found_params and "steps" in inputs:
                    parameters.append(Parameter(
                        name="steps",
                        display_name="Steps",
                        type="integer",
                        node_id=node_id,
                        input_name="steps",
                        default=inputs.get("steps", 20),
                        constraints=ParameterConstraints.from_dict({"min": 1, "max": 150, "step": 1}),
                        description="Number of sampling steps"
                    ))
                    found_params.add("steps")

                if "cfg" not in found_params and "cfg" in inputs:
                    parameters.append(Parameter(
                        name="cfg_scale",
                        display_name="CFG Scale",
                        type="float",
                        node_id=node_id,
                        input_name="cfg",
                        default=inputs.get("cfg", 7.0),
                        constraints=ParameterConstraints.from_dict({"min": 1.0, "max": 30.0, "step": 0.5}),
                        description="Classifier-free guidance scale"
                    ))
                    found_params.add("cfg")

                if "denoise" not in found_params and "denoise" in inputs:
                    parameters.append(Parameter(
                        name="denoise",
                        display_name="Denoise",
                        type="float",
                        node_id=node_id,
                        input_name="denoise",
                        default=inputs.get("denoise", 1.0),
                        constraints=ParameterConstraints.from_dict({"min": 0.0, "max": 1.0, "step": 0.05}),
                        description="Denoising strength"
                    ))
                    found_params.add("denoise")

            # Extract from RandomNoise nodes
            if class_type == "RandomNoise":
                if "seed" not in found_params and "noise_seed" in inputs:
                    parameters.append(Parameter(
                        name="seed",
                        display_name="Seed",
                        type="seed",
                        node_id=node_id,
                        input_name="noise_seed",
                        default=inputs.get("noise_seed", -1),
                        description="Random seed (-1 for random)"
                    ))
                    found_params.add("seed")

            # Extract from CLIPTextEncode nodes
            if class_type == "CLIPTextEncode" and "text" in inputs:
                # Determine if positive or negative from node title or position
                if "negative" in node_title or "neg" in node_title:
                    param_name = "negative_prompt"
                    display_name = "Negative Prompt"
                else:
                    param_name = "positive_prompt"
                    display_name = "Positive Prompt"

                if param_name not in found_params:
                    text_value = inputs.get("text", "")
                    # Only extract if it's a string (not a connection)
                    if isinstance(text_value, str):
                        parameters.append(Parameter(
                            name=param_name,
                            display_name=display_name,
                            type="prompt",
                            node_id=node_id,
                            input_name="text",
                            default=text_value,
                            description=f"{'Negative' if 'negative' in param_name else 'Positive'} text prompt"
                        ))
                        found_params.add(param_name)

            # Extract from TextEncodeQwenImageEditPlus (Qwen Image models)
            if class_type == "TextEncodeQwenImageEditPlus" and "prompt" in inputs:
                if "positive_prompt" not in found_params:
                    prompt_value = inputs.get("prompt", "")
                    if isinstance(prompt_value, str):
                        parameters.append(Parameter(
                            name="positive_prompt",
                            display_name="Prompt",
                            type="prompt",
                            node_id=node_id,
                            input_name="prompt",
                            default=prompt_value,
                            description="Image edit instruction prompt"
                        ))
                        found_params.add("positive_prompt")

            # Extract from CLIPTextEncodeFlux (Flux models)
            if class_type == "CLIPTextEncodeFlux":
                if "positive_prompt" not in found_params and "t5xxl_text" in inputs:
                    text_value = inputs.get("t5xxl_text", "")
                    if isinstance(text_value, str):
                        parameters.append(Parameter(
                            name="positive_prompt",
                            display_name="Prompt",
                            type="prompt",
                            node_id=node_id,
                            input_name="t5xxl_text",
                            default=text_value,
                            description="Main text prompt for Flux models"
                        ))
                        found_params.add("positive_prompt")

                if "guidance" not in found_params and "guidance" in inputs:
                    parameters.append(Parameter(
                        name="guidance",
                        display_name="Guidance",
                        type="float",
                        node_id=node_id,
                        input_name="guidance",
                        default=inputs.get("guidance", 3.5),
                        constraints=ParameterConstraints.from_dict({"min": 1.0, "max": 10.0, "step": 0.1}),
                        description="Flux guidance strength"
                    ))
                    found_params.add("guidance")

            # Extract from FluxGuidance nodes
            if class_type == "FluxGuidance" and "guidance" not in found_params:
                if "guidance" in inputs:
                    parameters.append(Parameter(
                        name="guidance",
                        display_name="Guidance",
                        type="float",
                        node_id=node_id,
                        input_name="guidance",
                        default=inputs.get("guidance", 3.5),
                        constraints=ParameterConstraints.from_dict({"min": 1.0, "max": 10.0, "step": 0.1}),
                        description="Flux guidance strength"
                    ))
                    found_params.add("guidance")

            # Extract from ModelSamplingAuraFlow nodes
            if class_type == "ModelSamplingAuraFlow" and "shift" not in found_params:
                if "shift" in inputs:
                    parameters.append(Parameter(
                        name="shift",
                        display_name="Shift",
                        type="float",
                        node_id=node_id,
                        input_name="shift",
                        default=inputs.get("shift", 1.0),
                        constraints=ParameterConstraints.from_dict({"min": 0.0, "max": 5.0, "step": 0.1}),
                        description="AuraFlow shift parameter"
                    ))
                    found_params.add("shift")

            # Extract from CFGGuider nodes
            if class_type == "CFGGuider" and "cfg" not in found_params:
                if "cfg" in inputs:
                    parameters.append(Parameter(
                        name="cfg_scale",
                        display_name="CFG Scale",
                        type="float",
                        node_id=node_id,
                        input_name="cfg",
                        default=inputs.get("cfg", 1.0),
                        constraints=ParameterConstraints.from_dict({"min": 0.0, "max": 30.0, "step": 0.5}),
                        description="Classifier-free guidance scale"
                    ))
                    found_params.add("cfg")

        return parameters

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary.

        Returns:
            Dictionary representation suitable for JSON export.
        """
        return {
            "meta": self.meta.to_dict(),
            "parameters": [p.to_dict() for p in self.parameters],
            "loras": [l.to_dict() for l in self.loras],
            "inputs": [i.to_dict() for i in self.inputs],
            "workflow": self.workflow,
        }

    def get_parameter(self, name: str) -> Parameter | None:
        """Get a parameter by name.

        Args:
            name: Parameter name to find.

        Returns:
            Parameter if found, None otherwise.
        """
        for param in self.parameters:
            if param.name == name:
                return param
        return None

    def get_lora(self, name: str) -> LoraSlot | None:
        """Get a LoRA slot by name.

        Args:
            name: LoRA slot name to find.

        Returns:
            LoraSlot if found, None otherwise.
        """
        for lora in self.loras:
            if lora.name == name:
                return lora
        return None

    def get_input(self, name: str) -> ImageInput | None:
        """Get an image input by name.

        Args:
            name: Input name to find.

        Returns:
            ImageInput if found, None otherwise.
        """
        for inp in self.inputs:
            if inp.name == name:
                return inp
        return None

    def get_node_input(
        self, node_id: str, input_name: str
    ) -> Parameter | None:
        """Find parameter for a specific node input.

        Args:
            node_id: Node ID to search.
            input_name: Input name within the node.

        Returns:
            Parameter if found, None otherwise.
        """
        for param in self.parameters:
            if (
                param.node_id == node_id
                and param.input_name == input_name
            ):
                return param
        return None
