"""Copy existing local MUAWIN records into PostgreSQL without overwriting remote rows.

Run with the backend stopped using python -m backend.supabase.migrate_sqlite.
"""

import sqlite3
from pathlib import Path
from tempfile import TemporaryDirectory

from psycopg import sql

from backend.storage_database import PostgresConnection, uses_postgres


ROOT = Path(__file__).resolve().parents[1] / "data"
SOURCES = {
    "muawin.sqlite3": (
        "ai_upload_history", "ai_clo_mapping", "ai_course_outline", "ai_class_schedule",
        "course_setup", "weekly_expectations", "reminders", "folder_candidates", "operation_events",
    ),
    "muawin_audit.sqlite3": ("audit_events",),
    "class_mode.sqlite3": (
        "class_sessions", "class_chunks", "class_segments", "class_segment_events",
        "class_suggestions", "class_workflows",
    ),
}


def migrate(data_directory=ROOT):
    if not uses_postgres():
        raise RuntimeError("Configure MUAWIN_DATABASE_URL before importing records.")
    target = PostgresConnection()
    try:
        with target, TemporaryDirectory(prefix="muawin-sqlite-snapshot-") as temporary:
            for filename, tables in SOURCES.items():
                source_path = Path(data_directory) / filename
                if not source_path.exists():
                    continue
                with sqlite3.connect(f"file:{source_path.as_posix()}?mode=ro", uri=True) as live:
                    snapshot = sqlite3.connect(str(Path(temporary) / filename))
                    try:
                        live.backup(snapshot)
                        snapshot.row_factory = sqlite3.Row
                        for table in tables:
                            _import_table(snapshot, target, table)
                    finally:
                        snapshot.close()
            for tables in SOURCES.values():
                for table in tables:
                    if "id" not in target.columns(table):
                        continue
                    identity = target.raw.execute("""
                        SELECT pg_get_serial_sequence(%s, 'id') AS sequence
                    """, (table,)).fetchone()["sequence"]
                    if identity:
                        target.raw.execute(sql.SQL("""
                            SELECT setval(%s, COALESCE((SELECT MAX(id) FROM {}), 1),
                                EXISTS(SELECT 1 FROM {}))
                        """).format(sql.Identifier(table), sql.Identifier(table)), (identity,))
        print("Migration committed. Original SQLite files remain available.")
    finally:
        target.close()


def _import_table(source, target, table):
    info = source.execute(f'PRAGMA table_info("{table}")').fetchall()
    remote_columns = target.columns(table)
    columns = [row["name"] for row in info if row["name"] in remote_columns]
    primary = [row["name"] for row in sorted(info, key=lambda row: row["pk"]) if row["pk"]]
    if not columns or not primary:
        raise RuntimeError(f"Missing source schema for {table}")
    names = sql.SQL(",").join(map(sql.Identifier, columns))
    remote = target.raw.execute(sql.SQL("SELECT {} FROM {}").format(names, sql.Identifier(table))).fetchall()
    existing = {tuple(row[key] for key in primary): row for row in remote}
    rows = source.execute(f'SELECT * FROM "{table}" ORDER BY rowid').fetchall()
    pending = []
    for row in rows:
        saved = existing.get(tuple(row[key] for key in primary))
        if saved:
            if any(saved[column] != row[column] for column in columns):
                raise RuntimeError(f"Conflicting existing record in {table}; import rolled back.")
        else:
            pending.append(tuple(row[column] for column in columns))
    for offset in range(0, len(pending), 250):
        batch = pending[offset:offset + 250]
        values = sql.SQL(",").join(
            sql.SQL("({})").format(sql.SQL(",").join(sql.Placeholder() for _ in columns)) for _ in batch
        )
        target.raw.execute(
            sql.SQL("INSERT INTO {} ({}) VALUES {}").format(sql.Identifier(table), names, values),
            [value for row in batch for value in row],
        )
    print(f"{table}: imported {len(pending)}, matched {len(rows) - len(pending)}", flush=True)


if __name__ == "__main__":
    migrate()
