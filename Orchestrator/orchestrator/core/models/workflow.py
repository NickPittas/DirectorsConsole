from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class ParamType(str, Enum):
    INT = "int"
    FLOAT = "float"
    STRING = "string"
    BOOL = "bool"
    IMAGE_PATH = "image_path"
    VIDEO_PATH = "video_path"
    CHOICE = "choice"
    MULTILINE_STRING = "multiline_string"
    SEED = "seed"
    PROMPT = "prompt"


class ParamConstraints(BaseModel):
    min_value: float | None = None
    max_value: float | None = None
    step: float | None = None
    choices: list[str] | None = None
    file_extensions: list[str] | None = None


class MediaType(str, Enum):
    """Type of media input."""
    IMAGE = "image"
    VIDEO = "video"
    MASK = "mask"


class MediaInputDefinition(BaseModel):
    """Definition of a media input node in the workflow."""
    id: str = ""
    node_id: str
    node_title: str
    node_class: str = ""
    media_type: MediaType
    field_name: str = "image"
    input_name: str = "image"
    is_required: bool = True
    required: bool = True
    accepts_mask: bool = False
    order: int = 0


class OutputDefinition(BaseModel):
    """Definition of an output node in the workflow."""
    id: str = ""
    node_id: str
    node_title: str
    node_class: str = ""
    output_type: str | MediaType = "image"
    filename_prefix: str = ""
    order: int = 0


class ParameterGroup(BaseModel):
    """Group of related parameters (e.g., grouped by KSampler)."""
    id: str
    name: str
    description: str = ""
    parameters: list["ExposedParameter"] = Field(default_factory=list)


class ExposedParameter(BaseModel):
    id: str
    node_id: str
    node_title: str
    field_name: str
    display_name: str
    param_type: ParamType
    default_value: Any
    constraints: ParamConstraints | None = None
    order: int = 0


class WorkflowDefinition(BaseModel):
    id: str
    name: str
    description: str = ""
    workflow_json: dict
    api_json: dict
    exposed_parameters: list[ExposedParameter] = Field(default_factory=list)
    media_inputs: list[MediaInputDefinition] = Field(default_factory=list)
    output_definitions: list[OutputDefinition] = Field(default_factory=list)
    required_capabilities: list[str] = Field(default_factory=list)
    required_custom_nodes: list[str] = Field(default_factory=list)
    bypassed_nodes: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    thumbnail: str | None = None

    def get_visible_parameters(self) -> list[ExposedParameter]:
        """Return all exposed parameters (visible in UI)."""
        return sorted(self.exposed_parameters, key=lambda p: p.order)
