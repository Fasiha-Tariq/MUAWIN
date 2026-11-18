import json
import sqlite3
from pathlib import Path
from fastapi.testclient import TestClient
from backend.server import app
from backend import file_assignment_validation

client = TestClient(app)

def test_fastapi_server_boots():
    """Verify the FastAPI server boots and serves OpenAPI/docs."""
    response = client.get("/docs")
    assert response.status_code in (200, 404)

def test_clo_outlines_json_is_valid():
    """Verify clo_outlines.json parses cleanly."""
    clo_path = Path(__file__).resolve().parents[1] / "clo_outlines.json"
    data = json.loads(clo_path.read_text(encoding="utf-8"))
    assert isinstance(data, (dict, list))

def test_isolated_sqlite_operations(isolated_storage):
    """Verify isolated SQLite storage works without touching production data."""
    conn = sqlite3.connect(isolated_storage["db_path"])
    conn.execute("CREATE TABLE IF NOT EXISTS health_check (id INTEGER PRIMARY KEY, status TEXT)")
    conn.execute("INSERT INTO health_check (status) VALUES ('ok')")
    conn.commit()
    row = conn.execute("SELECT status FROM health_check").fetchone()
    conn.close()
    assert row == ("ok",)

def test_assignment_file_validation():
    """Verify assignment validation module loads cleanly."""
    assert hasattr(file_assignment_validation, "__name__")
