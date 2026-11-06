"""Offline adapter for the pinned comfy-cli UI-to-API converter.

Fingerprints are SHA-256 of UTF-8 JSON serialized with sorted keys, compact
separators, and ensure_ascii=False. Warning capture cannot prove completeness;
separate upstream validation and live checks are still required.
"""

from __future__ import annotations

import contextlib
import hashlib
import json
import logging
import sys
from importlib import metadata
from typing import Any

EXPECTED_VERSION = "1.22.0"
MAX_INPUT_BYTES = 24 * 1024 * 1024
MAX_OUTPUT_BYTES = 12 * 1024 * 1024


class _Diagnostics(logging.Handler):
    def __init__(self) -> None:
        super().__init__(logging.WARNING)
        self.seen = False

    def emit(self, record: logging.LogRecord) -> None:
        self.seen = True


class _DiscardOutput:
    def __init__(self) -> None:
        self.written = False

    def write(self, text: str) -> int:
        self.written = self.written or bool(text)
        return len(text)

    def flush(self) -> None:
        pass


def _fingerprint(value: Any) -> str:
    """Hash a JSON value using the documented stable serialization."""
    canonical = json.dumps(
        value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False
    ).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def _failure(code: str, message: str) -> dict[str, Any]:
    return {"ok": False, "error": {"code": code, "message": message}, "readiness": "not_verified"}


def _emit(result: dict[str, Any]) -> None:
    payload = json.dumps(result, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")
    sys.stdout.buffer.write(payload + b"\n")


def _convert(workflow: dict[str, Any], object_info: dict[str, Any]) -> tuple[Any, bool, bool]:
    diagnostics = _Diagnostics()
    package_logger = logging.getLogger("comfy_cli")
    logger_states: list[tuple[logging.Logger, list[logging.Handler], list[logging.Filter], int, bool]] = []
    for name, candidate in logging.root.manager.loggerDict.items():
        if isinstance(candidate, logging.Logger) and (name == "comfy_cli" or name.startswith("comfy_cli.")):
            logger_states.append((candidate, candidate.handlers[:], candidate.filters[:], candidate.level, candidate.propagate))
    if not any(logger is package_logger for logger, *_ in logger_states):
        logger_states.append((package_logger, package_logger.handlers[:], package_logger.filters[:], package_logger.level, package_logger.propagate))

    for logger, _, _, _, _ in logger_states:
        logger.handlers = []
        logger.filters = []
        logger.level = logging.NOTSET
        logger.propagate = True
    package_logger.handlers = [diagnostics]
    package_logger.level = logging.DEBUG
    package_logger.propagate = False

    stdout_capture = _DiscardOutput()
    stderr_capture = _DiscardOutput()
    converted: Any = None
    failed = False
    try:
        with contextlib.redirect_stdout(stdout_capture), contextlib.redirect_stderr(stderr_capture):
            try:
                from comfy_cli.workflow_to_api import convert_ui_to_api

                converted = convert_ui_to_api(workflow, object_info)
            except Exception:
                failed = True
    finally:
        for logger, handlers, filters, level, propagate in logger_states:
            logger.handlers = handlers
            logger.filters = filters
            logger.level = level
            logger.propagate = propagate
    return converted, diagnostics.seen or stdout_capture.written or stderr_capture.written, failed


def main() -> None:
    """Read one bounded request and emit one generic JSON result."""
    try:
        raw = sys.stdin.buffer.read(MAX_INPUT_BYTES + 1)
        if len(raw) > MAX_INPUT_BYTES:
            _emit(_failure("input_too_large", "Input exceeds the size limit."))
            return
        request = json.loads(raw)
        if not isinstance(request, dict) or not isinstance(request.get("workflow"), dict) or not isinstance(request.get("object_info"), dict):
            _emit(_failure("invalid_input", "Input must contain workflow and object_info JSON objects."))
            return
        workflow = request["workflow"]
        object_info = request["object_info"]
        source_fingerprint = _fingerprint(workflow)
        schema_fingerprint = _fingerprint(object_info)
    except Exception:
        _emit(_failure("invalid_input", "Input must contain workflow and object_info JSON objects."))
        return

    try:
        if metadata.version("comfy-cli") != EXPECTED_VERSION:
            _emit(_failure("unavailable", "comfy-cli 1.22.0 is unavailable."))
            return
    except Exception:
        _emit(_failure("unavailable", "comfy-cli 1.22.0 is unavailable."))
        return

    try:
        converted, diagnosed, failed = _convert(workflow, object_info)
    except Exception:
        _emit(_failure("conversion_failed", "Workflow conversion failed."))
        return
    if diagnosed:
        _emit(_failure("conversion_diagnostics", "Converter emitted diagnostics or output."))
        return
    if failed:
        _emit(_failure("conversion_failed", "Workflow conversion failed."))
        return
    if not isinstance(converted, dict) or not converted or any(
        not isinstance(node_id, str)
        or not isinstance(node, dict)
        or not isinstance(node.get("class_type"), str)
        or not isinstance(node.get("inputs"), dict)
        for node_id, node in converted.items()
    ):
        _emit(_failure("invalid_output", "Converter returned an invalid workflow."))
        return
    if not any(
        isinstance(object_info.get(node["class_type"]), dict)
        and object_info[node["class_type"]].get("output_node") is True
        for node in converted.values()
    ):
        _emit(_failure("invalid_output", "Converted workflow has no advertised output node."))
        return
    try:
        export_fingerprint = _fingerprint(converted)
        result = {
            "ok": True,
            "version": EXPECTED_VERSION,
            "workflow": converted,
            "sourceGraphFingerprint": source_fingerprint,
            "objectInfoFingerprint": schema_fingerprint,
            "exportFingerprint": export_fingerprint,
            "readiness": "not_verified",
        }
        payload = json.dumps(result, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")
    except Exception:
        _emit(_failure("invalid_output", "Converter returned an invalid workflow."))
        return
    if len(payload) + 1 > MAX_OUTPUT_BYTES:
        _emit(_failure("output_too_large", "Converted workflow exceeds the output limit."))
        return
    sys.stdout.buffer.write(payload + b"\n")


if __name__ == "__main__":
    main()
