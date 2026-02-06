from orchestrator.core.models.metrics import MetricsSnapshot
from orchestrator.storage.database import SQLiteDatabase
from orchestrator.storage.repositories.metrics_repo import MetricsRepository


def test_metrics_repo_roundtrip(tmp_path) -> None:
    db = SQLiteDatabase(tmp_path / "test.db")
    db.run_migrations()
    db.execute(
        "INSERT INTO backends (id, name, host) VALUES (?, ?, ?)",
        ("b1", "Backend", "127.0.0.1"),
    )
    repo = MetricsRepository(db)
    snapshot = MetricsSnapshot(
        id="m1",
        backend_id="b1",
        gpu_memory_used=10,
        gpu_memory_total=20,
        gpu_utilization=5.0,
        gpu_temperature=30,
        cpu_utilization=10.0,
        ram_used=100,
        ram_total=200,
        queue_depth=0,
    )
    repo.save(snapshot)
    fetched = repo.list_for_backend("b1")
    assert fetched
    assert fetched[0].id == "m1"
    print("PASS: test_metrics_repo_roundtrip")
