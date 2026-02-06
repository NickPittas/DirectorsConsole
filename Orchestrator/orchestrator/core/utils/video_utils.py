"""Video utilities for metadata extraction, frame operations, and trimming.

Only MP4 videos are supported.
"""
from __future__ import annotations

import logging
import subprocess
import tempfile
from pathlib import Path
from typing import TYPE_CHECKING

import cv2
from pydantic import BaseModel

if TYPE_CHECKING:
    from PyQt6.QtGui import QImage

logger = logging.getLogger(__name__)


class VideoMetadata(BaseModel):
    """Video metadata - all durations in frames."""
    path: str
    width: int
    height: int
    fps: float
    total_frames: int
    codec: str = "unknown"
    file_size: int = 0  # bytes
    
    @property
    def duration_seconds(self) -> float:
        """Calculated duration for display."""
        return self.total_frames / self.fps if self.fps > 0 else 0
    
    @property
    def display_info(self) -> str:
        """Formatted string for UI display."""
        return f"{self.width}x{self.height} | {self.fps:.1f} fps | {self.total_frames} frames"


class VideoError(Exception):
    """Video processing error."""
    pass


class UnsupportedFormatError(VideoError):
    """Raised when video format is not MP4."""
    pass


def validate_video_path(path: Path | str) -> Path:
    """Validate that path is an MP4 video file.
    
    Args:
        path: Path to video file
        
    Returns:
        Validated Path object
        
    Raises:
        UnsupportedFormatError: If file is not MP4
        FileNotFoundError: If file doesn't exist
    """
    path = Path(path)
    
    if not path.exists():
        raise FileNotFoundError(f"Video file not found: {path}")
    
    if path.suffix.lower() != '.mp4':
        raise UnsupportedFormatError(
            f"Only MP4 videos are supported. Got: {path.suffix}"
        )
    
    return path


def get_video_metadata(path: Path | str) -> VideoMetadata:
    """Extract metadata from MP4 video using OpenCV.
    
    Args:
        path: Path to MP4 video file
        
    Returns:
        VideoMetadata with extracted information
        
    Raises:
        UnsupportedFormatError: If file is not MP4
        VideoError: If metadata extraction fails
    """
    path = validate_video_path(path)
    
    cap = cv2.VideoCapture(str(path))
    try:
        if not cap.isOpened():
            raise VideoError(f"Could not open video: {path}")
        
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = cap.get(cv2.CAP_PROP_FPS)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fourcc = int(cap.get(cv2.CAP_PROP_FOURCC))
        codec = _decode_fourcc(fourcc)
        
        if width == 0 or height == 0:
            raise VideoError(f"Invalid video dimensions: {width}x{height}")
        
        if total_frames <= 0:
            raise VideoError(f"Invalid frame count: {total_frames}")
        
        return VideoMetadata(
            path=str(path),
            width=width,
            height=height,
            fps=fps if fps > 0 else 30.0,  # Default to 30 fps if detection fails
            total_frames=total_frames,
            codec=codec,
            file_size=path.stat().st_size
        )
    finally:
        cap.release()


def extract_frame(path: Path | str, frame_number: int = 0) -> "QImage":
    """Extract a specific frame from video as QImage.
    
    Args:
        path: Path to MP4 video file
        frame_number: Frame number to extract (0-indexed)
        
    Returns:
        QImage of the extracted frame
        
    Raises:
        VideoError: If frame extraction fails
    """
    from PyQt6.QtGui import QImage
    
    path = validate_video_path(path)
    
    cap = cv2.VideoCapture(str(path))
    try:
        if not cap.isOpened():
            raise VideoError(f"Could not open video: {path}")
        
        # Seek to frame
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_number)
        ret, frame = cap.read()
        
        if not ret or frame is None:
            raise VideoError(f"Could not extract frame {frame_number} from {path}")
        
        # Convert BGR to RGB
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        
        # Create QImage
        height, width, channels = frame_rgb.shape
        bytes_per_line = channels * width
        
        return QImage(
            frame_rgb.data,
            width,
            height,
            bytes_per_line,
            QImage.Format.Format_RGB888
        ).copy()  # Copy to own the data
        
    finally:
        cap.release()


def extract_frame_at_percent(path: Path | str, percent: float = 0.0) -> "QImage":
    """Extract frame at a percentage through the video.
    
    Args:
        path: Path to MP4 video file
        percent: Position in video (0.0 to 1.0)
        
    Returns:
        QImage of the extracted frame
    """
    metadata = get_video_metadata(path)
    frame_number = int(metadata.total_frames * max(0.0, min(1.0, percent)))
    return extract_frame(path, frame_number)


