import asyncio
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest

from orchestrator.backends.client import ComfyUIClient, ImageOutput
from orchestrator.core.models.backend import BackendConfig
from orchestrator.core.models.job_group import (
    ChildJob,
    ChildJobStatus,
    JobGroup,
    JobGroupStatus,
)
from orchestrator.core.parallel_job_manager import ParallelJobManager


def queue_entry(prompt_id: str) -> list[object]:
    return [1, prompt_id, {}]


def history_entry(status: str, *, completed: bool = True) -> dict:
    return {"status": {"completed": completed, "status_str": status}}


@pytest.mark.asyncio
async def test_cancel_prompt_confirms_queued_removal_without_history() -> None:
    requests: list[httpx.Request] = []
    queue_reads = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal queue_reads
        requests.append(request)
        if request.url.path == "/history/target":
            return httpx.Response(404)
        if request.url.path == "/queue" and request.method == "GET":
            queue_reads += 1
            pending = [queue_entry("target")] if queue_reads == 1 else []
            return httpx.Response(200, json={"queue_running": [], "queue_pending": pending})
        return httpx.Response(200, json={})

    client = ComfyUIClient("http://backend", transport=httpx.MockTransport(handler))
    try:
        assert await client.cancel_prompt("target") == "cancelled"
    finally:
        await client.close()

    assert not any(request.url.path == "/interrupt" for request in requests)
    assert any(request.url.path == "/queue" and request.method == "POST" for request in requests)


@pytest.mark.asyncio
async def test_cancel_prompt_absent_then_pending_is_unconfirmed() -> None:
    queue_reads = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal queue_reads
        if request.url.path == "/history/target":
            return httpx.Response(404)
        if request.url.path == "/queue" and request.method == "GET":
            queue_reads += 1
            if queue_reads == 1:
                pending = [queue_entry("target")]
            elif queue_reads == 2:
                pending = []
            elif queue_reads == 3:
                pending = [queue_entry("target")]
            else:
                pending = []
            return httpx.Response(200, json={"queue_running": [], "queue_pending": pending})
        return httpx.Response(200, json={})

    client = ComfyUIClient("http://backend", transport=httpx.MockTransport(handler))
    try:
        assert await client.cancel_prompt("target") == "unconfirmed"
    finally:
        await client.close()


@pytest.mark.asyncio
async def test_cancel_prompt_completion_during_delete_beats_queue_removal() -> None:
    requests: list[httpx.Request] = []
    queue_reads = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal queue_reads
        requests.append(request)
        if request.url.path == "/queue" and request.method == "GET":
            queue_reads += 1
            payload = (
                {"queue_running": [], "queue_pending": [queue_entry("target")]}
                if queue_reads == 1
                else {"queue_running": [], "queue_pending": []}
            )
            return httpx.Response(200, json=payload)
        if request.url.path == "/history/target":
            return httpx.Response(
                200,
                json={"target": history_entry("success") | {"outputs": {"9": {"images": []}}}},
            )
        return httpx.Response(200, json={})

    client = ComfyUIClient("http://backend", transport=httpx.MockTransport(handler))
    try:
        assert await client.cancel_prompt("target") == "completed"
    finally:
        await client.close()
    assert not any(request.url.path == "/interrupt" for request in requests)


@pytest.mark.asyncio
async def test_cancel_prompt_queued_to_running_interrupts_only_target_and_confirms() -> None:
    requests: list[httpx.Request] = []
    queue_reads = 0
    interrupted = False

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal queue_reads, interrupted
        requests.append(request)
        if request.url.path == "/queue" and request.method == "GET":
            queue_reads += 1
            if queue_reads == 1:
                payload = {"queue_running": [], "queue_pending": [queue_entry("target")]}
            elif not interrupted:
                payload = {"queue_running": [queue_entry("target")], "queue_pending": []}
            else:
                payload = {"queue_running": [], "queue_pending": []}
            return httpx.Response(200, json=payload)
        if request.url.path == "/history/target":
            if interrupted:
                return httpx.Response(
                    200,
                    json={
                        "target": {
                            "outputs": {},
                            "status": {
                                "completed": True,
                                "status_str": "error",
                                "messages": [["execution_interrupted", {}]],
                            },
                        }
                    },
                )
            return httpx.Response(404)
        if request.url.path == "/interrupt":
            interrupted = True
            return httpx.Response(200)
        return httpx.Response(200, json={})

    client = ComfyUIClient("http://backend", transport=httpx.MockTransport(handler))
    try:
        assert await client.cancel_prompt("target") == "cancelled"
    finally:
        await client.close()
    assert sum(request.url.path == "/interrupt" for request in requests) == 1


