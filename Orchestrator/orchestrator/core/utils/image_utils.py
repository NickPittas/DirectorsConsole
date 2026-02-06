"""Image utilities for cropping, masking, and image manipulation.

Provides:
- Grid-snapped cropping with aspect ratio constraints
- Mask cropping synchronized with image crops
- Image scaling and thumbnail generation
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import TYPE_CHECKING

from pydantic import BaseModel

if TYPE_CHECKING:
    from PyQt6.QtCore import QRect
    from PyQt6.QtGui import QImage

logger = logging.getLogger(__name__)


# Common aspect ratios for cropping
ASPECT_RATIOS: dict[str, tuple[int, int]] = {
    "free": (0, 0),  # No constraint
    "1:1": (1, 1),
    "4:3": (4, 3),
    "3:4": (3, 4),
    "16:9": (16, 9),
    "9:16": (9, 16),
    "3:2": (3, 2),
    "2:3": (2, 3),
    "21:9": (21, 9),  # Ultrawide
}

# Valid grid snap values
GRID_SNAP_VALUES: list[int] = [2, 4, 8, 16, 32, 64]


class CropRect(BaseModel):
    """Crop rectangle with grid snapping and aspect ratio support."""
    x: int = 0
    y: int = 0
    width: int = 0
    height: int = 0
    
    def to_tuple(self) -> tuple[int, int, int, int]:
        """Return as (x, y, width, height)."""
        return (self.x, self.y, self.width, self.height)
    
    def to_qrect(self) -> "QRect":
        """Convert to QRect."""
        from PyQt6.QtCore import QRect
        return QRect(self.x, self.y, self.width, self.height)
    
    @classmethod
    def from_qrect(cls, rect: "QRect") -> "CropRect":
        """Create from QRect."""
        return cls(
            x=rect.x(),
            y=rect.y(),
            width=rect.width(),
            height=rect.height()
        )
    
    def is_valid(self) -> bool:
        """Check if crop rect has valid dimensions."""
        return self.width > 0 and self.height > 0


def snap_to_grid(value: int, grid_size: int) -> int:
    """Snap a value to the nearest grid point.
    
    Args:
        value: Value to snap
        grid_size: Grid size (must be in GRID_SNAP_VALUES)
        
    Returns:
        Value snapped to nearest grid point
    """
    if grid_size <= 0:
        return value
    return round(value / grid_size) * grid_size


def snap_rect_to_grid(
    x: int, y: int, width: int, height: int,
    grid_size: int,
    image_width: int,
    image_height: int
) -> tuple[int, int, int, int]:
    """Snap a rectangle to grid while keeping it within image bounds.
    
    Args:
        x, y: Top-left corner
        width, height: Rectangle dimensions
        grid_size: Grid size to snap to
        image_width, image_height: Image bounds
        
    Returns:
        Tuple of (x, y, width, height) snapped to grid
    """
    # Snap position
    x = snap_to_grid(x, grid_size)
    y = snap_to_grid(y, grid_size)
    
    # Snap dimensions
    width = max(grid_size, snap_to_grid(width, grid_size))
    height = max(grid_size, snap_to_grid(height, grid_size))
    
    # Keep within bounds
    x = max(0, min(x, image_width - width))
    y = max(0, min(y, image_height - height))
    
    # Adjust size if needed to stay within bounds
    if x + width > image_width:
        width = image_width - x
        width = snap_to_grid(width, grid_size)
    if y + height > image_height:
        height = image_height - y
        height = snap_to_grid(height, grid_size)
    
    return (x, y, width, height)


def calculate_aspect_constrained_size(
    width: int,
    height: int,
    aspect_ratio: str,
    grid_size: int = 8,
    max_width: int | None = None,
    max_height: int | None = None
) -> tuple[int, int]:
    """Calculate dimensions constrained to an aspect ratio.
    
    Args:
        width: Desired width
        height: Desired height
        aspect_ratio: Aspect ratio key (e.g., "16:9", "1:1", "free")
        grid_size: Grid size for snapping
        max_width: Maximum allowed width
        max_height: Maximum allowed height
        
    Returns:
        Tuple of (width, height) that maintains aspect ratio
    """
    if aspect_ratio == "free" or aspect_ratio not in ASPECT_RATIOS:
        # Just snap to grid
        w = snap_to_grid(width, grid_size)
        h = snap_to_grid(height, grid_size)
        return (max(grid_size, w), max(grid_size, h))
    
    ratio_w, ratio_h = ASPECT_RATIOS[aspect_ratio]
    
    # Calculate both possibilities
    # 1. Fix width, calculate height
    new_height_from_width = int(width * ratio_h / ratio_w)
    
    # 2. Fix height, calculate width
    new_width_from_height = int(height * ratio_w / ratio_h)
    
    # Choose the option that gives smaller area (fits better)
    area1 = width * new_height_from_width
    area2 = new_width_from_height * height
    
    if area1 <= area2:
        final_w, final_h = width, new_height_from_width
    else:
        final_w, final_h = new_width_from_height, height
    
    # Snap to grid
    final_w = max(grid_size, snap_to_grid(final_w, grid_size))
    final_h = max(grid_size, snap_to_grid(final_h, grid_size))
    
    # Apply max constraints
    if max_width and final_w > max_width:
        final_w = snap_to_grid(max_width, grid_size)
        final_h = snap_to_grid(int(final_w * ratio_h / ratio_w), grid_size)
    
    if max_height and final_h > max_height:
        final_h = snap_to_grid(max_height, grid_size)
        final_w = snap_to_grid(int(final_h * ratio_w / ratio_h), grid_size)
    
    return (final_w, final_h)


def crop_image(image: "QImage", crop_rect: CropRect) -> "QImage":
    """Crop a QImage to the specified rectangle.
    
    Args:
        image: Source QImage
        crop_rect: Rectangle to crop to
        
    Returns:
        Cropped QImage copy
    """
    if not crop_rect.is_valid():
        return image.copy()
    
    return image.copy(crop_rect.to_qrect())


def crop_mask(mask: "QImage", crop_rect: CropRect) -> "QImage":
    """Crop a mask image to match an image crop.
    
    Args:
        mask: Source mask QImage (grayscale)
        crop_rect: Rectangle to crop to (same as image crop)
        
    Returns:
        Cropped mask QImage copy
    """
    return crop_image(mask, crop_rect)


def apply_crop_to_path(
    image_path: Path | str,
    crop_rect: CropRect,
    output_path: Path | str | None = None
) -> Path:
    """Load an image, crop it, and save to output path.
    
    Args:
        image_path: Path to source image
        crop_rect: Rectangle to crop to
        output_path: Output path (auto-generated if None)
        
    Returns:
        Path to cropped image
    """
    from PyQt6.QtGui import QImage
    import tempfile
    
    image_path = Path(image_path)
    
    if output_path is None:
        suffix = f"_crop_{crop_rect.x}_{crop_rect.y}_{crop_rect.width}_{crop_rect.height}"
        output_path = Path(tempfile.gettempdir()) / f"{image_path.stem}{suffix}{image_path.suffix}"
    else:
        output_path = Path(output_path)
    
    # Load image
    image = QImage(str(image_path))
    if image.isNull():
        raise ValueError(f"Could not load image: {image_path}")
    
    # Crop
    cropped = crop_image(image, crop_rect)
    
    # Save
    if not cropped.save(str(output_path)):
        raise ValueError(f"Could not save cropped image: {output_path}")
    
    return output_path


def get_image_dimensions(image_path: Path | str) -> tuple[int, int]:
    """Get image dimensions without loading full image.
    
    Args:
        image_path: Path to image file
        
    Returns:
        Tuple of (width, height)
    """
    from PyQt6.QtGui import QImageReader
    
    reader = QImageReader(str(image_path))
    size = reader.size()
    return (size.width(), size.height())


def create_thumbnail(
    image: "QImage",
    max_size: tuple[int, int] = (160, 120)
) -> "QImage":
    """Scale image to fit within max_size while preserving aspect ratio.
    
    Args:
        image: Source QImage
        max_size: Maximum (width, height)
        
    Returns:
        Scaled QImage
    """
    from PyQt6.QtCore import Qt
    
    return image.scaled(
        max_size[0],
        max_size[1],
        Qt.AspectRatioMode.KeepAspectRatio,
        Qt.TransformationMode.SmoothTransformation
    )


def create_centered_crop_rect(
    image_width: int,
    image_height: int,
    crop_width: int,
    crop_height: int,
    grid_size: int = 8
) -> CropRect:
    """Create a centered crop rectangle within an image.
    
    Args:
        image_width, image_height: Image dimensions
        crop_width, crop_height: Desired crop dimensions
        grid_size: Grid size for snapping
        
    Returns:
        CropRect centered in the image
    """
    # Ensure crop fits within image
    crop_width = min(crop_width, image_width)
    crop_height = min(crop_height, image_height)
    
    # Snap to grid
    crop_width = snap_to_grid(crop_width, grid_size)
    crop_height = snap_to_grid(crop_height, grid_size)
    
    # Center
    x = (image_width - crop_width) // 2
    y = (image_height - crop_height) // 2
    
    # Snap position to grid
    x = snap_to_grid(x, grid_size)
    y = snap_to_grid(y, grid_size)
    
    return CropRect(x=x, y=y, width=crop_width, height=crop_height)


def fit_to_aspect_ratio(
    image_width: int,
    image_height: int,
    aspect_ratio: str,
    grid_size: int = 8
) -> CropRect:
    """Create the largest possible centered crop that fits an aspect ratio.
    
    Args:
        image_width, image_height: Image dimensions
        aspect_ratio: Target aspect ratio (e.g., "16:9")
        grid_size: Grid size for snapping
        
    Returns:
        CropRect with maximum size at given aspect ratio
    """
    if aspect_ratio == "free" or aspect_ratio not in ASPECT_RATIOS:
        return CropRect(x=0, y=0, width=image_width, height=image_height)
    
    ratio_w, ratio_h = ASPECT_RATIOS[aspect_ratio]
    
    # Calculate dimensions that fit within image
    # Try fitting to width
    fit_width = image_width
    fit_height = int(image_width * ratio_h / ratio_w)
    
    # If height exceeds image, fit to height instead
    if fit_height > image_height:
        fit_height = image_height
        fit_width = int(image_height * ratio_w / ratio_h)
    
    # Snap to grid
    fit_width = snap_to_grid(fit_width, grid_size)
    fit_height = snap_to_grid(fit_height, grid_size)
    
    return create_centered_crop_rect(
        image_width, image_height,
        fit_width, fit_height,
        grid_size
    )
