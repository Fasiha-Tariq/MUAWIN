"""
Teacher-approved upload of course outline and timetable to Moellim General section.
Uses the existing MoodleAutomation browser workflow.
"""

from __future__ import annotations

import asyncio
import os
import shutil
import threading
import uuid
from pathlib import Path
from typing import Any, Dict

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile
from playwright.sync_api import sync_playwright

from . import muawin_lecture


BASE_DIR = Path(__file__).resolve().parent
PENDING_DIR = BASE_DIR / "data" / "course_setup_pending"
PENDING_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {
    ".pdf", ".doc", ".docx", ".ppt", ".pptx",
    ".xls", ".xlsx", ".csv", ".txt",
}
MAX_FILE_SIZE = 50 * 1024 * 1024

# Jobs are held in memory for this running backend process.
JOBS: Dict[str, Dict[str, Any]] = {}

# Per-course locks prevent concurrent Playwright sessions from racing on the same course.
_COURSE_LOCKS_GUARD = threading.Lock()
_COURSE_LOCKS: Dict[str, threading.Lock] = {}


def _get_course_lock(course_name: str) -> threading.Lock:
    key = course_name.strip().casefold()
    with _COURSE_LOCKS_GUARD:
        lock = _COURSE_LOCKS.get(key)
        if lock is None:
            lock = threading.Lock()
            _COURSE_LOCKS[key] = lock
        return lock


def _get_teacher(server, authorization: str | None) -> dict:
    if not authorization:
        raise HTTPException(status_code=401, detail="Authentication required.")
    return server.get_teacher_session(authorization)


def _job_for_teacher(job_id: str, teacher: dict) -> dict:
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Upload job not found.")

    if job["teacher_username"] != str(teacher.get("username", "")):
        raise HTTPException(status_code=403, detail="This upload job belongs to another teacher.")

    return job


async def _save_upload(upload: UploadFile, destination: Path) -> dict:
    filename = Path(upload.filename or "").name
    extension = Path(filename).suffix.lower()

    if not filename or extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type for {filename or 'selected file'}.",
        )

    content = await upload.read()

    if not content:
        raise HTTPException(status_code=400, detail=f"{filename} is empty.")

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"{filename} exceeds the 50 MB upload limit.",
        )

    destination.write_bytes(content)

    return {
        "filename": filename,
        "path": str(destination),
        "size": len(content),
    }


def _upload_one(
    automation,
    page,
    file_path: Path,
    resource_name: str,
    description: str,
) -> dict:
    general_section = {"section_id": "section-0", "section_number": 0}

    section_locator = page.locator("#section-0")
    if not section_locator.count():
        raise RuntimeError("Moellim course General section (section-0) was not found.")

    section_text = section_locator.inner_text().casefold()
    if resource_name.casefold() in section_text:
        raise RuntimeError(
            f"A resource named '{resource_name}' already exists in General. "
            "No duplicate was created."
        )

    automation.open_activity_chooser(general_section)
    automation.select_file_resource()
    automation.upload_file(file_path)

    automation.fill_file_settings({
        "heading": resource_name,
        "description": description,
        "key_points": [],
    })

    automation.save_resource()

    # Reload and verify the exact resource name in General.
    page.reload(wait_until="domcontentloaded")
    page.wait_for_timeout(1500)

    section_locator = page.locator("#section-0")
    if not section_locator.count():
        raise RuntimeError("General section disappeared after saving.")

    final_text = section_locator.inner_text().casefold()
    if resource_name.casefold() not in final_text:
        raise RuntimeError(
            f"'{resource_name}' was saved, but could not be verified in General."
        )

    return {
        "resource": resource_name,
        "filename": file_path.name,
        "status": "verified",
        "section": "General",
        "message": "File resource is visible in the General section.",
    }


