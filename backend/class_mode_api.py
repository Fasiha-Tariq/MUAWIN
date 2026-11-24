"""Teacher-scoped Class Mode endpoints and adapter to shared workflow preparation."""

import asyncio
import logging
import os
from contextlib import asynccontextmanager, suppress
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlsplit
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Header, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from . import ai_db, class_mode_analysis, class_mode_store as store
from .live_transcribe_server import handle_transcription


ZONE = os.getenv("MUAWIN_CLASS_TIMEZONE", "Asia/Karachi")
logger = logging.getLogger(__name__)


class WorkflowReview(BaseModel):
    title: str = Field(min_length=1, max_length=250)
    week: int = Field(ge=1, le=52)
    material: str | None = Field(default=None, max_length=250)
    deadline: datetime | None = None
    publish_from: datetime | None = None
    marks: int | None = Field(default=None, ge=1, le=1000)
    instructions: str | None = Field(default=None, max_length=4000)
    confirm: bool = False


def course_link(teacher, course_id):
    for index, course in enumerate(teacher.get("courses", []), start=1):
        moellim_id = parse_qs(urlsplit(course.get("href") or "").query).get("id", [None])[0]
        if course_id == f"moellim-{moellim_id or index}" and moellim_id and moellim_id.isdigit():
            return {**course, "id": moellim_id}
    raise HTTPException(404, "Course is unavailable to this teacher. Sign in again to refresh courses.")


def schedule_window(teacher, course, course_id):
    local = datetime.now(ZoneInfo(ZONE))
    active, upcoming = None, None
    for slot in ai_db.get_schedule(teacher, course):
        if slot["weekday"] != local.weekday() or not slot["start_time"] or not slot["end_time"]:
            continue
        try:
            start = datetime.combine(local.date(), datetime.strptime(slot["start_time"], "%H:%M").time(),
                                     tzinfo=local.tzinfo)
            end = datetime.combine(local.date(), datetime.strptime(slot["end_time"], "%H:%M").time(),
                                   tzinfo=local.tzinfo)
        except ValueError:
            continue
        if start <= local < end:
            active = (f"{course_id}-{start.isoformat()}", end.astimezone(timezone.utc).isoformat())
            break
        if timedelta() < start - local <= timedelta(minutes=5):
            upcoming = start.isoformat()
    return active, upcoming


def sync_schedules(sessions):
    current = datetime.now(timezone.utc)
    teachers = {session["username"]: session for session in sessions
                if session.get("courses") and session["expires_at"] > current}
    for username, teacher in teachers.items():
        if store.get_session(username, active=True):
            continue
        for course in teacher["courses"]:
            ids = parse_qs(urlsplit(course.get("href") or "").query).get("id", [])
            if ids and ids[0].isdigit():
                course_id = f"moellim-{ids[0]}"
                scheduled, _ = schedule_window(username, course["name"], course_id)
                if scheduled and store.start(username, course_id, course["name"], ZONE, *scheduled):
                    break


