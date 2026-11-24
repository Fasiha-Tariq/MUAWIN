"""Store hosted course documents in a private Supabase Storage bucket."""

import hashlib
import os
from pathlib import Path
from urllib.parse import quote

import requests
from fastapi import File, Form, Header, HTTPException, UploadFile

from . import ai_db
from .storage_database import PostgresConnection

ROOT = Path(__file__).resolve().parent
BUCKET = "muawin-materials"


def storage_request(method, path, **kwargs):
    response = requests.request(
        method, os.environ["SUPABASE_URL"].rstrip("/") + "/storage/v1/" + path,
        headers={"apikey": os.environ["SUPABASE_SECRET_KEY"], **kwargs.pop("headers", {})},
        timeout=60, **kwargs,
    )
    response.raise_for_status()
    return response


def save_file(teacher, path):
    path = Path(path).resolve()
    allowed = ROOT / "data"
    if not path.is_file() or not path.is_relative_to(allowed):
        return
    relative = path.relative_to(ROOT).as_posix()
    content = path.read_bytes()
    checksum = hashlib.sha256(content).hexdigest()
    db = PostgresConnection()
    try:
        prior = db.execute("SELECT checksum FROM cloud_files WHERE teacher=? AND relative_path=?",
                           (teacher, relative)).fetchone()
        if prior and prior["checksum"] == checksum:
            return
        # Content-addressed objects make retries safe and preserve existing versions.
        key = hashlib.sha256(teacher.encode()).hexdigest() + "/" + checksum + "/" + path.name
        storage_request("POST", f"object/{BUCKET}/" + quote(key, safe="/"), data=content,
                        headers={"Content-Type": "application/octet-stream", "x-upsert": "true"})
        db.execute("""
            INSERT INTO cloud_files(teacher,relative_path,object_key,checksum) VALUES(?,?,?,?)
            ON CONFLICT(teacher,relative_path) DO UPDATE SET object_key=excluded.object_key,checksum=excluded.checksum
        """, (teacher, relative, key, checksum))
        db.commit()
    finally:
        db.close()


def course_folder(teacher, key, fallback):
    if os.getenv("MUAWIN_CLOUD") != "1":
        return fallback
    db = PostgresConnection()
    try:
        row = db.execute("SELECT folder_path FROM cloud_course_folders WHERE teacher=? AND course_key=?",
                         (teacher, key)).fetchone()
        return row["folder_path"] if row else None
    finally:
        db.close()


def restore(teacher):
    db = PostgresConnection()
    try:
        rows = db.execute("SELECT * FROM cloud_files WHERE teacher=?", (teacher,)).fetchall()
    finally:
        db.close()
    for row in rows:
        path = (ROOT / row["relative_path"]).resolve()
        if not path.is_relative_to(ROOT / "data"):
            raise RuntimeError("Invalid stored material path")
        if path.is_file() and hashlib.sha256(path.read_bytes()).hexdigest() == row["checksum"]:
            continue
        content = storage_request("GET", f"object/{BUCKET}/" + quote(row["object_key"], safe="/")).content
        if hashlib.sha256(content).hexdigest() != row["checksum"]:
            raise RuntimeError("Material checksum mismatch")
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_name(path.name + ".download")
        temporary.write_bytes(content)
        temporary.replace(path)


def _paths(value):
    if isinstance(value, dict):
        for item in value.values():
            yield from _paths(item)
    elif isinstance(value, (list, tuple)):
        for item in value:
            yield from _paths(item)
    elif isinstance(value, (str, Path)):
        yield value


def save_referenced(server, course_setup, teacher):
    from .cloud_runtime import request_state

    db = PostgresConnection()
    try:
        rows = db.execute("""
            SELECT outline_file_path,timetable_file_path,folder_path FROM course_setup WHERE teacher=?
        """, (teacher,)).fetchall()
    finally:
        db.close()
    for row in rows:
        for key in ("outline_file_path", "timetable_file_path"):
            if row[key]:
                save_file(teacher, row[key])
    for kind, entries in (request_state.get() or {}).items():
        if kind == "sessions":
            continue
        for value, _ in entries.values():
            for path in _paths(value):
                if isinstance(path, str) and path.startswith(str(ROOT / "data")):
                    save_file(teacher, path)


def install(server):
    @server.app.post("/api/materials/upload")
    async def upload_materials(
        course_id: str = Form(...), files: list[UploadFile] = File(...),
        authorization: str | None = Header(None),
    ):
        from .class_mode_api import course_link

        teacher = server.get_teacher_session(authorization)
        course = course_link(teacher, course_id)
        folder = ROOT / "data" / "materials" / hashlib.sha256(teacher["username"].encode()).hexdigest() / course["id"]
        names = []
        for file in files:
            name = Path((file.filename or "").replace("\\", "/")).name
            if not name or Path(name).suffix.lower() not in {
                ".pdf", ".ppt", ".pptx", ".doc", ".docx", ".txt", ".csv", ".xlsx",
            }:
                raise HTTPException(422, "Choose PDF, slides, document, text, or spreadsheet files.")
            content = await file.read(50 * 1024 * 1024 + 1)
            if len(content) > 50 * 1024 * 1024:
                raise HTTPException(413, "Each course file must be 50 MB or smaller.")
            folder.mkdir(parents=True, exist_ok=True)
            path = folder / name
            path.write_bytes(content)
            import asyncio

            await asyncio.to_thread(save_file, teacher["username"], path)
            names.append(name)
        db = PostgresConnection()
        try:
            with db:
                db.execute("""
                    INSERT INTO cloud_course_folders VALUES(?,?,?)
                    ON CONFLICT(teacher,course_key) DO UPDATE SET folder_path=excluded.folder_path
                """, (teacher["username"], ai_db.course_key(course["name"]), str(folder)))
        finally:
            db.close()
        if not ai_db.save_course_setup(teacher["username"], course["name"]):
            raise HTTPException(503, "Course folder could not be saved.")
        return {"files": names, "folder_path": str(folder)}
