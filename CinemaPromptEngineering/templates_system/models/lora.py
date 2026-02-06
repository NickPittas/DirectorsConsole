"""LoRA slot definition model for Storyboard Maker.

Defines LoRA slot configurations for workflow templates.
"""

from dataclasses import dataclass, field
from typing import Any


class LoraStrengthInputs(dict):
    """LoRA strength input mappings.

    A dictionary-like class for storing strength input names.

    Attributes:
        model: Input name for model strength.
        clip: Input name for CLIP strength.
    """

    def __init__(
        self,
        model: str = "strength",
        clip: str = "strength_clip",
    ) -> None:
        super().__init__()
        self["model"] = model
        self["clip"] = clip

    @property
    def model(self) -> str:
        """Get the model strength input name."""
        return self["model"]

    @model.setter
    def model(self, value: str) -> None:
        """Set the model strength input name."""
        self["model"] = value

    @property
    def clip(self) -> str:
        """Get the CLIP strength input name."""
        return self["clip"]

    @clip.setter
    def clip(self, value: str) -> None:
        """Set the CLIP strength input name."""
        self["clip"] = value


@dataclass
class LoraSlot:
    """LoRA slot definition for workflow templates.

    A LoRA slot defines where a LoRA can be applied in the workflow,
    including the node location and strength input mappings.

    Attributes:
        name: Unique identifier for the LoRA slot.
        display_name: Human-readable name for UI display.
        node_id: Node ID where the LoRA loader appears in the workflow.
        strength_inputs: Mapping of strength input names.
        compatible_patterns: List of filename patterns for LoRA suggestions.
        default_enabled: Whether the LoRA is enabled by default.
        default_strength: Default strength value (0.0-1.0 or higher).
        required: Whether this LoRA must be present for the template to work.
        lora_name: The actual LoRA name/path from the workflow (for display).
    """
    name: str
    display_name: str = ""
    node_id: str = ""
    strength_inputs: LoraStrengthInputs = field(
        default_factory=lambda: LoraStrengthInputs(model="strength", clip="strength_clip")
    )
    compatible_patterns: list[str] = field(default_factory=list)
    default_enabled: bool = False
    default_strength: float = 0.8
    required: bool = False
    lora_name: str = ""  # Actual LoRA name from workflow

    def __post_init__(self) -> None:
        """Initialize derived fields."""
        if not self.display_name:
            self.display_name = self.name.replace("_", " ").title()

    @property
    def model_strength_input(self) -> str:
        """Get the model strength input name.

        Returns:
            Input name for model strength.
        """
        return self.strength_inputs["model"]

    @property
    def clip_strength_input(self) -> str:
        """Get the CLIP strength input name.

        Returns:
            Input name for CLIP strength.
        """
        return self.strength_inputs["clip"]

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "LoraSlot":
        """Create LoraSlot from dictionary.

        Args:
            data: Dictionary containing LoRA slot data.

        Returns:
            LoraSlot instance.

        Raises:
            ValueError: If required fields are missing.
        """
        if "name" not in data:
            raise ValueError("LoRA slot missing required field: name")

        strength_inputs_data = data.get("strength_inputs", {})
        strength_inputs = LoraStrengthInputs(
            model=strength_inputs_data.get("model", "strength"),
            clip=strength_inputs_data.get("clip", "strength_clip"),
        )

        # Get lora_name from inputs or direct field
        lora_name = data.get("lora_name", "") or strength_inputs_data.get("lora_name", "")

        return cls(
            name=data["name"],
            display_name=data.get("display_name", ""),
            node_id=data.get("node_id", ""),
            strength_inputs=strength_inputs,
            compatible_patterns=data.get("compatible_patterns", []),
            default_enabled=data.get("default_enabled", False),
            default_strength=data.get("default_strength", 0.8),
            required=data.get("required", False),
            lora_name=lora_name,
        )

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary.

        Returns:
            Dictionary representation suitable for JSON export.
        """
        result: dict[str, Any] = {
            "name": self.name,
            "display_name": self.display_name,
            "node_id": self.node_id,
            "strength_inputs": {
                "model": self.strength_inputs["model"],
                "clip": self.strength_inputs["clip"],
                "lora_name": self.lora_name,
            },
            "compatible_patterns": self.compatible_patterns,
            "default_enabled": self.default_enabled,
            "default_strength": self.default_strength,
        }

        if self.required:
            result["required"] = True

        if self.lora_name:
            result["lora_name"] = self.lora_name

        return result
