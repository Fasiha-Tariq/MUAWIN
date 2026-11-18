"""
MUAWIN feature database.
Uses a local SQLite database for outlines, CLO mappings, upload history,
course setup, timetable expectations, folder candidates, reminders and audit events.
No PostgreSQL service is required for these MUAWIN AI features.
"""
from __future__ import annotations

import json
from contextlib import contextmanager
import os
import re
import sqlite3
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

HERE = Path(__file__).resolve().parent
DB_PATH = Path(os.getenv("MUAWIN_SQLITE_PATH", str(HERE / "data" / "muawin.sqlite3")))
MIN_REPEATS = 2
MIN_SHARE = 0.25
MIN_HISTORY = 3

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()

def _connect():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout=15000")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn

@contextmanager
def _db():
    conn = _connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def course_key(course: Optional[str]) -> str:
    text = re.sub(r"\s*\([^)]*\)\s*$", "", course or "")
    return re.sub(r"\s+", " ", text).strip().lower()

def ensure_tables() -> bool:
    schema = """
    CREATE TABLE IF NOT EXISTS ai_upload_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT, teacher TEXT NOT NULL, course_key TEXT NOT NULL,
      course TEXT NOT NULL, week INTEGER, item_type TEXT NOT NULL, title TEXT, file_name TEXT,
      weekday INTEGER NOT NULL, uploaded_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_upload_teacher_course ON ai_upload_history(teacher, course_key);
    CREATE TABLE IF NOT EXISTS ai_clo_mapping (
      id INTEGER PRIMARY KEY AUTOINCREMENT, teacher TEXT NOT NULL, course TEXT NOT NULL,
      week INTEGER, item_type TEXT NOT NULL, title TEXT, clos TEXT, week_clos TEXT,
      llm_clos TEXT, method TEXT, needs_review INTEGER DEFAULT 0, reason TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ai_course_outline (
      id INTEGER PRIMARY KEY AUTOINCREMENT, teacher TEXT NOT NULL, course_key TEXT NOT NULL,
      course TEXT NOT NULL, title TEXT, source_name TEXT, data TEXT NOT NULL, uploaded_at TEXT NOT NULL,
      UNIQUE(teacher, course_key)
    );
    CREATE TABLE IF NOT EXISTS ai_class_schedule (
      id INTEGER PRIMARY KEY AUTOINCREMENT, teacher TEXT NOT NULL, course_key TEXT NOT NULL,
      course TEXT NOT NULL, weekday INTEGER NOT NULL, start_time TEXT, end_time TEXT,
      auto_lecture INTEGER DEFAULT 1, auto_assignment INTEGER DEFAULT 0,
      UNIQUE(teacher, course_key, weekday, start_time, end_time)
    );
    CREATE TABLE IF NOT EXISTS course_setup (
      teacher TEXT NOT NULL, course_key TEXT NOT NULL, course TEXT NOT NULL,
      folder_path TEXT, timetable_json TEXT, timetable_confirmed INTEGER DEFAULT 0,
      outline_confirmed INTEGER DEFAULT 0, semester_started_at TEXT,
      outline_file_path TEXT, timetable_file_path TEXT,
      updated_at TEXT NOT NULL, PRIMARY KEY(teacher, course_key)
    );
    CREATE TABLE IF NOT EXISTS weekly_expectations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teacher TEXT NOT NULL,
    course_key TEXT NOT NULL,
    course TEXT NOT NULL,
    week INTEGER NOT NULL,
    expected_topic TEXT DEFAULT '',
    due_date TEXT,
    status TEXT DEFAULT 'pending',
    source TEXT DEFAULT 'outline',
    uploaded_at TEXT,
    notes TEXT,
    UNIQUE(teacher, course_key, week)
);
    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT, teacher TEXT NOT NULL, course_key TEXT NOT NULL,
      course TEXT NOT NULL, week INTEGER, title TEXT NOT NULL, message TEXT NOT NULL,
      status TEXT DEFAULT 'active', due_at TEXT, snoozed_until TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, dedupe_key TEXT NOT NULL,
      UNIQUE(teacher, dedupe_key)
    );
    CREATE TABLE IF NOT EXISTS folder_candidates (
      id INTEGER PRIMARY KEY AUTOINCREMENT, teacher TEXT NOT NULL, course_key TEXT NOT NULL,
      course TEXT NOT NULL, file_path TEXT NOT NULL, file_name TEXT NOT NULL,
      size_bytes INTEGER DEFAULT 0, modified_at TEXT, status TEXT DEFAULT 'pending',
      created_at TEXT NOT NULL, UNIQUE(teacher, course_key, file_path)
    );
    CREATE TABLE IF NOT EXISTS operation_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, teacher TEXT NOT NULL, course TEXT,
      event_type TEXT NOT NULL, status TEXT NOT NULL, details TEXT, created_at TEXT NOT NULL
    );
    """
    try:
        with _db() as db:
            db.executescript(schema)

            # Backward-compatible folder candidate migration.
            candidate_columns = {
                row["name"]
                for row in db.execute("PRAGMA table_info(folder_candidates)").fetchall()
            }
            if "size_bytes" not in candidate_columns:
                db.execute("ALTER TABLE folder_candidates ADD COLUMN size_bytes INTEGER DEFAULT 0")
            if "status" not in candidate_columns:
                db.execute("ALTER TABLE folder_candidates ADD COLUMN status TEXT DEFAULT 'pending'")


            # Backward-compatible upload-history migration.
            upload_columns = {
                row["name"]
                for row in db.execute("PRAGMA table_info(ai_upload_history)").fetchall()
            }
            if "is_active" not in upload_columns:
                db.execute(
                    "ALTER TABLE ai_upload_history ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1"
                )

            # Safe migration for databases created by older MUAWIN versions.
            columns = {
                row["name"]
                for row in db.execute("PRAGMA table_info(course_setup)").fetchall()
            }

            if "timetable_json" not in columns:
                db.execute("ALTER TABLE course_setup ADD COLUMN timetable_json TEXT")

            if "folder_path" not in columns:
                db.execute("ALTER TABLE course_setup ADD COLUMN folder_path TEXT")

            if "timetable_confirmed" not in columns:
                db.execute(
                    "ALTER TABLE course_setup ADD COLUMN timetable_confirmed INTEGER DEFAULT 0"
                )

            if "outline_file_path" not in columns:
                db.execute("ALTER TABLE course_setup ADD COLUMN outline_file_path TEXT")
            if "timetable_file_path" not in columns:
                db.execute("ALTER TABLE course_setup ADD COLUMN timetable_file_path TEXT")
            if "outline_confirmed" not in columns:
                db.execute("ALTER TABLE course_setup ADD COLUMN outline_confirmed INTEGER DEFAULT 0")
            if "semester_started_at" not in columns:
                db.execute("ALTER TABLE course_setup ADD COLUMN semester_started_at TEXT")

            # Backward-compatible migration for older reminders tables.
            reminder_columns = {
                row["name"]
                for row in db.execute("PRAGMA table_info(reminders)").fetchall()
            }

            reminder_additions = {
                "title": "TEXT DEFAULT ''",
                "due_at": "TEXT",
                "snoozed_until": "TEXT",
                "updated_at": "TEXT",
                "dedupe_key": "TEXT DEFAULT ''",
            }

            for column, definition in reminder_additions.items():
                if column not in reminder_columns:
                    db.execute(
                        f"ALTER TABLE reminders ADD COLUMN {column} {definition}"
                    )

            # Fill new fields without deleting or replacing existing records.
            db.execute("""
                UPDATE reminders
                SET title = CASE
                    WHEN title IS NULL OR title = ''
                    THEN 'Lecture reminder - Week ' || COALESCE(week, '?')
                    ELSE title
                END
            """)

            db.execute("""
                UPDATE reminders
                SET updated_at = COALESCE(NULLIF(updated_at, ''), created_at, ?)
                WHERE updated_at IS NULL OR updated_at = ''
            """, (_now(),))

            # Preserve existing keys; generate unique keys for legacy rows.
            existing = db.execute("""
                SELECT id, teacher, course_key, week, dedupe_key
                FROM reminders
                ORDER BY id
            """).fetchall()

            used_keys = set()

            for row in existing:
                teacher_value = row["teacher"]
                key = str(row["dedupe_key"] or "").strip()

                if not key:
                    if row["week"] is not None:
                        key = (
                            f"{row['course_key']}-missed-lecture-week-{row['week']}"
                        )
                    else:
                        key = f"legacy-reminder-{row['id']}"

                original_key = key
                suffix = 1

                while (teacher_value, key) in used_keys:
                    key = f"{original_key}-legacy-{row['id']}-{suffix}"
                    suffix += 1

                used_keys.add((teacher_value, key))

                if key != str(row["dedupe_key"] or "").strip():
                    db.execute(
                        "UPDATE reminders SET dedupe_key=? WHERE id=?",
                        (key, row["id"])
                    )

            db.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS
                idx_reminders_teacher_dedupe
                ON reminders(teacher, dedupe_key)
            """)

            db.commit()
        return True
    except Exception as exc:
        print(f"[AI-DB] SQLite initialization failed: {exc}")
        return False

def _ensure():
    if not ensure_tables():
        raise RuntimeError("MUAWIN SQLite database could not be initialized.")

def record_event(teacher: str, event_type: str, status: str = "success",
                 course: str = "", details: Any = None) -> bool:
    try:
        _ensure()
        payload = json.dumps(details, ensure_ascii=False, default=str) if not isinstance(details, str) else details
        with _db() as db:
            columns = {r["name"] for r in db.execute("PRAGMA table_info(operation_events)").fetchall()}
            fields = {"teacher": teacher.strip(), "course": course,
                      "status": status, "details": payload,
                      "created_at": _now(), "event_type": event_type,
                      "action": event_type}
            selected = {k: v for k, v in fields.items() if k in columns}
            names = list(selected)
            sql = f"INSERT INTO operation_events ({','.join(names)}) VALUES ({','.join('?' for _ in names)})"
            db.execute(sql, list(selected.values()))
        return True
    except Exception as exc:
        print(f"[AI-DB] record_event failed: {exc}")
        return False

def record_upload(teacher: str, course: str, week: Optional[int], item_type: str,
                  title: str = "", file_name: str = "") -> bool:
    try:
        _ensure()
        now = datetime.now()
        ckey = course_key(course)
        with _db() as db:
            db.execute("""INSERT INTO ai_upload_history
                (teacher,course_key,course,week,item_type,title,file_name,weekday,uploaded_at)
                VALUES(?,?,?,?,?,?,?,?,?)""",
                (teacher.strip(), ckey, course, week, item_type, title[:255],
                 file_name[:255], now.weekday(), now.replace(tzinfo=timezone.utc).isoformat()))
            if week is not None:
                # Resolve missing-lecture reminders for all teachers enrolled in this course.
                db.execute("""
                    UPDATE reminders
                    SET status='completed', updated_at=?
                    WHERE course_key=? AND week=? AND status IN ('active','snoozed')
                """, (_now(), ckey, int(week)))

                # Mark the matching expected lecture as completed across co-teachers in the course.
                # Assignment uploads must not change lecture progress.
                if item_type == "lecture":
                    db.execute("""
                        UPDATE weekly_expectations
                        SET status='completed', uploaded_at=?
                        WHERE course_key=? AND week=?
                          AND COALESCE(status, 'pending') <> 'not_expected'
                    """, (
                        now.replace(tzinfo=timezone.utc).isoformat(),
                        ckey,
                        int(week)
                    ))
        record_event(teacher, f"{item_type}_uploaded", "success", course,
                     {"week": week, "title": title, "file_name": file_name})
        return True
    except Exception as exc:
        print(f"[AI-DB] record_upload failed: {exc}")
        return False

def save_clo_mapping(teacher: str, course: str, week: Optional[int], item_type: str,
                     title: str, clo: Dict[str, Any]) -> bool:
    try:
        _ensure()
        with _db() as db:
            db.execute("""INSERT INTO ai_clo_mapping
              (teacher,course,week,item_type,title,clos,week_clos,llm_clos,method,needs_review,reason,created_at)
              VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
              (teacher.strip(), course, week, item_type, title[:255],
               ",".join(clo.get("clos") or []), ",".join(clo.get("week_clos") or []),
               ",".join(clo.get("llm_clos") or []), clo.get("method"),
               int(bool(clo.get("needs_review"))), clo.get("reason"), _now()))
        return True
    except Exception as exc:
        print(f"[AI-DB] save_clo_mapping failed: {exc}")
        return False


