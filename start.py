#!/usr/bin/env python3
"""
Director's Console - Unified Launcher

A robust Python launcher for all Director's Console services:
1. Orchestrator API (port 9820) - Job queue/render farm manager
2. CPE Backend (port 9800) - Cinema Prompt Engineering API
3. CPE Frontend (port 5173) - React UI

Features:
- Proper process management with cleanup on exit
- Signal handling for graceful shutdown (Ctrl+C, terminal close, etc.)
- Windows-specific socket cleanup to prevent orphaned ports
- Automatic port cleanup before starting
- Health checks with colored output
- Cross-platform compatible (Windows/Mac/Linux)
- Environment setup and dependency verification
- Auto-install missing packages
- PID lock file to prevent duplicate instances

Usage:
    python start.py                    # Start all services
    python start.py --setup            # Setup/verify all environments
    python start.py --no-orchestrator  # Skip orchestrator
    python start.py --no-frontend      # Backend only
    python start.py --no-browser       # Don't open browser
    python start.py --help             # Show help

Author: Director's Console Team
Date: February 2026
"""

from __future__ import annotations

import argparse
import atexit
import os
import platform
import shutil
import signal
import socket
import subprocess
import sys
import time
import webbrowser
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

# === PID LOCK FILE ===
# Prevent duplicate start.py instances from running
LOCK_FILE = Path(__file__).parent / ".start.pid"


def check_and_create_lock():
    """Check for existing start.py instance and create lock file."""
    current_pid = os.getpid()

    if LOCK_FILE.exists():
        try:
            old_pid = int(LOCK_FILE.read_text().strip())
            # Check if old process is still running
            if sys.platform == "win32":
                result = subprocess.run(
                    ["tasklist", "/FI", f"PID eq {old_pid}"],
                    capture_output=True,
                    text=True,
                )
                if str(old_pid) in result.stdout and "python" in result.stdout.lower():
                    print(
                        f"\033[91mERROR: start.py is already running (PID {old_pid})\033[0m"
                    )
                    print(f"\033[93mKill it first: taskkill /F /PID {old_pid}\033[0m")
                    sys.exit(1)
            else:
                # Unix: check if process exists
                try:
                    os.kill(old_pid, 0)
                    print(
                        f"\033[91mERROR: start.py is already running (PID {old_pid})\033[0m"
                    )
                    print(f"\033[93mKill it first: kill {old_pid}\033[0m")
                    sys.exit(1)
                except OSError:
                    pass  # Process doesn't exist, lock is stale
        except (ValueError, FileNotFoundError):
            pass  # Invalid or missing lock file, proceed

    # Create/update lock file with current PID
    LOCK_FILE.write_text(str(current_pid))


def remove_lock():
    """Remove lock file on exit."""
    try:
        if LOCK_FILE.exists():
            LOCK_FILE.unlink()
    except Exception:
        pass


# ANSI color codes
class Colors:
    RESET = "\033[0m"
    RED = "\033[91m"
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    BLUE = "\033[94m"
    MAGENTA = "\033[95m"
    CYAN = "\033[96m"
    GRAY = "\033[90m"
    WHITE = "\033[97m"
    BOLD = "\033[1m"


def supports_color() -> bool:
    """Check if the terminal supports color output."""
    if os.environ.get("NO_COLOR"):
        return False
    if os.environ.get("FORCE_COLOR"):
        return True
    if platform.system() == "Windows":
        # Enable ANSI on Windows
        os.system("")
        return True
    return hasattr(sys.stdout, "isatty") and sys.stdout.isatty()


USE_COLOR = supports_color()


def color(text: str, color_code: str) -> str:
    """Apply color to text if supported."""
    if USE_COLOR:
        return f"{color_code}{text}{Colors.RESET}"
    return text


def log(
    prefix: str,
    message: str,
    prefix_color: str = Colors.WHITE,
    msg_color: str = Colors.GRAY,
) -> None:
    """Print a prefixed log message."""
    print(f"{color(f'[{prefix}]', prefix_color)} {color(message, msg_color)}")


def log_header(title: str) -> None:
    """Print a section header."""
    print()
    print(color("=" * 50, Colors.CYAN))
    print(color(f"  {title}", Colors.CYAN))
    print(color("=" * 50, Colors.CYAN))
    print()


def print_banner() -> None:
    """Print the Director's Console banner."""
    banner = r"""
  ____  _               _             _        
 |  _ \(_)_ __ ___  ___| |_ ___  _ __( )___    
 | | | | | '__/ _ \/ __| __/ _ \| '__|// __|   
 | |_| | | | |  __/ (__| || (_) | |    \__ \   
 |____/|_|_|  \___|\___|\_/\___/|_|    |___/   
        ____                      _            
       / ___|___  _ __  ___  ___ | | ___       
      | |   / _ \| '_ \/ __|/ _ \| |/ _ \      
      | |__| (_) | | | \__ \ (_) | |  __/      
       \____\___/|_| |_|___/\___/|_|\___|      
"""
    for i, line in enumerate(banner.strip().split("\n")):
        if i < 5:
            print(color(line, Colors.MAGENTA))
        else:
            print(color(line, Colors.CYAN))
    print()
    print(color("  AI VFX Production Pipeline - Project Eliot", Colors.GRAY))
    print()


