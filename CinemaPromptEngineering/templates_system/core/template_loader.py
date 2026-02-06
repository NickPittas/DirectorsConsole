"""Template loader for Storyboard Maker.

Handles template discovery, loading, validation, and caching.
"""

import json
import logging
from pathlib import Path
from typing import Any

from jsonschema import ValidationError, validate

from ..models import Template
from ..models.template import TemplateMeta
from ..models import Parameter, ParameterConstraints, LoraSlot, ImageInput

logger = logging.getLogger(__name__)


class TemplateError(Exception):
    """Base exception for template-related errors."""
    pass


class TemplateNotFoundError(TemplateError):
    """Raised when a template cannot be found."""
    pass


class TemplateValidationError(TemplateError):
    """Raised when template validation fails."""
    pass


class TemplateLoader:
    """Template loader with discovery and validation.

    Discovers templates from built-in and user directories,
    validates them against the schema, and provides caching.

    Attributes:
        templates_dir: Directory for built-in templates.
        user_templates_dir: Directory for user templates.
        _cache: Internal template cache.
    """

    def __init__(
        self,
        templates_dir: Path | None = None,
        user_templates_dir: Path | None = None,
    ) -> None:
        """Initialize the template loader.

        Args:
            templates_dir: Directory containing built-in templates.
            user_templates_dir: Directory containing user templates.
        """
        self.templates_dir = templates_dir or Path(__file__).parent.parent / "templates"
        self.user_templates_dir = user_templates_dir or Path(__file__).parent.parent / "user_templates"
        self._cache: dict[str, Template] = {}
        self._template_schema: dict[str, Any] = {}

    def load_all(self) -> list[Template]:
        """Load all available templates.

        Returns:
            List of all valid templates from both directories.
        """
        templates: list[Template] = []

        # Load built-in templates
        if self.templates_dir.exists():
            for template in self._load_directory(self.templates_dir):
                templates.append(template)

        # Load user templates
        if self.user_templates_dir.exists():
            for template in self._load_directory(self.user_templates_dir):
                templates.append(template)

        return templates

    def _load_directory(self, directory: Path) -> list[Template]:
        """Load all templates from a directory.

        Args:
            directory: Path to template directory.

        Returns:
            List of loaded templates.
        """
        templates: list[Template] = []

        for template_path in directory.glob("*.json"):
            try:
                template = self.load(template_path)
                templates.append(template)
            except TemplateError as e:
                logger.warning(f"Failed to load template {template_path}: {e}")

        return templates

    def load(self, path: Path) -> Template:
        """Load a template from a file.

        Args:
            path: Path to the template JSON file.

        Returns:
            Loaded Template instance.

        Raises:
            TemplateNotFoundError: If the file doesn't exist.
            TemplateValidationError: If validation fails.
            TemplateError: If parsing fails.
        """
        if not path.exists():
            raise TemplateNotFoundError(f"Template file not found: {path}")

        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except json.JSONDecodeError as e:
            raise TemplateError(f"Invalid JSON in template: {e}") from e

        try:
            self._validate_template(data)
        except ValidationError as e:
            raise TemplateValidationError(
                f"Template validation failed: {e.message}"
            ) from e

        try:
            template = Template.from_dict(data)
            template.path = path  # Store the file path
            return template
        except (ValueError, KeyError) as e:
            raise TemplateError(f"Failed to parse template: {e}") from e

    def _validate_template(self, data: dict[str, Any]) -> None:
        """Validate a template against the schema.

        Args:
            data: Template data dictionary.

        Raises:
            ValidationError: If validation fails.
        """
        schema = self._get_template_schema()
        validate(instance=data, schema=schema)

    def _get_template_schema(self) -> dict[str, Any]:
        """Get the template JSON schema.

        Returns:
            The template schema dictionary.
        """
        if not self._template_schema:
            schema_path = Path(__file__).parent.parent / "data" / "template_schema.json"
            if schema_path.exists():
                with open(schema_path, "r", encoding="utf-8") as f:
                    self._template_schema = json.load(f)
            else:
                # Fallback to a minimal schema
                self._template_schema = {
                    "type": "object",
                    "required": ["meta"],
                    "properties": {
                        "meta": {
                            "type": "object",
                            "required": ["name"],
                            "properties": {
                                "name": {"type": "string"},
                                "version": {"type": "string"},
                                "author": {"type": "string"},
                                "description": {"type": "string"},
                                "engine": {"type": "string"},
                                "category": {"type": "string"},
                                "supports_angles": {"type": "boolean"},
                                "supports_next_scene": {"type": "boolean"},
                                "requires_images": {"type": "boolean"},
                            },
                        },
                    },
                }
        return self._template_schema

    def get_template_by_name(self, name: str) -> Template | None:
        """Get a template by name.

        Args:
            name: Template name to find.

        Returns:
            Template if found, None otherwise.
        """
        if not self._cache:
            self._cache_all()

        return self._cache.get(name)

    def get_templates_by_engine(self, engine: str) -> list[Template]:
        """Get all templates for a specific engine.

        Args:
            engine: Engine identifier.

        Returns:
            List of templates for the engine.
        """
        if not self._cache:
            self._cache_all()

        return [
            template for template in self._cache.values()
            if template.engine == engine
        ]

    def get_templates_by_category(self, category: str) -> list[Template]:
        """Get all templates for a specific category.

        Args:
            category: Template category.

        Returns:
            List of templates in the category.
        """
        if not self._cache:
            self._cache_all()

        return [
            template for template in self._cache.values()
            if category in template.categories
        ]

    def _cache_all(self) -> None:
        """Load and cache all templates."""
        for template in self.load_all():
            self._cache[template.name] = template

    def refresh(self) -> None:
        """Refresh the template cache.

        Clears the cache and reloads all templates.
        """
        self._cache.clear()
        self._cache_all()

    def get_available_engines(self) -> list[str]:
        """Get list of available engine types.

        Returns:
            List of unique engine identifiers.
        """
        if not self._cache:
            self._cache_all()

        return sorted(set(template.engine for template in self._cache.values()))

    def get_available_categories(self) -> list[str]:
        """Get list of available template categories.

        Returns:
            List of unique category identifiers.
        """
        if not self._cache:
            self._cache_all()

        return sorted(set(template.category for template in self._cache.values()))

    def get_template_path(self, template_name: str) -> Path | None:
        """Get the file path for a template by name.

        Args:
            template_name: Name of the template to find.

        Returns:
            Path to the template file, or None if not found.
        """
        # Search in user templates first (they are writable)
        user_path = self.user_templates_dir / f"{template_name.lower().replace(' ', '_')}.json"
        if user_path.exists():
            return user_path

        # Search in built-in templates
        built_in_path = self.templates_dir / f"{template_name.lower().replace(' ', '_')}.json"
        if built_in_path.exists():
            return built_in_path

        # Search all files in both directories for matching name
        for template_path in self.templates_dir.glob("*.json"):
            try:
                with open(template_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if data.get("meta", {}).get("name") == template_name:
                    return template_path
            except (json.JSONDecodeError, KeyError):
                continue

        for template_path in self.user_templates_dir.glob("*.json"):
            try:
                with open(template_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if data.get("meta", {}).get("name") == template_name:
                    return template_path
            except (json.JSONDecodeError, KeyError):
                continue

        return None

    def create_template(
        self,
        name: str,
        workflow: dict[str, Any],
        author: str = "",
        description: str = "",
        engine: str = "other",
        category: str = "generation",
    ) -> Template:
        """Create a new template with minimal metadata.

        This is useful for quickly creating templates from ComfyUI exports.

        Args:
            name: Template name.
            workflow: ComfyUI workflow dictionary.
            author: Template author.
            description: Template description.
            engine: Engine identifier.
            category: Template category.

        Returns:
            New Template instance.
        """
        meta = TemplateMeta(
            name=name,
            author=author,
            description=description,
            engine=engine,
            categories=[category],
        )
        return Template(meta=meta, workflow=workflow)

    def create_template_from_workflow(
        self,
        name: str,
        workflow: dict[str, Any],
    ) -> Template:
        """Create a template from a ComfyUI workflow dictionary.

        This method attempts to:
        1. Fix node IDs with invalid characters (colons from grouped nodes)
        2. Extract metadata from the workflow if available
        3. Auto-detect common parameters (steps, cfg, seed, width, height)
        4. Auto-detect LoRA slots
        5. Auto-detect image inputs

        Args:
            name: Template name.
            workflow: ComfyUI workflow dictionary.

        Returns:
            New Template instance with auto-detected parameters.
        """
        # NOTE: We no longer convert colons in node IDs - ComfyUI expects them as-is
        # Node IDs like "41:97" are valid JSON keys and must be preserved
        
        # Try to extract metadata from the workflow
        author = ""
        description = ""
        engine = "other"
        categories: list[str] = ["generation"]

        # Look for common workflow metadata
        if "meta" in workflow:
            meta = workflow["meta"]
            author = meta.get("author", "")
            description = meta.get("description", "")
            engine = meta.get("engine", "other")
            # Handle both old single category and new categories list
            cats_data = meta.get("categories", [])
            if isinstance(cats_data, str):
                categories = [cats_data]
            elif isinstance(cats_data, list) and cats_data:
                categories = cats_data
            else:
                # Fall back to old single category field
                single_cat = meta.get("category")
                if single_cat:
                    categories = [single_cat]

        # Auto-detect categories from workflow content if not provided
        if not categories or categories == ["generation"]:
            detected = self._detect_categories_from_workflow(workflow)
            if detected:
                categories = detected

        # Auto-detect parameters from workflow nodes
        parameters = self._extract_parameters_from_workflow(workflow)

        # Auto-detect LoRA slots
        loras = self._extract_loras_from_workflow(workflow)

        # Auto-detect image inputs
        inputs = self._extract_image_inputs_from_workflow(workflow)

        # Create the template
        meta_obj = TemplateMeta(
            name=name,
            author=author,
            description=description,
            engine=engine,
            categories=categories,
            supports_angles=True,
            supports_next_scene=False,
            requires_images=len(inputs) > 0,
        )

        # Convert parameter dicts to Parameter objects
        param_objects = [
            Parameter(
                name=p["name"],
                display_name=p["display_name"],
                type=p["type"],
                node_id=p.get("node_id", ""),
                input_name=p.get("input_name", ""),
                default=p.get("default"),
                constraints=ParameterConstraints(
                    min=p.get("constraints", {}).get("min"),
                    max=p.get("constraints", {}).get("max"),
                    step=p.get("constraints", {}).get("step"),
                    options=p.get("constraints", {}).get("options"),
                ),
                description=p.get("description", ""),
            )
            for p in parameters
        ]

        # Convert lora dicts to LoraSlot objects
        lora_objects = [
            LoraSlot(
                name=l["name"],
                display_name=l["display_name"],
                node_id=l["node_id"],
                strength_inputs=l.get("strength_inputs", {"model": "strength_model", "clip": "strength_clip"}),
                default_enabled=l.get("default_enabled", False),
                default_strength=l.get("default_strength", 0.75),
                required=l.get("required", False),
            )
            for l in loras
        ]

        # Convert input dicts to ImageInput objects
        input_objects = [
            ImageInput(
                name=i["name"],
                display_name=i["display_name"],
                node_id=i["node_id"],
                input_name=i["input_name"],
                type=i["type"],
                required=i.get("required", False),
                batch_min=i.get("batch_min", 1),
                batch_max=i.get("batch_max", 1),
                description=i.get("description", ""),
            )
            for i in inputs
        ]

        return Template(
            meta=meta_obj,
            parameters=param_objects,
            loras=lora_objects,
            inputs=input_objects,
            workflow=workflow,
        )

    def _fix_workflow_node_ids(self, workflow: dict[str, Any]) -> dict[str, Any]:
        """Fix node IDs containing invalid characters like colons.

        ComfyUI's grouped/sub-workflow nodes use colons in their IDs (e.g., '41:99'),
        but the API doesn't accept these. This method replaces colons with underscores.

        Args:
            workflow: ComfyUI workflow dictionary.

        Returns:
            Workflow with fixed node IDs.
        """
        # Find all node IDs with colons (skip 'meta' key if present)
        colon_nodes = [k for k in workflow.keys() if ':' in k and k != 'meta']
        
        if not colon_nodes:
            return workflow  # No fixes needed
        
        logger.info(f"Fixing {len(colon_nodes)} node IDs with colons: {colon_nodes}")
        
        # Create mapping old -> new
        mapping = {k: k.replace(':', '_') for k in colon_nodes}
        
        # Create new workflow with fixed IDs
        new_workflow = {}
        for node_id, node_data in workflow.items():
            if node_id == 'meta':
                new_workflow[node_id] = node_data
                continue
                
            new_id = mapping.get(node_id, node_id)
            
            # Deep copy node data to avoid modifying original
            if isinstance(node_data, dict):
                node_data = dict(node_data)
                
                # Update any references in inputs
                if 'inputs' in node_data:
                    new_inputs = {}
                    for input_name, input_value in node_data['inputs'].items():
                        if isinstance(input_value, list) and len(input_value) == 2:
                            # This is a connection [node_id, output_index]
                            ref_node = input_value[0]
                            if ref_node in mapping:
                                input_value = [mapping[ref_node], input_value[1]]
                        new_inputs[input_name] = input_value
                    node_data['inputs'] = new_inputs
            
            new_workflow[new_id] = node_data
        
        return new_workflow

    def _extract_parameters_from_workflow(self, workflow: dict[str, Any]) -> list[dict[str, Any]]:
        """Auto-detect parameters from ComfyUI workflow nodes.

        Args:
            workflow: ComfyUI workflow dictionary.

        Returns:
            List of parameter definitions.
        """
        parameters: list[dict[str, Any]] = []

        for node_id, node in workflow.items():
            if node_id == "meta" or not isinstance(node, dict):
                continue

            class_type = node.get("class_type", "")
            inputs = node.get("inputs", {})

            # Detect KSampler nodes - extract steps, cfg, seed, denoise
            if class_type == "KSampler":
                if "steps" in inputs:
                    parameters.append({
                        "name": "steps",
                        "display_name": "Sampling Steps",
                        "type": "integer",
                        "node_id": node_id,
                        "input_name": "steps",
                        "default": inputs.get("steps", 30),
                        "constraints": {
                            "min": 1,
                            "max": 150,
                            "step": 1
                        },
                        "description": "Number of denoising steps"
                    })

                if "cfg" in inputs:
                    parameters.append({
                        "name": "cfg_scale",
                        "display_name": "CFG Scale",
                        "type": "float",
                        "node_id": node_id,
                        "input_name": "cfg",
                        "default": inputs.get("cfg", 7.0),
                        "constraints": {
                            "min": 1.0,
                            "max": 20.0,
                            "step": 0.5
                        },
                        "description": "Classifier-free guidance scale"
                    })

                if "seed" in inputs:
                    parameters.append({
                        "name": "seed",
                        "display_name": "Seed",
                        "type": "seed",
                        "node_id": node_id,
                        "input_name": "seed",
                        "default": inputs.get("seed", -1),
                        "description": "Random seed (-1 for random)"
                    })

                if "denoise" in inputs:
                    parameters.append({
                        "name": "denoise",
                        "display_name": "Denoise Strength",
                        "type": "float",
                        "node_id": node_id,
                        "input_name": "denoise",
                        "default": inputs.get("denoise", 1.0),
                        "constraints": {
                            "min": 0.1,
                            "max": 1.0,
                            "step": 0.05
                        },
                        "description": "Denoising strength (img2img)"
                    })

            # Detect EmptyLatentImage - extract width, height
            if class_type == "EmptyLatentImage":
                if "width" in inputs:
                    parameters.append({
                        "name": "width",
                        "display_name": "Width",
                        "type": "integer",
                        "node_id": node_id,
                        "input_name": "width",
                        "default": inputs.get("width", 512),
                        "constraints": {
                            "min": 256,
                            "max": 2048,
                            "step": 64
                        },
                        "description": "Output image width"
                    })

                if "height" in inputs:
                    parameters.append({
                        "name": "height",
                        "display_name": "Height",
                        "type": "integer",
                        "node_id": node_id,
                        "input_name": "height",
                        "default": inputs.get("height", 512),
                        "constraints": {
                            "min": 256,
                            "max": 2048,
                            "step": 64
                        },
                        "description": "Output image height"
                    })

            # NOTE: CLIPTextEncode and other prompt nodes are now handled by
            # _extract_prompt_parameters() after this loop for better detection

            # Prompt nodes are handled separately after the loop
            # to ensure we can analyze all of them together

        # Now handle prompt nodes separately for better detection
        parameters = self._extract_prompt_parameters(workflow, parameters)
        
        return parameters

    def _extract_prompt_parameters(
        self,
        workflow: dict[str, Any],
        existing_parameters: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        """Extract prompt parameters from workflow with intelligent detection.
        
        This method handles multiple prompt nodes of the same type by:
        1. Collecting all prompt nodes
        2. Analyzing titles, content, and connections
        3. Creating uniquely named parameters for each prompt node
        
        Args:
            workflow: ComfyUI workflow dictionary.
            existing_parameters: Already detected parameters.
            
        Returns:
            Updated parameter list with prompt parameters added.
        """
        parameters = existing_parameters.copy()
        
        # Collect all prompt nodes with their metadata
        prompt_nodes: list[dict[str, Any]] = []
        
        # Known prompt node class types and their text input names
        prompt_class_types = {
            "CLIPTextEncode": "text",
            "TextEncodeQwenImageEditPlus": "prompt",
            "TextEncodeQwenImageEdit": "prompt",
            "TextEncodeQwen": "prompt",
            "CLIPTextEncodeSDXL": "text_g",  # Also has text_l
            "PromptStyler": "text_positive",  # Also has text_negative
            "ShowText": "text",
            "StringFunction": "text",
        }
        
        for node_id, node in workflow.items():
            if node_id == "meta" or not isinstance(node, dict):
                continue
            
            class_type = node.get("class_type", "")
            inputs = node.get("inputs", {})
            
            # Check if this is a known prompt node
            if class_type in prompt_class_types:
                input_name = prompt_class_types[class_type]
                if input_name in inputs:
                    text = str(inputs.get(input_name, ""))
                    meta_title = node.get("_meta", {}).get("title", "")
                    
                    prompt_nodes.append({
                        "node_id": node_id,
                        "class_type": class_type,
                        "input_name": input_name,
                        "text": text,
                        "title": meta_title,
                        "title_lower": meta_title.lower(),
                    })
        
        if not prompt_nodes:
            return parameters
        
        # Categorize prompt nodes
        positive_nodes = []
        negative_nodes = []
        unknown_nodes = []
        
        # Keywords for detection
        positive_keywords = ["positive", "pos ", "(pos)", "prompt", "main prompt", "subject"]
        negative_keywords = ["negative", "neg ", "(neg)", "bad", "ugly", "worst", "low quality", "avoid"]
        
        for node_info in prompt_nodes:
            title_lower = node_info["title_lower"]
            text_lower = node_info["text"].lower()[:200]  # Check first 200 chars of content
            
            # Check title first (most reliable)
            is_positive = any(kw in title_lower for kw in positive_keywords)
            is_negative = any(kw in title_lower for kw in negative_keywords)
            
            # If title is ambiguous, check content
            if not is_positive and not is_negative:
                # Content with negative words is likely negative prompt
                content_negative_words = ["ugly", "blurry", "bad anatomy", "worst quality", 
                                         "low quality", "normal quality", "lowres", "watermark",
                                         "deformed", "disfigured", "mutation", "extra limbs"]
                is_negative = any(word in text_lower for word in content_negative_words)
            
            if is_negative and not is_positive:
                negative_nodes.append(node_info)
            elif is_positive and not is_negative:
                positive_nodes.append(node_info)
            else:
                unknown_nodes.append(node_info)
        
        # If we have clear positive/negative nodes, use them
        # If we have unknown nodes, try to assign them intelligently
        
        # Handle unknown nodes
        for node_info in unknown_nodes:
            if not positive_nodes:
                # First unknown becomes positive
                positive_nodes.append(node_info)
            elif not negative_nodes:
                # Second unknown becomes negative (if we have a positive)
                negative_nodes.append(node_info)
            else:
                # Additional unknowns - create unique parameter names
                param_name = f"prompt_{node_info['node_id']}"
                display_name = node_info["title"] or f"Prompt (Node {node_info['node_id']})"
                parameters.append({
                    "name": param_name,
                    "display_name": display_name,
                    "type": "prompt",
                    "node_id": node_info["node_id"],
                    "input_name": node_info["input_name"],
                    "default": node_info["text"],
                    "description": f"Text prompt for {node_info['class_type']} node {node_info['node_id']}"
                })
        
        # Add positive prompt parameter(s)
        for i, node_info in enumerate(positive_nodes):
            # Check if already exists
            existing = next(
                (p for p in parameters if p.get("name") == "positive_prompt"),
                None
            )
            if i == 0 and not existing:
                parameters.append({
                    "name": "positive_prompt",
                    "display_name": "Positive Prompt",
                    "type": "prompt",
                    "node_id": node_info["node_id"],
                    "input_name": node_info["input_name"],
                    "default": node_info["text"],
                    "description": "Positive prompt (what to generate)"
                })
            elif i > 0 or existing:
                # Additional positive prompts get unique names
                param_name = f"positive_prompt_{i+1}" if i > 0 else f"positive_prompt_{node_info['node_id']}"
                display_name = node_info["title"] or f"Positive Prompt {i+2}"
                parameters.append({
                    "name": param_name,
                    "display_name": display_name,
                    "type": "prompt",
                    "node_id": node_info["node_id"],
                    "input_name": node_info["input_name"],
                    "default": node_info["text"],
                    "description": "Additional positive prompt"
                })
        
        # Add negative prompt parameter(s)
        for i, node_info in enumerate(negative_nodes):
            existing = next(
                (p for p in parameters if p.get("name") == "negative_prompt"),
                None
            )
            if i == 0 and not existing:
                parameters.append({
                    "name": "negative_prompt",
                    "display_name": "Negative Prompt",
                    "type": "prompt",
                    "node_id": node_info["node_id"],
                    "input_name": node_info["input_name"],
                    "default": node_info["text"],
                    "description": "Negative prompt (things to avoid)"
                })
            elif i > 0 or existing:
                # Additional negative prompts get unique names
                param_name = f"negative_prompt_{i+1}" if i > 0 else f"negative_prompt_{node_info['node_id']}"
                display_name = node_info["title"] or f"Negative Prompt {i+2}"
                parameters.append({
                    "name": param_name,
                    "display_name": display_name,
                    "type": "prompt",
                    "node_id": node_info["node_id"],
                    "input_name": node_info["input_name"],
                    "default": node_info["text"],
                    "description": "Additional negative prompt"
                })
        
        return parameters

    def _extract_loras_from_workflow(self, workflow: dict[str, Any]) -> list[dict[str, Any]]:
        """Auto-detect LoRA slots from ComfyUI workflow nodes.

        Args:
            workflow: ComfyUI workflow dictionary.

        Returns:
            List of LoRA slot definitions.
        """
        loras: list[dict[str, Any]] = []
        lora_count = 0

        for node_id, node in workflow.items():
            if node_id == "meta" or not isinstance(node, dict):
                continue

            class_type = node.get("class_type", "")

            # Detect LoraLoader nodes (including LoraLoaderModelOnly)
            if "LoraLoader" in class_type or class_type == "LoraLoader" or class_type == "LoraLoaderModelOnly":
                lora_count += 1
                inputs = node.get("inputs", {})

                # Get the actual lora_name from the workflow
                actual_lora_name = inputs.get("lora_name", "")
                if actual_lora_name:
                    # Extract just the filename without path
                    import os
                    display_name = os.path.splitext(os.path.basename(actual_lora_name))[0]
                else:
                    display_name = f"LoRA {lora_count}"

                loras.append({
                    "name": f"lora_{lora_count}",
                    "display_name": display_name,
                    "node_id": node_id,
                    "strength_inputs": {
                        "model": "strength_model",
                        "clip": "strength_clip"
                    },
                    "default_enabled": True,  # Embedded LoRAs are enabled by default
                    "default_strength": inputs.get("strength_model", 0.75),
                    "required": True,  # Embedded LoRAs are required
                    "lora_name": actual_lora_name,  # Store the actual lora_name
                })

        return loras

    def _extract_image_inputs_from_workflow(self, workflow: dict[str, Any]) -> list[dict[str, Any]]:
        """Auto-detect image input requirements from ComfyUI workflow nodes.

        Args:
            workflow: ComfyUI workflow dictionary.

        Returns:
            List of image input definitions.
        """
        inputs: list[dict[str, Any]] = []
        input_count = 0

        for node_id, node in workflow.items():
            if node_id == "meta" or not isinstance(node, dict):
                continue

            class_type = node.get("class_type", "")

            # Detect LoadImage nodes
            if class_type == "LoadImage":
                input_count += 1
                inputs.append({
                    "name": f"reference_image_{input_count}",
                    "display_name": f"Reference Image {input_count}",
                    "node_id": node_id,
                    "input_name": "image",
                    "type": "image",
                    "required": False,
                    "batch_min": 1,
                    "batch_max": 1,
                    "description": f"Reference image for node {node_id}"
                })

            # Detect LoadImageMask nodes
            if class_type == "LoadImageMask":
                input_count += 1
                inputs.append({
                    "name": f"mask_image_{input_count}",
                    "display_name": f"Mask Image {input_count}",
                    "node_id": node_id,
                    "input_name": "image",
                    "type": "mask",
                    "required": False,
                    "batch_min": 1,
                    "batch_max": 1,
                    "description": f"Mask image for node {node_id}"
                })

        return inputs

    def _detect_categories_from_workflow(self, workflow: dict[str, Any]) -> list[str]:
        """Auto-detect template categories from workflow content.

        Args:
            workflow: ComfyUI workflow dictionary.

        Returns:
            List of detected category strings.
        """
        has_load_image = False
        has_empty_latent = False
        has_sampler = False
        has_inpaint_nodes = False

        for node_id, node in workflow.items():
            if node_id == "meta" or not isinstance(node, dict):
                continue

            class_type = node.get("class_type", "")

            if class_type == "LoadImage":
                has_load_image = True

            if "EmptyLatent" in class_type:
                has_empty_latent = True

            if class_type == "KSampler":
                has_sampler = True

            # Check for inpainting-specific nodes
            if class_type in ["VAEEncodeForInpaint", "InpaintModelConditioning", "Inpaint"]:
                has_inpaint_nodes = True

        # Decision tree for category detection
        categories: list[str] = []

        if has_load_image and not has_empty_latent:
            # Workflow with LoadImage but no EmptyLatent - image editing
            categories.append("editing")

        if has_load_image and has_empty_latent:
            # Has both - could be img2img
            categories.append("img2img")

        if has_empty_latent and has_sampler:
            # Text-to-image generation
            categories.append("generation")

        if has_inpaint_nodes:
            # Has inpainting support
            if "img2img" not in categories:
                categories.append("img2img")

        # Default to generation if no specific category detected
        if not categories:
            categories = ["generation"]

        return categories

    def save_user_template(self, template: Template) -> Path:
        """Save a template to the user templates directory.

        Args:
            template: Template to save.

        Returns:
            Path to the saved file.
        """
        # Ensure user templates directory exists
        self.user_templates_dir.mkdir(parents=True, exist_ok=True)

        # Create safe filename from template name
        safe_name = template.name.lower().replace(" ", "_")
        file_path = self.user_templates_dir / f"{safe_name}.json"

        # Save the template
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(template.to_dict(), f, indent=4, ensure_ascii=False)

        logger.info(f"Saved user template: {file_path}")
        return file_path
