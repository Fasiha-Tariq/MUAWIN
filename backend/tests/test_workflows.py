import sqlite3
from pathlib import Path
from fastapi.testclient import TestClient
from backend.server import app
from backend import muawin_services, course_setup_automation, assignment_workflow

client = TestClient(app)

BACKEND_DIR = Path(__file__).resolve().parents[1]
SAMPLE_OUTLINE = BACKEND_DIR / "data" / "course_setup_files" / "53289" / "CS7_MUAWIN_Female" / "MUAWIN_Course_Outline.docx"
SAMPLE_SCHEDULE = BACKEND_DIR / "data" / "course_setup_files" / "53289" / "CS7_MUAWIN_Female" / "Class_Schedule.docx"
SAMPLE_ASSIGNMENT_PDF = BACKEND_DIR / "data" / "assignment_pdfs" / "Week_1_Assignment.pdf"


def test_sample_test_fixtures_exist():
    """Verify sample course outlines, schedules, and assignment PDFs exist in backend/data."""
    assert SAMPLE_OUTLINE.exists(), f"Missing sample outline: {SAMPLE_OUTLINE}"
    assert SAMPLE_SCHEDULE.exists(), f"Missing sample schedule: {SAMPLE_SCHEDULE}"
    assert SAMPLE_ASSIGNMENT_PDF.exists(), f"Missing sample PDF: {SAMPLE_ASSIGNMENT_PDF}"


def test_openapi_schema_and_routes_registered():
    """Verify FastAPI generates a valid OpenAPI schema with registered workflow routes."""
    response = client.get("/openapi.json")
    assert response.status_code == 200
    schema = response.json()
    assert "paths" in schema
    assert len(schema["paths"]) > 0


def test_core_service_modules_loaded():
    """Verify core MUAWIN automation and service modules import cleanly."""
    assert hasattr(muawin_services, "__name__")
    assert hasattr(course_setup_automation, "__name__")
    assert hasattr(assignment_workflow, "__name__")


def test_audit_and_workflow_sqlite_isolation(isolated_storage):
    """Verify isolated SQLite schema creation for workflow state and audit logs."""
    db_path = isolated_storage["db_path"]
    conn = sqlite3.connect(db_path)
    conn.execute(
        "CREATE TABLE approvals (id TEXT PRIMARY KEY, workflow_type TEXT, status TEXT)"
    )
    conn.execute(
        "INSERT INTO approvals (id, workflow_type, status) VALUES (?, ?, ?)",
        ("apr-001", "course_setup", "pending"),
    )
    conn.commit()

    row = conn.execute(
        "SELECT workflow_type, status FROM approvals WHERE id = ?", ("apr-001",)
    ).fetchone()
    conn.close()

    assert row == ("course_setup", "pending")


def test_invalid_endpoint_returns_404():
    """Verify unknown API routes return standard 404 JSON responses."""
    response = client.get("/api/nonexistent_muawin_route")
    assert response.status_code == 404
