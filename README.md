# MUAWIN

MUAWIN is a final-year project that helps instructors at Riphah International University manage teaching workflows in Moellim. Teachers can give text or voice instructions to prepare lecture uploads and assignments, then review and approve them before MUAWIN publishes them.

## What it does

- **AI Assistant** turns teacher instructions into course-specific drafts for lecture uploads and assignments.
- **Class Mode** transcribes live lectures, extracts key points and academic activities, and suggests actions for teacher review.
- **Course management** helps teachers set up course outlines and schedules, track weekly lecture uploads, and see reminders and activity logs.

The frontend uses React and TypeScript. The backend uses FastAPI, Gemini, and SQLite, with optional n8n integration for lecture analysis. Playwright handles publishing and verification in Moellim.

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
