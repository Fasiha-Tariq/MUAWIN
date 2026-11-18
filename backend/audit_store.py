"""Local SQLite audit trail; independent of the optional PostgreSQL database."""
from __future__ import annotations
import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

BACKEND_DIR = Path(__file__).resolve().parent
DB_PATH = Path(os.getenv("MUAWIN_AUDIT_DB", str(BACKEND_DIR / "data" / "muawin_audit.sqlite3")))
DB_PATH.parent.mkdir(parents=True, exist_ok=True)


def _connect():
    con = sqlite3.connect(DB_PATH, timeout=15)
    con.row_factory = sqlite3.Row
    return con


def init_audit_db():
    with _connect() as con:
        con.execute("""CREATE TABLE IF NOT EXISTS audit_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            teacher_username TEXT NOT NULL,
            workflow_id TEXT,
            action TEXT NOT NULL,
            status TEXT NOT NULL,
            course TEXT,
            week INTEGER,
            file_name TEXT,
            details TEXT
        )""")
        con.execute("CREATE INDEX IF NOT EXISTS idx_audit_teacher_time ON audit_events(teacher_username, created_at DESC)")


def record_event(*, teacher_username: str, action: str, status: str,
                 workflow_id: str | None = None, course: str | None = None,
                 week: int | None = None, file_name: str | None = None,
                 details: dict[str, Any] | None = None):
    init_audit_db()
    with _connect() as con:
        cur = con.execute("""INSERT INTO audit_events
            (created_at, teacher_username, workflow_id, action, status, course, week, file_name, details)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (datetime.now(timezone.utc).isoformat(), teacher_username, workflow_id,
             action, status, course, week, file_name,
             json.dumps(details or {}, ensure_ascii=False, default=str)))
        return cur.lastrowid


def list_events(teacher_username: str, limit: int = 200):
    init_audit_db()
    with _connect() as con:
        rows = con.execute("""SELECT * FROM audit_events
            WHERE teacher_username = ? ORDER BY id DESC LIMIT ?""",
            (teacher_username, max(1, min(int(limit), 500)))).fetchall()
    return [{**dict(row), "details": json.loads(row["details"] or "{}")} for row in rows]