def _ensure_setup_lifecycle_columns(db):
    columns = {row["name"] for row in db.execute("PRAGMA table_info(course_setup)")}
    for name, definition in (
        ("setup_completed", "INTEGER DEFAULT 0"),
        ("outline_status_ready", "INTEGER DEFAULT 0"),
        ("schedule_status_ready", "INTEGER DEFAULT 0"),
    ):
        if name not in columns:
            db.execute(f"ALTER TABLE course_setup ADD COLUMN {name} {definition}")


def _refresh_setup_completion(teacher: str, course: str) -> bool:
    try:
        _ensure()
        with _db() as db:
            _ensure_setup_lifecycle_columns(db)
            key = course_key(course)
            row = db.execute(
                "SELECT folder_path, timetable_confirmed FROM course_setup WHERE teacher=? AND course_key=?",
                (str(teacher).strip(), key)
            ).fetchone()
            if not row:
                return False
            outline = db.execute(
                "SELECT 1 FROM ai_course_outline WHERE course_key=? LIMIT 1",
                (key,)
            ).fetchone()
            slots = db.execute(
                "SELECT 1 FROM ai_class_schedule WHERE course_key=? LIMIT 1",
                (key,)
            ).fetchone()
            folder = row["folder_path"]
            has_timetable = bool(
                row["timetable_confirmed"]
                or db.execute(
                    "SELECT 1 FROM course_setup WHERE course_key=? AND timetable_confirmed=1 LIMIT 1",
                    (key,)
                ).fetchone()
                or slots
            )
            complete = bool(outline and slots and has_timetable
                            and folder and Path(folder).is_dir())
            if complete:
                db.execute("""
                    UPDATE course_setup
                    SET setup_completed=1, outline_status_ready=1,
                        schedule_status_ready=1, updated_at=?
                    WHERE teacher=? AND course_key=?
                """, (_now(), str(teacher).strip(), key))
        return True
    except Exception as exc:
        print(f"[AI-DB] setup lifecycle refresh failed: {exc}")
        return False


