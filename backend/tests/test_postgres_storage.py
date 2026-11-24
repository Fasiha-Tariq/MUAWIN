"""Opt-in checks against the configured Supabase project using disposable teacher records."""

import os
from uuid import uuid4

import pytest

from backend import ai_db, audit_store, class_mode_store as store


@pytest.mark.skipif(os.getenv("MUAWIN_TEST_POSTGRES") != "1", reason="Live PostgreSQL checks are opt-in")
def test_supabase_storage_round_trip(monkeypatch):
    monkeypatch.setenv("MUAWIN_STORAGE_BACKEND", "postgres")
    teacher = "storage-test-" + uuid4().hex
    course = "Storage Test Course"
    session_id = None
    try:
        assert ai_db.ensure_tables()
        store.initialize()
        outline = {"title": course, "clos": {}, "weeks": {"1": {"topic": "Introduction"}}}
        assert ai_db.save_outline(teacher, course, outline, "outline.pdf")
        assert ai_db.get_outline(teacher, course)["title"] == course
        assert ai_db.get_outline(teacher + "-other", course) is None
        assert ai_db.save_schedule(teacher, course, [
            {"weekday": 1, "start_time": "10:00", "end_time": "11:00"}
        ]) == 1
        assert len(ai_db.get_schedule(teacher, course)) == 1
        assert ai_db.save_expectations(teacher, course, [
            {"week": 1, "topic": "Introduction", "due_date": "2020-01-01", "expected": True}
        ])
        assert ai_db.create_missing_reminders(teacher, course, current_week=1) == 1
        assert ai_db.create_missing_reminders(teacher, course, current_week=1) == 0
        reminder = ai_db.list_reminders(teacher, course)[0]
        assert ai_db.update_reminder(teacher, reminder["id"], "snooze", "2099-01-01T00:00:00+00:00")
        assert ai_db.record_upload(teacher, course, 1, "lecture", "Lecture 1", "lecture.pdf")
        assert ai_db.weekly_progress(teacher, course)[0]["lecture_completed"] is True
        assert ai_db.record_event(teacher, "postgres_test", details={"verified": True})

        session = store.start(teacher, "course-test", course, "Asia/Karachi")
        session_id = session["id"]
        event_id = "event-" + teacher
        segment = store.append_segment(session_id, "اصل لیکچر", event_id)
        assert store.append_segment(session_id, "اصل لیکچر", event_id) == segment
        store.stop(teacher, session_id)
        store.seal_chunks()
        with store.connection() as db:
            chunk_id = db.execute("SELECT id FROM class_chunks WHERE session_id=?", (session_id,)).fetchone()["id"]
        store.complete_chunk({"id": chunk_id, "session_id": session_id}, {
            "topics": ["Introduction"], "key_points": [], "important_concepts": [],
        }, [{"type": "instruction", "name": "Review lecture"}])
        review = store.review_session(session_id, 0)
        assert review["segments"][0]["text"] == "اصل لیکچر"
        suggestion = review["suggestions"][0]
        assert store.decide(suggestion["id"], "preparing", {"title": "Review lecture"})
        store.record_workflow(suggestion["id"], {
            "id": "wf-" + teacher, "status": "approved", "draft": {"title": "Review lecture"},
        }, prepared=True)
        assert store.review_session(session_id, 0)["suggestions"][0]["workflows"][0]["approved_at"]
        assert audit_store.record_event(teacher_username=teacher, action="postgres test", status="success")
        assert len(audit_store.list_events(teacher)) == 1
    finally:
        with store.connection() as db:
            db.execute("DELETE FROM class_workflows WHERE id=?", ("wf-" + teacher,))
            if session_id:
                db.execute("DELETE FROM class_segment_events WHERE event_id=?", ("event-" + teacher,))
                for table in ("class_suggestions", "class_segments", "class_chunks"):
                    db.execute(f"DELETE FROM {table} WHERE session_id=?", (session_id,))
            db.execute("DELETE FROM class_sessions WHERE teacher=?", (teacher,))
            db.execute("DELETE FROM audit_events WHERE teacher_username=?", (teacher,))
            for table in ("operation_events", "folder_candidates", "reminders", "weekly_expectations",
                          "course_setup", "ai_class_schedule", "ai_course_outline",
                          "ai_clo_mapping", "ai_upload_history"):
                db.execute(f"DELETE FROM {table} WHERE teacher=?", (teacher,))
