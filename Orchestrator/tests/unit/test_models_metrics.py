from orchestrator.core.models.metrics import MetricsSnapshot


def test_metrics_snapshot_defaults() -> None:
    snapshot = MetricsSnapshot(
        id="m1",
        backend_id="b1",
        gpu_memory_used=100,
        gpu_memory_total=200,
        gpu_utilization=50.0,
        gpu_temperature=60,
        cpu_utilization=10.0,
        ram_used=100,
        ram_total=200,
        queue_depth=0,
    )
    assert snapshot.gpu_memory_used == 100
    print("PASS: test_metrics_snapshot_defaults")
