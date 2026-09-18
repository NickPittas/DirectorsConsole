#!/usr/bin/env python3
"""Run the repository's offline regression checks."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "CinemaPromptEngineering" / "frontend"
NODE = shutil.which("node") or "node"
NPM = "npm.cmd" if os.name == "nt" else "npm"

CHECKS = [
    (
        "Python tests",
        [
            sys.executable,
            "-m",
            "pytest",
            "-c",
            "pytest.ini",
            "tests/",
            "Orchestrator/tests/",
            "-q",
        ],
        ROOT,
    ),
    *[
        (f"Node regression: {test.name}", [NODE, str(test)], ROOT)
        for test in (
            ROOT / "tests/test_comfyui_websocket_node.js",
            ROOT / "tests/test_oauth_sync.js",
            ROOT / "tests/test_settings_oauth.js",
            ROOT / "tests/test_storyboard_generation_run.js",
            ROOT / "tests/test_storyboard_metadata.js",
            ROOT / "tests/test_batch_rename_dialog_race.js",
            ROOT / "tests/test_storyboard_issue6_connection.js",
            ROOT / "tests/test_storyboard_issue7_checkpoint.js",
            ROOT / "tests/test_workflow_schema_controls.js",
            ROOT / "tests/test_workflow_schema_production.js",
            ROOT / "tests/test_error_boundary_hint.js",
            ROOT / "tests/test_project_ux_fixes.js",
            ROOT / "tests/test_session_draft_storage.js",
            ROOT / "tests/test_session_recovery_node.js",
            ROOT / "tests/test_session_recovery_consumer.js",
            ROOT / "tests/test_session_recovery_ui_consumer.js",
            ROOT / "tests/test_prompt_enhancement_frontend.js",
        )
    ],
    ("Frontend lint", [NPM, "run", "lint"], FRONTEND),
    ("Frontend build", [NPM, "run", "build"], FRONTEND),
]


def main() -> int:
    failed: list[str] = []
    for name, command, cwd in CHECKS:
        print(f"\n== {name} ==", flush=True)
        result = subprocess.run(command, cwd=cwd, check=False)
        if result.returncode:
            failed.append(f"{name} (exit {result.returncode})")

    if failed:
        print("\nFailed checks:", ", ".join(failed), file=sys.stderr)
        return 1
    print("\nAll checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
