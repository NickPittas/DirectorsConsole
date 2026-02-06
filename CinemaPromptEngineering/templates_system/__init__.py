"""
Templates System for Director's Console

This module provides complete template management functionality ported from StoryboardUI2.
Includes:
- Template models (Template, Parameter, LoRA, ImageInput)
- Core modules (TemplateLoader, WorkflowBuilder, PromptBuilder, etc.)
- Camera angle library (144 presets)
- Export management (PNG, JPEG, WebP, PDF, CSV)
- Session management
"""

__version__ = "2.0.0"
__author__ = "Project Eliot - Director's Console"

from .models import (
    Template,
    TemplateMeta,
    Parameter,
    ParameterConstraints,
    LoraSlot,
    ImageInput,
)

from .core import (
    TemplateLoader,
    WorkflowBuilder,
    PromptBuilder,
    AngleLibrary,
    ExportManager,
    SessionManager,
    ComfyUIClient,
)

__all__ = [
    # Models
    "Template",
    "TemplateMeta",
    "Parameter",
    "ParameterConstraints",
    "LoraSlot",
    "ImageInput",
    # Core modules
    "TemplateLoader",
    "WorkflowBuilder",
    "PromptBuilder",
    "AngleLibrary",
    "ExportManager",
    "SessionManager",
    "ComfyUIClient",
]
