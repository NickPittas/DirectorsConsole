"""Configuration for templates_system."""

from pathlib import Path


class Config:
    """Configuration holder for templates system."""
    
    # ComfyUI connection settings
    COMFYUI_HOST: str = "127.0.0.1"
    COMFYUI_PORT: int = 8188
    COMFYUI_TIMEOUT: int = 300  # 5 minutes
    
    # Paths
    TEMPLATES_DIR: Path = Path(__file__).parent / "templates"
    USER_TEMPLATES_DIR: Path = Path(__file__).parent / "user_templates"
    DATA_DIR: Path = Path(__file__).parent / "data"
    
    # Export settings
    EXPORT_DIR: Path = Path.home() / "ComfyUI" / "exports"
    
    @classmethod
    def get_comfyui_url(cls) -> str:
        """Get the full ComfyUI URL."""
        return f"http://{cls.COMFYUI_HOST}:{cls.COMFYUI_PORT}"
