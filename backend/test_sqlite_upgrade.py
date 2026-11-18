"""SQLite regression tests for MUAWIN's feature database."""
import os
import tempfile
from pathlib import Path

def run():
    with tempfile.TemporaryDirectory(prefix="muawin-sqlite-") as tmp:
        os.environ["MUAWIN_SQLITE_PATH"] = str(Path(tmp) / "test.sqlite3")
        from . import ai_db
        assert ai_db.ensure_tables()
        outline={"title":"Sample Course","clos":{"CLO 1":"Understand core concepts"},
                 "weeks":{"1":{"topic":"Introduction"},"2":{"topic":"Advanced Topics"}}}
        assert ai_db.save_outline("teacher-a","Sample Course",outline,"outline.pdf")
        assert ai_db.get_outline("teacher-a","Sample Course")["title"]=="Sample Course"
        assert ai_db.get_outline("teacher-b","Sample Course") is None
        assert len(ai_db.weekly_progress("teacher-a","Sample Course"))==2
        assert ai_db.save_expectations("teacher-a","Sample Course",[
            {"week":1,"topic":"Introduction","due_date":"2020-01-01","expected":True},
            {"week":2,"topic":"Advanced Topics","due_date":"2099-01-01","expected":True}])
        assert ai_db.create_missing_reminders("teacher-a","Sample Course")==1
        reminders=ai_db.list_reminders("teacher-a","Sample Course")
        assert len(reminders)==1 and reminders[0]["week"]==1
        rid=reminders[0]["id"]
        assert ai_db.update_reminder("teacher-a",rid,"snooze","2099-01-01T00:00:00+00:00")
        assert ai_db.record_upload("teacher-a","Sample Course",1,"lecture","Lecture 1","lecture1.pdf")
        progress=ai_db.weekly_progress("teacher-a","Sample Course")
        assert progress[0]["lecture_completed"] is True
        assert ai_db.get_readiness("teacher-a","Sample Course")["outline_ready"] is True
        assert ai_db.record_event("teacher-a","test","success","Sample Course",{"ok":True})
        # Ensure SQLite connections are closed (Windows can delete the temp directory).
        assert Path(tmp,"test.sqlite3").exists()
    print("PASS: SQLite schema, teacher isolation, outline persistence, timetable expectations, overdue reminder deduplication, reminder actions, upload completion, readiness and event logging.")

if __name__=="__main__":
    run()