def upload_course_outline(
    course_name: str,
    outline_path: str,
    teacher_username: str,
    teacher_password: str,
) -> dict:
    """Upload one teacher-confirmed outline to the exact course General section."""
    outline = Path(outline_path)

    if not outline.is_file():
        return {"ok": False, "error": "The saved course outline file is missing."}

    if not teacher_username or not teacher_password:
        return {"ok": False, "error": "Authenticated teacher credentials are unavailable."}

    with _get_course_lock(course_name):
        browser = None
        context = None

        try:
            with sync_playwright() as playwright:
                browser, context = muawin_lecture.launch_browser(playwright)
                page = context.new_page()
                automation = muawin_lecture.MoodleAutomation(page)

                automation.login(
                    username=teacher_username,
                    password=teacher_password,
                )

                matched_course = automation.discover_course(course_name)
                actual_name = str(matched_course.get("name", "")).strip()

                if actual_name.casefold() != course_name.strip().casefold():
                    raise RuntimeError(
                        f"Course safety check failed. Requested '{course_name}', "
                        f"but Moellim matched '{actual_name}'."
                    )

                automation.open_course(matched_course)
                automation.ensure_edit_mode()

                section_locator = page.locator("#section-0")
                if not section_locator.count():
                    raise RuntimeError("Moellim course General section (section-0) was not found.")

                if "course outline" in section_locator.inner_text().casefold():
                    return {
                        "ok": True,
                        "course": actual_name,
                        "section": "General",
                        "upload": {
                            "resource": "Course Outline",
                            "filename": outline.name,
                            "status": "already_exists",
                            "section": "General",
                            "message": "Course Outline already exists in General; skipped duplicate.",
                        },
                        "message": "Course Outline already exists in General.",
                    }

                upload = _upload_one(
                    automation,
                    page,
                    outline,
                    "Course Outline",
                    "Course outline uploaded by MUAWIN after teacher confirmation.",
                )

                return {
                    "ok": True,
                    "course": actual_name,
                    "section": "General",
                    "upload": upload,
                    "message": "Course Outline uploaded and verified in General.",
                }

        except Exception as exc:
            return {
                "ok": False,
                "course": course_name,
                "section": "General",
                "error": str(exc),
                "message": "Course Outline upload failed. The upload was not verified.",
            }

        finally:
            if context:
                try:
                    context.close()
                except Exception:
                    pass

            if browser:
                try:
                    browser.close()
                except Exception:
                    pass


def upload_class_schedule_document(
    course_name: str,
    timetable_path: str,
    teacher_username: str,
    teacher_password: str,
) -> dict:
    """Upload and verify the confirmed class schedule in the course General section."""
    timetable = Path(timetable_path)

    if not timetable.is_file():
        return {"ok": False, "error": "The generated class schedule document is missing."}

    if not teacher_username or not teacher_password:
        return {"ok": False, "error": "Authenticated teacher credentials are unavailable."}

    with _get_course_lock(course_name):
        browser = None
        context = None

        try:
            with sync_playwright() as playwright:
                browser, context = muawin_lecture.launch_browser(playwright)
                page = context.new_page()
                automation = muawin_lecture.MoodleAutomation(page)

                automation.login(
                    username=teacher_username,
                    password=teacher_password,
                )

                matched_course = automation.discover_course(course_name)
                actual_name = str(matched_course.get("name", "")).strip()

                if actual_name.casefold() != course_name.strip().casefold():
                    raise RuntimeError(
                        f"Course safety check failed. Requested '{course_name}', "
                        f"but Moellim matched '{actual_name}'."
                    )

                automation.open_course(matched_course)
                automation.ensure_edit_mode()

                section_locator = page.locator("#section-0")
                if not section_locator.count():
                    raise RuntimeError("Moellim course General section (section-0) was not found.")

                if "class schedule" in section_locator.inner_text().casefold():
                    return {
                        "ok": True,
                        "course": actual_name,
                        "section": "General",
                        "upload": {
                            "resource": "Class Schedule",
                            "filename": timetable.name,
                            "status": "already_exists",
                            "section": "General",
                            "message": "Class Schedule already exists in General; skipped duplicate.",
                        },
                        "message": "Class Schedule already exists in General.",
                    }

                upload = _upload_one(
                    automation,
                    page,
                    timetable,
                    "Class Schedule",
                    "Teacher-confirmed weekly class days and timings uploaded by MUAWIN.",
                )

                return {
                    "ok": True,
                    "course": actual_name,
                    "section": "General",
                    "upload": upload,
                    "message": "Class Schedule uploaded and verified in General.",
                }

        except Exception as exc:
            return {
                "ok": False,
                "course": course_name,
                "section": "General",
                "error": str(exc),
                "message": "Class Schedule upload failed; saved MUAWIN timings were retained.",
            }

        finally:
            if context:
                try:
                    context.close()
                except Exception:
                    pass
            if browser:
                try:
                    browser.close()
                except Exception:
                    pass


