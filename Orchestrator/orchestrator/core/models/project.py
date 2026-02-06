from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class NodeType(str, Enum):
    WORKFLOW = "workflow"
    CONDITION = "condition"
    FANOUT = "fanout"
    MERGE = "merge"
    INPUT = "input"
    OUTPUT = "output"
    EXECUTE = "execute"


class FallbackStrategy(str, Enum):
    NONE = "none"
    ASK_USER = "ask_user"
    AUTO_SELECT = "auto"


class DataType(str, Enum):
    TRIGGER = "trigger"
    IMAGE = "image"
    VIDEO = "video"
    LATENT = "latent"
    ANY = "any"


class CropSettings(BaseModel):
    """Settings for image cropping."""
    x: int = 0
    y: int = 0
    width: int = 0
    height: int = 0
    enabled: bool = False
    grid_snap: int = 8
    aspect_ratio: str | None = None


class MediaInputState(BaseModel):
    """Complete state for a media input including crop and mask."""
    file_path: str = ""
    crop: CropSettings | None = None
    mask_path: str | None = None
    mask_data: bytes | None = None
    width: int = 0
    height: int = 0


class CanvasNode(BaseModel):
    id: str
    node_type: NodeType
    position: tuple[float, float]
    name: str | None = None
    workflow_id: str | None = None
    backend_affinity: str | None = None
    fallback_strategy: FallbackStrategy = FallbackStrategy.ASK_USER
    config: dict = Field(default_factory=dict)
    parameter_values: dict = Field(default_factory=dict)
    exposed_parameters: list = Field(default_factory=list)
    group_collapsed: dict = Field(default_factory=dict)
    parameter_visibility: dict = Field(default_factory=dict)
    media_state: dict | None = None


class CanvasConnection(BaseModel):
    id: str
    source_node_id: str
    source_port: str
    target_node_id: str
    target_port: str
    data_type: DataType = DataType.ANY
    # Port indices for disambiguation when multiple ports have the same name
    source_port_index: int | None = None
    target_port_index: int | None = None


class Viewport(BaseModel):
    offset_x: float = 0.0
    offset_y: float = 0.0
    zoom: float = 1.0


class CanvasLayout(BaseModel):
    nodes: list[CanvasNode] = Field(default_factory=list)
    connections: list[CanvasConnection] = Field(default_factory=list)
    viewport: Viewport = Field(default_factory=Viewport)


class Project(BaseModel):
    id: str
    name: str
    description: str = ""
    canvas_layout: CanvasLayout = Field(default_factory=CanvasLayout)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