@dataclass
class EnvironmentConfig:
    """Configuration for a Python environment."""

    name: str
    display_name: str
    working_dir: Path
    venv_path: Path
    requirements_file: Path
    required_imports: list[str] = field(default_factory=list)
    prefix_color: str = Colors.CYAN


@dataclass
class ServiceConfig:
    """Configuration for a service."""

    name: str
    prefix: str
    port: int
    working_dir: Path
    venv_path: Path
    command: list[str]
    health_endpoint: str
    prefix_color: str = Colors.CYAN


class EnvironmentManager:
    """Manages Python virtual environments and dependencies."""

    def __init__(self, script_dir: Path):
        self.script_dir = script_dir
        self.environments: list[EnvironmentConfig] = []
        self.uv_path = shutil.which("uv")  # Check if uv is available
        self._setup_environments()

    def _setup_environments(self) -> None:
        """Define all required environments."""
        # Orchestrator environment
        orch_dir = self.script_dir / "Orchestrator"
        self.environments.append(
            EnvironmentConfig(
                name="orchestrator",
                display_name="Orchestrator",
                working_dir=orch_dir,
                venv_path=orch_dir / ".venv",
                requirements_file=orch_dir / "requirements.txt",
                required_imports=[
                    "fastapi",
                    "uvicorn",
                    "pydantic",
                    "httpx",
                    "loguru",
                    "PIL",
                ],
                prefix_color=Colors.CYAN,
            )
        )

        # CPE Backend environment
        cpe_dir = self.script_dir / "CinemaPromptEngineering"
        self.environments.append(
            EnvironmentConfig(
                name="cpe",
                display_name="CPE Backend",
                working_dir=cpe_dir,
                venv_path=cpe_dir / "venv",
                requirements_file=cpe_dir / "requirements.txt",
                required_imports=[
                    "fastapi",
                    "uvicorn",
                    "pydantic",
                    "httpx",
                    "loguru",
                    "PIL",
                    "cryptography",
                ],
                prefix_color=Colors.BLUE,
            )
        )

    def get_python_exe(self, venv_path: Path) -> Path:
        """Get the Python executable path for a venv."""
        if platform.system() == "Windows":
            return venv_path / "Scripts" / "python.exe"
        return venv_path / "bin" / "python"

    def is_uv_venv(self, venv_path: Path) -> bool:
        """Check if a venv was created by uv (lacks pip)."""
        python_exe = self.get_python_exe(venv_path)
        if not python_exe.exists():
            return False

        # Check if pip module exists
        try:
            result = subprocess.run(
                [str(python_exe), "-c", "import pip"], capture_output=True, timeout=10
            )
            return result.returncode != 0  # If pip import fails, it's a uv venv
        except:
            return True  # Assume uv venv if we can't check

    def venv_exists(self, env: EnvironmentConfig) -> bool:
        """Check if a virtual environment exists."""
        python_exe = self.get_python_exe(env.venv_path)
        return python_exe.exists()

    def create_venv(self, env: EnvironmentConfig) -> bool:
        """Create a virtual environment."""
        log(
            env.name.upper(),
            f"Creating virtual environment at {env.venv_path}...",
            env.prefix_color,
        )

        try:
            # Use system Python to create venv
            result = subprocess.run(
                [sys.executable, "-m", "venv", str(env.venv_path)],
                capture_output=True,
                text=True,
                timeout=120,
            )

            if result.returncode != 0:
                log(
                    env.name.upper(),
                    f"Failed to create venv: {result.stderr}",
                    Colors.RED,
                )
                return False

            log(env.name.upper(), "Virtual environment created", Colors.GREEN)
            return True

        except Exception as e:
            log(env.name.upper(), f"Error creating venv: {e}", Colors.RED)
            return False

    def install_requirements(self, env: EnvironmentConfig) -> bool:
        """Install requirements from requirements.txt."""
        if not env.requirements_file.exists():
            log(
                env.name.upper(),
                f"Requirements file not found: {env.requirements_file}",
                Colors.YELLOW,
            )
            return True  # Not an error, just no requirements

        python_exe = self.get_python_exe(env.venv_path)
        use_uv = self.uv_path and self.is_uv_venv(env.venv_path)

        log(
            env.name.upper(),
            "Installing dependencies from requirements.txt...",
            env.prefix_color,
        )

        try:
            if use_uv:
                # Use uv pip for uv-managed venvs
                log(
                    env.name.upper(),
                    "Using uv pip (uv-managed venv detected)",
                    Colors.GRAY,
                )
                result = subprocess.run(
                    [
                        self.uv_path,
                        "pip",
                        "install",
                        "-r",
                        str(env.requirements_file),
                        "--python",
                        str(python_exe),
                    ],
                    capture_output=True,
                    text=True,
                    timeout=600,
                )
            else:
                # Standard pip
                # Upgrade pip first
                subprocess.run(
                    [str(python_exe), "-m", "pip", "install", "--upgrade", "pip"],
                    capture_output=True,
                    timeout=120,
                )

                # Install requirements
                result = subprocess.run(
                    [
                        str(python_exe),
                        "-m",
                        "pip",
                        "install",
                        "-r",
                        str(env.requirements_file),
                    ],
                    capture_output=True,
                    text=True,
                    timeout=600,
                )

            if result.returncode != 0:
                log(env.name.upper(), f"Failed to install requirements:", Colors.RED)
                # Show last few lines of error
                error_lines = (
                    (result.stderr or result.stdout or "").strip().split("\n")[-5:]
                )
                for line in error_lines:
                    if line.strip():
                        log(env.name.upper(), f"  {line}", Colors.RED)
                return False

            log(env.name.upper(), "Dependencies installed successfully", Colors.GREEN)
            return True

        except subprocess.TimeoutExpired:
            log(env.name.upper(), "Installation timed out", Colors.RED)
            return False
        except Exception as e:
            log(env.name.upper(), f"Error installing requirements: {e}", Colors.RED)
            return False

    def verify_imports(self, env: EnvironmentConfig) -> tuple[bool, list[str]]:
        """Verify that required imports work. Returns (success, failed_imports)."""
        python_exe = self.get_python_exe(env.venv_path)
        failed_imports = []

        for module in env.required_imports:
            try:
                result = subprocess.run(
                    [str(python_exe), "-c", f"import {module}"],
                    capture_output=True,
                    text=True,
                    timeout=10,
                )

                if result.returncode != 0:
                    failed_imports.append(module)

            except Exception:
                failed_imports.append(module)

        return len(failed_imports) == 0, failed_imports

    def install_missing_packages(
        self, env: EnvironmentConfig, packages: list[str]
    ) -> bool:
        """Install specific missing packages."""
        python_exe = self.get_python_exe(env.venv_path)
        use_uv = self.uv_path and self.is_uv_venv(env.venv_path)

        # Map import names to package names
        package_map = {
            "PIL": "Pillow",
            "cv2": "opencv-python",
            "yaml": "PyYAML",
        }

        packages_to_install = [package_map.get(p, p) for p in packages]

        log(
            env.name.upper(),
            f"Installing missing packages: {', '.join(packages_to_install)}",
            env.prefix_color,
        )

        try:
            if use_uv:
                # Use uv pip for uv-managed venvs
                result = subprocess.run(
                    [self.uv_path, "pip", "install", "--python", str(python_exe)]
                    + packages_to_install,
                    capture_output=True,
                    text=True,
                    timeout=300,
                )
            else:
                # Use python -m pip for standard venvs
                result = subprocess.run(
                    [str(python_exe), "-m", "pip", "install"] + packages_to_install,
                    capture_output=True,
                    text=True,
                    timeout=300,
                )

            if result.returncode != 0:
                error_msg = result.stderr or result.stdout or "Unknown error"
                log(
                    env.name.upper(),
                    f"Failed to install packages: {error_msg}",
                    Colors.RED,
                )
                return False

            log(env.name.upper(), "Packages installed successfully", Colors.GREEN)
            return True

        except Exception as e:
            log(env.name.upper(), f"Error installing packages: {e}", Colors.RED)
            return False

    def setup_environment(
        self, env: EnvironmentConfig, force_reinstall: bool = False
    ) -> bool:
        """Set up a complete environment (create venv, install deps, verify)."""
        log_header(f"Setting up {env.display_name}")

        # Check if venv exists
        if not self.venv_exists(env):
            log(env.name.upper(), "Virtual environment not found", Colors.YELLOW)
            if not self.create_venv(env):
                return False
            if not self.install_requirements(env):
                return False
        elif force_reinstall:
            log(env.name.upper(), "Force reinstalling requirements...", Colors.YELLOW)
            if not self.install_requirements(env):
                return False
        else:
            log(env.name.upper(), "Virtual environment exists", Colors.GREEN)

        # Verify imports
        log(env.name.upper(), "Verifying dependencies...", env.prefix_color)
        success, failed = self.verify_imports(env)

        if not success:
            log(
                env.name.upper(), f"Missing imports: {', '.join(failed)}", Colors.YELLOW
            )

            # Try to install missing packages
            if not self.install_missing_packages(env, failed):
                return False

            # Verify again
            success, failed = self.verify_imports(env)
            if not success:
                log(
                    env.name.upper(),
                    f"Still missing after install: {', '.join(failed)}",
                    Colors.RED,
                )
                log(
                    env.name.upper(),
                    "Try: --setup --force to reinstall all dependencies",
                    Colors.YELLOW,
                )
                return False

        log(env.name.upper(), "All dependencies verified", Colors.GREEN)
        return True

    def verify_environment(self, env: EnvironmentConfig, auto_fix: bool = True) -> bool:
        """Quick verification of an environment, optionally auto-fixing issues."""
        if not self.venv_exists(env):
            log(env.name.upper(), "Virtual environment not found", Colors.RED)
            if auto_fix:
                return self.setup_environment(env)
            return False

        # Verify imports
        success, failed = self.verify_imports(env)

        if not success:
            log(env.name.upper(), f"Missing: {', '.join(failed)}", Colors.YELLOW)
            if auto_fix:
                if self.install_missing_packages(env, failed):
                    success, failed = self.verify_imports(env)
                    if success:
                        log(
                            env.name.upper(), "Fixed missing dependencies", Colors.GREEN
                        )
                        return True
            log(env.name.upper(), "Environment has missing dependencies", Colors.RED)
            return False

        log(env.name.upper(), "Environment OK", Colors.GREEN)
        return True

    def setup_all(self, force_reinstall: bool = False) -> bool:
        """Set up all environments."""
        log_header("Environment Setup")

        all_success = True
        for env in self.environments:
            if not self.setup_environment(env, force_reinstall):
                all_success = False

        return all_success

    def verify_all(self, auto_fix: bool = True) -> bool:
        """Verify all environments, optionally auto-fixing issues."""
        log_header("Verifying Environments")

        all_success = True
        for env in self.environments:
            if not self.verify_environment(env, auto_fix):
                all_success = False

        return all_success