def set_moellim_setup_status(teacher: str, course: str,
                             outline_ready: bool, schedule_ready: bool) -> bool:
    try:
        _ensure()
        with _db() as db:
            _ensure_setup_lifecycle_columns(db)
            db.execute("""
                UPDATE course_setup
                SET outline_status_ready=?, schedule_status_ready=?, updated_at=?
                WHERE teacher=? AND course_key=?
            """, (int(bool(outline_ready)), int(bool(schedule_ready)), _now(),
                  str(teacher).strip(), course_key(course)))
        return True
    except Exception as exc:
        print(f"[AI-DB] Moellim setup status update failed: {exc}")
        return False


def save_outline(teacher: str, course: str, outline: Dict[str, Any], source_name: str = "") -> bool:
    try:
        _ensure()
        with _db() as db:
            db.execute("""INSERT INTO ai_course_outline
              (teacher,course_key,course,title,source_name,data,uploaded_at) VALUES(?,?,?,?,?,?,?)
              ON CONFLICT(teacher,course_key) DO UPDATE SET course=excluded.course,title=excluded.title,
              source_name=excluded.source_name,data=excluded.data,uploaded_at=excluded.uploaded_at""",
              (teacher.strip(), course_key(course), course, (outline.get("title") or "")[:255],
               source_name[:255], json.dumps(outline, ensure_ascii=False), _now()))
            db.execute("""INSERT INTO course_setup (teacher,course_key,course,outline_confirmed,updated_at)
                VALUES (?,?,?,1,?) ON CONFLICT(teacher,course_key) DO UPDATE SET
                outline_confirmed=1,updated_at=excluded.updated_at""",
                (teacher.strip(),course_key(course),course,_now()))
            db.execute("""UPDATE course_setup SET semester_started_at=COALESCE(semester_started_at,?)
                WHERE teacher=? AND course_key=? AND outline_confirmed=1 AND timetable_confirmed=1""",
                (_now(),teacher.strip(),course_key(course)))
            # Synchronize 16 tracker weeks from the saved outline without deleting
            # rows or changing completion status, due dates, upload timestamps or notes.
            outline_weeks = outline.get("weeks") or {}
            if isinstance(outline_weeks, list):
                outline_weeks = {
                    str(row.get("week", i + 1)): row
                    for i, row in enumerate(outline_weeks) if isinstance(row, dict)
                }
            for week in range(1, 17):
                row = outline_weeks.get(str(week), outline_weeks.get(week, {}))
                topic = row.get("topic", "") if isinstance(row, dict) else str(row or "")
                topic = str(topic or "").strip() or "To be confirmed"
                db.execute("""
                    INSERT INTO weekly_expectations
                      (teacher,course_key,course,week,expected_topic,status,source)
                    VALUES(?,?,?,?,?,'pending','outline')
                    ON CONFLICT(teacher,course_key,week) DO UPDATE SET
                      course=excluded.course,
                      expected_topic=excluded.expected_topic,
                      source='outline'
                """, (teacher.strip(), course_key(course), course, week, topic))
        _refresh_setup_completion(teacher, course)
        record_event(teacher, "outline_saved", "success", course, {"source": source_name})
        return True
    except Exception as exc:
        print(f"[AI-DB] save_outline failed: {exc}")
        return False

