"""Image input configuration model for Storyboard Maker.

Defines image input specifications for workflow templates.
"""

from dataclasses import dataclass
from typing import Any, Literal


@dataclass
class ImageInput:
    """Image input configuration for workflow templates.

    Defines where reference images connect to the workflow.

    Attributes:
        name: Unique identifier for the input.
        display_name: Human-readable name for UI display.
        node_id: Node ID where the image input connects.
        input_name: Input name within the node.
        type: Input type ('image' or 'mask').
        required: Whether this input must be configured.
        batch_min: Minimum number of inputs in a batch group.
        batch_max: Maximum number of inputs in a batch group.
        description: Brief description for tooltips.
    """
    name: str
    display_name: str = ""
    node_id: str = ""
    input_name: str = "image"
    type: Literal["image", "mask"] = "image"
    required: bool = False
    batch_min: int = 1
    batch_max: int = 1
    description: str = ""

    def __post_init__(self) -> None:
        """Initialize derived fields."""
        if not self.display_name:
            self.display_name = self.name.replace("_", " ").title()

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ImageInput":
        """Create ImageInput from dictionary.

        Args:
            data: Dictionary containing input data.

        Returns:
            ImageInput instance.

        Raises:
            ValueError: If required fields are missing.
        """
        if "name" not in data:
            raise ValueError("Image input missing required field: name")

        return cls(
            name=data["name"],
            display_name=data.get("display_name", ""),
            node_id=data.get("node_id", ""),
            input_name=data.get("input_name", "image"),
            type=data.get("type", "image"),
            required=data.get("required", False),
            batch_min=data.get("batch_min", 1),
            batch_max=data.get("batch_max", 1),
            description=data.get("description", ""),
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
            "input_name": self.input_name,
            "type": self.type,
            "required": self.required,
        }

        if self.batch_min != 1 or self.batch_max != 1:
            result["batch_min"] = self.batch_min
            result["batch_max"] = self.batch_max

        if self.description:
            result["description"] = self.description

        return result

    def is_batch(self) -> bool:
        """Check if this is a batch input.

        Returns:
            True if batch input (batch_max > 1).
        """
        return self.batch_max > 1