def upload_course_setup_documents(
    course_name: str,
    outline_path: str,
    timetable_path: str,
    teacher_username: str,
    teacher_password: str,
) -> dict:
    outline = Path(outline_path)
    timetable = Path(timetable_path)

    if not outline.is_file() or not timetable.is_file():
        raise RuntimeError("The saved outline or generated class schedule file is missing.")

    if not teacher_username or not teacher_password:
        raise RuntimeError("Authenticated teacher credentials are unavailable.")

    with _get_course_lock(course_name):
        browser = None
        context = None
        results = []

        try:
            with sync_playwright() as playwright:
                # Use the same visible browser configuration as the lecture workflow.
                browser, context = muawin_lecture.launch_browser(playwright)
                page = context.new_page()
                automation = muawin_lecture.MoodleAutomation(page)

                automation.login(
                    username=teacher_username,
                    password=teacher_password,
                )

                matched_course = automation.discover_course(course_name)
                actual_name = str(matched_course.get("name", "")).strip()

                # Do not allow fuzzy matching to silently upload into another course.
                if actual_name.casefold() != course_name.strip().casefold():
                    raise RuntimeError(
                        f"Course safety check failed. Requested '{course_name}', "
                        f"but Moellim matched '{actual_name}'."
                    )

                automation.open_course(matched_course)
                automation.ensure_edit_mode()

                section_locator = page.locator("#section-0")
                if not section_locator.count():
                    raise RuntimeError("Moellim course General section (section-0) was not found.")

                section_text = section_locator.inner_text().casefold()

                # 1. Course Outline: skip duplicate instead of aborting so Class Schedule still uploads
                if "course outline" in section_text:
                    results.append({
                        "resource": "Course Outline",
                        "filename": outline.name,
                        "status": "already_exists",
                        "section": "General",
                        "message": "Course Outline already exists in General; skipped duplicate.",
                    })
                else:
                    results.append(_upload_one(
                        automation,
                        page,
                        outline,
                        "Course Outline",
                        "Course outline uploaded by MUAWIN after teacher approval.",
                    ))

                # Refresh General section text before checking Class Schedule
                section_text = page.locator("#section-0").inner_text().casefold()

                # 2. Class Schedule
                if "class schedule" in section_text:
                    results.append({
                        "resource": "Class Schedule",
                        "filename": timetable.name,
                        "status": "already_exists",
                        "section": "General",
                        "message": "Class Schedule already exists in General; skipped duplicate.",
                    })
                else:
                    results.append(_upload_one(
                        automation,
                        page,
                        timetable,
                        "Class Schedule",
                        "Teacher-confirmed weekly class days and timings uploaded by MUAWIN after approval.",
                    ))

                return {
                    "ok": True,
                    "course": actual_name,
                    "section": "General",
                    "uploads": results,
                    "message": "Course setup documents verified in General.",
                }

        except Exception as exc:
            return {
                "ok": False,
                "course": course_name,
                "section": "General",
                "uploads": results,
                "error": str(exc),
                "message": (
                    "Upload did not fully complete. Check the upload results; "
                    "a document may already have been uploaded."
                ),
            }

        finally:
            if context:
                try:
                    context.close()
                except Exception:
                    pass

            if browser:
                try:
                    browser.close()
                except Exception:
                    pass