def get_outline(teacher: str, course: str) -> Optional[Dict[str, Any]]:
    try:
        _ensure()
        with _db() as db:
            row = db.execute("SELECT data,source_name,title FROM ai_course_outline WHERE teacher=? AND course_key=?",
                             (teacher.strip(), course_key(course))).fetchone()
        if not row: return None
        data = json.loads(row["data"])
        data.setdefault("title", row["title"] or course)
        data["source"] = row["source_name"] or data.get("source", "")
        return data
    except Exception as exc:
        print(f"[AI-DB] get_outline failed: {exc}")
        return None


def get_shared_course_outline(teacher: str, course: str) -> Optional[Dict[str, Any]]:
    """Return this teacher's outline, or mirror an existing co-teacher's outline for the same course_key."""
    own = get_outline(teacher, course)
    if own:
        return own
    try:
        _ensure()
        ckey = course_key(course)
        with _db() as db:
            row = db.execute(
                """SELECT teacher, data, source_name, title
                   FROM ai_course_outline
                   WHERE course_key=?
                   ORDER BY uploaded_at DESC LIMIT 1""",
                (ckey,)
            ).fetchone()
            if not row:
                return None

            data = json.loads(row["data"])
            data.setdefault("title", row["title"] or course)
            data["source"] = row["source_name"] or data.get("source", "")
            data["shared_from_teacher"] = row["teacher"]

            db.execute("""INSERT INTO ai_course_outline
              (teacher,course_key,course,title,source_name,data,uploaded_at) VALUES(?,?,?,?,?,?,?)
              ON CONFLICT(teacher,course_key) DO NOTHING""",
              (teacher.strip(), ckey, course, (row["title"] or "")[:255],
               (row["source_name"] or "")[:255], row["data"], _now()))

            db.execute("""INSERT INTO course_setup (teacher,course_key,course,outline_confirmed,updated_at)
                VALUES (?,?,?,1,?) ON CONFLICT(teacher,course_key) DO UPDATE SET
                outline_confirmed=1, updated_at=excluded.updated_at""",
                (teacher.strip(), ckey, course, _now()))

            db.execute("""
                INSERT OR IGNORE INTO weekly_expectations
                  (teacher, course_key, course, week, expected_topic, due_date, status, source, uploaded_at, notes)
                SELECT ?, course_key, ?, week, expected_topic, due_date, status, source, uploaded_at, notes
                FROM weekly_expectations
                WHERE course_key=? AND teacher=?
            """, (teacher.strip(), course, ckey, row["teacher"]))

        _refresh_setup_completion(teacher, course)
        return data
    except Exception as exc:
        print(f"[AI-DB] get_shared_course_outline failed: {exc}")
        return None


def list_outlines(teacher: str) -> List[Dict[str, Any]]:
    try:
        _ensure()
        with _db() as db:
            rows = db.execute("SELECT course,title,source_name,data,uploaded_at FROM ai_course_outline WHERE teacher=? ORDER BY course",
                              (teacher.strip(),)).fetchall()
        out=[]
        for r in rows:
            data=json.loads(r["data"])
            out.append({"course":r["course"],"title":r["title"],"source_name":r["source_name"],
                        "clo_count":len(data.get("clos") or {}),"week_count":len(data.get("weeks") or {}),
                        "uploaded_at":r["uploaded_at"]})
        return out
    except Exception as exc:
        print(f"[AI-DB] list_outlines failed: {exc}")
        return []

def delete_outline(teacher: str, course: str) -> bool:
    try:
        _ensure()
        with _db() as db:
            db.execute("DELETE FROM ai_course_outline WHERE teacher=? AND course_key=?",
                       (teacher.strip(), course_key(course)))
        return True
    except Exception as exc:
        print(f"[AI-DB] delete_outline failed: {exc}")
        return False

def _hhmm(value: Any) -> Optional[str]:
    if value in (None, ""): return None
    text=str(value).strip()
    return text[:5] if re.match(r"^\d{1,2}:\d{2}", text) else None

