"""Durable Class Mode sessions, transcript chunks, and workflow provenance."""

import json
import os
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4
from . import storage_database


DB_PATH = Path(os.getenv("MUAWIN_CLASS_MODE_DB", Path(__file__).parent / "data" / "class_mode.sqlite3"))
CHUNK_SECONDS = max(1, int(os.getenv("TRANSCRIPT_CHUNK_SECONDS", "300")))
CHUNK_CHARS = max(1, int(os.getenv("TRANSCRIPT_MAX_CHARS", "12000")))


def now():
    return datetime.now(timezone.utc).isoformat()


@contextmanager
def connection():
    db = storage_database.connect(DB_PATH)
    try:
        with db:
            yield db
    finally:
        db.close()


def initialize():
    if storage_database.uses_postgres():
        storage_database.verify_schema(os.environ["MUAWIN_DATABASE_URL"])
        return
    with connection() as db:
        db.executescript("""
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS class_sessions (
            id TEXT PRIMARY KEY, teacher TEXT NOT NULL, course_id TEXT NOT NULL,
            course TEXT NOT NULL, timezone TEXT NOT NULL, started_at TEXT NOT NULL,
            ended_at TEXT, schedule_key TEXT, scheduled_end TEXT
        );
        CREATE UNIQUE INDEX IF NOT EXISTS class_active_teacher
            ON class_sessions(teacher) WHERE ended_at IS NULL;
        CREATE INDEX IF NOT EXISTS class_history ON class_sessions(teacher, course_id, started_at);
        CREATE TABLE IF NOT EXISTS class_chunks (
            id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES class_sessions(id),
            status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
            retry_at REAL NOT NULL DEFAULT 0, error TEXT, result TEXT
        );
        CREATE TABLE IF NOT EXISTS class_segments (
            id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL REFERENCES class_sessions(id),
            text TEXT NOT NULL, timestamp TEXT NOT NULL,
            chunk_id TEXT REFERENCES class_chunks(id)
        );
        CREATE INDEX IF NOT EXISTS class_chunks_session ON class_chunks(session_id);
        CREATE TABLE IF NOT EXISTS class_segment_events (
            event_id TEXT PRIMARY KEY, segment_id INTEGER NOT NULL REFERENCES class_segments(id)
        );
        CREATE INDEX IF NOT EXISTS class_segments_session ON class_segments(session_id, id);
        CREATE INDEX IF NOT EXISTS class_segments_unsealed
            ON class_segments(session_id, id) WHERE chunk_id IS NULL;
        CREATE TABLE IF NOT EXISTS class_suggestions (
            id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES class_sessions(id),
            chunk_id TEXT NOT NULL REFERENCES class_chunks(id), payload TEXT NOT NULL,
            decision TEXT NOT NULL DEFAULT 'proposed', review TEXT
        );
        CREATE TABLE IF NOT EXISTS class_workflows (
            id TEXT PRIMARY KEY, suggestion_id TEXT NOT NULL REFERENCES class_suggestions(id),
            status TEXT NOT NULL, updated_at TEXT NOT NULL, result TEXT, error TEXT,
            approved_at TEXT, draft TEXT
        );
        """)


def get_session(teacher, *, session_id=None, course_id=None, active=False):
    query = "SELECT * FROM class_sessions WHERE teacher=?"
    args = [teacher]
    for column, value in (("id", session_id), ("course_id", course_id)):
        if value is not None:
            query += f" AND {column}=?"
            args.append(value)
    if active:
        query += " AND ended_at IS NULL"
    with connection() as db:
        row = db.execute(query + " ORDER BY started_at DESC LIMIT 1", args).fetchone()
        return dict(row) if row else None


def session_history(teacher, course_id):
    with connection() as db:
        rows = db.execute("""
            SELECT * FROM class_sessions WHERE teacher=? AND course_id=?
            ORDER BY started_at DESC LIMIT 50
        """, (teacher, course_id)).fetchall()
        return [dict(row) for row in rows]


