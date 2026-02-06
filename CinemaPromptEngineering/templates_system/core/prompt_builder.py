"""Prompt builder for Storyboard Maker.

Assembles prompts from angle tokens, scene descriptions, and quality tags.
"""

import logging
from dataclasses import dataclass, field
from typing import Any

from ..models import Template

from .angle_library import AngleLibrary, CameraAngle

logger = logging.getLogger(__name__)


@dataclass
class PromptComponents:
    """Components of a generated prompt.

    Attributes:
        angle_token: Camera angle token, if enabled.
        character_description: Character description text.
        scene_description: Scene description text.
        next_scene_prefix: Whether to prepend "Next Scene:" prefix.
        quality_tags: Quality enhancement tags.
    """
    angle_token: str = ""
    character_description: str = ""
    scene_description: str = ""
    next_scene_prefix: bool = False
    quality_tags: list[str] = field(default_factory=list)


class PromptBuilder:
    """Builds prompts for image generation.

    Combines angle tokens, scene descriptions, and quality tags
    into a single prompt suitable for ComfyUI.

    Attributes:
        angle_library: The angle library for token generation.
        default_quality_tags: Default quality enhancement tags.
    """

    DEFAULT_QUALITY_TAGS = [
        "masterpiece",
        "best quality",
        "highly detailed",
    ]

    def __init__(
        self,
        angle_library: AngleLibrary | None = None,
        default_quality_tags: list[str] | None = None,
    ) -> None:
        """Initialize the prompt builder.

        Args:
            angle_library: Optional angle library instance.
            default_quality_tags: Optional default quality tags.
        """
        self.angle_library = angle_library or AngleLibrary()
        self.default_quality_tags = default_quality_tags or self.DEFAULT_QUALITY_TAGS.copy()

    def build_prompt(
        self,
        components: PromptComponents,
        template: Template | None = None,
    ) -> str:
        """Build a complete prompt from components.

        Args:
            components: The prompt components to combine.
            template: Optional template for additional processing.

        Returns:
            Complete prompt string.
        """
        parts: list[str] = []

        # Add angle token first (maximum attention weight)
        if components.angle_token:
            parts.append(components.angle_token)

        # Add character description
        if components.character_description:
            parts.append(components.character_description)

        # Build scene description with optional prefix
        scene_text = components.scene_description
        if components.next_scene_prefix and scene_text:
            scene_text = f"Next Scene: {scene_text}"
        if scene_text:
            parts.append(scene_text)

        # Add quality tags
        parts.extend(components.quality_tags)

        return ", ".join(part for part in parts if part)

    def build_from_values(
        self,
        angle: CameraAngle | None = None,
        angle_enabled: bool = False,
        character_description: str = "",
        scene_description: str = "",
        next_scene_prefix: bool = False,
        quality_tags: list[str] | None = None,
        template: Template | None = None,
    ) -> str:
        """Build a prompt from individual values.

        Args:
            angle: Selected camera angle.
            angle_enabled: Whether to include angle token.
            character_description: Character description text.
            scene_description: Scene description text.
            next_scene_prefix: Whether to prepend prefix.
            quality_tags: Quality tags to include.
            template: Optional template for additional processing.

        Returns:
            Complete prompt string.
        """
        components = PromptComponents(
            angle_token=angle.token if angle and angle_enabled else "",
            character_description=character_description,
            scene_description=scene_description,
            next_scene_prefix=next_scene_prefix,
            quality_tags=quality_tags or self.default_quality_tags,
        )

        return self.build_prompt(components, template)

    def update_angle(
        self,
        current_prompt: str,
        angle: CameraAngle | None,
        angle_enabled: bool,
    ) -> str:
        """Update only the angle token in an existing prompt.

        Args:
            current_prompt: Existing prompt text.
            angle: New camera angle.
            angle_enabled: Whether angle token should be included.

        Returns:
            Updated prompt string.
        """
        # Remove existing angle token if present
        parts = current_prompt.split(", ")

        # Check if first part looks like an angle token
        if parts and parts[0].startswith("<sks>"):
            parts = parts[1:]

        # Build new prompt without angle
        components = PromptComponents(
            scene_description=", ".join(parts),
        )

        # Re-add angle if enabled
        if angle and angle_enabled:
            components.angle_token = angle.token

        return self.build_prompt(components)

    def extract_angle_token(self, prompt: str) -> str | None:
        """Extract the angle token from a prompt.

        Args:
            prompt: Prompt text to parse.

        Returns:
            Angle token if found, None otherwise.
        """
        parts = prompt.split(", ")
        if parts and parts[0].startswith("<sks>"):
            return parts[0]
        return None

    def has_next_scene_prefix(self, prompt: str) -> bool:
        """Check if a prompt has the Next Scene prefix.

        Args:
            prompt: Prompt text to check.

        Returns:
            True if prefix is present.
        """
        return "Next Scene:" in prompt

    def set_next_scene_prefix(
        self,
        prompt: str,
        enabled: bool,
    ) -> str:
        """Enable or disable the Next Scene prefix.

        Args:
            prompt: Existing prompt text.
            enabled: Whether prefix should be enabled.

        Returns:
            Updated prompt.
        """
        has_prefix = self.has_next_scene_prefix(prompt)

        if has_prefix == enabled:
            return prompt  # No change needed

        parts = prompt.split(", ")

        # Remove prefix if present
        if has_prefix:
            parts = [p.replace("Next Scene:", "").strip() for p in parts]
            parts = [p for p in parts if p]

        # Add prefix if enabling
        if enabled and parts:
            parts[0] = f"Next Scene: {parts[0]}"

        return ", ".join(parts)

    def validate_prompt(self, prompt: str) -> bool:
        """Basic validation of a prompt.

        Args:
            prompt: Prompt text to validate.

        Returns:
            True if prompt passes basic checks.
        """
        if not prompt:
            return True  # Empty is valid (will use defaults)

        if len(prompt) > 2000:
            logger.warning("Prompt exceeds 2000 characters")

        return True

    def get_quality_tags(
        self,
        template: Template | None = None,
    ) -> list[str]:
        """Get the appropriate quality tags for a template.

        Args:
            template: Optional template for custom tags.

        Returns:
            List of quality tag strings.
        """
        if template:
            # Could be extended to read tags from template metadata
            pass
        return self.default_quality_tags.copy()

    def merge_quality_tags(
        self,
        existing: list[str],
        additional: list[str],
    ) -> list[str]:
        """Merge two lists of quality tags, avoiding duplicates.

        Args:
            existing: First list of tags.
            additional: Second list of tags to merge.

        Returns:
            Combined list without duplicates.
        """
        result = existing.copy()
        for tag in additional:
            if tag not in result:
                result.append(tag)
        return result

    def build_negative_prompt(
        self,
        base_negative: str = "",
        template: Template | None = None,
    ) -> str:
        """Build a negative prompt.

        Args:
            base_negative: Base negative prompt.
            template: Optional template for custom negatives.

        Returns:
            Complete negative prompt.
        """
        negative_parts = []

        if base_negative:
            negative_parts.append(base_negative)

        # Add common negatives
        negative_parts.extend([
            "low quality",
            "worst quality",
            "blurry",
            "distorted",
        ])

        return ", ".join(negative_parts)
