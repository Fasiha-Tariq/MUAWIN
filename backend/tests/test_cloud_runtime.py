"""Cloud state checks; live PostgreSQL tests create and remove disposable records."""
import os
from datetime import datetime, timedelta
from uuid import uuid4

import pytest

from backend.cloud_runtime import DurableState, _decode, _encode, lease, request_state
from backend.storage_database import PostgresConnection


def test_workflow_serialization_preserves_dates_and_skips_browser_resources():
    due = datetime(2026, 12, 1, 10, 30)
    result = _decode(_encode({"due": due, "automation": object(), "nested": [due]}))
    assert result == {"due": due, "nested": [due]}
    with pytest.raises(TypeError):
        _encode({"unexpected_resource": object()})


@pytest.mark.skipif(os.getenv("MUAWIN_TEST_POSTGRES") != "1", reason="Live PostgreSQL checks are opt-in")
def test_state_survives_requests_and_execution_guard(monkeypatch):
    monkeypatch.setenv("MUAWIN_STORAGE_BACKEND", "postgres")
    key = "cloud-test-" + uuid4().hex
    state = DurableState("cloud_test")
    token = request_state.set({})
    try:
        state[key] = {"status": "draft", "nested": {"title": "Original"}}
        state[key]["nested"]["title"] = "Reviewed"
        state.flush()
        request_state.set({})
        fresh = DurableState("cloud_test")
        assert fresh[key]["nested"]["title"] == "Reviewed"
        fresh[key]["status"] = "approved"
        fresh.guard_execution(key, fresh[key])
        assert fresh[key]["status"] == "approved"
        request_state.set({})
        assert DurableState("cloud_test")[key]["status"] == "running"
        assert lease(key, "first")
        assert not lease(key, "second")
        lease(key, "second", release=True)
        assert not lease(key, "second")
        lease(key, "first", release=True)
        assert lease(key, "second")
    finally:
        lease(key, "second", release=True)
        del state[key]
        request_state.reset(token)


@pytest.mark.skipif(os.getenv("MUAWIN_TEST_POSTGRES") != "1", reason="Live PostgreSQL checks are opt-in")
def test_expired_teacher_session_cannot_be_restored(monkeypatch):
    monkeypatch.setenv("MUAWIN_STORAGE_BACKEND", "postgres")
    state = DurableState("sessions")
    key = "cloud-test-" + uuid4().hex
    try:
        state[key] = {"expires_at": datetime.now() - timedelta(seconds=1)}
        assert state.get(key) is None
    finally:
        del state[key]


@pytest.mark.skipif(os.getenv("MUAWIN_TEST_POSTGRES") != "1", reason="Live PostgreSQL checks are opt-in")
def test_backend_role_is_restored_after_each_transaction():
    db = PostgresConnection()
    try:
        for _ in range(2):
            assert db.execute("SELECT current_user AS role").fetchone()["role"] == "service_role"
            db.commit()
        db.rollback()
        assert db.execute("SELECT current_user AS role").fetchone()["role"] == "service_role"
    finally:
        db.close()
