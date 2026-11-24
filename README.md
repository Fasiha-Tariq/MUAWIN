# MUAWIN

MUAWIN is a final-year project that helps instructors at Riphah International University manage teaching workflows in Moellim. Teachers can give text or voice instructions to prepare lecture uploads and assignments, then review and approve them before MUAWIN publishes them.

## What it does

- **AI Assistant** turns teacher instructions into course-specific drafts for lecture uploads and assignments.
- **Class Mode** transcribes live lectures, extracts key points and academic activities, and suggests actions for teacher review.
- **Course management** helps teachers set up course outlines and schedules, track weekly lecture uploads, and see reminders and activity logs.

The frontend uses React and TypeScript. The backend uses FastAPI, Gemini, and Supabase PostgreSQL, with optional n8n integration for lecture analysis. Playwright handles publishing and verification in Moellim.

## Run locally

From the repository root, install the backend dependencies and start the API.

```sh
python -m pip install -r backend/requirements.txt
python -m playwright install chromium
python -m uvicorn backend.server_ai:app --port 8000
```

In a second terminal, start the frontend and open [localhost:3000](http://localhost:3000).

```sh
cd frontend
npm ci
npm run dev
```

Sign in with your Moellim account. Set `GEMINI_API_KEY` in `backend/.env` to enable Gemini features.

## Database configuration

Set `MUAWIN_STORAGE_BACKEND=postgres` and `MUAWIN_DATABASE_URL` in `backend/.env` or the backend host's environment. Use the Supabase transaction pooler URL with SSL required. The database login must be able to assume the `service_role` role because the backend enforces teacher ownership checks. The connection layer disables prepared statements for pooler compatibility.

Apply `backend/supabase/001_initial_schema.sql` and `002_ordering.sql` before starting the backend. Course setup, schedules, outlines, upload history, reminders, transcripts, suggestions, workflow results, and audit events use this database. Local SQLite remains available for tests and offline development through `MUAWIN_STORAGE_BACKEND=sqlite`.

To copy existing local records, stop the backend and run `python -m backend.supabase.migrate_sqlite`. The importer commits all tables together and rejects conflicting remote records. It retains the original SQLite files.

## Deploy the frontend on Vercel

When importing this repository in Vercel, choose **Import single project** on the **frontend (Vite)** row. Use `frontend` as the root directory, `npm run build` as the build command, and `dist` as the output directory.

The current backend runs as a long-running HTTPS service with WebSocket support and Playwright Chromium. It runs Class Mode's scheduler and holds live teacher sessions and browser workflows in memory. Supabase stores the structured data; uploaded course files still use disk storage. A complete Vercel backend deployment requires further changes to these browser sessions and file operations.

- Set `VITE_API_BASE_URL=https://your-backend.example/api` in the Vercel project before deploying.
- Set `MUAWIN_CORS_ORIGINS=https://your-frontend.vercel.app` on the backend. Use a comma-separated list if you have multiple frontend origins.
- Keep `GEMINI_API_KEY` and any n8n credentials in the backend environment.

### Host the backend container

The root `Dockerfile` installs the Python dependencies and Playwright Chromium. It starts the full API on the host's `PORT` with one worker, so teacher sessions and browser workflows stay in the same process.

Create a Docker web service from this repository, using the repository root as the build context and `Dockerfile` as the Dockerfile path. Use `/api/health` as its health check. Set `GEMINI_API_KEY` and `MUAWIN_CORS_ORIGINS=https://muawin-lovat.vercel.app` on the backend host, together with any optional Gemini or n8n settings.

Set the PostgreSQL environment variables on the backend host. Uploaded course documents currently require writable storage at `/app/backend/data`. Provide materials on the server because a hosted backend cannot read folders on your laptop. Google Drive integration requires its OAuth files to be provisioned separately.

Once the service is healthy, set the Vercel project's `VITE_API_BASE_URL` to the service's HTTPS address followed by `/api`, then redeploy the frontend.