def save_schedule(teacher: str, course: str, slots: List[Dict[str, Any]]) -> Optional[int]:
    try:
        _ensure()
        key=course_key(course)
        with _db() as db:
            db.execute("DELETE FROM ai_class_schedule WHERE teacher=? AND course_key=?", (teacher.strip(),key))
            count=0
            for slot in slots or []:
                day=slot.get("weekday",slot.get("day",0))
                if isinstance(day,str):
                    names=["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]
                    day=names.index(day.lower()) if day.lower() in names else int(day)
                db.execute("""INSERT OR IGNORE INTO ai_class_schedule
                  (teacher,course_key,course,weekday,start_time,end_time,auto_lecture,auto_assignment)
                  VALUES(?,?,?,?,?,?,?,?)""",
                  (teacher.strip(),key,course,int(day),_hhmm(slot.get("start_time") or slot.get("start")),
                   _hhmm(slot.get("end_time") or slot.get("end")),int(slot.get("auto_lecture",True)),
                   int(slot.get("auto_assignment",False))))
                count += 1
        _refresh_setup_completion(teacher, course)
        return count
    except Exception as exc:
        print(f"[AI-DB] save_schedule failed: {exc}")
        return None

def get_schedule(teacher: str, course: str) -> List[Dict[str, Any]]:
    try:
        _ensure()
        with _db() as db:
            rows=db.execute("SELECT weekday,start_time,end_time,auto_lecture,auto_assignment FROM ai_class_schedule WHERE teacher=? AND course_key=? ORDER BY weekday,start_time",
                            (teacher.strip(),course_key(course))).fetchall()
        return [{"weekday":r["weekday"],"start_time":r["start_time"],"end_time":r["end_time"],
                 "auto_lecture":bool(r["auto_lecture"]),"auto_assignment":bool(r["auto_assignment"])} for r in rows]
    except Exception as exc:
        print(f"[AI-DB] get_schedule failed: {exc}")
        return []


def get_shared_schedule(teacher: str, course: str) -> List[Dict[str, Any]]:
    """Return this teacher's class schedule, or fall back to a co-teacher's saved schedule for the course."""
    own = get_schedule(teacher, course)
    if own:
        return own
    try:
        _ensure()
        ckey = course_key(course)
        with _db() as db:
            other = db.execute(
                "SELECT teacher FROM ai_class_schedule WHERE course_key=? LIMIT 1",
                (ckey,)
            ).fetchone()
            if not other:
                return []
            rows = db.execute(
                """SELECT weekday, start_time, end_time, auto_lecture, auto_assignment
                   FROM ai_class_schedule
                   WHERE course_key=? AND teacher=?
                   ORDER BY weekday, start_time""",
                (ckey, other["teacher"])
            ).fetchall()
        return [{
            "weekday": r["weekday"],
            "start_time": r["start_time"],
            "end_time": r["end_time"],
            "auto_lecture": bool(r["auto_lecture"]),
            "auto_assignment": bool(r["auto_assignment"]),
        } for r in rows]
    except Exception as exc:
        print(f"[AI-DB] get_shared_schedule failed: {exc}")
        return []


def learned_upload_days(teacher: str, course: str) -> List[int]:
    try:
        _ensure()
        with _db() as db:
            rows=db.execute("SELECT weekday,COUNT(*) n FROM ai_upload_history WHERE teacher=? AND course_key=? AND item_type='lecture' GROUP BY weekday",
                            (teacher.strip(),course_key(course))).fetchall()
        counts={r["weekday"]:r["n"] for r in rows}; total=sum(counts.values())
        if total < MIN_HISTORY: return []
        return [day for day,n in counts.items() if n>=MIN_REPEATS and n/total>=MIN_SHARE]
    except Exception as exc:
        print(f"[AI-DB] learned_upload_days failed: {exc}")
        return []

def upload_day_check(teacher: str, course: str, today: Optional[datetime] = None) -> Dict[str, Any]:
    today=today or datetime.now()
    days=learned_upload_days(teacher,course)
    return {"known":bool(days),"usual_days":days,"today":today.weekday(),
            "matches":today.weekday() in days if days else False}

def save_course_setup(teacher: str, course: str, folder_path: Optional[str] = None,
                      timetable: Optional[Dict[str, Any]] = None,
                      timetable_confirmed: Optional[bool] = None) -> bool:
    try:
        _ensure()
        with _db() as db:
            old=db.execute("SELECT * FROM course_setup WHERE teacher=? AND course_key=?",
                           (teacher.strip(),course_key(course))).fetchone()
            folder=folder_path if folder_path is not None else (old["folder_path"] if old else None)
            table=json.dumps(timetable,ensure_ascii=False) if timetable is not None else (old["timetable_json"] if old else None)
            confirmed=int(timetable_confirmed if timetable_confirmed is not None else (old["timetable_confirmed"] if old else 0))
            db.execute("""INSERT INTO course_setup(teacher,course_key,course,folder_path,timetable_json,timetable_confirmed,updated_at)
              VALUES(?,?,?,?,?,?,?) ON CONFLICT(teacher,course_key) DO UPDATE SET course=excluded.course,
              folder_path=excluded.folder_path,timetable_json=excluded.timetable_json,
              timetable_confirmed=excluded.timetable_confirmed,updated_at=excluded.updated_at""",
              (teacher.strip(),course_key(course),course,folder,table,confirmed,_now()))
            db.execute("""UPDATE course_setup SET semester_started_at=COALESCE(semester_started_at,?)
                WHERE teacher=? AND course_key=? AND outline_confirmed=1 AND timetable_confirmed=1""",
                (_now(),teacher.strip(),course_key(course)))
        _refresh_setup_completion(teacher, course)
        return True
    except Exception as exc:
        print(f"[AI-DB] save_course_setup failed: {exc}")
        return False

def get_course_setup(teacher: str, course: str) -> Dict[str, Any]:
    try:
        _ensure()
        with _db() as db:
            _ensure_setup_lifecycle_columns(db)
            row=db.execute("SELECT * FROM course_setup WHERE teacher=? AND course_key=?",
                           (teacher.strip(),course_key(course))).fetchone()
        if not row: return {"course":course,"folder_path":None,"timetable":None,"timetable_confirmed":False,"outline_confirmed":False,"semester_started_at":None,"setup_completed":False,"outline_status_ready":False,"schedule_status_ready":False}
        return {"course":row["course"],"folder_path":row["folder_path"],
                "setup_completed":bool(row["setup_completed"]),
                "outline_status_ready":bool(row["outline_status_ready"]),
                "schedule_status_ready":bool(row["schedule_status_ready"]),
                "timetable":json.loads(row["timetable_json"]) if row["timetable_json"] else None,
                "timetable_confirmed":bool(row["timetable_confirmed"]),
                "outline_confirmed":bool(row["outline_confirmed"]),
                "semester_started_at":row["semester_started_at"],
                "outline_file_path":row["outline_file_path"],"timetable_file_path":row["timetable_file_path"],"updated_at":row["updated_at"]}
    except Exception as exc:
        print(f"[AI-DB] get_course_setup failed: {exc}")
        return {"course":course,"folder_path":None,"timetable":None,"timetable_confirmed":False}

def get_semester_current_week(teacher: str, course: str) -> Optional[int]:
    try:
        setup = get_course_setup(teacher, course)
        started = setup.get("semester_started_at")
        if not started:
            ckey = course_key(course)
            with _db() as db:
                row = db.execute(
                    "SELECT semester_started_at FROM course_setup WHERE course_key=? AND semester_started_at IS NOT NULL ORDER BY semester_started_at ASC LIMIT 1",
                    (ckey,)
                ).fetchone()
            started = row["semester_started_at"] if row else None
        if not started:
            return None
        start = datetime.fromisoformat(str(started).replace("Z", "+00:00"))
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        elapsed = (datetime.now(timezone.utc) - start.astimezone(timezone.utc)).total_seconds()
        return max(1, int(elapsed // 604800) + 1)
    except Exception as exc:
        print(f"[AI-DB] semester week failed: {exc}")
        return None


def save_expectations(teacher: str, course: str, weeks: List[Dict[str, Any]]) -> bool:
    """Merge teacher-confirmed expectations without deleting tracker history."""
    try:
        _ensure()
        with _db() as db:
            for item in weeks:
                week = int(item.get("week"))
                if week < 1 or week > 52:
                    continue
                topic = str(item.get("expected_topic") or item.get("topic") or "").strip()
                due_date = item.get("due_date")
                db.execute("""
                    INSERT INTO weekly_expectations
                    (teacher, course_key, course, week, expected_topic, due_date, status, source)
                    VALUES (?, ?, ?, ?, ?, ?, 'pending', 'teacher_confirmed')
                    ON CONFLICT(teacher,course_key,week) DO UPDATE SET
                      course=excluded.course,
                      expected_topic=excluded.expected_topic,
                      due_date=COALESCE(excluded.due_date, weekly_expectations.due_date),
                      source='teacher_confirmed'
                """, (teacher.strip(), course_key(course), course, week, topic, due_date))
        record_event(teacher, "weekly_expectations_saved", "success", course, {"count": len(weeks)})
        return True
    except Exception as exc:
        print(f"[AI-DB] save_expectations failed: {exc}")
        return False

def get_active_lecture_uploads(teacher: str, course: str) -> List[Dict[str, Any]]:
    """Return active, week-scoped lecture records across all co-teachers in the course."""
    try:
        _ensure()
        with _db() as db:
            rows = db.execute("""
                SELECT id, teacher, week, title, file_name
                FROM ai_upload_history
                WHERE course_key=? AND item_type='lecture'
                  AND week IS NOT NULL AND COALESCE(is_active, 1)=1
                ORDER BY id
            """, (course_key(course),)).fetchall()
        return [dict(row) for row in rows]
    except Exception as exc:
        print(f"[AI-DB] get_active_lecture_uploads failed: {exc}")
        raise


def mark_lecture_upload_missing(teacher: str, course: str, upload_id: int) -> bool:
    """Deactivate one confirmed-missing record for the course; preserve history and other uploads."""
    try:
        _ensure()
        ckey = course_key(course)
        with _db() as db:
            row = db.execute("""
                SELECT id, week FROM ai_upload_history
                WHERE id=? AND course_key=? AND item_type='lecture'
            """, (int(upload_id), ckey)).fetchone()
            if not row:
                return False

            db.execute(
                "UPDATE ai_upload_history SET is_active=0 WHERE id=?",
                (int(upload_id),)
            )
            remaining = db.execute("""
                SELECT COUNT(*) AS total FROM ai_upload_history
                WHERE course_key=? AND week=?
                  AND item_type='lecture' AND COALESCE(is_active, 1)=1
            """, (ckey, row["week"])).fetchone()["total"]

            if not remaining:
                db.execute("""
                    UPDATE weekly_expectations
                    SET status='pending', uploaded_at=NULL
                    WHERE course_key=? AND week=?
                      AND COALESCE(status, 'pending') <> 'not_expected'
                """, (ckey, row["week"]))

                db.execute("""
                    UPDATE reminders
                    SET status='active', snoozed_until=NULL, updated_at=?
                    WHERE course_key=? AND week=?
                      AND status IN ('resolved', 'completed')
                """, (_now(), ckey, row["week"]))
        return True
    except Exception as exc:
        print(f"[AI-DB] mark_lecture_upload_missing failed: {exc}")
        raise


def weekly_progress(teacher: str, course: str) -> List[Dict[str, Any]]:
    """Return course-wide weekly progress shared across all teachers enrolled in the same course."""
    try:
        _ensure()
        ckey = course_key(course)
        with _db() as db:
            expected_rows = db.execute("""
                SELECT teacher, week, expected_topic, due_date, status
                FROM weekly_expectations
                WHERE course_key=?
                ORDER BY CASE WHEN teacher=? THEN 0 ELSE 1 END, week
            """, (ckey, teacher.strip())).fetchall()

            expected_by_week: Dict[int, Dict[str, Any]] = {}
            for r in expected_rows:
                w = int(r["week"])
                if w not in expected_by_week:
                    expected_by_week[w] = dict(r)

            uploads = db.execute("""
                SELECT week, item_type, MAX(uploaded_at) AS uploaded_at
                FROM ai_upload_history
                WHERE course_key=?
                  AND COALESCE(is_active, 1)=1
                GROUP BY week, item_type
            """, (ckey,)).fetchall()

        done = {(r["week"], r["item_type"]): r["uploaded_at"] for r in uploads}
        all_weeks = sorted(
            set(expected_by_week.keys()) | {int(w) for (w, _) in done.keys() if w is not None}
        )

        out = []
        for w in all_weeks:
            r = expected_by_week.get(w, {})
            uploaded = done.get((w, "lecture"))
            is_expected = r.get("status") != "not_expected"
            out.append({
                "week": w,
                "topic": r.get("expected_topic", ""),
                "due_date": r.get("due_date"),
                "expected": is_expected,
                "lecture_completed": bool(uploaded),
                "uploaded_at": uploaded,
                "assignment_completed": bool(done.get((w, "assignment"))),
                "status": "completed" if uploaded else "pending",
            })
        return out
    except Exception as exc:
        print(f"[AI-DB] weekly_progress failed: {exc}")
        return []


def create_missing_reminders(
    teacher: str,
    course: str,
    current_week: Optional[int] = None,
    live_uploaded_weeks: Optional[List[int]] = None,
) -> int:
    """Create/keep active reminders for all weeks 1..current_week with no lecture uploaded on Moellim."""
    progress = weekly_progress(teacher, course)
    created = 0
    live_uploaded_set = {
        int(week) for week in (live_uploaded_weeks or [])
        if week is not None
    }

    # Determine the effective current week to check across
    effective_current_week = current_week
    if effective_current_week is None:
        effective_current_week = get_semester_current_week(teacher, course)
    if effective_current_week is None and live_uploaded_set:
        effective_current_week = max(live_uploaded_set)
    if effective_current_week is None:
        return 0

    effective_current_week = int(effective_current_week)
    progress_by_week = {int(row["week"]): row for row in progress if row.get("week") is not None}

    # Check every week from Week 1 through effective_current_week (plus any stored weeks to clean up future ones)
    weeks_to_check = sorted(
        set(range(1, effective_current_week + 1)) | set(progress_by_week.keys())
    )

    try:
        with _db() as db:
            for week in weeks_to_check:
                row = progress_by_week.get(week, {})
                dedupe = f"{course_key(course)}-missed-lecture-week-{week}"

                # 1. Resolve any reminder for weeks beyond the current week
                if week > effective_current_week:
                    db.execute("""
                        UPDATE reminders
                        SET status='resolved', snoozed_until=NULL, updated_at=?
                        WHERE teacher=? AND dedupe_key=?
                          AND status IN ('active', 'snoozed')
                    """, (_now(), teacher.strip(), dedupe))
                    continue

                # 2. If live Moellim scan confirms a lecture exists in this week, resolve any reminder
                if week in live_uploaded_set:
                    db.execute("""
                        UPDATE reminders
                        SET status='resolved', snoozed_until=NULL, updated_at=?
                        WHERE teacher=? AND dedupe_key=?
                          AND status NOT IN ('resolved')
                    """, (_now(), teacher.strip(), dedupe))
                    continue

                if row and row.get("expected") is False:
                    continue

                topic = (row.get("topic") or "").strip()
                topic_suffix = f" ({topic})" if topic and topic != "To be confirmed" else ""
                title = f"Lecture missing - Week {week}"
                message = f"No lecture has been uploaded yet for Week {week}{topic_suffix}."

                existing = db.execute("""
                    SELECT id, status FROM reminders
                    WHERE teacher=? AND dedupe_key=?
                """, (teacher.strip(), dedupe)).fetchone()

                if existing:
                    if existing["status"] in ("resolved", "completed"):
                        db.execute("""
                            UPDATE reminders
                            SET status='active', title=?, message=?, snoozed_until=NULL, updated_at=?
                            WHERE id=?
                        """, (title, message, _now(), existing["id"]))
                        created += 1
                    elif existing["status"] in ("active", "snoozed"):
                        db.execute("""
                            UPDATE reminders
                            SET title=?, message=?, updated_at=?
                            WHERE id=?
                        """, (title, message, _now(), existing["id"]))
                    continue

                cur = db.execute("""
                    INSERT OR IGNORE INTO reminders
                    (teacher,course_key,course,week,title,message,status,due_at,
                     created_at,updated_at,dedupe_key)
                    VALUES(?,?,?,?,?,?,'active',?,?,?,?)
                """, (
                    teacher.strip(), course_key(course), course, week,
                    title, message, row.get("due_date"), _now(), _now(), dedupe
                ))
                created += cur.rowcount

        return created
    except Exception as exc:
        print(f"[AI-DB] create_missing_reminders failed: {exc}")
        return created

def list_reminders(teacher: str, course: Optional[str] = None) -> List[Dict[str, Any]]:
    try:
        _ensure()
        sql="SELECT * FROM reminders WHERE teacher=?"; args=[teacher.strip()]
        if course:
            sql+=" AND course_key=?"; args.append(course_key(course))
        sql+=" ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'snoozed' THEN 1 ELSE 2 END,created_at DESC"
        with _db() as db:
            rows=db.execute(sql,args).fetchall()
        return [dict(r) for r in rows]
    except Exception as exc:
        print(f"[AI-DB] list_reminders failed: {exc}")
        return []

def update_reminder(teacher: str, reminder_id: int, action: str, until: Optional[str] = None) -> bool:
    if action not in {"acknowledge","dismiss","snooze"}: return False
    status={"acknowledge":"acknowledged","dismiss":"dismissed","snooze":"snoozed"}[action]
    try:
        _ensure()
        with _db() as db:
            cur=db.execute("UPDATE reminders SET status=?,snoozed_until=?,updated_at=? WHERE id=? AND teacher=?",
                           (status,until if action=="snooze" else None,_now(),reminder_id,teacher.strip()))
            changed=cur.rowcount>0
        if changed: record_event(teacher,"reminder_"+action,"success",details={"reminder_id":reminder_id})
        return changed
    except Exception as exc:
        print(f"[AI-DB] update_reminder failed: {exc}")
        return False

def save_folder_candidate(teacher: str, course: str, file_path: str) -> Optional[int]:
    try:
        _ensure()
        p=Path(file_path)
        with _db() as db:
            db.execute("""INSERT OR IGNORE INTO folder_candidates
              (teacher,course_key,course,file_path,file_name,size_bytes,modified_at,status,created_at)
              VALUES(?,?,?,?,?,?,?,'pending',?)""",
              (teacher.strip(),course_key(course),course,str(p),p.name,p.stat().st_size,
               datetime.fromtimestamp(p.stat().st_mtime,timezone.utc).isoformat(),_now()))
            row=db.execute("SELECT id FROM folder_candidates WHERE teacher=? AND course_key=? AND file_path=?",
                           (teacher.strip(),course_key(course),str(p))).fetchone()
        return int(row["id"]) if row else None
    except Exception as exc:
        print(f"[AI-DB] save_folder_candidate failed: {exc}")
        return None

def list_folder_candidates(teacher: str, course: str) -> List[Dict[str, Any]]:
    try:
        _ensure()
        with _db() as db:
            rows=db.execute("SELECT * FROM folder_candidates WHERE teacher=? AND course_key=? ORDER BY modified_at DESC",
                            (teacher.strip(),course_key(course))).fetchall()
        return [dict(r) for r in rows]
    except Exception as exc:
        print(f"[AI-DB] list_folder_candidates failed: {exc}")
        return []

def confirm_folder_candidate(teacher: str, candidate_id: int) -> bool:
    try:
        _ensure()
        with _db() as db:
            cur=db.execute("UPDATE folder_candidates SET status='confirmed' WHERE id=? AND teacher=?",
                           (candidate_id,teacher.strip()))
        return cur.rowcount>0
    except Exception as exc:
        print(f"[AI-DB] confirm_folder_candidate failed: {exc}")
        return False

def list_events(teacher: str, limit: int = 200) -> List[Dict[str, Any]]:
    try:
        _ensure()
        with _db() as db:
            rows=db.execute("SELECT * FROM operation_events WHERE teacher=? ORDER BY id DESC LIMIT ?",
                            (teacher.strip(), max(1,min(int(limit),500)))).fetchall()
        out=[]
        for r in rows:
            item=dict(r)
            try: item["details"]=json.loads(item.get("details") or "{}")
            except Exception: pass
            out.append(item)
        return out
    except Exception as exc:
        print(f"[AI-DB] list_events failed: {exc}")
        return []

def get_readiness(teacher: str, course: str) -> Dict[str, Any]:
    setup=get_course_setup(teacher,course)
    outline=get_shared_course_outline(teacher,course)
    progress=weekly_progress(teacher,course)
    class_schedule=get_shared_schedule(teacher,course)
    ckey = course_key(course)
    with _db() as db:
        shared_timetable = db.execute(
            "SELECT 1 FROM course_setup WHERE course_key=? AND timetable_confirmed=1 LIMIT 1",
            (ckey,)
        ).fetchone()
    completed = bool(setup.get("setup_completed"))
    return {"course":course,"setup_completed":completed,
            "outline_ready":bool(outline),
            "timetable_ready":bool(setup.get("timetable_confirmed") or shared_timetable or class_schedule),
            "class_schedule_ready":bool(class_schedule),
            "folder_ready":bool(setup.get("folder_path") and Path(setup["folder_path"]).is_dir()),
            "expected_weeks":len(progress),
            "completed_weeks":sum(1 for x in progress if x["lecture_completed"]),
            "pending_reminders":sum(1 for x in list_reminders(teacher,course) if x["status"] in ("active","snoozed"))}


def save_course_document_paths(teacher: str, course: str,
                               outline_file_path: Optional[str] = None,
                               timetable_file_path: Optional[str] = None) -> bool:
    try:
        _ensure()
        with _db() as db:
            db.execute(
                """INSERT INTO course_setup
                   (teacher, course_key, course, outline_file_path,
                    timetable_file_path, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?)
                   ON CONFLICT(teacher, course_key) DO UPDATE SET
                     outline_file_path=COALESCE(excluded.outline_file_path,
                                                course_setup.outline_file_path),
                     timetable_file_path=COALESCE(excluded.timetable_file_path,
                                                  course_setup.timetable_file_path),
                     updated_at=excluded.updated_at""",
                (teacher.strip(), course_key(course), course,
                 outline_file_path, timetable_file_path, _now())
            )
        return True
    except Exception as exc:
        print(f"[AI-DB] save_course_document_paths failed: {exc}")
        return False
