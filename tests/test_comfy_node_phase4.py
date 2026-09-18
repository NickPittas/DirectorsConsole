"""Fresh-process checks for ComfyCinemaPrompting's rules ownership."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CPE_ROOT = ROOT / "CinemaPromptEngineering"
CANONICAL_RULES = CPE_ROOT / "cinema_rules"
NODE_SOURCE = CPE_ROOT / "ComfyCinemaPrompting"
SYNC_SCRIPT = ROOT / "scripts" / "sync_comfy_node.py"


def _copy_node(destination: Path) -> None:
    destination.mkdir(parents=True)
    for name in ("__init__.py", "api_routes.py", "README.md", "requirements.txt"):
        shutil.copy2(NODE_SOURCE / name, destination / name)
    shutil.copytree(NODE_SOURCE / "web" / "app", destination / "web" / "app")


def _copy_rules(source: Path, destination: Path) -> None:
    shutil.copytree(
        source,
        destination,
        ignore=shutil.ignore_patterns("__pycache__", "*.pyc", "*.pyo"),
    )


def _run_node(
    workspace: Path,
    import_parent: Path,
    expected_rules: Path,
    expected_node: Path,
) -> dict[str, str]:
    code = """
import json
import sys
from pathlib import Path

sys.path.insert(0, sys.argv[1])
import ComfyCinemaPrompting as node
import cinema_rules
import ComfyCinemaPrompting.api_routes as api_routes

assert Path(cinema_rules.__file__).resolve() == Path(sys.argv[2]).resolve()
assert node._load_rules()
assert isinstance(cinema_rules.RuleEngine(), cinema_rules.RuleEngine)
assert isinstance(api_routes.engine, cinema_rules.RuleEngine)
assert any(
    getattr(route.resource, "canonical", None) == "/cinema_prompt/api/options"
    for route in api_routes.PromptServer.instance.app.router.routes()
)
assert api_routes.EDITOR_APP_DIR == Path(sys.argv[3]).resolve() / "web" / "app"
assert api_routes.EDITOR_INDEX_PATH.is_file()
print(json.dumps({"rules": str(Path(cinema_rules.__file__).resolve())}))
"""
    environment = os.environ.copy()
    environment.pop("PYTHONPATH", None)
    result = subprocess.run(
        [
            sys.executable,
            "-I",
            "-c",
            code,
            str(import_parent),
            str(expected_rules / "__init__.py"),
            str(expected_node),
        ],
        cwd=workspace,
        env=environment,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def _make_repository_copy(tmp_path: Path) -> tuple[Path, Path, Path, Path]:
    engineering = tmp_path / "repo" / "CinemaPromptEngineering"
    engineering.mkdir(parents=True)
    canonical = engineering / "cinema_rules"
    _copy_rules(CANONICAL_RULES, canonical)
    node = engineering / "ComfyCinemaPrompting"
    _copy_node(node)
    return engineering.parent, engineering, canonical, node


def test_in_repo_node_uses_canonical_rules_without_generated_copy(tmp_path: Path) -> None:
    workspace, engineering, canonical, node = _make_repository_copy(tmp_path)

    result = _run_node(workspace, engineering, canonical, node)

    assert result["rules"] == str((canonical / "__init__.py").resolve())
    assert not (engineering / "ComfyCinemaPrompting" / "cinema_rules").exists()


def test_in_repo_node_prefers_canonical_rules_with_generated_copy(tmp_path: Path) -> None:
    workspace, engineering, canonical, node = _make_repository_copy(tmp_path)
    generated = node / "cinema_rules"

    subprocess.run(
        [
            sys.executable,
            str(SYNC_SCRIPT),
            "--source",
            str(canonical),
            "--destination",
            str(generated),
        ],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    result = _run_node(workspace, engineering, canonical, node)

    assert result["rules"] == str((canonical / "__init__.py").resolve())
    assert generated.exists()


def test_isolated_standalone_node_uses_generated_rules_and_api_routes(tmp_path: Path) -> None:
    workspace = tmp_path / "outside-checkout"
    workspace.mkdir()
    standalone = workspace / "custom_nodes"
    standalone.mkdir()
    node = standalone / "ComfyCinemaPrompting"
    _copy_node(node)
    generated = node / "cinema_rules"
    subprocess.run(
        [
            sys.executable,
            str(SYNC_SCRIPT),
            "--destination",
            str(generated),
        ],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )

    result = _run_node(workspace, standalone, generated, node)

    assert result["rules"] == str((generated / "__init__.py").resolve())


def test_missing_rules_has_actionable_error_in_isolated_node(tmp_path: Path) -> None:
    workspace = tmp_path / "outside-checkout"
    standalone = workspace / "custom_nodes"
    node = standalone / "ComfyCinemaPrompting"
    node.mkdir(parents=True)
    shutil.copy2(NODE_SOURCE / "__init__.py", node / "__init__.py")

    code = """
