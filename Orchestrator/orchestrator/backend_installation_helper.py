"""Fixed stdio helper for remote model-file management over verified SSH."""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import socket
import sys
from pathlib import Path, PurePosixPath
from typing import Any

_MAX_HEADER_BYTES = 64 * 1024
_MAX_MODEL_BYTES = 512 * 1024**3


def _safe_root(value: str) -> Path:
    root = Path(value)
    if not root.is_absolute():
        raise ValueError("root_not_absolute")
    root = root.resolve(strict=True)
    if not root.is_dir():
        raise ValueError("root_not_directory")
    return root


def _safe_environment(value: str) -> Path:
    environment = Path(value)
    if not environment.is_absolute():
        raise ValueError("environment_not_absolute")
    environment = environment.resolve(strict=True)
    if not environment.exists():
        raise ValueError("environment_missing")
    return environment


def _relative_filename(value: str) -> PurePosixPath:
    if not value or "\x00" in value or ":" in value:
        raise ValueError("filename_invalid")
    path = PurePosixPath(value.replace("\\", "/"))
    if path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts):
        raise ValueError("filename_invalid")
    return path


def _destination(root: Path, filename: str, job_id: str) -> Path:
    relative = _relative_filename(filename)
    current = root
    for part in relative.parts[:-1]:
        child = current / part
        if child.is_symlink():
            raise ValueError("destination_symlink_disallowed")
        if not child.exists():
            child.mkdir()
        current = child.resolve(strict=True)
        if os.path.commonpath((os.path.normcase(str(root)), os.path.normcase(str(current)))) != os.path.normcase(str(root)):
            raise ValueError("destination_outside_root")
    target = current / relative.parts[-1]
    if target.exists():
        raise FileExistsError("destination_exists")
    if not job_id.isalnum() or len(job_id) > 64:
        raise ValueError("job_id_invalid")
    return target


def _identity(request: dict[str, Any]) -> dict[str, Any]:
    actual = socket.gethostname()
    expected = request.get("host_identity")
    if not isinstance(expected, str) or actual.casefold() != expected.casefold():
        raise ValueError("host_identity_mismatch")
    install_root = _safe_root(str(request["installation_root"]))
    if not (install_root / "main.py").is_file():
        raise ValueError("comfy_root_unverified")
    environment = _safe_environment(str(request["service_environment"]))
    roots: dict[str, str] = {}
    unverified: list[str] = []
    for category, path in request["model_roots"].items():
        try:
            resolved = _safe_root(str(path))
            roots[str(category)] = str(resolved)
        except (OSError, ValueError):
            unverified.append(str(category))
    expected_installation_root = request.get("expected_installation_root")
    expected_environment = request.get("expected_service_environment")
    expected_category = request.get("expected_root_category")
    expected_model_root = request.get("expected_model_root")
    if (
        expected_installation_root is not None
        and str(install_root) != expected_installation_root
    ) or (
        expected_environment is not None
        and str(environment) != expected_environment
    ) or (
        expected_category is not None
        and roots.get(expected_category) != expected_model_root
    ):
        raise ValueError("management_identity_changed")
    return {
        "backend_id": request["backend_id"],
        "host_identity": actual,
        "installation_root": str(install_root),
        "service_environment": str(environment),
        "model_roots": roots,
        "unverified_model_roots": unverified,
    }


def _send(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def main() -> int:
    part: Path | None = None
    try:
        header = sys.stdin.buffer.readline(_MAX_HEADER_BYTES + 1)
        if len(header) > _MAX_HEADER_BYTES or not header.endswith(b"\n"):
            raise ValueError("request_header_invalid")
        request = json.loads(header)
        if not isinstance(request, dict) or request.get("protocol") != 1:
            raise ValueError("protocol_unsupported")
        identity = _identity(request)
        action = request.get("action")
        if action == "inspect":
            filename = request.get("filename")
            root_category = request.get("root_category")
            exists = False
            destination = None
            if filename is not None:
                if root_category not in identity["model_roots"]:
                    raise ValueError("model_root_unverified")
                root = Path(identity["model_roots"][root_category])
                relative = _relative_filename(str(filename))
                current = root
                for part in relative.parts[:-1]:
                    child = current / part
                    if child.is_symlink():
                        raise ValueError("destination_symlink_disallowed")
                    if child.exists():
                        current = child.resolve(strict=True)
                        if os.path.commonpath((os.path.normcase(str(root)), os.path.normcase(str(current)))) != os.path.normcase(str(root)):
                            raise ValueError("destination_outside_root")
                    else:
                        current = child
                candidate = current / relative.parts[-1]
                destination = str(candidate)
                exists = candidate.exists() or candidate.is_symlink()
            _send({"ok": True, **identity, "destination": destination, "exists": exists})
            return 0
        if action != "install":
            raise ValueError("action_unsupported")

        category = str(request["root_category"])
        if category not in identity["model_roots"]:
            raise ValueError("model_root_unverified")
        root = Path(identity["model_roots"][category])
        size = int(request["size_bytes"])
        if size <= 0 or size > _MAX_MODEL_BYTES:
            raise ValueError("size_out_of_range")
        destination = _destination(root, str(request["filename"]), str(request["job_id"]))
        if shutil.disk_usage(destination.parent).free < size + 64 * 1024**2:
            raise OSError("insufficient_space")
        part = destination.with_name(f".{destination.name}.{request['job_id']}.part")
        digest = hashlib.sha256()
        count = 0
        with part.open("xb") as output:
            while count < size:
                chunk = sys.stdin.buffer.read(min(8 * 1024**2, size - count))
                if not chunk:
                    raise EOFError("transfer_incomplete")
                output.write(chunk)
                digest.update(chunk)
                count += len(chunk)
                if shutil.disk_usage(destination.parent).free < 64 * 1024**2:
                    raise OSError("insufficient_space")
            output.flush()
            os.fsync(output.fileno())
        actual_hash = digest.hexdigest()
        if actual_hash != request["sha256"]:
            raise ValueError("transfer_hash_mismatch")
        commit = sys.stdin.buffer.readline(_MAX_HEADER_BYTES + 1)
        if len(commit) > _MAX_HEADER_BYTES or not commit.endswith(b"\n"):
            raise EOFError("commit_not_received")
        if json.loads(commit) != {"commit": True}:
            raise ValueError("commit_not_authorized")
        os.link(part, destination)
        part.unlink()
        part = None
        _send(
            {
                "ok": True,
                **identity,
                "destination": str(destination),
                "size_bytes": count,
                "sha256": actual_hash,
            }
        )
        return 0
    except BaseException as error:
        if part is not None:
            try:
                part.unlink(missing_ok=True)
            except OSError:
                pass
        if isinstance(error, FileExistsError):
            code = "destination_exists"
        elif isinstance(error, OSError) and error.errno == 28:
            code = "insufficient_space"
        elif isinstance(error, (ValueError, EOFError, KeyError)):
            code = str(error)
            if code not in {
                "protocol_unsupported",
                "request_header_invalid",
                "host_identity_mismatch",
                "management_identity_changed",
                "comfy_root_unverified",
                "environment_missing",
                "root_not_absolute",
                "root_not_directory",
                "filename_invalid",
                "destination_outside_root",
                "destination_symlink_disallowed",
                "job_id_invalid",
                "model_root_unverified",
                "size_out_of_range",
                "transfer_incomplete",
                "transfer_hash_mismatch",
                "commit_not_received",
                "commit_not_authorized",
                "action_unsupported",
            }:
                code = "helper_failed"
        else:
            code = "helper_failed"
        _send({"ok": False, "error_code": code[:96]})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
