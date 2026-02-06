"""Angle library for Storyboard Maker.

Provides camera angle definitions and token generation.
"""

from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Iterator


class ShotSize(Enum):
    """Shot size classification."""
    CLOSE_UP = "close-up"
    MEDIUM_SHOT = "medium shot"
    WIDE_SHOT = "wide shot"


class CameraHeight(Enum):
    """Camera height classification."""
    LOW_ANGLE = "low-angle"
    EYE_LEVEL = "eye-level"
    ELEVATED = "elevated"
    HIGH_ANGLE = "high-angle"


class ViewDirection(Enum):
    """View direction classification."""
    FRONT = "front"
    FRONT_RIGHT_QUARTER = "front-right quarter"
    RIGHT_SIDE = "right side"
    BACK_RIGHT_QUARTER = "back-right quarter"
    BACK = "back"
    BACK_LEFT_QUARTER = "back-left quarter"
    LEFT_SIDE = "left side"
    FRONT_LEFT_QUARTER = "front-left quarter"


@dataclass(frozen=True)
class CameraAngle:
    """Represents a single camera angle configuration.

    Attributes:
        shot_size: How much of the subject fills the frame.
        height: Vertical camera position relative to subject.
        direction: Horizontal camera position relative to subject.
        token: The angle token string for prompt generation.
    """
    shot_size: ShotSize
    height: CameraHeight
    direction: ViewDirection

    @property
    def token(self) -> str:
        """Generate the angle token for prompt injection.

        Returns:
            Token string formatted for the Multiple Angles LoRA.
        """
        return f"<sks> {self.direction.value} {self.height.value} shot {self.shot_size.value}"

    @property
    def display_name(self) -> str:
        """Get a human-readable name for the angle.

        Returns:
            Formatted angle name.
        """
        return f"{self.direction.value} - {self.height.value} shot - {self.shot_size.value}"

    @property
    def short_name(self) -> str:
        """Get a short name for compact display.

        Returns:
            Abbreviated angle name.
        """
        direction_abbr = {
            ViewDirection.FRONT: "F",
            ViewDirection.FRONT_RIGHT_QUARTER: "FRQ",
            ViewDirection.RIGHT_SIDE: "RS",
            ViewDirection.BACK_RIGHT_QUARTER: "BRQ",
            ViewDirection.BACK: "B",
            ViewDirection.BACK_LEFT_QUARTER: "BLQ",
            ViewDirection.LEFT_SIDE: "LS",
            ViewDirection.FRONT_LEFT_QUARTER: "FLQ",
        }
        height_abbr = {
            CameraHeight.LOW_ANGLE: "LA",
            CameraHeight.EYE_LEVEL: "EL",
            CameraHeight.ELEVATED: "EV",
            CameraHeight.HIGH_ANGLE: "HA",
        }
        size_abbr = {
            ShotSize.CLOSE_UP: "CU",
            ShotSize.MEDIUM_SHOT: "MS",
            ShotSize.WIDE_SHOT: "WS",
        }
        return f"{direction_abbr[self.direction]}-{height_abbr[self.height]}-{size_abbr[self.shot_size]}"