def start(teacher, course_id, course, zone, schedule_key=None, scheduled_end=None, *, manual=False):
    with connection() as db:
        db.execute("BEGIN IMMEDIATE")
        active = db.execute(
            "SELECT * FROM class_sessions WHERE teacher=? AND ended_at IS NULL", (teacher,)
        ).fetchone()
        if active:
            return dict(active)
        if not manual and schedule_key and db.execute(
            "SELECT 1 FROM class_sessions WHERE teacher=? AND schedule_key=?",
            (teacher, schedule_key),
        ).fetchone():
            return None
        session_id = uuid4().hex
        db.execute("""
            INSERT INTO class_sessions(id, teacher, course_id, course, timezone, started_at, schedule_key, scheduled_end)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (session_id, teacher, course_id, course, zone, now(), schedule_key, scheduled_end))
        return dict(db.execute("SELECT * FROM class_sessions WHERE id=?", (session_id,)).fetchone())


def append_segment(session_id, text, event_id=None):
    timestamp = now()
    with connection() as db:
        if event_id:
            db.execute("BEGIN IMMEDIATE")
            existing = db.execute("""
                SELECT p.id AS sequence, p.timestamp FROM class_segment_events e
                JOIN class_segments p ON p.id=e.segment_id WHERE e.event_id=?
            """, (event_id,)).fetchone()
            if existing:
                return dict(existing)
        row = db.execute(
            "INSERT INTO class_segments(session_id, text, timestamp) VALUES (?, ?, ?) RETURNING id",
            (session_id, text, timestamp),
        )
        sequence = row.fetchone()["id"]
        if event_id:
            db.execute("INSERT INTO class_segment_events VALUES (?, ?)", (event_id, sequence))
        return {"sequence": sequence, "timestamp": timestamp}


def seal_chunks():
    """Use the handover's time and size thresholds with durable, incremental input."""
    cutoff = datetime.now(timezone.utc).timestamp() - CHUNK_SECONDS

    def ready(segments, ended):
        return segments and (ended or datetime.fromisoformat(segments[0]["timestamp"]).timestamp() <= cutoff)

    with connection() as db:
        db.execute("BEGIN IMMEDIATE")
        rows = db.execute("""
            SELECT p.session_id, p.id, p.timestamp, length(p.text) AS size, s.ended_at
            FROM class_segments p JOIN class_sessions s ON s.id=p.session_id
            WHERE p.chunk_id IS NULL ORDER BY p.session_id, p.id
        """).fetchall()
        segments = []
        size = 0
        current = None
        ended = None
        for row in rows:
            if row["session_id"] != current:
                if ready(segments, ended):
                    _seal(db, current, segments)
                current, segments, size = row["session_id"], [], 0
            ended = row["ended_at"]
            segments.append(row)
            size += row["size"]
            elapsed = datetime.fromisoformat(row["timestamp"]) - datetime.fromisoformat(segments[0]["timestamp"])
            if size >= CHUNK_CHARS or elapsed.total_seconds() >= CHUNK_SECONDS:
                _seal(db, current, segments)
                segments, size = [], 0
        if ready(segments, ended):
            _seal(db, current, segments)


def _seal(db, session_id, segments):
    chunk_id = f"{session_id}-{segments[0]['id']}"
    db.execute(
        "INSERT INTO class_chunks(id, session_id) VALUES (?, ?)", (chunk_id, session_id)
    )
    db.executemany(
        "UPDATE class_segments SET chunk_id=? WHERE id=?",
        [(chunk_id, segment["id"]) for segment in segments],
    )


def stop(teacher, session_id):
    with connection() as db:
        db.execute("""
            UPDATE class_sessions SET ended_at=?
            WHERE id=? AND teacher=? AND ended_at IS NULL
        """, (now(), session_id, teacher))


def end_scheduled():
    with connection() as db:
        db.execute("""
            UPDATE class_sessions SET ended_at=scheduled_end
            WHERE ended_at IS NULL AND scheduled_end <= ?
        """, (now(),))


def recover_processing():
    with connection() as db:
        if os.getenv("MUAWIN_CLOUD") == "1":
            db.execute("""
                UPDATE class_chunks SET status='pending'
                WHERE status='processing' AND retry_at<=?
            """, (time.time(),))
            db.execute("""
                UPDATE class_suggestions SET decision='proposed'
                WHERE decision='preparing' AND preparing_until<=?
            """, (time.time(),))
            return
        db.execute("UPDATE class_chunks SET status='pending',retry_at=0 WHERE status='processing'")
        db.execute("UPDATE class_suggestions SET decision='proposed' WHERE decision='preparing'")
        db.execute("""
            UPDATE class_workflows SET status='interrupted'
            WHERE status NOT IN ('failed', 'completed', 'rejected', 'interrupted')
        """)


def claim_chunk():
    with connection() as db:
        db.execute("BEGIN IMMEDIATE")
        if os.getenv("MUAWIN_CLOUD") == "1":
            db.execute("UPDATE class_chunks SET status='pending' WHERE status='processing' AND retry_at<=?",
                       (time.time(),))
        order = "created_order" if storage_database.uses_postgres() else "rowid"
        row = db.execute(f"""
            SELECT c.*, s.course, s.started_at, s.timezone,
                (SELECT COUNT(*) FROM class_chunks prior
                 WHERE prior.session_id=c.session_id AND prior.{order}<=c.{order}) AS chunk_index
            FROM class_chunks c JOIN class_sessions s ON s.id=c.session_id
            WHERE c.status='pending' AND c.retry_at <= ? ORDER BY c.retry_at, c.{order} LIMIT 1
        """, (time.time(),)).fetchone()
        if not row:
            return None
        db.execute("UPDATE class_chunks SET status='processing',retry_at=? WHERE id=?",
                   (time.time() + 240, row["id"]))
        segments = db.execute("""
            SELECT text, timestamp FROM class_segments WHERE chunk_id=? ORDER BY id
        """, (row["id"],)).fetchall()
        return {**dict(row), "transcript": "\n".join(s["text"] for s in segments),
                "recorded_at": segments[0]["timestamp"]}


def previous_context(chunk_id, session_id):
    with connection() as db:
        rows = db.execute("""
            SELECT text FROM class_segments WHERE session_id=? AND id<
                (SELECT MIN(id) FROM class_segments WHERE chunk_id=?)
            ORDER BY id DESC LIMIT 12
        """, (session_id, chunk_id)).fetchall()
        return "\n".join(row["text"] for row in reversed(rows))[-3500:]


def complete_chunk(chunk, result, activities):
    with connection() as db:
        db.execute("""
            UPDATE class_chunks SET status='completed', result=?, error=NULL WHERE id=?
        """, (json.dumps(result, ensure_ascii=False), chunk["id"]))
        for index, activity in enumerate(activities):
            db.execute("""
                INSERT INTO class_suggestions(id, session_id, chunk_id, payload)
                VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING
            """, (f"{chunk['id']}-{index}", chunk["session_id"], chunk["id"],
                  json.dumps(activity, ensure_ascii=False)))


def fail_chunk(chunk, error):
    attempts = chunk["attempts"] + 1
    with connection() as db:
        db.execute("""
            UPDATE class_chunks SET status=?, attempts=?, retry_at=?, error=? WHERE id=?
        """, ("failed" if attempts >= 5 else "pending", attempts,
              time.time() + min(15 * 2 ** (attempts - 1), 300), error, chunk["id"]))


def retry_failed(session_id):
    with connection() as db:
        db.execute("""
            UPDATE class_chunks SET status='pending', attempts=0, retry_at=0, error=NULL
            WHERE session_id=? AND status='failed'
        """, (session_id,))


def review_session(session_id, after):
    order = "created_order" if storage_database.uses_postgres() else "rowid"
    with connection() as db:
        segments = db.execute("""
            SELECT id AS sequence, text, timestamp FROM class_segments
            WHERE session_id=? AND id>? ORDER BY id LIMIT 500
        """, (session_id, after)).fetchall()
        chunks = db.execute(f"""
            SELECT id, status, result, error FROM class_chunks WHERE session_id=? ORDER BY {order}
        """, (session_id,)).fetchall()
        suggestions = db.execute(f"""
            SELECT * FROM class_suggestions WHERE session_id=? ORDER BY {order}
        """, (session_id,)).fetchall()
        workflows = db.execute(f"""
            SELECT w.* FROM class_workflows w JOIN class_suggestions s ON w.suggestion_id=s.id
            WHERE s.session_id=? ORDER BY w.{order}
        """, (session_id,)).fetchall()
    return {
        "segments": [dict(row) for row in segments],
        "chunks": [{**dict(row), "result": json.loads(row["result"] or "null")} for row in chunks],
        "suggestions": [
            {**dict(row), "payload": json.loads(row["payload"]), "review": json.loads(row["review"] or "null"),
             "workflows": [{**dict(wf), "result": json.loads(wf["result"] or "null"),
                            "draft": json.loads(wf["draft"] or "null")}
                           for wf in workflows if wf["suggestion_id"] == row["id"]]}
            for row in suggestions
        ],
    }


def get_suggestion(session_id, suggestion_id):
    with connection() as db:
        row = db.execute("""
            SELECT * FROM class_suggestions WHERE id=? AND session_id=?
        """, (suggestion_id, session_id)).fetchone()
    return {**dict(row), "payload": json.loads(row["payload"])} if row else None


def decide(suggestion_id, decision, review=None, retry=False):
    order = "created_order" if storage_database.uses_postgres() else "rowid"
    with connection() as db:
        cursor = db.execute(f"""
            UPDATE class_suggestions SET decision=?, review=COALESCE(?, review)
            WHERE id=? AND (decision='proposed' OR
                (? = 1 AND decision='prepared' AND
                    (SELECT status FROM class_workflows WHERE suggestion_id=?
                     ORDER BY {order} DESC LIMIT 1) IN ('failed', 'interrupted')))
        """, (decision, json.dumps(review) if review else None, suggestion_id, retry, suggestion_id))
        if cursor.rowcount and decision == "preparing" and os.getenv("MUAWIN_CLOUD") == "1":
            db.execute("UPDATE class_suggestions SET preparing_until=? WHERE id=?",
                       (time.time() + 300, suggestion_id))
        return cursor.rowcount == 1


def record_workflow(suggestion_id, workflow, *, prepared=False):
    timestamp = now()
    with connection() as db:
        db.execute("""
            INSERT INTO class_workflows(id, suggestion_id, status, updated_at, result, error, approved_at, draft)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,
                updated_at=excluded.updated_at, result=excluded.result, error=excluded.error,
                approved_at=COALESCE(class_workflows.approved_at, excluded.approved_at),
                draft=COALESCE(excluded.draft, class_workflows.draft)
        """, (workflow["id"], suggestion_id, workflow["status"], timestamp,
              json.dumps(workflow.get("result"), ensure_ascii=False, default=str), workflow.get("error"),
              timestamp if workflow["status"] == "approved" else None,
              json.dumps(workflow["draft"], ensure_ascii=False, default=str) if workflow.get("draft") else None))
        if prepared:
            db.execute("UPDATE class_suggestions SET decision='prepared' WHERE id=?", (suggestion_id,))


def reset_preparation(suggestion_id):
    with connection() as db:
        db.execute("UPDATE class_suggestions SET decision='proposed' WHERE id=? AND decision='preparing'",
                   (suggestion_id,))
