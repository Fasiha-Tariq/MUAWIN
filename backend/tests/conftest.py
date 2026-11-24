import os
import sys
from pathlib import Path
from unittest.mock import MagicMock
import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
ROOT_DIR = BACKEND_DIR.parent

for p in (str(ROOT_DIR), str(BACKEND_DIR)):
    if p not in sys.path:
        sys.path.insert(0, p)

os.environ.setdefault("GEMINI_API_KEY", "test-dummy-key")
os.environ["MUAWIN_STORAGE_BACKEND"] = "sqlite"

@pytest.fixture
def isolated_storage(tmp_path):
    """Provides isolated temporary SQLite and JSON directories for tests."""
    db_file = tmp_path / "test_muawin.sqlite3"
    json_dir = tmp_path / "json_data"
    json_dir.mkdir(parents=True, exist_ok=True)
    return {"db_path": db_file, "json_dir": json_dir}

@pytest.fixture
def mock_external_apis():
    """Provides a mocked AI client so tests never make live LLM/Google API calls."""
    mock_instance = MagicMock()
    mock_instance.models.generate_content.return_value.text = '{"status": "ok", "summary": "Mocked AI response"}'
    return mock_instance