def verify_course_setup_documents(
    course_name: str,
    teacher_username: str,
    teacher_password: str,
) -> dict:
    """Read-only verification of setup documents in the exact Moellim General section."""
    if not teacher_username or not teacher_password:
        return {
            "verification_status": "unknown",
            "message": "Teacher credentials are unavailable.",
        }

    browser = None
    context = None

    try:
        with sync_playwright() as playwright:
            browser, context = muawin_lecture.launch_browser(playwright)
            page = context.new_page()
            automation = muawin_lecture.MoodleAutomation(page)

            automation.login(
                username=teacher_username,
                password=teacher_password,
            )

            matched_course = automation.discover_course(course_name)
            actual_name = str(matched_course.get("name", "")).strip()

            if actual_name.casefold() != course_name.strip().casefold():
                raise RuntimeError(
                    f"Course safety check failed: requested '{course_name}', "
                    f"Moellim matched '{actual_name}'."
                )

            automation.open_course(matched_course)

            section = page.locator("#section-0")
            if not section.count():
                raise RuntimeError("Moellim General section was not found.")

            section_text = section.inner_text().casefold()

            outline_found = (
                "course outline" in section_text
                or "outline" in section_text
            )
            timetable_found = (
                "class schedule" in section_text
                or "timetable" in section_text
            )

            return {
                "verification_status": "verified",
                "course": actual_name,
                "outline_status": "verified" if outline_found else "missing",
                "class_schedule_status": "verified" if timetable_found else "missing",
                "message": "General section was checked successfully.",
            }

    except Exception as exc:
        return {
            "verification_status": "unknown",
            "course": course_name,
            "outline_status": "unknown",
            "class_schedule_status": "unknown",
            "timetable_status": "unknown",
            "message": str(exc),
        }

    finally:
        if context:
            try:
                context.close()
            except Exception:
                pass

        if browser:
            try:
                browser.close()
            except Exception:
                pass


