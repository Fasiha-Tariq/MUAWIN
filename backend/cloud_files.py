"""Store hosted course documents in a private Supabase Storage bucket."""

import hashlib
import os
from pathlib import Path
from urllib.parse import quote
from uuid import uuid4

import requests
from fastapi import Header, HTTPException
from pydantic import BaseModel, Field

from . import ai_db
from .storage_database import PostgresConnection

ROOT = Path(__file__).resolve().parent
BUCKET = "muawin-materials"
ALLOWED = {".pdf", ".ppt", ".pptx", ".doc", ".docx", ".txt", ".csv", ".xlsx"}


class MaterialUpload(BaseModel):
    course_id: str
    file_name: str = Field(min_length=1, max_length=255)
    object_key: str | None = None


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
    return course_path(teacher, key, "folder_path", fallback)


def course_path(teacher, key, column, fallback):
    if column not in {"folder_path", "outline_file_path", "timetable_file_path"}:
        raise ValueError("Unsupported course path")
    if os.getenv("MUAWIN_CLOUD") != "1":
        return fallback
    if column != "folder_path" and fallback and Path(fallback).is_file():
        return fallback
    db = PostgresConnection()
    try:
        row = db.execute(f"SELECT {column} FROM cloud_course_folders WHERE teacher=? AND course_key=?",
                         (teacher, key)).fetchone()
        if row and row[column]:
            return row[column]
        return fallback if column != "folder_path" and fallback and Path(fallback).is_file() else None
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
    def context(request, authorization):
        from .class_mode_api import course_link
        teacher = server.get_teacher_session(authorization)
        course = course_link(teacher, request.course_id)
        name = Path(request.file_name.replace("\\", "/")).name
        if name != request.file_name or Path(name).suffix.lower() not in ALLOWED:
            raise HTTPException(422, "Choose PDF, slides, document, text, or spreadsheet files.")
        prefix = hashlib.sha256(teacher["username"].encode()).hexdigest() + "/" + course["id"] + "/"
        return teacher, course, name, prefix

    @server.app.post("/api/materials/upload-url")
    def signed_upload(request: MaterialUpload, authorization: str | None = Header(None)):
        _, _, name, prefix = context(request, authorization)
        key = prefix + uuid4().hex + "/" + name
        result = storage_request("POST", f"object/upload/sign/{BUCKET}/" + quote(key, safe="/"),
                                 json={}).json()
        return {"object_key": key, "upload_url": os.environ["SUPABASE_URL"].rstrip("/")
                + "/storage/v1" + result["url"]}

    @server.app.post("/api/materials/confirm")
    def confirm_upload(request: MaterialUpload, authorization: str | None = Header(None)):
        teacher, course, name, prefix = context(request, authorization)
        key = request.object_key or ""
        components = key.removeprefix(prefix).split("/")
        if not key.startswith(prefix) or len(components) != 2 or len(components[0]) != 32 or components[1] != name:
            raise HTTPException(403, "Upload belongs to another course or teacher.")
        content = storage_request("GET", f"object/{BUCKET}/" + quote(key, safe="/")).content
        if not content or len(content) > 50 * 1024 * 1024:
            raise HTTPException(413, "Each course file must contain data and be 50 MB or smaller.")
        folder = ROOT / "data" / "materials" / prefix.removesuffix("/")
        folder.mkdir(parents=True, exist_ok=True)
        path = folder / name
        path.write_bytes(content)
        relative = path.relative_to(ROOT).as_posix()
        checksum = hashlib.sha256(content).hexdigest()
        db = PostgresConnection()
        try:
            with db:
                db.execute("""
                    INSERT INTO cloud_files VALUES(?,?,?,?)
                    ON CONFLICT(teacher,relative_path) DO UPDATE SET object_key=excluded.object_key,
                        checksum=excluded.checksum
                """, (teacher["username"], relative, key, checksum))
                db.execute("""
                    INSERT INTO cloud_course_folders(teacher,course_key,folder_path) VALUES(?,?,?)
                    ON CONFLICT(teacher,course_key) DO UPDATE SET folder_path=excluded.folder_path
                """, (teacher["username"], ai_db.course_key(course["name"]), str(folder)))
        finally:
            db.close()
        if not ai_db.save_course_setup(teacher["username"], course["name"]):
            raise HTTPException(503, "Course folder could not be saved.")
        return {"file": name, "folder_path": str(folder)}