@pytest.mark.asyncio
async def test_cancel_prompt_interrupt_completion_beats_acknowledgement() -> None:
    requests: list[httpx.Request] = []
    completed = False

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal completed
        requests.append(request)
        if request.url.path == "/queue" and request.method == "GET":
            return httpx.Response(
                200,
                json={
                    "queue_running": [queue_entry("target")] if not completed else [],
                    "queue_pending": [],
                },
            )
        if request.url.path == "/interrupt":
            completed = True
            return httpx.Response(200)
        if request.url.path == "/history/target":
            if completed:
                return httpx.Response(
                    200,
                    json={"target": history_entry("success") | {"outputs": {"9": {"images": []}}}},
                )
            return httpx.Response(404)
        return httpx.Response(200, json={})

    client = ComfyUIClient("http://backend", transport=httpx.MockTransport(handler))
    try:
        assert await client.cancel_prompt("target") == "completed"
    finally:
        await client.close()
    assert sum(request.url.path == "/interrupt" for request in requests) == 1


@pytest.mark.asyncio
async def test_cancel_prompt_ack_only_still_running_or_empty_queue_is_unconfirmed() -> None:
    requests: list[httpx.Request] = []
    interrupt_requested = False

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal interrupt_requested
        requests.append(request)
        if request.url.path == "/queue" and request.method == "GET":
            return httpx.Response(
                200,
                json={
                    "queue_running": [queue_entry("target")] if not interrupt_requested else [],
                    "queue_pending": [],
                },
            )
        if request.url.path == "/history/target":
            return httpx.Response(404)
        if request.url.path == "/interrupt":
            interrupt_requested = True
        return httpx.Response(200, json={})

    client = ComfyUIClient("http://backend", transport=httpx.MockTransport(handler))
    try:
        assert await client.cancel_prompt("target") == "unconfirmed"
    finally:
        await client.close()
    assert sum(request.url.path == "/interrupt" for request in requests) == 1


@pytest.mark.asyncio
async def test_cancel_prompt_does_not_interrupt_absent_or_unrelated_prompt() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.path == "/history/target":
            return httpx.Response(404)
        return httpx.Response(
            200,
            json={"queue_running": [queue_entry("other")], "queue_pending": []},
        )

    client = ComfyUIClient("http://backend", transport=httpx.MockTransport(handler))
    try:
        assert await client.cancel_prompt("target") == "unconfirmed"
    finally:
        await client.close()
    assert not any(request.url.path == "/interrupt" for request in requests)


@pytest.mark.asyncio
async def test_cancel_prompt_interrupted_history_beats_stale_completed_flag() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/history/target":
            return httpx.Response(
                200,
                json={
                    "target": {
                        "outputs": {},
                        "status": {
                            "completed": True,
                            "status_str": "success",
                            "messages": [["execution_interrupted", {}]],
                        },
                    }
                },
            )
        return httpx.Response(200, json={"queue_running": [], "queue_pending": []})

    client = ComfyUIClient("http://backend", transport=httpx.MockTransport(handler))
    try:
        assert await client.cancel_prompt("target") == "cancelled"
    finally:
        await client.close()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("message_type", "expected"),
    [
        ("execution_interrupted", "interrupted"),
        ("execution_error", "execution error"),
    ],
)
async def test_terminal_execution_messages_raise(message_type: str, expected: str) -> None:
    client = ComfyUIClient(
        "http://backend",
        transport=httpx.MockTransport(lambda _: httpx.Response(200)),
    )

    async def messages(_prompt_id: str):
        yield message_type, {"prompt_id": "target", "node_id": "1"}

    client._stream_ws = messages  # type: ignore[method-assign]
    try:
        with pytest.raises(RuntimeError, match=expected):
            async for _update in client.monitor_progress("target"):
                pass
    finally:
        await client.close()


@pytest.mark.asyncio
@pytest.mark.parametrize("remote_result", ["cancelled", "unconfirmed", RuntimeError("backend offline")])
async def test_cancel_group_reports_only_confirmed_remote_stops(remote_result: object) -> None:
    backend = BackendConfig(id="backend", name="Backend", host="backend")
    backend_manager = MagicMock()
    backend_manager.get.return_value = backend
    client = MagicMock()
    client.queue_prompt = AsyncMock(return_value="prompt")
    client.cancel_prompt = AsyncMock(
        side_effect=remote_result if isinstance(remote_result, Exception) else None,
        return_value=remote_result,
    )
    client.close = AsyncMock()

    async def wait_for_cancellation(_prompt_id: str):
        await asyncio.Event().wait()
        yield None

    client.monitor_progress = wait_for_cancellation
    manager = ParallelJobManager(backend_manager, lambda _backend: client)
    child = ChildJob(job_id="child", backend_id="backend", seed=1)
    group = JobGroup(id="group", workflow_json={}, child_jobs=[child])
    manager._active_groups[group.id] = group
    task = asyncio.create_task(manager._execute_child_job(group, child))
    manager._running_tasks[child.job_id] = task

    for _ in range(10):
        await asyncio.sleep(0)
        if client.queue_prompt.await_count:
            break
    assert client.queue_prompt.await_count == 1

    result = await manager.cancel_group(group.id)

    if remote_result == "cancelled":
        assert result == {"interrupted": 1, "already_complete": 0}
    else:
        assert result == {"interrupted": 0, "already_complete": 0, "unconfirmed": 1}
        assert child.error_type == "RemoteCancellationUnconfirmed"
        assert "unconfirmed" in child.error_message
    assert task.done()
    assert child.status == ChildJobStatus.CANCELLED
    client.cancel_prompt.assert_awaited_once_with("prompt")
    client.close.assert_awaited_once()
    assert group.status == JobGroupStatus.CANCELLED