def install(server) -> None:
    router = APIRouter()

    @router.post("/api/setup/moellim/prepare-saved")
    async def prepare_saved_documents(
        course: str = Form(...),
        authorization: str | None = Header(default=None),
    ):
        teacher = _get_teacher(server, authorization)
        course = course.strip()
        username = str(teacher.get("username", "")).strip()

        if not course:
            raise HTTPException(status_code=400, detail="Course is required.")

        from . import ai_db, muawin_ai

        outline = muawin_ai.find_outline(course, username)
        setup = ai_db.get_course_setup(username, course)
        if not outline or not outline.get("clos"):
            raise HTTPException(
                status_code=409,
                detail="Save the Course Outline for this course first."
            )

        class_slots = ai_db.get_schedule(username, course)
        if not class_slots:
            raise HTTPException(
                status_code=409,
                detail="Save the Class Days & Timings for this course first."
            )

        job_id = str(uuid.uuid4())
        job_dir = PENDING_DIR / job_id
        job_dir.mkdir(parents=True, exist_ok=False)

        try:
            outline_source = Path(setup.get("outline_file_path") or "")
            if not outline_source.is_file():
                raise HTTPException(
                    status_code=409,
                    detail="Original course outline file is missing. Upload the outline PDF/DOCX again."
                )

            outline_path = job_dir / outline_source.name
            shutil.copy2(outline_source, outline_path)

            day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
            schedule_lines = [
                f"{day_names[int(slot['weekday'])]}: {slot['start_time']} - {slot['end_time']}"
                for slot in class_slots
                if 0 <= int(slot.get("weekday", -1)) <= 6
            ]
            schedule_text = "Class Schedule\n" + "\n".join(schedule_lines)
            schedule_text += "\n\nDays not listed are off days."
            timetable_path = job_dir / "Class Schedule.txt"
            timetable_path.write_text(schedule_text, encoding="utf-8")

            outline_info = {
                "filename": outline_path.name,
                "path": str(outline_path),
                "size": outline_path.stat().st_size,
            }
            timetable_info = {
                "filename": timetable_path.name,
                "path": str(timetable_path),
                "size": timetable_path.stat().st_size,
            }

            JOBS[job_id] = {
                "job_id": job_id,
                "course": course,
                "teacher_username": username,
                "outline": outline_info,
                "timetable": timetable_info,
                "status": "awaiting_approval",
                "uploads": [],
                "message": "Course Outline and Class Schedule are ready for teacher approval.",
            }

            return {
                "job_id": job_id,
                "course": course,
                "status": "awaiting_approval",
                "uploads": [
                    {
                        "resource": "Course Outline",
                        "filename": outline_info["filename"],
                        "status": "ready_for_approval",
                    },
                    {
                        "resource": "Class Schedule",
                        "filename": timetable_info["filename"],
                        "status": "ready_for_approval",
                    },
                ],
                "message": JOBS[job_id]["message"],
            }

        except Exception:
            shutil.rmtree(job_dir, ignore_errors=True)
            raise

    @router.post("/api/setup/moellim/prepare")
    async def prepare_documents(
        course: str = Form(...),
        outline_file: UploadFile = File(...),
        timetable_file: UploadFile = File(...),
        authorization: str | None = Header(default=None),
    ):
        teacher = _get_teacher(server, authorization)
        course = course.strip()

        if not course:
            raise HTTPException(status_code=400, detail="Course is required.")

        job_id = str(uuid.uuid4())
        job_dir = PENDING_DIR / job_id
        job_dir.mkdir(parents=True, exist_ok=False)

        try:
            outline_info = await _save_upload(
                outline_file, job_dir / Path(outline_file.filename or "outline").name
            )
            timetable_info = await _save_upload(
                timetable_file, job_dir / Path(timetable_file.filename or "timetable").name
            )

            job = {
                "job_id": job_id,
                "course": course,
                "teacher_username": str(teacher.get("username", "")),
                "teacher_password": str(teacher.get("password", "")),
                "outline": outline_info,
                "timetable": timetable_info,
                "status": "awaiting_approval",
                "uploads": [],
                "message": "Both documents are ready. Teacher approval is required.",
            }
            JOBS[job_id] = job

            return {
                "job_id": job_id,
                "course": course,
                "status": job["status"],
                "uploads": [
                    {
                        "resource": "Course Outline",
                        "filename": outline_info["filename"],
                        "status": "ready_for_approval",
                    },
                    {
                        "resource": "Class Schedule",
                        "filename": timetable_info["filename"],
                        "status": "ready_for_approval",
                    },
                ],
                "message": job["message"],
            }

        except Exception:
            shutil.rmtree(job_dir, ignore_errors=True)
            raise

    @router.post("/api/setup/moellim/{job_id}/approve")
    async def approve_documents(
        job_id: str,
        authorization: str | None = Header(default=None),
    ):
        teacher = _get_teacher(server, authorization)
        job = _job_for_teacher(job_id, teacher)

        if job["status"] != "awaiting_approval":
            raise HTTPException(
                status_code=409,
                detail=f"Cannot approve a job with status '{job['status']}'.",
            )

        job["status"] = "approved"
        job["message"] = "Teacher approved both documents. Upload can now be started."

        return {
            "job_id": job_id,
            "course": job["course"],
            "status": job["status"],
            "message": job["message"],
        }

    @router.post("/api/setup/moellim/{job_id}/execute")
    async def execute_documents(
        job_id: str,
        authorization: str | None = Header(default=None),
    ):
        teacher = _get_teacher(server, authorization)
        job = _job_for_teacher(job_id, teacher)

        if job["status"] != "approved":
            raise HTTPException(
                status_code=409,
                detail="Teacher approval is required before uploading.",
            )

        # Change state before starting browser work to block duplicate requests.
        job["status"] = "running"
        job["message"] = "Uploading documents to Moellim General section."

        result = await asyncio.to_thread(
            upload_course_setup_documents,
            job["course"],
            job["outline"]["path"],
            job["timetable"]["path"],
            str(teacher.get("username", "")),
            str(teacher.get("password", "")),
        )

        job["uploads"] = result.get("uploads", [])
        job["status"] = "completed" if result.get("ok") else "failed"
        job["message"] = result.get("message", "")
        job["error"] = result.get("error")

        return {
            "job_id": job_id,
            "course": job["course"],
            "status": job["status"],
            "uploads": job["uploads"],
            "message": job["message"],
            "error": job.get("error"),
        }

    @router.get("/api/setup/moellim/{job_id}")
    async def get_document_status(
        job_id: str,
        authorization: str | None = Header(default=None),
    ):
        teacher = _get_teacher(server, authorization)
        job = _job_for_teacher(job_id, teacher)

        return {
            "job_id": job_id,
            "course": job["course"],
            "status": job["status"],
            "uploads": job.get("uploads", []),
            "message": job.get("message", ""),
            "error": job.get("error"),
        }

    @router.get("/api/setup/moellim/verify")
    async def verify_saved_documents(
        course: str,
        authorization: str | None = Header(default=None),
    ):
        teacher = _get_teacher(server, authorization)
        course_name = course.strip()

        if not course_name:
            raise HTTPException(status_code=400, detail="Course is required.")

        result = await asyncio.to_thread(
            verify_course_setup_documents,
            course_name,
            str(teacher.get("username", "")),
            str(teacher.get("password", "")),
        )
        return result

    server.app.include_router(router)