class ProcessManager:
    """Manages subprocess lifecycle with proper cleanup."""

    def __init__(self):
        self.processes: dict[str, subprocess.Popen] = {}
        self.is_shutting_down = False
        self._register_signal_handlers()
        atexit.register(self.cleanup_all)

    def _register_signal_handlers(self) -> None:
        """Register signal handlers for graceful shutdown."""
        # Handle Ctrl+C
        signal.signal(signal.SIGINT, self._signal_handler)

        # Handle termination
        signal.signal(signal.SIGTERM, self._signal_handler)

        # Windows-specific: Handle console close events
        if platform.system() == "Windows":
            try:
                import win32api
                import win32con

                win32api.SetConsoleCtrlHandler(self._windows_ctrl_handler, True)
            except ImportError:
                # pywin32 not installed, use basic handling
                signal.signal(signal.SIGBREAK, self._signal_handler)

    def _signal_handler(self, signum: int, frame) -> None:
        """Handle termination signals."""
        if not self.is_shutting_down:
            print()
            log(
                "SHUTDOWN",
                "Received termination signal, stopping services...",
                Colors.YELLOW,
            )
            self.cleanup_all()
            sys.exit(0)

    def _windows_ctrl_handler(self, ctrl_type: int) -> bool:
        """Handle Windows console control events."""
        # CTRL_C_EVENT = 0, CTRL_BREAK_EVENT = 1, CTRL_CLOSE_EVENT = 2
        # CTRL_LOGOFF_EVENT = 5, CTRL_SHUTDOWN_EVENT = 6
        if ctrl_type in (0, 1, 2, 5, 6):
            self.cleanup_all()
            return True
        return False

    def start_process(self, config: ServiceConfig) -> Optional[subprocess.Popen]:
        """Start a service process."""
        try:
            # Determine the Python executable
            if platform.system() == "Windows":
                python_exe = config.venv_path / "Scripts" / "python.exe"
            else:
                python_exe = config.venv_path / "bin" / "python"

            if not python_exe.exists():
                log(config.prefix, f"Python not found at {python_exe}", Colors.RED)
                return None

            # Build the full command
            full_command = [str(python_exe)] + config.command

            # Set up environment
            env = os.environ.copy()
            env["PYTHONPATH"] = str(config.working_dir)
            env["PYTHONUNBUFFERED"] = "1"

            # Start the process
            # On Windows, CREATE_NO_WINDOW + CREATE_NEW_PROCESS_GROUP gives isolation without visible windows
            kwargs = {
                "cwd": config.working_dir,
                "env": env,
                "bufsize": 1,
                "universal_newlines": True,
            }

            if platform.system() == "Windows":
                # CREATE_NO_WINDOW (0x09800000) runs process without a console window
                # CREATE_NEW_PROCESS_GROUP (0x200) for signal isolation
                kwargs["creationflags"] = (
                    subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP
                )
            else:
                kwargs["start_new_session"] = True
                kwargs["stdout"] = subprocess.PIPE
                kwargs["stderr"] = subprocess.STDOUT

            process = subprocess.Popen(full_command, **kwargs)
            self.processes[config.name] = process

            # Debug: Log the exact process that was spawned
            log(
                config.prefix,
                f"Spawned PID {process.pid}: {' '.join(full_command[:4])}...",
                Colors.CYAN,
            )

            return process

        except Exception as e:
            log(config.prefix, f"Failed to start: {e}", Colors.RED)
            return None

    def stop_process(self, name: str, timeout: int = 5) -> None:
        """Stop a specific process gracefully."""
        if name not in self.processes:
            return

        process = self.processes[name]
        if process.poll() is not None:
            # Already terminated
            del self.processes[name]
            return

        log("CLEANUP", f"Stopping {name}...", Colors.YELLOW)

        try:
            if platform.system() == "Windows":
                # On Windows, use taskkill for reliable termination
                # First try graceful termination
                subprocess.run(
                    ["taskkill", "/PID", str(process.pid), "/T"],
                    capture_output=True,
                    timeout=2,
                )
                time.sleep(0.5)

                # If still running, force kill
                if process.poll() is None:
                    subprocess.run(
                        ["taskkill", "/F", "/PID", str(process.pid), "/T"],
                        capture_output=True,
                        timeout=2,
                    )
            else:
                # Unix: send SIGTERM first
                process.terminate()
                try:
                    process.wait(timeout=timeout)
                except subprocess.TimeoutExpired:
                    # Force kill if graceful shutdown fails
                    process.kill()
                    process.wait(timeout=2)

        except Exception as e:
            log("CLEANUP", f"Error stopping {name}: {e}", Colors.YELLOW)
            try:
                process.kill()
            except:
                pass

        finally:
            if name in self.processes:
                del self.processes[name]

    def cleanup_all(self) -> None:
        """Stop all managed processes."""
        if self.is_shutting_down:
            return

        self.is_shutting_down = True
        log("SHUTDOWN", "Stopping all services...", Colors.YELLOW)

        # Stop in reverse order (frontend, backend, orchestrator)
        names = list(self.processes.keys())[::-1]
        for name in names:
            self.stop_process(name)

        # Windows: extra cleanup for orphaned processes
        if platform.system() == "Windows":
            self._windows_cleanup_orphans()

        log("SHUTDOWN", "All services stopped", Colors.GREEN)

    def _windows_cleanup_orphans(self) -> None:
        """Clean up any orphaned Python processes on Windows."""
        try:
            # Find any uvicorn processes that might be orphaned
            result = subprocess.run(
                [
                    "wmic",
                    "process",
                    "where",
                    "commandline like '%uvicorn%'",
                    "get",
                    "processid",
                ],
                capture_output=True,
                text=True,
                timeout=5,
            )

            for line in result.stdout.strip().split("\n")[1:]:
                pid = line.strip()
                if pid and pid.isdigit():
                    try:
                        subprocess.run(
                            ["taskkill", "/F", "/PID", pid],
                            capture_output=True,
                            timeout=2,
                        )
                    except:
                        pass
        except:
            pass


