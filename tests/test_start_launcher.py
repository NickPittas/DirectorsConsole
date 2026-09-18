"""Bounded, listener-only port cleanup tests for the launcher."""

import signal
import subprocess

import pytest

import start as launcher


def _linux(monkeypatch):
    monkeypatch.setattr(launcher.platform, "system", lambda: "Linux")


def test_ss_fallback_terminates_unique_listeners_only(monkeypatch):
    """ss fallback ignores clients, deduplicates listeners, and skips this PID."""
    _linux(monkeypatch)
    monkeypatch.setattr(
        launcher.shutil,
        "which",
        lambda name: "/usr/bin/ss" if name == "ss" else None,
    )
    ss_output = """State Recv-Q Send-Q Local Address:Port Peer Address:Port Process
LISTEN 0 128 0.0.0.0:9820 0.0.0.0:* users:((\"uvicorn\",pid=200,fd=6))
LISTEN 0 128 127.0.0.1:9820 0.0.0.0:* users:((\"uvicorn\",pid=200,fd=7))
LISTEN 0 128 [::]:9820 [::]:* users:((\"uvicorn\",pid=300,fd=8))
LISTEN 0 128 127.0.0.1:9820 0.0.0.0:* users:((\"launcher\",pid=1000,fd=9))
ESTAB 0 0 127.0.0.1:9820 127.0.0.1:50000 users:((\"client\",pid=999,fd=4))
"""
    run = lambda *args, **kwargs: subprocess.CompletedProcess(
        args, 0, stdout=ss_output, stderr=""
    )
    monkeypatch.setattr(launcher.subprocess, "run", run)
    monkeypatch.setattr(launcher.os, "getpid", lambda: 1000)
    monkeypatch.setattr(launcher.time, "sleep", lambda _: None)
    monkeypatch.setattr(launcher, "is_port_in_use", lambda port: False)

    killed = []
    monkeypatch.setattr(
        launcher.os,
        "kill",
        lambda pid, sig: killed.append((pid, sig)),
    )

    assert launcher.kill_process_on_port(9820) is True
    assert killed == [(200, signal.SIGTERM), (300, signal.SIGTERM)]


def test_lsof_query_is_listener_only(monkeypatch):
    """An installed lsof is still constrained to LISTEN sockets."""
    _linux(monkeypatch)
    monkeypatch.setattr(
        launcher.shutil,
        "which",
        lambda name: "/usr/bin/lsof" if name == "lsof" else None,
    )
    calls = []

    def run(*args, **kwargs):
        calls.append(args[0])
        return subprocess.CompletedProcess(args[0], 0, stdout="200\n", stderr="")

    monkeypatch.setattr(launcher.subprocess, "run", run)
    monkeypatch.setattr(launcher.os, "kill", lambda *args: None)
    monkeypatch.setattr(launcher.time, "sleep", lambda _: None)
    monkeypatch.setattr(launcher, "is_port_in_use", lambda port: False)

    assert launcher.kill_process_on_port(9800) is True
    assert "-sTCP:LISTEN" in calls[0]


def test_cleanup_reports_unavailable_or_pidless_discovery(monkeypatch, capsys):
    """Unsupported tools and listeners without visible PIDs fail usefully."""
    _linux(monkeypatch)
    monkeypatch.setattr(launcher.shutil, "which", lambda name: None)
    monkeypatch.setattr(launcher, "is_port_in_use", lambda port: True)

    assert launcher.kill_process_on_port(9820) is False
    assert "neither lsof nor ss is available" in capsys.readouterr().out

    monkeypatch.setattr(
        launcher.shutil,
        "which",
        lambda name: "/usr/bin/ss" if name == "ss" else None,
    )
    monkeypatch.setattr(
        launcher.subprocess,
        "run",
        lambda *args, **kwargs: subprocess.CompletedProcess(
            args, 0, stdout="LISTEN 0 128 0.0.0.0:9820 0.0.0.0:*\n", stderr=""
        ),
    )

    assert launcher.kill_process_on_port(9820) is False
    assert "did not report its PID" in capsys.readouterr().out