class AngleLibrary:
    """Library of all available camera angles.

    Provides access to the complete set of 144 camera angles
    organized by shot size, height, and view direction.

    Attributes:
        _angles: Internal list of all angles.
    """

    def __init__(self, angles_file: Path | None = None) -> None:
        """Initialize the angle library.

        Args:
            angles_file: Optional path to angles text file.
        """
        self._angles: list[CameraAngle] = []
        self._angle_map: dict[str, CameraAngle] = {}

        if angles_file and angles_file.exists():
            self._load_from_file(angles_file)
        else:
            self._generate_all_angles()

    def _generate_all_angles(self) -> None:
        """Generate all 144 possible angle combinations."""
        for shot_size in ShotSize:
            for height in CameraHeight:
                for direction in ViewDirection:
                    angle = CameraAngle(
                        shot_size=shot_size,
                        height=height,
                        direction=direction,
                    )
                    self._angles.append(angle)
                    self._angle_map[angle.token] = angle

    def _load_from_file(self, path: Path) -> None:
        """Load angles from a text file.

        Each line should contain a token string.

        Args:
            path: Path to the angles text file.
        """
        try:
            with open(path, "r", encoding="utf-8") as f:
                for line in f:
                    token = line.strip()
                    if token:
                        angle = self._token_to_angle(token)
                        if angle:
                            self._angles.append(angle)
                            self._angle_map[token] = angle
        except OSError as e:
            # Fall back to generated angles
            self._generate_all_angles()

    def _token_to_angle(self, token: str) -> CameraAngle | None:
        """Convert a token string to a CameraAngle.

        Args:
            token: Angle token string.

        Returns:
            CameraAngle if conversion successful, None otherwise.
        """
        # Parse token format: "<sks> {direction} {height} shot {size}"
        # The direction may be multi-word like "front view" or "front-right quarter"
        parts = token.replace("<sks>", "").strip().split()

        if len(parts) < 5:
            return None

        # Expected format: [direction] [height] shot [size]
        # Direction can be multi-word

        size_str = parts[-1]  # Last part is shot size
        shot_str = parts[-2]  # Second to last should be "shot"

        if shot_str != "shot":
            return None

        height_str = parts[-3]  # Third from last is height

        # Direction is everything before "shot" (excluding height)
        # This could be "front view" or "front-right quarter"
        direction_str = " ".join(parts[:-3])

        # Clean up direction_str - remove "view" suffix if present
        # "front view" -> "front", "back view" -> "back"
        if direction_str.endswith(" view"):
            direction_str = direction_str[:-5]  # Remove " view"

        # Convert to enums
        # The token format already uses the correct enum value format (with hyphens)
        try:
            shot_size = ShotSize(size_str)
            height = CameraHeight(height_str)
            direction = ViewDirection(direction_str)
        except ValueError:
            return None

        return CameraAngle(
            shot_size=shot_size,
            height=height,
            direction=direction,
        )

    def get_all_angles(self) -> list[CameraAngle]:
        """Get all available angles.

        Returns:
            List of all CameraAngle objects.
        """
        return sorted(
            self._angles,
            key=lambda a: (
                a.shot_size.value,
                a.height.value,
                a.direction.value,
            ),
        )

    def get_angle_by_token(self, token: str) -> CameraAngle | None:
        """Get an angle by its token.

        Args:
            token: The angle token string.

        Returns:
            CameraAngle if found, None otherwise.
        """
        return self._angle_map.get(token)

    def get_angles_by_shot_size(self, shot_size: ShotSize) -> list[CameraAngle]:
        """Get all angles for a specific shot size.

        Args:
            shot_size: The shot size to filter by.

        Returns:
            List of matching CameraAngle objects.
        """
        return [
            angle for angle in self._angles
            if angle.shot_size == shot_size
        ]

    def get_angles_by_height(self, height: CameraHeight) -> list[CameraAngle]:
        """Get all angles for a specific height.

        Args:
            height: The camera height to filter by.

        Returns:
            List of matching CameraAngle objects.
        """
        return [
            angle for angle in self._angles
            if angle.height == height
        ]

    def get_angles_by_direction(
        self,
        direction: ViewDirection,
    ) -> list[CameraAngle]:
        """Get all angles for a specific view direction.

        Args:
            direction: The view direction to filter by.

        Returns:
            List of matching CameraAngle objects.
        """
        return [
            angle for angle in self._angles
            if angle.direction == direction
        ]

    def get_shot_sizes(self) -> list[ShotSize]:
        """Get all available shot sizes.

        Returns:
            List of ShotSize enums.
        """
        return list(ShotSize)

    def get_heights(self) -> list[CameraHeight]:
        """Get all available camera heights.

        Returns:
            List of CameraHeight enums.
        """
        return list(CameraHeight)

    def get_directions(self) -> list[ViewDirection]:
        """Get all available view directions.

        Returns:
            List of ViewDirection enums.
        """
        return list(ViewDirection)

    def search_angles(self, query: str) -> list[CameraAngle]:
        """Search angles by text query.

        Args:
            query: Search string to match against display names.

        Returns:
            List of matching CameraAngle objects.
        """
        query_lower = query.lower()
        return [
            angle for angle in self._angles
            if query_lower in angle.display_name.lower()
        ]

    def get_random_angle(
        self,
        shot_size: ShotSize | None = None,
        height: CameraHeight | None = None,
        direction: ViewDirection | None = None,
    ) -> CameraAngle:
        """Get a random angle, optionally filtered.

        Args:
            shot_size: Optional shot size filter.
            height: Optional height filter.
            direction: Optional direction filter.

        Returns:
            A random CameraAngle matching the filters.
        """
        import random

        candidates = self._angles

        if shot_size:
            candidates = [a for a in candidates if a.shot_size == shot_size]
        if height:
            candidates = [a for a in candidates if a.height == height]
        if direction:
            candidates = [a for a in candidates if a.direction == direction]

        if not candidates:
            # Fall back to any angle
            candidates = self._angles

        return random.choice(candidates)

    def __iter__(self) -> Iterator[CameraAngle]:
        """Iterate over all angles.

        Returns:
            Iterator of CameraAngle objects.
        """
        return iter(self.get_all_angles())

    def __len__(self) -> int:
        """Get the total number of angles.

        Returns:
            Angle count (should be 144).
        """
        return len(self._angles)
