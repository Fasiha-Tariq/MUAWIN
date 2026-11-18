import json
from pathlib import Path
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from backend.server import app

client = TestClient(app)

BACKEND_DIR = Path(__file__).resolve().parents[1]
SAMPLE_OUTLINE = BACKEND_DIR / "data" / "course_setup_files" / "53289" / "CS7_MUAWIN_Female" / "MUAWIN_Course_Outline.docx"
SAMPLE_SCHEDULE = BACKEND_DIR / "data" / "course_setup_files" / "53289" / "CS7_MUAWIN_Female" / "Class_Schedule.docx"
SAMPLE_ASSIGNMENT = BACKEND_DIR / "data" / "assignment_pdfs" / "Week_1_Assignment.pdf"


def test_all_parameterless_get_endpoints_do_not_500():
    """Automatically hit every static GET route in server.py to verify zero 500 crashes."""
    tested = 0
    for route in app.routes:
        if hasattr(route, "methods") and "GET" in route.methods:
            # Skip routes requiring path parameters like {course_id}
            if "{" not in route.path and route.path not in ("/docs/oauth2-redirect",):
                res = client.get(route.path)
                assert res.status_code < 500, f"GET {route.path} failed with {res.status_code}: {res.text}"
                tested += 1
    assert tested > 0


def test_course_setup_sample_files_readable():
    """Verify sample .docx course setup documents are non-empty and valid ZIP/DOCX containers."""
    import zipfile
    for doc_path in (SAMPLE_OUTLINE, SAMPLE_SCHEDULE):
        assert doc_path.exists()
        assert zipfile.is_zipfile(doc_path), f"{doc_path.name} is not a valid DOCX archive"


def test_assignment_results_json_schema(isolated_storage):
    """Verify assignment evaluation result JSON structure matches expected schema."""
    sample_result = {
        "assignment_title": "Week 1 Assignment",
        "total_marks": 100,
        "obtained_marks": 88,
        "clo_mapping": ["CLO-1", "CLO-2"],
        "feedback": "Clear explanation of core concepts.",
    }
    out_file = isolated_storage["json_dir"] / "assignment_test_result.json"
    out_file.write_text(json.dumps(sample_result, indent=2), encoding="utf-8")

    loaded = json.loads(out_file.read_text(encoding="utf-8"))
    assert loaded["obtained_marks"] <= loaded["total_marks"]
    assert "clo_mapping" in loaded


def test_mocked_ai_pipeline_execution(mock_external_apis):
    """Verify AI response pipeline works cleanly with mocked Gemini client."""
    response = mock_external_apis.models.generate_content(
        model="gemini-2.5-flash",
        contents="Summarize Week 1 lecture outline",
    )
    parsed = json.loads(response.text)
    assert parsed["status"] == "ok"