def trim_video(
    path: Path | str,
    start_frame: int,
    end_frame: int,
    output_path: Path | str | None = None
) -> Path:
    """Trim video by frame range.
    
    Uses ffmpeg for efficient trimming without re-encoding when possible.
    
    Args:
        path: Path to source MP4 video
        start_frame: Starting frame (inclusive)
        end_frame: Ending frame (exclusive)
        output_path: Output path (auto-generated if None)
        
    Returns:
        Path to trimmed video
        
    Raises:
        VideoError: If trimming fails
    """
    path = validate_video_path(path)
    metadata = get_video_metadata(path)
    
    # Validate frame range
    if start_frame < 0:
        start_frame = 0
    if end_frame > metadata.total_frames:
        end_frame = metadata.total_frames
    if start_frame >= end_frame:
        raise VideoError(f"Invalid frame range: {start_frame} to {end_frame}")
    
    # Generate output path if not provided
    if output_path is None:
        suffix = f"_trim_{start_frame}_{end_frame}.mp4"
        output_path = Path(tempfile.gettempdir()) / (path.stem + suffix)
    else:
        output_path = Path(output_path)
    
    # Calculate time-based values for ffmpeg
    fps = metadata.fps
    start_time = start_frame / fps
    duration = (end_frame - start_frame) / fps
    
    try:
        # Try ffmpeg first (faster, preserves quality)
        _trim_with_ffmpeg(path, output_path, start_time, duration)
    except (FileNotFoundError, subprocess.SubprocessError) as e:
        logger.warning(f"ffmpeg trim failed: {e}, falling back to OpenCV")
        # Fallback to OpenCV (slower, may re-encode)
        _trim_with_opencv(path, output_path, start_frame, end_frame, fps)
    
    if not output_path.exists():
        raise VideoError(f"Failed to create trimmed video: {output_path}")
    
    return output_path


def _trim_with_ffmpeg(
    input_path: Path,
    output_path: Path,
    start_time: float,
    duration: float
) -> None:
    """Trim video using ffmpeg."""
    cmd = [
        'ffmpeg',
        '-y',  # Overwrite output
        '-ss', str(start_time),  # Start time (before -i for fast seek)
        '-i', str(input_path),
        '-t', str(duration),  # Duration
        '-c', 'copy',  # Copy streams without re-encoding
        '-avoid_negative_ts', 'make_zero',
        str(output_path)
    ]
    
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=300  # 5 minute timeout
    )
    
    if result.returncode != 0:
        raise subprocess.SubprocessError(f"ffmpeg failed: {result.stderr}")


def _trim_with_opencv(
    input_path: Path,
    output_path: Path,
    start_frame: int,
    end_frame: int,
    fps: float
) -> None:
    """Trim video using OpenCV (fallback method)."""
    cap = cv2.VideoCapture(str(input_path))
    try:
        if not cap.isOpened():
            raise VideoError(f"Could not open video: {input_path}")
        
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        
        # Use mp4v codec
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(str(output_path), fourcc, fps, (width, height))
        
        try:
            # Seek to start frame
            cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)
            
            for frame_idx in range(start_frame, end_frame):
                ret, frame = cap.read()
                if not ret:
                    break
                out.write(frame)
        finally:
            out.release()
    finally:
        cap.release()


def _decode_fourcc(fourcc: int) -> str:
    """Decode fourcc integer to string codec name."""
    if fourcc == 0:
        return "unknown"
    return "".join([chr((fourcc >> 8 * i) & 0xFF) for i in range(4)])


def get_frame_thumbnail(
    path: Path | str,
    frame_number: int = 0,
    max_size: tuple[int, int] = (160, 120)
) -> "QImage":
    """Extract frame and scale to thumbnail size.
    
    Args:
        path: Path to MP4 video file
        frame_number: Frame to extract
        max_size: Maximum thumbnail dimensions (width, height)
        
    Returns:
        Scaled QImage thumbnail
    """
    from PyQt6.QtCore import Qt
    
    frame = extract_frame(path, frame_number)
    return frame.scaled(
        max_size[0],
        max_size[1],
        Qt.AspectRatioMode.KeepAspectRatio,
        Qt.TransformationMode.SmoothTransformation
    )