import sys
sys.path.insert(0, sys.argv[1])
try:
    import ComfyCinemaPrompting
except ImportError as error:
    assert "sync_comfy_node.py" in str(error)
else:
    raise AssertionError("missing rules unexpectedly imported")
"""
    environment = os.environ.copy()
    environment.pop("PYTHONPATH", None)
    subprocess.run(
        [sys.executable, "-I", "-c", code, str(standalone)],
        cwd=workspace,
        env=environment,
        check=True,
        capture_output=True,
        text=True,
    )


def test_sync_rejects_overlapping_source_and_destination(tmp_path: Path) -> None:
    source = tmp_path / "source"
    source.mkdir()
    (source / "__init__.py").write_text("rules = True\n", encoding="utf-8")

    code = """
import sys
from pathlib import Path
sys.path.insert(0, sys.argv[1])
from scripts.sync_comfy_node import sync_rules
source = Path(sys.argv[2])
try:
    sync_rules(source=source, destination=source / "generated")
except ValueError as error:
    assert "overlap" in str(error)
else:
    raise AssertionError("overlapping paths were accepted")
"""
    # The script is imported by an explicit checkout path, never PYTHONPATH.
    environment = os.environ.copy()
    environment.pop("PYTHONPATH", None)
    subprocess.run(
        [sys.executable, "-I", "-c", code, str(ROOT), str(source)],
        cwd=tmp_path,
        env=environment,
        check=True,
        capture_output=True,
        text=True,
    )


def test_sync_removes_stale_files_and_caches_without_touching_source(tmp_path: Path) -> None:
    source = tmp_path / "source"
    destination = tmp_path / "node" / "cinema_rules"
    source.mkdir()
    (source / "__init__.py").write_text("sentinel = True\n", encoding="utf-8")
    (source / "legacy.py").write_text("legacy = True\n", encoding="utf-8")
    (source / "__pycache__").mkdir()
    (source / "__pycache__" / "source.pyc").write_bytes(b"cache")

    destination.parent.mkdir()
    (destination / "stale.py").parent.mkdir(parents=True)
    (destination / "stale.py").write_text("stale = True\n", encoding="utf-8")
    (destination / "__pycache__").mkdir()
    (destination / "__pycache__" / "old.pyc").write_bytes(b"cache")
    (destination / "old.pyc").write_bytes(b"cache")

    subprocess.run(
        [
            sys.executable,
            str(SYNC_SCRIPT),
            "--source",
            str(source),
            "--destination",
            str(destination),
        ],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )

    assert (destination / "__init__.py").read_text(encoding="utf-8") == "sentinel = True\n"
    assert (destination / "legacy.py").exists()
    assert not (destination / "stale.py").exists()
    assert not (destination / "old.pyc").exists()
    assert not (destination / "__pycache__").exists()
    assert (source / "legacy.py").exists()
    assert (source / "__pycache__" / "source.pyc").exists()
