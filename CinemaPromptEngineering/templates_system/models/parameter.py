"""Parameter specification model for Storyboard Maker.

Defines parameter types and validation constraints for workflow templates.
"""

from dataclasses import dataclass, field
from typing import Any, Literal


# Parameter type literal
ParameterType = Literal[
    "integer",
    "float",
    "seed",
    "enum",
    "boolean",
    "prompt",
]


@dataclass
class ParameterConstraints:
    """Validation constraints for parameter values.

    Attributes:
        min: Minimum allowed value (for numeric types).
        max: Maximum allowed value (for numeric types).
        step: Step size for adjustment (for numeric types).
        options: List of valid options (for enum type).
    """
    min: float | None = None
    max: float | None = None
    step: float | None = None
    options: list[str] | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any] | None) -> "ParameterConstraints":
        """Create constraints from dictionary.

        Args:
            data: Dictionary with constraint fields, or None.

        Returns:
            ParameterConstraints instance.
        """
        if data is None:
            return cls()

        return cls(
            min=data.get("min"),
            max=data.get("max"),
            step=data.get("step"),
            options=data.get("options"),
        )

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary.

        Returns:
            Dictionary representation, excluding None values.
        """
        result: dict[str, Any] = {}
        if self.min is not None:
            result["min"] = self.min
        if self.max is not None:
            result["max"] = self.max
        if self.step is not None:
            result["step"] = self.step
        if self.options is not None:
            result["options"] = self.options
        return result


@dataclass
class Parameter:
    """Parameter specification for workflow templates.

    Defines an adjustable parameter that can be modified when generating
    panels from a template.

    Attributes:
        name: Unique identifier for the parameter.
        display_name: Human-readable name for UI display.
        type: Parameter type (integer, float, seed, enum, boolean, prompt).
        node_id: Node ID in the workflow where this parameter applies.
        input_name: Input name within the node.
        default: Default value for the parameter.
        constraints: Validation constraints.
        description: Brief description for tooltips.
    """
    name: str
    type: ParameterType
    node_id: str
    input_name: str
    display_name: str = ""
    default: Any = None
    constraints: ParameterConstraints = field(default_factory=ParameterConstraints)
    description: str = ""

    def __post_init__(self) -> None:
        """Initialize derived fields."""
        if not self.display_name:
            self.display_name = self.name.replace("_", " ").title()

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Parameter":
        """Create Parameter from dictionary.

        Args:
            data: Dictionary containing parameter data.

        Returns:
            Parameter instance.

        Raises:
            ValueError: If required fields are missing.
        """
        required = ["name", "type", "node_id", "input_name"]
        for field_name in required:
            if field_name not in data:
                raise ValueError(f"Parameter missing required field: {field_name}")

        return cls(
            name=data["name"],
            type=data["type"],
            node_id=data["node_id"],
            input_name=data["input_name"],
            display_name=data.get("display_name", ""),
            default=data.get("default"),
            constraints=ParameterConstraints.from_dict(
                data.get("constraints")
            ),
            description=data.get("description", ""),
        )

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary.

        Returns:
            Dictionary representation suitable for JSON export.
        """
        result: dict[str, Any] = {
            "name": self.name,
            "type": self.type,
            "node_id": self.node_id,
            "input_name": self.input_name,
            "display_name": self.display_name,
            "default": self.default,
        }

        if self.description:
            result["description"] = self.description

        constraints_dict = self.constraints.to_dict()
        if constraints_dict:
            result["constraints"] = constraints_dict

        return result

    def validate_value(self, value: Any) -> bool:
        """Validate a value against constraints.

        Args:
            value: Value to validate.

        Returns:
            True if valid, False otherwise.
        """
        if self.type == "integer":
            if not isinstance(value, int):
                return False
            if self.constraints.min is not None and value < self.constraints.min:
                return False
            if self.constraints.max is not None and value > self.constraints.max:
                return False

        elif self.type == "float":
            if not isinstance(value, (int, float)):
                return False
            if self.constraints.min is not None and value < self.constraints.min:
                return False
            if self.constraints.max is not None and value > self.constraints.max:
                return False

        elif self.type == "enum":
            if self.constraints.options is None:
                return False
            if value not in self.constraints.options:
                return False

        elif self.type == "boolean":
            if not isinstance(value, bool):
                return False

        elif self.type in ("seed", "prompt"):
            # No specific validation for seed and prompt types
            pass

        return True
