"""Server entry point for the Director's Console Orchestrator API.

This module provides the command-line entry point for running the FastAPI server.
It sets up logging, loads configuration, and starts the Uvicorn ASGI server.

Usage:
    python -m orchestrator.server
    
    Or with custom host/port:
    python -m orchestrator.server --host 0.0.0.0 --port 9800
    
Environment:
    LOG_LEVEL: Set logging level (DEBUG, INFO, WARNING, ERROR)
    ORCHESTRATOR_CONFIG: Path to config.yaml (default: config.yaml)
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

import uvicorn

from orchestrator.utils.config import load_config
from orchestrator.utils.logging_config import setup_logging


logger = logging.getLogger(__name__)


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments.
    
    Returns:
        Parsed arguments namespace
    """
    parser = argparse.ArgumentParser(
        description="Director's Console Orchestrator API Server",
    )
    parser.add_argument(
        "--host",
        type=str,
        default="127.0.0.1",
        help="Host to bind to (default: 127.0.0.1)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=9800,
        help="Port to bind to (default: 9800)",
    )
    parser.add_argument(
        "--reload",
        action="store_true",
        help="Enable auto-reload for development",
    )
    parser.add_argument(
        "--log-level",
        type=str,
        default="info",
        choices=["debug", "info", "warning", "error"],
        help="Logging level (default: info)",
    )
    parser.add_argument(
        "--config",
        type=Path,
        default=Path("config.yaml"),
        help="Path to config.yaml (default: config.yaml)",
    )
    return parser.parse_args()


def main() -> int:
    """Main entry point for the API server.
    
    Returns:
        Exit code (0 for success)
    """
    args = parse_args()
    
    # Load configuration
    config_path = args.config
    if not config_path.exists():
        print(f"Config file not found: {config_path}", file=sys.stderr)
        print("Falling back to config.example.yaml", file=sys.stderr)
        config_path = Path("config.example.yaml")
        if not config_path.exists():
            print("No config file found. Exiting.", file=sys.stderr)
            return 1
    
    config = load_config(config_path)
    
    # Setup logging
    setup_logging(config.log_dir)
    
    # Set log level from args
    log_level = getattr(logging, args.log_level.upper())
    logging.getLogger().setLevel(log_level)
    
    logger.info("=" * 60)
    logger.info("Director's Console Orchestrator API Server")
    logger.info("=" * 60)
    logger.info(f"Host: {args.host}")
    logger.info(f"Port: {args.port}")
    logger.info(f"Log Level: {args.log_level.upper()}")
    logger.info(f"Config: {config_path}")
    logger.info(f"Auto-reload: {args.reload}")
    logger.info("=" * 60)
    
    # Start Uvicorn server
    try:
        uvicorn.run(
            "orchestrator.api:app",
            host=args.host,
            port=args.port,
            reload=args.reload,
            log_level=args.log_level,
            access_log=True,
        )
    except KeyboardInterrupt:
        logger.info("Server stopped by user (Ctrl+C)")
        return 0
    except Exception as e:
        logger.error(f"Server error: {e}", exc_info=True)
        return 1
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
