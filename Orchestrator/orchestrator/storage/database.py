from __future__ import annotations

from pathlib import Path
import sqlite3

from typing import Iterator


class SQLiteDatabase:
    def __init__(self, path: Path) -> None:
        self._path = path

    def connect(self):
        return self._connect()

    def run_migrations(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as connection:
            connection.execute(
                "CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)"
            )
            current_version = self._get_schema_version(connection)
            for version, sql_path in self._iter_migration_files():
                if version <= current_version:
                    continue
                script = sql_path.read_text(encoding="utf-8")
                connection.executescript(script)
                connection.execute("DELETE FROM schema_version")
                connection.execute(
                    "INSERT INTO schema_version (version) VALUES (?)",
                    (version,),
                )
                connection.commit()

    def execute(self, sql: str, params: tuple = ()) -> None:
        with self._connect() as connection:
            connection.execute(sql, params)
            connection.commit()

    def fetchone(self, sql: str, params: tuple = ()): 
        with self._connect() as connection:
            cursor = connection.execute(sql, params)
            row = cursor.fetchone()
            return self._row_to_dict(row)

    def fetchall(self, sql: str, params: tuple = ()): 
        with self._connect() as connection:
            cursor = connection.execute(sql, params)
            rows = cursor.fetchall()
            return [self._row_to_dict(row) for row in rows if row is not None]

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self._path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA foreign_keys=ON")
        return connection

    def _get_schema_version(self, connection: sqlite3.Connection) -> int:
        cursor = connection.execute("SELECT version FROM schema_version LIMIT 1")
        row = cursor.fetchone()
        if row is None:
            return 0
        return int(row["version"])

    def _iter_migration_files(self) -> Iterator[tuple[int, Path]]:
        migrations_dir = Path(__file__).resolve().parent / "migrations"
        if not migrations_dir.exists():
            return iter(())

        migrations = []
        for path in migrations_dir.glob("*.sql"):
            version = int(path.stem.split("_")[0])
            migrations.append((version, path))

        return iter(sorted(migrations, key=lambda item: item[0]))

    @staticmethod
    def _row_to_dict(row: sqlite3.Row | None) -> dict | None:
        if row is None:
            return None
        return dict(row)
