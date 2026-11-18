# MUAWIN Backend SQLite + Setup Patch

This patch is designed for the existing MUAWIN V5 project. It replaces only:
- `backend/ai_db.py` — SQLAlchemy/PostgreSQL add-on persistence replaced with SQLite.
- `backend/muawin_ai.py` — installs setup/tracker routes and updates course setup state after outline upload.
- `backend/muawin_services.py` — new setup, timetable preview/confirmation, teacher-selected folder scan, weekly tracker, reminders, and readiness APIs.
- `backend/test_sqlite_upgrade.py` — local storage regression test.

## Before installing
1. Stop the MUAWIN backend.
2. Make a full copy of the project folder.
3. Do not overwrite `.env`, credentials, tokens, course files, outlines, or existing workflow modules.
4. Python dependencies for optional timetable parsing: `pypdf`, `python-docx`, `python-pptx`, `openpyxl`. If a parser package is missing, install it in the project's Python environment.

## Install (PowerShell)
Set `$Project` to the actual project root containing `backend\server.py`.
Copy the four patch files into the matching `backend` folder, overwriting only the three named implementation files and adding the test file.
The existing `server.py`, `server_ai.py`, lecture, assignment, combined workflow, audit store, frontend, `.env`, and credentials are not replaced.

## SQLite
Operational database: `backend/data/muawin.sqlite3` (created automatically).
Existing `backend/data/muawin_audit.sqlite3`, JSON outline files, and existing data folders are preserved.
SQLite tables are teacher-scoped. SQLite uses WAL and a 10-second connection timeout.

## New API endpoints
All endpoints require the existing MUAWIN teacher Authorization session:
- `GET /api/setup/status`
- `POST /api/setup/timetable/preview` (multipart: `course`, `file`)
- `POST /api/setup/timetable/confirm` (JSON: `course`, `weeks`, optional `timezone`)
- `PUT /api/setup/folder` (JSON: `course`, `folder_path`)
- `POST /api/setup/folder/scan?course=...`\n- `POST /api/setup/folder/candidates/{id}/confirm`
- `GET /api/tracker/weekly?course=...`
- `PUT /api/tracker/weekly` (JSON: `course`, `weeks`)
- `GET /api/reminders`
- `POST /api/reminders/{id}` (JSON action: `acknowledge`, `dismiss`, or `snooze` + ISO `until`)
- `GET /api/readiness`

Outline parsing seeds a reviewable candidate week plan. Timetable parsing is a preview only. Teacher must review and confirm topics.
Folder scanning occurs only under a path explicitly selected by the teacher. Last-access time is only a candidate signal and never proof that a lecture was taught.
Missed-week reminders are created once per teacher/course/week; no background spam scheduler is enabled.
When a teacher uploads a new outline through MUAWIN, that course is marked as outline-confirmed. If that course has a setup record, lecture/assignment/combined workflow preparation now also requires its timetable to be confirmed.

## Test
From the project root:
`python -m backend.test_sqlite_upgrade`

This is a local SQLite test only. It does not log into Moellim or claim a live upload succeeded.
