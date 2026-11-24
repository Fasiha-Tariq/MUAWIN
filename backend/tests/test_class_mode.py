import asyncio
from datetime import datetime, timedelta, timezone
from time import monotonic, sleep

from fastapi.testclient import TestClient

from backend import class_mode_analysis as analysis, class_mode_store as store, server
from backend import live_transcribe_server as transcription


def sign_in(username, course_id="42"):
    token = server.create_teacher_session(username, "", username)
    server.user_sessions[token]["courses"] = [
        {"name": "Test Course", "href": f"https://example.test/course/view.php?id={course_id}"}
    ]
    return token, {"Authorization": f"Bearer {token}"}


def test_class_audio_extracts_and_uses_the_shared_approval_workflow(tmp_path, monkeypatch):
    from backend.server_ai import app
    connections = []

    class FakeGemini:
        def __init__(self, handle):
            connections.append(handle)
            self.resumption_handle = handle
            self.events = asyncio.Queue()

        async def connect(self):
            pass

        async def send_audio(self, _):
            await self.events.put({"serverContent": {"inputTranscription": {"text": "لیکچر کی سلائیڈز"}}})
            if self.resumption_handle is None:
                await self.events.put({"sessionResumptionUpdate": {"resumable": True, "newHandle": "resume-ticket"}})
                await self.events.put({"goAway": {"timeLeft": "1s"}})

        async def receive(self):
            return await self.events.get()

        async def send_audio_end(self):
            await self.events.put({"serverContent": {"turnComplete": True}})

        async def close(self):
            pass

    monkeypatch.setattr(store, "DB_PATH", tmp_path / "class.sqlite3")
    monkeypatch.setattr(server.audit_store, "DB_PATH", tmp_path / "audit.sqlite3")
    monkeypatch.setattr(transcription, "GeminiLiveSession", FakeGemini)
    monkeypatch.setattr(transcription, "API_KEY", "dummy")
    monkeypatch.delenv("N8N_LECTURE_ANALYSIS_WEBHOOK_URL", raising=False)
    monkeypatch.setattr(analysis.muawin_ai, "gemini_json", lambda *args, **kwargs: {
        "topics": ["Lecture slides"], "key_points": [], "important_concepts": [],
        "academic_activities": [
            {"type": "quiz", "intent": "announcement", "name": "Quiz", "assessment_date": "Next Monday"},
            {"type": "resource_upload", "intent": "lms_instruction", "name": "Lecture slides",
             "evidence": "Upload lecture slides.", "requires_clarification": False},
            {"type": "assignment", "intent": "lms_instruction", "name": "Assignment 3",
             "deadline": "Friday", "evidence": "Create Assignment 3, due Friday."},
        ],
    })
    material = tmp_path / "Lecture 1.pdf"
    material.touch()

    def prepare(wf, _teacher):
        assert wf["parsed"]["lecture"] == "Lecture 1.pdf"
        assert wf["parsed"]["course"] == "Test Course"
        assert wf["_class_mode"]["course_link"]["id"] == "42"
        return {"course_name": "Test Course", "file_path": str(material),
                "draft": {"heading": "Lecture slides", "file": "Lecture 1.pdf"}}

    def execute(_wf, _teacher):
        return {"verified": True, "course": "Test Course", "file": "Lecture 1.pdf"}

    async def prepare_assignment(wf, _teacher):
        assert wf["parsed"]["title"] == "Assignment 3"
        assert wf["parsed"]["target_course_id"] == "42"
        assert wf["parsed"]["max_grade"] == 25 and wf["parsed"]["duedate"].year > 2025
        wf["status"] = "waiting_approval"
        wf["draft"] = {"title": "Assignment 3"}

    monkeypatch.setattr(server, "prepare_moellim_workflow_sync", prepare)
    monkeypatch.setattr(server, "execute_moellim_workflow_sync", execute)
    monkeypatch.setattr(server, "run_assignment_preparation", prepare_assignment)
    token, teacher = sign_in("class-test-teacher")
    other_token, other = sign_in("class-test-other")
    try:
        with TestClient(app) as client:
            assert client.post("/api/class-mode/start?course_id=moellim-999", headers=teacher).status_code == 404
            started = client.post("/api/class-mode/start?course_id=moellim-42", headers=teacher)
            assert started.status_code == 200
            session_id = started.json()["id"]
            path = f"/api/class-mode/sessions/{session_id}"
            assert client.get(path, headers=other).status_code == 404
            with client.websocket_connect(path + "/audio") as audio:
                audio.send_json({"token": token})
                assert audio.receive_json()["type"] == "authorized"
                assert audio.receive_json()["status"] == "connected"
                frame = {"type": "audio", "sequence": 1, "capture": "1" * 36, "data": "AAAA"}
                audio.send_json(frame)
                events = [audio.receive_json(), audio.receive_json()]
                assert {event["type"] for event in events} == {"audio_ack", "transcript"}
                assert audio.receive_json()["resumed"]
                assert connections == [None, "resume-ticket"]
                audio.send_json(frame)
                assert audio.receive_json()["type"] == "audio_ack"
                audio.send_json({"type": "finish"})
                assert audio.receive_json()["type"] == "turn_complete"
            assert client.post(path + "/stop", headers=teacher).status_code == 200
            timeout = monotonic() + 8
            while True:
                review = client.get(path, headers=teacher).json()
                if review["suggestions"] or monotonic() >= timeout:
                    break
                sleep(0.05)
            assert [item["text"] for item in review["segments"]] == ["لیکچر کی سلائیڈز"]
            quiz, slides, assignment = review["suggestions"]
            assert quiz["payload"]["assessment_date"] == "Next Monday"
            assert "operation" not in quiz["payload"]
            proposal = path + f"/suggestions/{slides['id']}/prepare"
            review_input = {"title": "Lecture slides", "week": 1, "material": "Lecture 1.pdf", "confirm": True}
            assert client.post(proposal, headers=other, json=review_input).status_code == 404
            future = datetime.now(timezone.utc) + timedelta(days=1)
            response = client.post(proposal, headers=teacher, json={**review_input, "publish_from": future.isoformat()})
            assert response.status_code == 200
            workflow = response.json()
            assert workflow["status"] == "waiting_approval"
            workflow_path = f"/api/workflows/{workflow['id']}"
            assert client.post(workflow_path + "/approve", headers=teacher, json={}).status_code == 200
            assert client.post(workflow_path + "/execute", headers=teacher).status_code == 409
            server.workflows[workflow["id"]]["_class_mode"]["not_before"] = None
            outcome = client.post(workflow_path + "/execute", headers=teacher)
            assert outcome.status_code == 200, outcome.text
            assert outcome.json()["status"] == "completed"
            linked = client.get(path, headers=teacher).json()["suggestions"][1]["workflows"][0]
            assert linked["id"] == workflow["id"] and linked["result"]["verified"]
            assert linked["approved_at"] and linked["draft"]["file"] == "Lecture 1.pdf"
            assignment_path = path + f"/suggestions/{assignment['id']}/prepare"
            details = {"title": "Assignment 3", "week": 2, "marks": 25, "confirm": True}
            assert client.post(assignment_path, headers=teacher, json=details).status_code == 422
            due = datetime.now(timezone.utc) + timedelta(days=7)
            response = client.post(assignment_path, headers=teacher, json={**details, "deadline": due.isoformat()})
            assert response.status_code == 200, response.text
            assert response.json()["status"] == "waiting_approval"
    finally:
        server.user_sessions.pop(token, None)
        server.user_sessions.pop(other_token, None)


def test_class_chunks_retry_and_preserve_raw_transcript(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "DB_PATH", tmp_path / "class.sqlite3")
    store.initialize()
    session = store.start("teacher", "moellim-42", "Test Course", "Asia/Karachi", "slot1")
    store.append_segment(session["id"], "Here is the lecture transcript.")
    store.stop("teacher", session["id"])
    assert store.start("teacher", "moellim-42", "Test Course", "Asia/Karachi", "slot1") is None
    store.seal_chunks()
    store.seal_chunks()
    chunk = store.claim_chunk()
    assert store.claim_chunk() is None
    store.recover_processing()
    assert store.claim_chunk()["id"] == chunk["id"]
    store.fail_chunk({**chunk, "attempts": 4}, "TestFailure")
    assert store.review_session(session["id"], 0)["chunks"][0]["status"] == "failed"
    store.retry_failed(session["id"])
    assert store.claim_chunk()["transcript"] == "Here is the lecture transcript."