def install(server):
    streams = {}

    async def schedule():
        while True:
            try:
                await asyncio.to_thread(store.end_scheduled)
                await asyncio.to_thread(sync_schedules, tuple(server.user_sessions.copy().values()))
                for session_id, stream in tuple(streams.items()):
                    if stream["connected"]:
                        continue
                    session = await asyncio.to_thread(store.get_session, stream["teacher"], session_id=session_id)
                    if not stream["connected"] and (not session or session["ended_at"]):
                        finals = stream["resume"].get("finals", [])
                        while session and finals:
                            event_id, original = finals[0]
                            await asyncio.to_thread(store.append_segment, session_id, original, event_id)
                            finals.pop(0)
                        streams.pop(session_id, None)
            except Exception:
                logger.exception("Class Mode scheduler could not update sessions")
            await asyncio.sleep(5)

    @asynccontextmanager
    async def lifespan(_app):
        await asyncio.to_thread(store.initialize)
        await asyncio.to_thread(store.recover_processing)
        tasks = [asyncio.create_task(run()) for run in (class_mode_analysis.run, schedule)]
        try:
            yield
        finally:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)

    router = APIRouter(prefix="/api/class-mode", tags=["Class Mode"], lifespan=lifespan)

    def owner(session_id, authorization):
        teacher = server.get_teacher_session(authorization)
        session = store.get_session(teacher["username"], session_id=session_id)
        if not session:
            raise HTTPException(404, "Class session was not found.")
        return teacher, session

    @router.get("/status")
    def status(course_id: str, authorization: str = Header(None)):
        teacher = server.get_teacher_session(authorization)
        link = course_link(teacher, course_id)
        username = teacher["username"]
        active = store.get_session(username, active=True)
        if active and active["scheduled_end"] and active["scheduled_end"] <= store.now():
            store.stop(username, active["id"])
            active = None
        scheduled, upcoming = schedule_window(username, link["name"], course_id)
        if scheduled and not active:
            active = store.start(username, course_id, link["name"], ZONE, *scheduled)
        history = store.session_history(username, course_id)
        return {"session": history[0] if history else None, "history": history,
                "active": active, "upcoming": upcoming}

    @router.post("/start")
    def start(course_id: str, authorization: str = Header(None)):
        teacher = server.get_teacher_session(authorization)
        link = course_link(teacher, course_id)
        scheduled, _ = schedule_window(teacher["username"], link["name"], course_id)
        session = store.start(teacher["username"], course_id, link["name"], ZONE,
                              *(scheduled or (None, None)), manual=True)
        if session["course_id"] != course_id:
            raise HTTPException(409, "Finish the active class session before starting another course.")
        return session

    @router.post("/sessions/{session_id}/stop")
    def stop(session_id: str, authorization: str = Header(None)):
        _, session = owner(session_id, authorization)
        store.stop(session["teacher"], session_id)
        store.seal_chunks()
        return store.get_session(session["teacher"], session_id=session_id)

    @router.get("/sessions/{session_id}")
    def review(session_id: str, after: int = Query(0, ge=0), authorization: str = Header(None)):
        _, session = owner(session_id, authorization)
        return {"session": session, **store.review_session(session_id, after)}

    @router.post("/sessions/{session_id}/retry-analysis")
    def retry_analysis(session_id: str, authorization: str = Header(None)):
        owner(session_id, authorization)
        store.retry_failed(session_id)
        return {"status": "pending"}

    @router.post("/sessions/{session_id}/suggestions/{suggestion_id}/reject")
    def reject(session_id: str, suggestion_id: str, authorization: str = Header(None)):
        owner(session_id, authorization)
        if not store.get_suggestion(session_id, suggestion_id):
            raise HTTPException(404, "Class suggestion was not found.")
        if not store.decide(suggestion_id, "rejected"):
            raise HTTPException(409, "This suggestion has already been reviewed.")
        return {"status": "rejected"}

    @router.post("/sessions/{session_id}/suggestions/{suggestion_id}/prepare")
    async def prepare(session_id: str, suggestion_id: str, request: WorkflowReview,
                      authorization: str = Header(None)):
        teacher, session = owner(session_id, authorization)
        link = course_link(teacher, session["course_id"])
        suggestion = store.get_suggestion(session_id, suggestion_id)
        if not suggestion:
            raise HTTPException(404, "Class suggestion was not found.")
        payload = suggestion["payload"]
        operation = payload.get("operation")
        if operation not in ("upload_lecture", "create_assignment") or not request.confirm or not request.title.strip():
            raise HTTPException(422, "Confirm a supported Moellim instruction and enter a title.")
        if payload.get("availability") and not request.publish_from:
            raise HTTPException(422, "Confirm when this item may be published.")

        zone = ZoneInfo(session["timezone"])
        current_time = datetime.now(zone)
        deadline = request.deadline
        publish_from = request.publish_from
        for value in (deadline, publish_from):
            if value and value.tzinfo is None:
                raise HTTPException(422, "Supply dates with a timezone offset.")
        if deadline and publish_from and publish_from > deadline:
            raise HTTPException(422, "The publication time must precede the deadline.")
        title = request.title.strip()
        material = (request.material or "").strip()
        workflow = server.PrepareWorkflowRequest(
            instruction=f"{operation.replace('_', ' ')}: {title}",
            course=session["course"], course_id=session["course_id"],
        )
        workflow._class_mode = {
            "session_id": session_id, "suggestion_id": suggestion_id, "course_link": link,
            "not_before": publish_from.isoformat() if publish_from else None,
        }
        parsed = {"course": session["course"], "week": request.week,
                  "class_instructions": (request.instructions or "").strip(),
                  "class_publish_from": workflow._class_mode["not_before"]}
        if operation == "upload_lecture":
            if not material:
                raise HTTPException(422, "Choose a lecture file by name from the course material source.")
            parsed.update(lecture=material, heading=title)
            handler = server.prepare_workflow
        else:
            if not deadline or deadline <= current_time or not request.marks:
                raise HTTPException(422, "Confirm a future submission deadline and total marks.")
            parsed.update(
                section=f"Week {request.week}", title=title, max_grade=request.marks,
                duedate=deadline.astimezone().replace(tzinfo=None), question_types=None,
                source={"week": None, "lecture": None, "name": material or None},
                raw_request=workflow.instruction, target_course_id=link["id"],
            )
            handler = server.prepare_assignment_workflow
        workflow._parsed_override = parsed
        if not store.decide(suggestion_id, "preparing", request.model_dump(mode="json"), retry=True):
            raise HTTPException(409, "A workflow already exists for this suggestion.")
        try:
            result = await handler(workflow, authorization)
            store.record_workflow(suggestion_id, result, prepared=True)
            return result
        finally:
            store.reset_preparation(suggestion_id)

    @router.websocket("/sessions/{session_id}/audio")
    async def audio(websocket: WebSocket, session_id: str):
        await websocket.accept()
        try:
            message = await asyncio.wait_for(websocket.receive_json(), timeout=5)
            _, session = owner(session_id, f"Bearer {message.get('token', '')}")
        except (HTTPException, ValueError, AttributeError, asyncio.TimeoutError, WebSocketDisconnect):
            with suppress(RuntimeError):
                await websocket.close(code=4401)
            return
        if session["ended_at"]:
            await websocket.close(code=4403)
            return
        stream = streams.setdefault(session_id, {"connected": False, "resume": {}, "teacher": session["teacher"]})
        if stream["connected"]:
            await websocket.close(code=4409)
            return
        stream["connected"] = True
        stop_event = asyncio.Event()

        async def check_session():
            while not stop_event.is_set():
                await asyncio.sleep(1)
                try:
                    _, current = owner(session_id, f"Bearer {message['token']}")
                    if current["ended_at"]:
                        break
                except HTTPException:
                    break
            stop_event.set()

        async def save(text, event_id):
            return await asyncio.to_thread(store.append_segment, session_id, text, event_id)

        monitor = asyncio.create_task(check_session())
        try:
            await websocket.send_json({"type": "authorized"})
            await handle_transcription(websocket, on_final=save, stop_event=stop_event,
                                       resume_state=stream["resume"])
        finally:
            stop_event.set()
            monitor.cancel()
            with suppress(asyncio.CancelledError):
                await monitor
            stream["connected"] = False

    server.app.include_router(router)