def is_port_in_use(port: int) -> bool:
    """Check if a port is currently in use."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("localhost", port)) == 0


def kill_orphaned_processes() -> None:
    """Kill any orphaned DirectorsConsole processes before starting fresh."""
    if platform.system() != "Windows":
        return

    if not shutil.which("wmic"):
        log("CLEANUP", "Skipping orphan cleanup (wmic not available)", Colors.YELLOW)
        return

    log("CLEANUP", "Checking for orphaned processes...", Colors.YELLOW)

    try:
        # Find all python processes with DirectorsConsole in the command line
        result = subprocess.run(
            [
                "wmic",
                "process",
                "where",
                "commandline like '%DirectorsConsole%'",
                "get",
                "processid,commandline",
            ],
            capture_output=True,
            text=True,
            timeout=10,
        )

        current_pid = os.getpid()
        killed = 0

        # Get parent PID to avoid killing our parent process
        parent_pid = None
        try:
            parent_result = subprocess.run(
                [
                    "wmic",
                    "process",
                    "where",
                    f"processid={current_pid}",
                    "get",
                    "parentprocessid",
                ],
                capture_output=True,
                text=True,
                timeout=5,
            )
            for pline in parent_result.stdout.strip().split("\n")[1:]:
                pline = pline.strip()
                if pline.isdigit():
                    parent_pid = int(pline)
                    break
        except:
            pass

        log(
            "CLEANUP",
            f"Current PID: {current_pid}, Parent PID: {parent_pid}",
            Colors.GRAY,
        )

        for line in result.stdout.strip().split("\n")[1:]:
            line = line.strip()
            if not line:
                continue

            # Extract PID (last number in the line)
            parts = line.split()
            if not parts:
                continue

            pid = parts[-1]
            if not pid.isdigit():
                continue

            pid_int = int(pid)

            # Don't kill ourselves or our parent
            if pid_int == current_pid:
                log("CLEANUP", f"Skipping self (PID {pid_int})", Colors.GRAY)
                continue
            if parent_pid and pid_int == parent_pid:
                log("CLEANUP", f"Skipping parent (PID {pid_int})", Colors.GRAY)
                continue

            # Kill orphaned uvicorn or start.py processes
            if "uvicorn" in line or "start.py" in line:
                log("CLEANUP", f"Killing orphan PID {pid_int}", Colors.YELLOW)
                try:
                    subprocess.run(
                        ["taskkill", "/F", "/PID", pid], capture_output=True, timeout=5
                    )
                    killed += 1
                except:
                    pass

        if killed > 0:
            log("CLEANUP", f"Killed {killed} orphaned process(es)", Colors.GREEN)
            # Wait for sockets to be released
            time.sleep(2)
        else:
            log("CLEANUP", "No orphaned processes found", Colors.GREEN)

    except Exception as e:
        log("CLEANUP", f"Error checking for orphaned processes: {e}", Colors.YELLOW)


def kill_process_on_port(port: int) -> bool:
    """Kill any process using the specified port."""
    if platform.system() == "Windows":
        try:
            # Find process using the port
            result = subprocess.run(
                ["netstat", "-ano"], capture_output=True, text=True, timeout=10
            )

            pids_killed = set()
            for line in result.stdout.split("\n"):
                if f":{port}" in line and "LISTEN" in line:
                    parts = line.split()
                    if parts:
                        pid = parts[-1]
                        if pid.isdigit() and pid != "0" and pid not in pids_killed:
                            log(
                                "CLEANUP",
                                f"Killing process {pid} on port {port}",
                                Colors.YELLOW,
                            )
                            subprocess.run(
                                ["taskkill", "/F", "/PID", pid],
                                capture_output=True,
                                timeout=5,
                            )
                            pids_killed.add(pid)

            if pids_killed:
                # Wait for sockets to be released
                time.sleep(2)
                return True

        except Exception as e:
            log("CLEANUP", f"Error cleaning port {port}: {e}", Colors.YELLOW)
    else:
        # Unix: use lsof and kill
        try:
            result = subprocess.run(
                ["lsof", "-ti", f":{port}"], capture_output=True, text=True, timeout=5
            )

            pids = result.stdout.strip().split("\n")
            for pid in pids:
                if pid.isdigit():
                    log(
                        "CLEANUP",
                        f"Killing process {pid} on port {port}",
                        Colors.YELLOW,
                    )
                    subprocess.run(["kill", "-9", pid], capture_output=True, timeout=2)

            if pids and pids[0]:
                time.sleep(1)
                return True

        except Exception as e:
            pass

    return False


def wait_for_health(url: str, timeout: int = 30, prefix: str = "WAIT") -> bool:
    """Wait for a health endpoint to respond."""
    import urllib.request
    import urllib.error

    start_time = time.time()
    dots_printed = 0

    while time.time() - start_time < timeout:
        try:
            req = urllib.request.Request(url, method="GET")
            with urllib.request.urlopen(req, timeout=2) as response:
                if response.status == 200:
                    print()  # Newline after dots
                    return True
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError):
            pass

        # Print progress dot
        print(".", end="", flush=True)
        dots_printed += 1
        time.sleep(1)

    if dots_printed > 0:
        print()  # Newline after dots
    return False


def stream_output(
    process: subprocess.Popen,
    prefix: str,
    prefix_color: str,
    stop_event: Optional[callable] = None,
) -> None:
    """Stream process output with prefix."""
    try:
        for line in process.stdout:
            line = line.rstrip()
            if line:
                log(prefix, line, prefix_color, Colors.GRAY)
            if stop_event and stop_event():
                break
    except:
        pass


def check_node() -> bool:
    """Check if Node.js is available."""
    node_path = shutil.which("node")
    if not node_path:
        log(
            "UI",
            "Node.js not found! Please install from https://nodejs.org",
            Colors.RED,
        )
        return False

    try:
        result = subprocess.run(
            ["node", "--version"], capture_output=True, text=True, timeout=5
        )
        log("UI", f"Node.js {result.stdout.strip()}", Colors.GREEN)
        return True
    except:
        return False


def check_npm_modules(frontend_dir: Path) -> bool:
    """Check if npm modules are installed, offer to install if not."""
    node_modules = frontend_dir / "node_modules"
    if node_modules.exists():
        return True

    log("UI", "node_modules not found", Colors.YELLOW)

    # Ask user if they want to install
    print()
    response = (
        input(color("  Install npm dependencies now? [Y/n]: ", Colors.WHITE))
        .strip()
        .lower()
    )

    if response in ("", "y", "yes"):
        log("UI", "Running npm install...", Colors.CYAN)
        npm_cmd = "npm.cmd" if platform.system() == "Windows" else "npm"

        try:
            result = subprocess.run([npm_cmd, "install"], cwd=frontend_dir, timeout=300)

            if result.returncode == 0:
                log("UI", "npm install completed", Colors.GREEN)
                return True
            else:
                log("UI", "npm install failed", Colors.RED)
                return False

        except Exception as e:
            log("UI", f"npm install error: {e}", Colors.RED)
            return False

    return False


def install_npm_dependencies(frontend_dir: Path) -> bool:
    """Install/update npm dependencies (always runs npm install for setup mode)."""
    if not frontend_dir.exists():
        log("UI", f"Frontend directory not found: {frontend_dir}", Colors.RED)
        return False

    package_json = frontend_dir / "package.json"
    if not package_json.exists():
        log("UI", "package.json not found", Colors.RED)
        return False

    log("UI", "Installing/updating npm dependencies...", Colors.CYAN)
    npm_cmd = "npm.cmd" if platform.system() == "Windows" else "npm"

    try:
        result = subprocess.run([npm_cmd, "install"], cwd=frontend_dir, timeout=300)

        if result.returncode == 0:
            log("UI", "npm dependencies up to date", Colors.GREEN)
            return True
        else:
            log("UI", "npm install failed", Colors.RED)
            return False

    except subprocess.TimeoutExpired:
        log("UI", "npm install timed out", Colors.RED)
        return False
    except Exception as e:
        log("UI", f"npm install error: {e}", Colors.RED)
        return False


def main():
    # Check for duplicate instance and create lock file
    check_and_create_lock()
    atexit.register(remove_lock)

    parser = argparse.ArgumentParser(
        description="Director's Console - Unified Launcher",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    python start.py                    # Start all services
    python start.py --setup            # Setup/verify all environments
    python start.py --setup --force    # Force reinstall all dependencies
    python start.py --no-orchestrator  # Skip orchestrator
    python start.py --no-frontend      # Backend only  
    python start.py --no-browser       # Don't open browser
""",
    )
    parser.add_argument(
        "--orchestrator-port",
        type=int,
        default=9820,
        help="Orchestrator API port (default: 9820)",
    )
    parser.add_argument(
        "--backend-port",
        type=int,
        default=9800,
        help="CPE Backend port (default: 9800)",
    )
    parser.add_argument(
        "--frontend-port",
        type=int,
        default=5173,
        help="CPE Frontend port (default: 5173)",
    )
    parser.add_argument(
        "--no-orchestrator", action="store_true", help="Skip starting Orchestrator"
    )
    parser.add_argument(
        "--no-frontend",
        action="store_true",
        help="Skip starting Frontend (backend only)",
    )
    parser.add_argument(
        "--no-browser", action="store_true", help="Don't open browser automatically"
    )
    parser.add_argument(
        "--setup",
        action="store_true",
        help="Setup/verify all environments before starting",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Force reinstall all dependencies (use with --setup)",
    )
    parser.add_argument(
        "--skip-verify",
        action="store_true",
        help="Skip environment verification (faster startup)",
    )

    args = parser.parse_args()

    # Print banner
    print_banner()

    # Get script directory
    script_dir = Path(__file__).parent.resolve()

    # Initialize environment manager
    env_manager = EnvironmentManager(script_dir)

    # --- Setup Mode ---
    if args.setup:
        if not env_manager.setup_all(force_reinstall=args.force):
            log("SETUP", "Some environments failed to set up", Colors.RED)
            sys.exit(1)

        # Also check frontend
        log_header("Checking Frontend")
        if check_node():
            frontend_dir = script_dir / "CinemaPromptEngineering" / "frontend"
            install_npm_dependencies(frontend_dir)

        log_header("Setup Complete!")
        print(color("  All environments are ready.", Colors.GREEN))
        print(color("  Run 'python start.py' to start all services.", Colors.GRAY))
        print()
        return

    # --- Verify Environments ---
    if not args.skip_verify:
        if not env_manager.verify_all(auto_fix=True):
            log("ERROR", "Environment verification failed", Colors.RED)
            log("ERROR", "Run 'python start.py --setup' to fix", Colors.YELLOW)
            sys.exit(1)

    # Initialize process manager
    pm = ProcessManager()

    # --- Kill Orphaned Processes ---
    kill_orphaned_processes()

    # --- Prepare Ports ---
    log_header("Preparing Ports")

    ports_to_check = []
    if not args.no_orchestrator:
        ports_to_check.append(args.orchestrator_port)
    ports_to_check.append(args.backend_port)
    if not args.no_frontend:
        ports_to_check.append(args.frontend_port)

    for port in ports_to_check:
        if is_port_in_use(port):
            log(
                "CLEANUP",
                f"Port {port} is in use, attempting to free...",
                Colors.YELLOW,
            )
            kill_process_on_port(port)

            # Verify it's free now
            if is_port_in_use(port):
                log(
                    "ERROR",
                    f"Could not free port {port}. Please kill the process manually.",
                    Colors.RED,
                )
                sys.exit(1)

    log("PORTS", f"Ports {', '.join(map(str, ports_to_check))} ready", Colors.GREEN)

    # --- Start Orchestrator ---
    if not args.no_orchestrator:
        log_header("Starting Orchestrator")

        orch_dir = script_dir / "Orchestrator"
        orch_venv = orch_dir / ".venv"

        log("ORCH", f"Starting on port {args.orchestrator_port}...", Colors.CYAN)

        orch_config = ServiceConfig(
            name="orchestrator",
            prefix="ORCH",
            port=args.orchestrator_port,
            working_dir=orch_dir,
            venv_path=orch_venv,
            command=[
                "-m",
                "uvicorn",
                "orchestrator.api:app",
                "--host",
                "0.0.0.0",
                "--port",
                str(args.orchestrator_port),
            ],
            health_endpoint=f"http://localhost:{args.orchestrator_port}/health",
            prefix_color=Colors.CYAN,
        )

        orch_process = pm.start_process(orch_config)
        if not orch_process:
            sys.exit(1)

        # Wait for startup and show output
        print("  Waiting for Orchestrator ", end="", flush=True)

        # Start streaming output in background
        import threading

        stop_streaming = threading.Event()
        output_thread = threading.Thread(
            target=stream_output,
            args=(orch_process, "ORCH", Colors.CYAN, stop_streaming.is_set),
            daemon=True,
        )
        output_thread.start()

        if wait_for_health(orch_config.health_endpoint, timeout=30, prefix="ORCH"):
            log(
                "ORCH",
                f"Ready at http://localhost:{args.orchestrator_port}",
                Colors.GREEN,
            )
        else:
            log("ORCH", "Failed to start within timeout", Colors.RED)
            pm.cleanup_all()
            sys.exit(1)

    # --- Start CPE Backend ---
    log_header("Starting CPE Backend")

    cpe_dir = script_dir / "CinemaPromptEngineering"
    cpe_venv = cpe_dir / "venv"

    log("CPE", f"Starting on port {args.backend_port}...", Colors.CYAN)

    cpe_config = ServiceConfig(
        name="cpe_backend",
        prefix="CPE",
        port=args.backend_port,
        working_dir=cpe_dir,
        venv_path=cpe_venv,
        command=[
            "-m",
            "uvicorn",
            "api.main:app",
            "--host",
            "0.0.0.0",
            "--port",
            str(args.backend_port),
            "--reload",  # Required for proper async behavior on Windows
        ],
        health_endpoint=f"http://localhost:{args.backend_port}/api/health",
        prefix_color=Colors.BLUE,
    )

    cpe_process = pm.start_process(cpe_config)
    if not cpe_process:
        pm.cleanup_all()
        sys.exit(1)

    print("  Waiting for CPE Backend ", end="", flush=True)

    if wait_for_health(cpe_config.health_endpoint, timeout=30, prefix="CPE"):
        log("CPE", f"Ready at http://localhost:{args.backend_port}", Colors.GREEN)
    else:
        log("CPE", "Failed to start within timeout", Colors.RED)
        pm.cleanup_all()
        sys.exit(1)

    # --- Start Frontend ---
    frontend_process = None
    if not args.no_frontend:
        log_header("Starting Frontend")

        if not check_node():
            log("UI", "Skipping frontend...", Colors.YELLOW)
        else:
            frontend_dir = cpe_dir / "frontend"

            # Check node_modules
            if not check_npm_modules(frontend_dir):
                log("UI", "Skipping frontend (no node_modules)", Colors.YELLOW)
            else:
                # Remove any stale .env.local files — frontend derives URLs dynamically
                env_file = frontend_dir / ".env.local"
                if env_file.exists():
                    env_file.unlink()

                log("UI", f"Starting on port {args.frontend_port}...", Colors.CYAN)

                # For frontend, we use npm directly
                npm_cmd = "npm.cmd" if platform.system() == "Windows" else "npm"

                env = os.environ.copy()
                env["PYTHONUNBUFFERED"] = "1"

                try:
                    kwargs = {
                        "cwd": frontend_dir,
                        "env": env,
                        "stdout": subprocess.PIPE,
                        "stderr": subprocess.STDOUT,
                        "bufsize": 1,
                        "universal_newlines": True,
                    }

                    if platform.system() == "Windows":
                        kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
                    else:
                        kwargs["start_new_session"] = True

                    frontend_process = subprocess.Popen(
                        [
                            npm_cmd,
                            "run",
                            "dev",
                            "--",
                            "--port",
                            str(args.frontend_port),
                            "--host",
                        ],
                        **kwargs,
                    )
                    pm.processes["frontend"] = frontend_process

                    # Wait for Vite to be ready
                    log("UI", "Waiting for Vite to compile...", Colors.YELLOW)
                    start_time = time.time()
                    vite_ready = False

                    while time.time() - start_time < 60:
                        if frontend_process.poll() is not None:
                            log(
                                "UI", "Frontend process exited unexpectedly", Colors.RED
                            )
                            break

                        # Check output for ready message
                        try:
                            line = frontend_process.stdout.readline()
                            if line:
                                line = line.strip()
                                if (
                                    "ready in" in line.lower()
                                    or f"localhost:{args.frontend_port}" in line
                                ):
                                    vite_ready = True
                                    log("UI", "Vite dev server ready!", Colors.GREEN)
                                    break
                                elif line:
                                    log("UI", line, Colors.CYAN, Colors.GRAY)
                        except:
                            pass

                        time.sleep(0.5)

                    if vite_ready:
                        log(
                            "UI",
                            f"Frontend ready at http://localhost:{args.frontend_port}",
                            Colors.GREEN,
                        )
                    else:
                        log("UI", "Vite startup timeout", Colors.YELLOW)

                except Exception as e:
                    log("UI", f"Failed to start frontend: {e}", Colors.RED)

    # --- Summary ---
    log_header("Director's Console Running!")

    print(color("  Services:", Colors.WHITE))
    if not args.no_orchestrator:
        print(
            f"    {color('Orchestrator:', Colors.GRAY)}  {color(f'http://localhost:{args.orchestrator_port}', Colors.CYAN)}"
        )
    print(
        f"    {color('CPE Backend:', Colors.GRAY)}   {color(f'http://localhost:{args.backend_port}', Colors.CYAN)}"
    )
    print(
        f"    {color('API Docs:', Colors.GRAY)}      {color(f'http://localhost:{args.backend_port}/docs', Colors.CYAN)}"
    )
    if not args.no_frontend and frontend_process:
        print(
            f"    {color('Frontend:', Colors.GRAY)}      {color(f'http://localhost:{args.frontend_port}', Colors.GREEN)}"
        )

    print()
    print(color("  Process IDs:", Colors.GRAY))
    for name, proc in pm.processes.items():
        print(f"    {color(f'{name}:', Colors.GRAY)} {proc.pid}")

    print()

    # Open browser
    if not args.no_browser and not args.no_frontend and frontend_process:
        time.sleep(2)
        log("BROWSER", f"Opening http://localhost:{args.frontend_port}", Colors.MAGENTA)
        webbrowser.open(f"http://localhost:{args.frontend_port}")

    print()
    print(color("  Press Ctrl+C to stop all services", Colors.GRAY))
    print()

    # --- Monitor loop ---
    try:
        while True:
            time.sleep(2)

            # Check if any process has died
            for name, proc in list(pm.processes.items()):
                if proc.poll() is not None:
                    log(
                        name.upper(),
                        f"Process exited with code {proc.returncode}",
                        Colors.RED,
                    )
                    # Read any remaining output
                    try:
                        remaining = proc.stdout.read()
                        if remaining:
                            for line in remaining.split("\n"):
                                if line.strip():
                                    log(
                                        name.upper(),
                                        line.strip(),
                                        Colors.RED,
                                        Colors.RED,
                                    )
                    except:
                        pass
                    del pm.processes[name]

            # If all critical processes are dead, exit
            if not pm.processes:
                log("ERROR", "All processes have stopped", Colors.RED)
                break

    except KeyboardInterrupt:
        print()
        log("SHUTDOWN", "Received Ctrl+C, stopping services...", Colors.YELLOW)
    finally:
        pm.cleanup_all()


if __name__ == "__main__":
    main()
