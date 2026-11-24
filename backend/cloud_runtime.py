"""Durable sessions and browser workflows for the combined hosted application."""

import asyncio
import contextvars
import hashlib
import json
import os
import time
from collections.abc import MutableMapping
from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from cryptography.fernet import Fernet
from fastapi import HTTPException
from fastapi.responses import FileResponse, JSONResponse
from starlette.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StaticHTTPException

from .storage_database import PostgresConnection

request_state = contextvars.ContextVar("muawin_cloud_request", default=None)
SKIP = {"automation", "_assignment_automation", "_playwright", "_assignment_worker", "_selector", "selector"}


def _encode(value):
    from .assignment_workflow import GeneratedQuestion

    if isinstance(value, datetime):
        return {"__muawin_type": "datetime", "value": value.isoformat()}
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, GeneratedQuestion):
        return {"__muawin_type": "question", "value": asdict(value)}
    if isinstance(value, dict):
        return {key: _encode(item) for key, item in value.items() if key not in SKIP}
    if isinstance(value, (list, tuple)):
        return [_encode(item) for item in value]
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    raise TypeError(f"Cannot persist workflow value of type {type(value).__name__}")


def _decode(value):
    from .assignment_workflow import GeneratedQuestion

    if isinstance(value, dict):
        if value.get("__muawin_type") == "datetime":
            return datetime.fromisoformat(value["value"])
        if value.get("__muawin_type") == "question":
            return GeneratedQuestion(**value["value"])
        return {key: _decode(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_decode(item) for item in value]
    return value


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


class DurableState(MutableMapping):
    def __init__(self, kind):
        self.kind = kind
        self.cipher = Fernet(os.environ["MUAWIN_STATE_ENCRYPTION_KEY"].encode())

    def _cache(self):
        context = request_state.get()
        return context.setdefault(self.kind, {}) if context is not None else {}

    def __getitem__(self, key):
        cache = self._cache()
        if key in cache:
            return cache[key][0]
        db = PostgresConnection()
        try:
            row = db.execute("""
                SELECT encrypted_value FROM cloud_state WHERE kind=? AND key_hash=?
                AND (expires_at IS NULL OR expires_at>?)
            """, (self.kind, digest(key), time.time())).fetchone()
        finally:
            db.close()
        if not row:
            raise KeyError(key)
        data = json.loads(self.cipher.decrypt(row["encrypted_value"].encode()))
        value = _decode(data["value"])
        cache[key] = (value, json.dumps(_encode(value), sort_keys=True))
        return value

    def __setitem__(self, key, value):
        self._save(key, value)
        self._cache()[key] = (value, json.dumps(_encode(value), sort_keys=True))

    def _save(self, key, value):
        encrypted = self.cipher.encrypt(json.dumps({"key": key, "value": _encode(value)}).encode()).decode()
        expires = value.get("expires_at") if self.kind == "sessions" else None
        if isinstance(expires, datetime):
            expires = expires.timestamp()
        db = PostgresConnection()
        try:
            with db:
                db.execute("""
                    INSERT INTO cloud_state(kind,key_hash,encrypted_value,expires_at) VALUES(?,?,?,?)
                    ON CONFLICT(kind,key_hash) DO UPDATE SET encrypted_value=excluded.encrypted_value,
                        expires_at=excluded.expires_at
                """, (self.kind, digest(key), encrypted, expires))
        finally:
            db.close()

    def __delitem__(self, key):
        db = PostgresConnection()
        try:
            with db:
                result = db.execute("DELETE FROM cloud_state WHERE kind=? AND key_hash=?", (self.kind, digest(key)))
                if not result.rowcount:
                    raise KeyError(key)
        finally:
            db.close()
        self._cache().pop(key, None)

    def __iter__(self):
        db = PostgresConnection()
        try:
            rows = db.execute("""
                SELECT encrypted_value FROM cloud_state WHERE kind=?
                AND (expires_at IS NULL OR expires_at>?)
            """, (self.kind, time.time())).fetchall()
        finally:
            db.close()
        return iter([json.loads(self.cipher.decrypt(row["encrypted_value"].encode()))["key"] for row in rows])

    def __len__(self):
        return len(list(iter(self)))

    def copy(self):
        return dict(self.items())

    def flush(self):
        cache = self._cache()
        for key, (value, original) in list(cache.items()):
            updated = json.dumps(_encode(value), sort_keys=True)
            if updated != original:
                self._save(key, value)
                cache[key] = (value, updated)


def lease(key, owner, *, release=False):
    db = PostgresConnection()
    try:
        with db:
            if release:
                db.execute("DELETE FROM cloud_leases WHERE key_hash=? AND owner=?", (digest(key), owner))
                return True
            return db.execute("""
                INSERT INTO cloud_leases(key_hash,owner,expires_at) VALUES(?,?,?)
                ON CONFLICT(key_hash) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at
                WHERE cloud_leases.expires_at<?
                RETURNING owner
            """, (digest(key), owner, time.time() + 300, time.time())).fetchone() is not None
    finally:
        db.close()


def reopen_browser(server, workflow, session, combined=False):
    """Open a new authenticated browser for the saved teacher-approved draft."""
    resources = {}
    try:
        resources["p"] = server.sync_playwright().start()
        resources["browser"], resources["context"] = server.automation.launch_browser(resources["p"])
        resources["page"] = page = resources["context"].new_page()
        moodle = server.automation.MoodleAutomation(page)
        moodle.login(session["username"], session["password"])
        assignment = server.assignment_automation.AssignmentAutomation(page)
        if combined:
            parsed = workflow["parsed"]["lecture"]
            course = moodle.discover_course(parsed["course"])
            moodle.open_course(course)
            moodle.ensure_edit_mode()
            workflow["automation"] = moodle
            workflow["_assignment_automation"] = assignment
        else:
            assignment.open_course(str(workflow["course_id"]))
            assignment.verify_course(workflow["draft"]["course"])
            assignment.find_week_section(workflow["draft"]["week_number"])
            workflow["automation"] = assignment
        workflow["_playwright"] = resources
    except Exception:
        server.close_playwright_resources(resources)
        raise


class WebsiteFiles(StaticFiles):
    async def get_response(self, path, scope):
        if path.startswith(("api/", "ws/")):
            return JSONResponse({"detail": "Not found"}, status_code=404)
        try:
            return await super().get_response(path, scope)
        except StaticHTTPException as error:
            if error.status_code != 404 or Path(path).suffix:
                raise
            return FileResponse(Path(self.directory) / "index.html")


def install(server, course_setup):
    stores = {}
    for name, kind in (
        ("user_sessions", "sessions"), ("workflows", "lecture"),
        ("assignment_workflows", "assignment"), ("combined_workflows", "combined"),
        ("file_assignment_workflows", "file_assignment"),
    ):
        stores[name] = DurableState(kind)
        setattr(server, name, stores[name])
    course_setup.JOBS = DurableState("course_documents")
    stores["course_jobs"] = course_setup.JOBS
    server.app.state.authorize_transcription = lambda token: server.get_teacher_session(f"Bearer {token}")

    @server.app.middleware("http")
    async def durable_request(request, call_next):
        from . import cloud_files

        context = request_state.set({})
        owner = uuid4().hex
        auth = request.headers.get("authorization", "")
        locked = False
        session = None
        workflow = None
        try:
            if auth.startswith("Bearer "):
                session = await asyncio.to_thread(server.get_teacher_session, auth)
                if request.method in ("POST", "PUT", "DELETE", "PATCH"):
                    locked = await asyncio.to_thread(lease, auth, owner)
                    if not locked:
                        return JSONResponse({"detail": "Another operation is running. Try again shortly."}, status_code=409)
                    await asyncio.to_thread(cloud_files.restore, session["username"])
            path = request.url.path
            if path.endswith("/execute") and session:
                for name, combined in (("assignment_workflows", False), ("combined_workflows", True)):
                    workflow = stores[name].get(path.split("/")[-2])
                    if workflow and workflow["status"] == "approved":
                        if workflow.get("session_token") != auth[7:]:
                            raise HTTPException(403, "Workflow belongs to another session.")
                        server.check_class_publish_time(workflow)
                        worker = server.AssignmentPlaywrightWorker(workflow, session)
                        workflow["_assignment_worker"] = worker
                        await server.await_worker_future(worker.submit(
                            reopen_browser, server, workflow, session, combined,
                        ))
                        break
            response = await call_next(request)
            if session and locked:
                await asyncio.to_thread(cloud_files.save_referenced, server, course_setup, session["username"])
            for name in ("assignment_workflows", "combined_workflows"):
                for value, _ in list(stores[name]._cache().values()):
                    if value.get("_assignment_worker"):
                        await server.cleanup_assignment_workflow(value)
            for state in stores.values():
                await asyncio.to_thread(state.flush)
            return response
        except HTTPException as error:
            return JSONResponse({"detail": error.detail}, status_code=error.status_code)
        finally:
            if workflow and workflow.get("_assignment_worker"):
                await server.cleanup_assignment_workflow(workflow)
            if locked:
                await asyncio.to_thread(lease, auth, owner, release=True)
            request_state.reset(context)

    from . import cloud_files
    cloud_files.install(server)
    site = Path(__file__).resolve().parent.parent / "frontend" / "dist"
    # The existing root handler is registered earlier than the SPA mount.
    for route in server.app.routes:
        if getattr(route, "path", None) == "/":
            async def homepage():
                return FileResponse(site / "index.html")
            route.endpoint = homepage
            # Replace the route itself so its generated ASGI handler is rebuilt.
            server.app.routes.remove(route)
            server.app.get("/")(homepage)
            break
    server.app.mount("/", WebsiteFiles(directory=site, html=True), name="website")
