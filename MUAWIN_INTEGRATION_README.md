# MUAWIN Integration Patch

This patch adds the missing Course Management screens and connects them to authenticated backend APIs. It keeps the existing Moellim lecture, assignment, combined-workflow, approval and browser-automation modules in place.

## Install

1. Extract this ZIP into the project root:
   `C:\Users\NK\Desktop\MUAWIN V5\MUAWIN V4\MUAWIN`
2. Allow files to merge and replace the matching files.
3. Do **not** replace `backend/server.py`, `backend/muawin_lecture.py`, `backend/assignment_workflow.py` or `backend/muawin_combined.py`.

The ZIP contains only the listed patch files. It does not contain `.env`, `credentials.json`, `token.json`, local databases, `node_modules`, or lecture/assignment materials.

## Files replaced

- `backend/ai_db.py` — SQLite implementation for MUAWIN outline/CLO history, upload history, course setup, weekly expectations, reminders and feature audit events.
- `backend/server_ai.py` — installs the existing AI add-on plus the new course-management API router.
- `frontend/src/services/api.ts` — adds safe multipart upload support.
- `frontend/src/services/activityService.ts` — combines workflow audit entries with course-management events.
- `frontend/src/App.tsx` — registers the new pages.
- `frontend/src/components/layout/Sidebar.tsx` — adds Course Setup, Timetable, Weekly Tracker and Reminders navigation and truthful connection status.
- `frontend/src/pages/Dashboard.tsx` — adds four Quick Access cards.
- `frontend/src/context/AppContext.tsx`, `frontend/src/types/index.ts`, `frontend/src/services/assistantService.ts`, `frontend/src/services/workflowService.ts` — TypeScript compatibility fixes required by the existing frontend.
- `frontend/tsconfig.json` — excludes an unused duplicate JSX file incorrectly saved as `src/data/workflowData.ts`.

## New files

- `backend/muawin_services.py`
- `backend/test_sqlite_upgrade.py`
- `frontend/src/services/featureService.ts`
- `frontend/src/pages/CourseSetup.tsx`
- `frontend/src/pages/Timetable.tsx`
- `frontend/src/pages/WeeklyTracker.tsx`
- `frontend/src/pages/Reminders.tsx`

## What is now connected

- Course outline upload through the existing `/api/ai/outlines/upload` route.
- Timetable file preview, manual correction and teacher confirmation.
- Explicit teacher-selected course folder, candidate scan and teacher confirmation. Candidate confirmation does **not** upload a file.
- Weekly expected/completed lecture tracking from verified upload history.
- Persistent reminders for incomplete expected weeks with an explicit past due date; reminders can be acknowledged, snoozed or dismissed. They are generated when the Reminders page is loaded, not by a background scheduler.
- Feature actions are saved to SQLite and shown alongside existing workflow activity logs.
- Teacher data is scoped by the authenticated Moellim username.

## Database

The feature store is created automatically at:

`backend/data/muawin.sqlite3`

SQLite is part of Python's standard library; PostgreSQL is not required for these AI feature tables. Existing outline files under `backend/outlines/` remain available as the current file fallback. Existing PostgreSQL rows are **not** automatically migrated; upload/confirm the course outline again in Course Setup so it is saved into SQLite.

Optional document parsers used by timetable imports:

```powershell
pip install python-multipart pypdf python-docx python-pptx openpyxl
```

## Start

Backend (from project root):

```powershell
python -m uvicorn backend.server_ai:app --reload --port 8000
```

Frontend (second terminal):

```powershell
cd frontend
npm run dev
```

Open `http://localhost:3000`.

## Verification performed for this patch

- Python compilation passed for the backend integration modules.
- SQLite regression test passed: `python -m backend.test_sqlite_upgrade`
- FastAPI route registration and authenticated API smoke tests passed.
- Frontend TypeScript check passed: `npm run lint`

The Vite production build was not verified in this Linux build environment because the uploaded `node_modules` contains Windows-native Rolldown binaries. Run `npm run build` on the Windows project machine if a production bundle is required.