@pytest.mark.asyncio
async def test_completion_during_cancel_recovers_outputs_and_emits_completion() -> None:
    backend = BackendConfig(id="backend", name="Backend", host="backend")
    backend_manager = MagicMock()
    backend_manager.get.return_value = backend
    client = MagicMock()
    client.queue_prompt = AsyncMock(return_value="prompt")
    client.cancel_prompt = AsyncMock(return_value="completed")
    client.get_history = AsyncMock(return_value={"outputs": {"9": {"images": []}}})
    client.download_outputs.return_value = [
        ImageOutput(filename="finished.png", subfolder="", image_type="output")
    ]
    client.close = AsyncMock()

    async def wait_for_cancellation(_prompt_id: str):
        await asyncio.Event().wait()
        yield None

    client.monitor_progress = wait_for_cancellation
    manager = ParallelJobManager(backend_manager, lambda _backend: client)
    events: list[dict] = []

    async def capture(event: dict) -> None:
        events.append(event)

    manager.register_websocket_handler("group", capture)
    child = ChildJob(job_id="child", backend_id="backend", seed=1)
    group = JobGroup(id="group", workflow_json={}, child_jobs=[child])
    manager._active_groups[group.id] = group
    task = asyncio.create_task(manager._execute_child_job(group, child))
    manager._running_tasks[child.job_id] = task

    for _ in range(10):
        await asyncio.sleep(0)
        if client.queue_prompt.await_count:
            break
    result = await manager.cancel_group(group.id)

    assert result == {"interrupted": 0, "already_complete": 1}
    assert child.status == ChildJobStatus.COMPLETED
    assert child.outputs["images"][0]["filename"] == "finished.png"
    assert [event["type"] for event in events] == ["child_completed"]
    assert task.done()
    client.get_history.assert_awaited_once_with("prompt")
    client.close.assert_awaited_once()
    assert group.status == JobGroupStatus.CANCELLED


@pytest.mark.asyncio
async def test_interrupted_prompt_cannot_complete_child_with_partial_outputs() -> None:
    backend = BackendConfig(id="backend", name="Backend", host="backend")
    backend_manager = MagicMock()
    backend_manager.get.return_value = backend
    client = MagicMock()
    client.queue_prompt = AsyncMock(return_value="prompt")
    client.get_history = AsyncMock(return_value={"outputs": {"partial": {}}})
    client.close = AsyncMock()

    async def interrupted(_prompt_id: str):
        raise RuntimeError("ComfyUI execution interrupted")
        yield None

    client.monitor_progress = interrupted
    manager = ParallelJobManager(backend_manager, lambda _backend: client)
    child = ChildJob(job_id="child", backend_id="backend", seed=1)
    group = JobGroup(id="group", workflow_json={}, child_jobs=[child])

    await manager._execute_child_job(group, child)

    assert child.status == ChildJobStatus.FAILED
    assert child.outputs == {}
    client.get_history.assert_not_awaited()
    client.close.assert_awaited_once()


@pytest.mark.asyncio
async def test_timeout_cleans_up_submitted_prompt() -> None:
    backend = BackendConfig(id="backend", name="Backend", host="backend")
    backend_manager = MagicMock()
    backend_manager.get.return_value = backend
    client = MagicMock()
    client.queue_prompt = AsyncMock(return_value="prompt")
    client.cancel_prompt = AsyncMock(return_value="cancelled")
    client.close = AsyncMock()

    async def timed_out(_prompt_id: str):
        raise asyncio.TimeoutError
        yield None

    client.monitor_progress = timed_out
    manager = ParallelJobManager(backend_manager, lambda _backend: client)
    child = ChildJob(job_id="child", backend_id="backend", seed=1)
    group = JobGroup(id="group", workflow_json={}, child_jobs=[child])

    await manager._execute_child_job(group, child)

    assert child.status == ChildJobStatus.TIMEOUT
    client.cancel_prompt.assert_awaited_once_with("prompt")
    client.close.assert_awaited_once()


@pytest.mark.asyncio
async def test_cancel_before_group_starts_never_submits_work() -> None:
    client_factory = MagicMock()
    manager = ParallelJobManager(MagicMock(), client_factory)
    child = ChildJob(job_id="child", backend_id="backend", seed=1)
    group = JobGroup(id="group", workflow_json={}, child_jobs=[child])
    manager._active_groups[group.id] = group

    await manager.cancel_group(group.id)
    await manager._execute_group(group)

    assert child.status == ChildJobStatus.CANCELLED
    client_factory.assert_not_called()
