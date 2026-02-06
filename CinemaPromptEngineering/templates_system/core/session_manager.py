"""Session manager for Storyboard Maker.

Handles saving and loading storyboard sessions including panel images and notes.
"""

import json
import logging
import shutil
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)


@dataclass
class PanelData:
    """Data for a single panel in the session.

    Attributes:
        index: Panel index.
        image_filename: Filename of the image (stored in session folder).
        original_path: Original path to the generated image.
        notes: User notes for this panel.
        metadata: Generation metadata (prompt, settings, etc.).
    """
    index: int
    image_filename: Optional[str] = None
    original_path: Optional[str] = None
    notes: str = ""
    metadata: Optional[dict[str, Any]] = None


@dataclass
class SessionData:
    """Complete session data.

    Attributes:
        name: Session name.
        created: Creation timestamp.
        modified: Last modified timestamp.
        template_name: Name of the template used.
        panel_count: Total number of panels.
        panels: List of panel data.
    """
    name: str
    created: str
    modified: str
    template_name: str = ""
    panel_count: int = 6
    panels: list[dict[str, Any]] | None = None


class SessionError(Exception):
    """Base exception for session-related errors."""
    pass


class SessionManager:
    """Manages storyboard session save/load operations.

    Sessions are stored as folders containing:
    - session.json: Session metadata and panel data
    - images/: Folder containing panel images
    """

    SESSION_FILE = "session.json"
    IMAGES_FOLDER = "images"

    def __init__(self, sessions_dir: Path | None = None) -> None:
        """Initialize the session manager.

        Args:
            sessions_dir: Directory to store sessions.
        """
        self.sessions_dir = sessions_dir or Path("sessions")
        self.sessions_dir.mkdir(parents=True, exist_ok=True)

    def save_session(
        self,
        name: str,
        panel_images: dict[int, Path],
        panel_notes: dict[int, str],
        panel_metadata: dict[int, dict[str, Any]],
        template_name: str = "",
        panel_count: int = 6,
    ) -> Path:
        """Save a storyboard session.

        Args:
            name: Session name.
            panel_images: Dictionary mapping panel index to image path.
            panel_notes: Dictionary mapping panel index to notes.
            panel_metadata: Dictionary mapping panel index to metadata.
            template_name: Name of the template used.
            panel_count: Total number of panels.

        Returns:
            Path to the saved session folder.

        Raises:
            SessionError: If save fails.
        """
        # Sanitize session name for filesystem
        safe_name = "".join(c for c in name if c.isalnum() or c in (' ', '-', '_')).strip()
        if not safe_name:
            safe_name = f"session_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

        session_dir = self.sessions_dir / safe_name
        images_dir = session_dir / self.IMAGES_FOLDER

        try:
            # Create directories
            session_dir.mkdir(parents=True, exist_ok=True)
            images_dir.mkdir(exist_ok=True)

            # Build panel data
            panels = []
            for i in range(panel_count):
                panel_data = PanelData(
                    index=i,
                    notes=panel_notes.get(i, ""),
                    metadata=panel_metadata.get(i),
                )

                # Copy image if exists
                if i in panel_images and panel_images[i] and panel_images[i].exists():
                    src_path = panel_images[i]
                    image_filename = f"panel_{i + 1:03d}{src_path.suffix}"
                    dst_path = images_dir / image_filename
                    shutil.copy(src_path, dst_path)
                    panel_data.image_filename = image_filename
                    panel_data.original_path = str(src_path)

                panels.append(asdict(panel_data))

            # Build session data
            now = datetime.now().isoformat()
            session_data = SessionData(
                name=name,
                created=now,
                modified=now,
                template_name=template_name,
                panel_count=panel_count,
                panels=panels,
            )

            # Save session file
            session_file = session_dir / self.SESSION_FILE
            with open(session_file, 'w', encoding='utf-8') as f:
                json.dump(asdict(session_data), f, indent=2)

            logger.info(f"Saved session to: {session_dir}")
            return session_dir

        except Exception as e:
            raise SessionError(f"Failed to save session: {e}") from e

    def load_session(self, session_path: Path) -> tuple[SessionData, dict[int, Path], dict[int, str], dict[int, dict]]:
        """Load a storyboard session.

        Args:
            session_path: Path to the session folder or session.json file.

        Returns:
            Tuple of (session_data, panel_images, panel_notes, panel_metadata).

        Raises:
            SessionError: If load fails.
        """
        try:
            # Handle both folder and file paths
            if session_path.is_file():
                session_dir = session_path.parent
                session_file = session_path
            else:
                session_dir = session_path
                session_file = session_dir / self.SESSION_FILE

            if not session_file.exists():
                raise SessionError(f"Session file not found: {session_file}")

            # Load session data
            with open(session_file, 'r', encoding='utf-8') as f:
                data = json.load(f)

            session_data = SessionData(
                name=data.get('name', 'Untitled'),
                created=data.get('created', ''),
                modified=data.get('modified', ''),
                template_name=data.get('template_name', ''),
                panel_count=data.get('panel_count', 6),
                panels=data.get('panels', []),
            )

            # Build panel dictionaries
            panel_images: dict[int, Path] = {}
            panel_notes: dict[int, str] = {}
            panel_metadata: dict[int, dict] = {}
            images_dir = session_dir / self.IMAGES_FOLDER

            for panel in session_data.panels or []:
                idx = panel.get('index', 0)
                panel_notes[idx] = panel.get('notes', '')
                
                if panel.get('metadata'):
                    panel_metadata[idx] = panel['metadata']

                if panel.get('image_filename'):
                    image_path = images_dir / panel['image_filename']
                    if image_path.exists():
                        panel_images[idx] = image_path

            logger.info(f"Loaded session from: {session_dir}")
            return session_data, panel_images, panel_notes, panel_metadata

        except json.JSONDecodeError as e:
            raise SessionError(f"Invalid session file format: {e}") from e
        except Exception as e:
            raise SessionError(f"Failed to load session: {e}") from e

    def list_sessions(self) -> list[tuple[str, Path, str]]:
        """List all available sessions.

        Returns:
            List of (name, path, modified_date) tuples.
        """
        sessions = []
        for session_dir in self.sessions_dir.iterdir():
            if session_dir.is_dir():
                session_file = session_dir / self.SESSION_FILE
                if session_file.exists():
                    try:
                        with open(session_file, 'r', encoding='utf-8') as f:
                            data = json.load(f)
                        name = data.get('name', session_dir.name)
                        modified = data.get('modified', '')
                        sessions.append((name, session_dir, modified))
                    except Exception:
                        continue
        
        # Sort by modified date, newest first
        sessions.sort(key=lambda x: x[2], reverse=True)
        return sessions

    def delete_session(self, session_path: Path) -> None:
        """Delete a session.

        Args:
            session_path: Path to the session folder.
        """
        if session_path.exists() and session_path.is_dir():
            shutil.rmtree(session_path)
            logger.info(f"Deleted session: {session_path}")