@pytest.mark.parametrize("port_still_occupied", [True, False])
def test_force_kill_rechecks_original_listeners_and_reports_port_state(
    monkeypatch, port_still_occupied
):
    """Force-kill only original PIDs still listening after graceful shutdown."""
    _linux(monkeypatch)
    monkeypatch.setattr(
        launcher.shutil,
        "which",
        lambda name: "/usr/bin/ss" if name == "ss" else None,
    )
    initial = """LISTEN 0 128 0.0.0.0:9820 0.0.0.0:* users:((\"old\",pid=200,fd=1))
LISTEN 0 128 [::]:9820 [::]:* users:((\"old\",pid=300,fd=2))
LISTEN 0 128 127.0.0.1:9820 0.0.0.0:* users:((\"self\",pid=1000,fd=3))
ESTAB 0 0 127.0.0.1:9820 127.0.0.1:50000 users:((\"client\",pid=999,fd=4))
"""
    rediscovered = """LISTEN 0 128 0.0.0.0:9820 0.0.0.0:* users:((\"old\",pid=200,fd=1))
LISTEN 0 128 [::]:9820 [::]:* users:((\"new\",pid=400,fd=2))
LISTEN 0 128 127.0.0.1:9820 0.0.0.0:* users:((\"self\",pid=1000,fd=3))
ESTAB 0 0 127.0.0.1:9820 127.0.0.1:50000 users:((\"client\",pid=999,fd=4))
"""
    results = iter(
        [
            subprocess.CompletedProcess(["ss"], 0, stdout=initial, stderr=""),
            subprocess.CompletedProcess(["ss"], 0, stdout=rediscovered, stderr=""),
        ]
    )
    monkeypatch.setattr(launcher.subprocess, "run", lambda *args, **kwargs: next(results))
    monkeypatch.setattr(launcher.os, "getpid", lambda: 1000)
    monkeypatch.setattr(launcher.time, "sleep", lambda _: None)
    statuses = iter([True, port_still_occupied])
    monkeypatch.setattr(launcher, "is_port_in_use", lambda port: next(statuses))
    killed = []
    monkeypatch.setattr(
        launcher.os, "kill", lambda pid, sig: killed.append((pid, sig))
    )

    assert launcher.kill_process_on_port(9820) is (not port_still_occupied)
    assert killed == [
        (200, signal.SIGTERM),
        (300, signal.SIGTERM),
        (200, signal.SIGKILL),
    ]


def test_rediscovery_failure_prevents_force_kill(monkeypatch):
    """A failed safety recheck must not escalate SIGTERM to SIGKILL."""
    _linux(monkeypatch)
    discoveries = iter([{200}, None])
    monkeypatch.setattr(launcher, "_unix_listener_pids", lambda port: next(discoveries))
    monkeypatch.setattr(launcher.os, "getpid", lambda: 1000)
    monkeypatch.setattr(launcher.time, "sleep", lambda _: None)
    monkeypatch.setattr(launcher, "is_port_in_use", lambda port: True)
    killed = []
    monkeypatch.setattr(
        launcher.os, "kill", lambda pid, sig: killed.append((pid, sig))
    )

    assert launcher.kill_process_on_port(9820) is False
    assert killed == [(200, signal.SIGTERM)]


@pytest.mark.parametrize(
    ("discovery_result", "message"),
    [
        (
            subprocess.TimeoutExpired(["ss", "-ltnp"], 5),
            "Timed out discovering listeners",
        ),
        (
            subprocess.CompletedProcess(
                ["ss", "-ltnp"], 2, stdout="", stderr="permission denied"
            ),
            "ss failed",
        ),
    ],
)
def test_discovery_errors_are_reported_without_killing(monkeypatch, capsys, discovery_result, message):
    """Discovery timeout and command failure are useful, safe failures."""
    _linux(monkeypatch)
    monkeypatch.setattr(
        launcher.shutil,
        "which",
        lambda name: "/usr/bin/ss" if name == "ss" else None,
    )

    def run(*args, **kwargs):
        if isinstance(discovery_result, BaseException):
            raise discovery_result
        return discovery_result

    monkeypatch.setattr(launcher.subprocess, "run", run)
    monkeypatch.setattr(launcher, "is_port_in_use", lambda port: True)
    killed = []
    monkeypatch.setattr(
        launcher.os, "kill", lambda pid, sig: killed.append((pid, sig))
    )

    assert launcher.kill_process_on_port(9820) is False
    assert not killed
    assert message in capsys.readouterr().out


@pytest.mark.parametrize(
    ("kill_error", "statuses", "expected", "signals"),
    [
        (PermissionError, [True, True], False, [signal.SIGTERM, signal.SIGKILL]),
        (ProcessLookupError, [False], True, [signal.SIGTERM]),
    ],
)
def test_kill_errors_are_safe_and_return_actual_port_state(
    monkeypatch, kill_error, statuses, expected, signals
):
    """Permission and already-gone PIDs do not escape or report false success."""
    _linux(monkeypatch)
    monkeypatch.setattr(
        launcher, "_unix_listener_pids", lambda port: {200}
    )
    monkeypatch.setattr(launcher.os, "getpid", lambda: 1000)
    monkeypatch.setattr(launcher.time, "sleep", lambda _: None)
    status_values = iter(statuses)
    monkeypatch.setattr(launcher, "is_port_in_use", lambda port: next(status_values))
    killed = []

    def kill(pid, sig):
        killed.append((pid, sig))
        raise kill_error("mocked")

    monkeypatch.setattr(launcher.os, "kill", kill)

    assert launcher.kill_process_on_port(9820) is expected
    assert [sig for _, sig in killed] == signals
