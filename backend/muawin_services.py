"""
Course setup, timetable, folder review, weekly tracking and reminder APIs.
All records are scoped to the authenticated Moellim teacher.
"""
from __future__ import annotations
import logging

logger = logging.getLogger(__name__)
import csv
import io
import json
import re
from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, List, Optional
import asyncio
import uuid
import shutil

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from . import ai_db


ALLOWED_LECTURE_EXTS = {".pdf", ".pptx", ".ppt", ".docx", ".txt"}


def _teacher(server, authorization: Optional[str]) -> str:
    session = server.get_teacher_session(authorization)
    username = (session or {}).get("username", "").strip()
    if not username:
        raise HTTPException(status_code=401, detail="Authenticated teacher session is required.")
    return username


def _ocr_image(data: bytes) -> str:
    try:
        from PIL import Image
        pytesseract = __import__("pytesseract")
        image = Image.open(io.BytesIO(data)).convert("RGB")
        return pytesseract.image_to_string(image)
    except Exception as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Image OCR could not run. Check that Tesseract OCR engine is installed. Details: {exc}"
        )


def _extract_text(data: bytes, filename: str) -> str:
    ext = Path(filename).suffix.lower()

    if ext in {".txt", ".csv"}:
        return data.decode("utf-8-sig", errors="ignore")

    if ext in {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}:
        return _ocr_image(data)

    if ext == ".pdf":
        try:
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(data))
            pages = [(page.extract_text() or "").strip() for page in reader.pages]
            text = "\n".join(pages).strip()

            if text:
                return text

            # Scanned PDF fallback: render pages and read them with OCR.
            try:
                import fitz
                from PIL import Image
                pytesseract = __import__("pytesseract")

                pdf = fitz.open(stream=data, filetype="pdf")
                results = []
                for page in pdf:
                    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
                    image = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
                    results.append(pytesseract.image_to_string(image))
                return "\n".join(results)
            except Exception as exc:
                raise HTTPException(
                    status_code=422,
                    detail=f"This PDF appears to be scanned. OCR could not read it. Check Tesseract OCR installation. Details: {exc}"
                )
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Could not read PDF: {exc}")

    if ext == ".docx":
        try:
            from docx import Document
            doc = Document(io.BytesIO(data))
            parts = [p.text for p in doc.paragraphs if p.text.strip()]
            for table in doc.tables:
                for row in table.rows:
                    parts.append(" | ".join(cell.text.strip() for cell in row.cells))
            return "\n".join(parts)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Could not read DOCX: {exc}")

    if ext == ".pptx":
        try:
            from pptx import Presentation
            prs = Presentation(io.BytesIO(data))
            return "\n".join(
                " ".join(sh.text for sh in slide.shapes if getattr(sh, "has_text_frame", False))
                for slide in prs.slides
            )
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Could not read PPTX: {exc}")

    if ext == ".xlsx":
        try:
            from importlib import import_module
            from importlib.util import find_spec
            if find_spec("openpyxl") is None:
                raise ModuleNotFoundError("openpyxl is not installed")

            load_workbook = import_module("openpyxl").load_workbook
            wb = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
            parts = []
            for ws in wb.worksheets:
                for row in ws.iter_rows(values_only=True):
                    values = [str(c).strip() for c in row if c is not None and str(c).strip()]
                    if values:
                        parts.append(" | ".join(values))
            return "\n".join(parts)
        except ModuleNotFoundError as exc:
            raise HTTPException(
                status_code=400,
                detail="XLSX parsing requires the optional dependency 'openpyxl'. Install it with: pip install openpyxl"
            ) from exc
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Could not read XLSX: {exc}")

    raise HTTPException(
        status_code=400,
        detail="Supported timetable files: PDF, DOCX, PPTX, XLSX, CSV, TXT, JPG, JPEG, PNG, WEBP, BMP and TIFF."
    )


def _parse_weeks(text: str) -> List[Dict[str, Any]]:
    lines = [re.sub(r"\s+", " ", line).strip(" \t|") for line in text.replace("\r", "\n").splitlines()]
    lines = [line for line in lines if line]

    # A class-time row contains two clock times; exclude it from weekly topics.
    time_range = re.compile(r"\b\d{1,2}:\d{2}.*\d{1,2}:\d{2}\b")
    lines = [line for line in lines if not time_range.search(line)]

    out: Dict[int, str] = {}
    patterns = [
        re.compile(r"^\s*week\s*(\d{1,2})\s*[-:.)|]?\s*(.*)$", re.I),
        re.compile(r"^\s*w\s*(\d{1,2})\s*[-:.)|]\s*(.+)$", re.I),
    ]
    numbered = re.compile(r"^\s*(\d{1,2})\s*[-:.)|]\s*(.+)$")
    ignored = {"topic", "topics", "contents", "course contents", "week", "weeks", "lecture", "lectures", "schedule"}

    for i, line in enumerate(lines):
        topic, number = "", None
        for pattern in patterns:
            match = pattern.match(line)
            if match:
                number = int(match.group(1))
                topic = (match.group(2) or "").strip(" :-|")
                break
        if number is None:
            match = numbered.match(line)
            if match:
                number = int(match.group(1))
                topic = match.group(2).strip()
        if number is None or not 1 <= number <= 52:
            continue
        if not topic and i + 1 < len(lines):
            candidate = lines[i + 1].strip()
            if candidate.lower() not in ignored and not re.match(r"^(?:week\s*|w\s*)\d{1,2}\b", candidate, re.I):
                topic = candidate
        topic = re.sub(r"\s+", " ", topic).strip(" :-|")
        if topic and topic.lower() not in ignored:
            out[number] = topic[:300]
    return [{"week": n, "topic": out[n], "expected": True} for n in sorted(out)]


def install(server):
    router = APIRouter()

    def _week_from_section_dates(
        teacher: str, course: str, live_scan: Dict[str, Any]
    ) -> Optional[int]:
        today = date.today()
        pattern = re.compile(
            r"(\d{1,2})\s+([A-Za-z]+)\s*[-–—]\s*(\d{1,2})\s+([A-Za-z]+)"
        )

        def parse_month_day(day_str: str, month_str: str):
            for fmt in ("%d %B", "%d %b"):
                try:
                    dt = datetime.strptime(f"{day_str} {month_str}", fmt)
                    return dt.month, int(day_str)
                except ValueError:
                    pass
            return None

        # 1. Check section headings from live Moellim scan if present
        sections = live_scan.get("sections") or live_scan.get("section_headings") or []
        if isinstance(sections, dict):
            sections = [{"num": k, "heading": v} for k, v in sections.items()]

        for sec in sections:
            if isinstance(sec, dict):
                heading = str(sec.get("heading") or sec.get("title") or "")
                sec_num = sec.get("week") or sec.get("num")
            else:
                heading = str(sec)
                sec_num = None

            m = pattern.search(heading)
            if not m:
                continue
            first = parse_month_day(m.group(1), m.group(2))
            last = parse_month_day(m.group(3), m.group(4))
            if not first or not last:
                continue

            s_mon, s_day = first
            e_mon, e_day = last
            for yr in (today.year - 1, today.year, today.year + 1):
                try:
                    start_dt = date(yr, s_mon, s_day)
                    end_yr = yr + (1 if (e_mon, e_day) < (s_mon, s_day) else 0)
                    end_dt = date(end_yr, e_mon, e_day)
                except ValueError:
                    continue
                if start_dt <= today <= end_dt:
                    wk_match = re.search(r"\bweek\s*(\d{1,2})\b", heading, re.I)
                    if wk_match:
                        return int(wk_match.group(1))
                    if sec_num is not None and str(sec_num).isdigit():
                        return int(sec_num)

        # 2. Check due_date / week date ranges in weekly_expectations
        progress = ai_db.weekly_progress(teacher, course)
        dated_weeks = []
        for row in progress:
            due = row.get("due_date")
            if not due:
                continue
            try:
                due_dt = datetime.fromisoformat(str(due).replace("Z", "+00:00")).date()
                dated_weeks.append((int(row["week"]), due_dt))
            except Exception:
                pass
        if dated_weeks:
            upcoming = [wk for wk, d in sorted(dated_weeks) if d >= today]
            if upcoming:
                return upcoming[0]
            past = [wk for wk, d in sorted(dated_weeks) if d <= today]
            if past:
                return past[-1]

        return None

    def _resolve_live_current_week(
        teacher: str, course: str, live_scan: Dict[str, Any]
    ) -> Optional[int]:
        if live_scan.get("current_week") is not None:
            return int(live_scan["current_week"])

        date_week = _week_from_section_dates(teacher, course, live_scan)
        if date_week is not None:
            return int(date_week)

        sem_week = ai_db.get_semester_current_week(teacher, course)
        if sem_week is not None:
            return int(sem_week)

        uploaded = [
            int(w) for w in (live_scan.get("weeks_with_lecture") or [])
            if w is not None
        ]
        return max(uploaded) if uploaded else None

    @router.get("/api/setup/status")
    def setup_status(course: Optional[str] = None, authorization: Optional[str] = Header(None)):
        teacher = _teacher(server, authorization)
        outlines = ai_db.list_outlines(teacher)
        if course:
            setup = ai_db.get_course_setup(teacher, course)
            readiness = ai_db.get_readiness(teacher, course)
            outline = None
            try:
                outline = ai_db.get_shared_course_outline(teacher, course)
                if not outline:
                    from . import muawin_ai
                    outline = muawin_ai._load_uploaded_outline(teacher, course)
            except Exception as exc:
                print(f"[SETUP] Exact course outline lookup failed: {exc}")
            outline_status = ({"course": course, "title": outline.get("title"),
                               "clo_count": len(outline.get("clos") or {}),
                               "week_count": len(outline.get("weeks") or {}),
                               "source_name": outline.get("source") or "Saved outline"}
                              if outline else None)
            return {"course": course, "setup": setup, "readiness": readiness,
                    "outline_status": outline_status, "outlines": outlines}
        return {"outlines": outlines}

    @router.post("/api/setup/timetable/preview")
    async def timetable_preview(course: str = Form(...), file: UploadFile = File(...),
                                authorization: Optional[str] = Header(None)):
        teacher = _teacher(server, authorization)
        if not course.strip():
            raise HTTPException(status_code=400, detail="Select a course first.")
        data = await file.read()
        text = _extract_text(data, file.filename or "timetable.txt")
        weeks = _parse_weeks(text)
        if not weeks:
            raise HTTPException(status_code=422, detail="No week/topic rows were detected. Use the manual week editor or upload a clearer timetable.")
        ai_db.record_event(teacher, "timetable_previewed", "success", course, {"filename": file.filename, "weeks": len(weeks)})
        return {"ok": True, "course": course, "filename": file.filename, "weeks": weeks,
                "message": "Review and correct the extracted weeks before confirming."}

    @router.post("/api/setup/timetable/confirm")
    async def timetable_confirm(
        course: str = Form(...),
        weeks: str = Form(...),
        timezone: str = Form("Asia/Karachi"),
        file: UploadFile = File(...),
        authorization: Optional[str] = Header(None)
    ):
        teacher = _teacher(server, authorization)
        course = course.strip()
        try:
            weeks = json.loads(weeks)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid timetable weeks data.")

        if not course or not isinstance(weeks, list) or not weeks:
            raise HTTPException(status_code=400, detail="Course and at least one week are required.")

        cleaned = []
        seen = set()
        for row in weeks:
            try:
                n = int(row.get("week"))
            except Exception:
                continue
            if n < 1 or n > 52 or n in seen:
                continue
            topic = str(row.get("topic") or "").strip()
            if not topic:
                raise HTTPException(status_code=400, detail=f"Enter a topic for Week {n}.")
            seen.add(n)
            cleaned.append({
                "week": n,
                "topic": topic[:300],
                "due_date": row.get("due_date"),
                "expected": bool(row.get("expected", True))
            })

        if not cleaned:
            raise HTTPException(status_code=400, detail="No valid week numbers were provided.")

        timetable = {
            "weeks": cleaned,
            "confirmed": True,
            "timezone": timezone or "Asia/Karachi"
        }

        original_name = Path(file.filename or "course_timetable.pdf").name
        safe_name = re.sub(r"[^A-Za-z0-9._-]+", "_", original_name)
        if not Path(safe_name).suffix:
            raise HTTPException(status_code=400, detail="Timetable file extension is missing.")

        storage = Path(__file__).resolve().parent / "data" / "course_setup_files"
        safe_teacher = re.sub(r"[^A-Za-z0-9_-]+", "_", teacher).strip("_") or "teacher"
        safe_course = re.sub(r"[^A-Za-z0-9_-]+", "_", course).strip("_") or "course"
        storage = storage / safe_teacher / safe_course
        storage.mkdir(parents=True, exist_ok=True)
        stored_file = storage / safe_name
        data = await file.read()
        if not data:
            raise HTTPException(status_code=400, detail="Timetable file is empty.")
        stored_file.write_bytes(data)

        if not ai_db.save_course_setup(
            teacher, course, timetable=timetable, timetable_confirmed=True
        ):
            raise HTTPException(status_code=500, detail="Could not save timetable setup.")

        if not ai_db.save_course_document_paths(
            teacher, course, timetable_file_path=str(stored_file)
        ):
            raise HTTPException(status_code=500, detail="Timetable saved, but original file path could not be saved.")

        saved_setup = ai_db.get_course_setup(teacher, course)
        if not saved_setup.get("timetable_confirmed") or not saved_setup.get("timetable"):
            raise HTTPException(status_code=500, detail="Timetable database verification failed.")

        if not ai_db.save_expectations(teacher, course, cleaned):
            raise HTTPException(status_code=500, detail="Could not save weekly expectations.")

        ai_db.record_event(
            teacher, "timetable_confirmed", "success", course, {"weeks": len(cleaned)}
        )
        return {"ok": True, "course": course, "weeks_saved": len(cleaned)}

    @router.put("/api/setup/folder")
    def folder_save(body: Dict[str, Any], authorization: Optional[str] = Header(None)):
        teacher = _teacher(server, authorization)
        course = str(body.get("course") or "").strip()
        raw = str(body.get("folder_path") or "").strip()

        if not course:
            raise HTTPException(status_code=400, detail="Course is required.")

        if raw:
            path = Path(raw).expanduser()
            if not path.exists() or not path.is_dir():
                raise HTTPException(
                    status_code=400,
                    detail="Selected folder does not exist or is not a directory."
                )
            resolved = str(path.resolve())
            event_type = "course_folder_selected"
        else:
            resolved = ""
            event_type = "course_folder_cleared"

        if not ai_db.save_course_setup(teacher, course, folder_path=resolved):
            raise HTTPException(status_code=500, detail="Could not save course folder.")

        saved_setup = ai_db.get_course_setup(teacher, course)
        if str(saved_setup.get("folder_path") or "") != resolved:
            raise HTTPException(status_code=500, detail="Folder database verification failed.")

        ai_db.record_event(
            teacher, event_type, "success", course, {"folder_path": resolved}
        )

        outline_result = {
            "status": "skipped",
            "message": "No course folder was selected."
        }
        timetable_ready = False

        if resolved:
            # 1. Check whether a fellow teacher already uploaded the Course Outline and Timetable
            shared_outline = ai_db.get_shared_course_outline(teacher, course)
            shared_schedule = ai_db.get_shared_schedule(teacher, course)

            moellim_outline_verified = False
            moellim_schedule_verified = False
            try:
                from . import course_setup_automation
                if hasattr(course_setup_automation, "verify_course_setup_on_moellim"):
                    session = server.get_teacher_session(authorization) or {}
                    v = course_setup_automation.verify_course_setup_on_moellim(
                        course,
                        str(session.get("username", "")),
                        str(session.get("password", "")),
                    )
                    moellim_outline_verified = v.get("outline_status") == "verified"
                    moellim_schedule_verified = v.get("class_schedule_status") == "verified"
            except Exception as exc:
                print(f"[SETUP] Live Moellim check skipped during folder save: {exc}")

            if shared_outline or moellim_outline_verified:
                # Already uploaded by another teaching fellow -> sync CLOs & schedule without re-uploading
                if shared_outline:
                    try:
                        from . import muawin_ai
                        muawin_ai.save_outline_for_teacher(
                            teacher,
                            course,
                            shared_outline,
                            shared_outline.get("source") or "Shared course outline",
                        )
                    except Exception as exc:
                        print(f"[SETUP] Shared outline cache sync note: {exc}")

                if shared_schedule and not ai_db.get_schedule(teacher, course):
                    ai_db.save_schedule(teacher, course, shared_schedule)

                timetable_ready = bool(shared_schedule or moellim_schedule_verified)
                ai_db.set_moellim_setup_status(
                    teacher,
                    course,
                    outline_ready=True,
                    schedule_ready=timetable_ready,
                )

                outline_result = {
                    "status": "already_uploaded",
                    "filename": (shared_outline or {}).get("source") or "Course Outline",
                    "timetable_uploaded": timetable_ready,
                    "message": (
                        "Folder saved. Course outline and timetable were already uploaded by a fellow teacher—"
                        "CLOs mapped and system is ready."
                        if timetable_ready else
                        "Folder saved. Course outline was already uploaded by a fellow teacher—"
                        "CLOs mapped. Please save Class Days & Timings if not uploaded yet."
                    ),
                }
            else:
                # 2. Not uploaded yet by any fellow teacher -> detect & upload outline to Moellim General
                try:
                    detection = detect_course_outline(course, authorization)
                    candidates = detection.get("candidates") or []

                    named_candidates = [
                        item for item in candidates
                        if "outline" in str(item.get("filename", "")).lower()
                    ]

                    selected = None
                    if len(named_candidates) == 1:
                        selected = named_candidates[0]
                    elif len(candidates) == 1:
                        selected = candidates[0]

                    if selected:
                        try:
                            saved_outline = confirm_detected_outline(
                                course,
                                selected["filename"],
                                authorization
                            )
                            outline_result = {
                                "status": "uploaded",
                                "filename": selected["filename"],
                                "details": saved_outline,
                                "message": "Course outline was saved and uploaded to Moellim General."
                            }
                        except HTTPException as exc:
                            outline_result = {
                                "status": "failed",
                                "message": str(exc.detail)
                            }
                    elif len(candidates) > 1:
                        outline_result = {
                            "status": "ambiguous",
                            "message": "Multiple possible outlines were found. No file was uploaded."
                        }
                    else:
                        outline_result = {
                            "status": "not_found",
                            "message": "No valid course outline was found in the selected folder."
                        }

                except Exception as exc:
                    outline_result = {
                        "status": "failed",
                        "message": str(exc)
                    }

            ai_db.record_event(
                teacher,
                "automatic_course_outline_upload",
                "success" if outline_result["status"] in ("uploaded", "already_uploaded") else "failed",
                course,
                {
                    "folder_path": resolved,
                    "outline_status": outline_result["status"],
                    "message": outline_result["message"]
                }
            )

        return {
            "ok": True,
            "course": course,
            "folder_path": resolved,
            "outline": outline_result,
            "timetable_uploaded": timetable_ready,
            "message": outline_result["message"]
        }

    @router.post("/api/setup/outline/detect")
    def detect_course_outline(course: str, authorization: Optional[str] = Header(None)):
        teacher = _teacher(server, authorization)
        course = str(course or "").strip()
        if not course:
            raise HTTPException(status_code=400, detail="Select a course first.")

        setup = ai_db.get_course_setup(teacher, course) or {}
        folder = setup.get("folder_path")
        if not folder:
            raise HTTPException(status_code=400, detail="Select and save this course's folder first.")

        root = Path(folder).expanduser().resolve()
        if not root.is_dir():
            raise HTTPException(status_code=400, detail="The saved course folder is unavailable.")

        from . import muawin_ai

        files = [
            item for item in root.iterdir()
            if item.is_file() and item.suffix.lower() in {".pdf", ".docx"}
            and not item.name.startswith("~$")
        ]
        files.sort(key=lambda item: (
            0 if "outline" in item.stem.lower() else 1,
            item.name.lower()
        ))

        candidates = []
        checked = 0
        for item in files[:50]:
            checked += 1
            try:
                result = muawin_ai.preview_outline_bytes(item.read_bytes(), item.name)
                if not result.get("ok"):
                    continue

                outline = result.get("outline") or {}
                clos = outline.get("clos") or {}
                if not clos:
                    continue

                preview = []
                for key, value in list(clos.items())[:8]:
                    preview.append(f"{key}: {str(value)[:260]}")

                candidates.append({
                    "filename": item.name,
                    "title": outline.get("title") or item.stem,
                    "clo_count": len(clos),
                    "week_count": len(outline.get("weeks") or {}),
                    "clo_preview": preview,
                    "warnings": result.get("warnings") or []
                })
            except Exception as exc:
                print(f"[SETUP] Outline detection skipped {item.name}: {exc}")

        ai_db.record_event(
            teacher, "course_outline_detection", "success", course,
            {"files_checked": checked, "valid_candidates": len(candidates)}
        )
        return {
            "ok": True,
            "course": course,
            "files_checked": checked,
            "candidates": candidates,
            "message": (
                "Review a detected outline and confirm it."
                if candidates else
                "No valid course outline was found in the selected folder."
            )
        }

    @router.post("/api/setup/outline/confirm")
    def confirm_detected_outline(
        course: str,
        filename: str,
        authorization: Optional[str] = Header(None)
    ):
        session = server.get_teacher_session(authorization)
        teacher = str((session or {}).get("username", "")).strip()
        if not teacher:
            raise HTTPException(status_code=401, detail="Authenticated teacher session is required.")

        course = str(course or "").strip()
        filename = Path(str(filename or "")).name

        if not course or not filename:
            raise HTTPException(status_code=400, detail="Course and filename are required.")

        setup = ai_db.get_course_setup(teacher, course) or {}
        folder = setup.get("folder_path")
        if not folder:
            raise HTTPException(status_code=400, detail="Select and save this course's folder first.")

        root = Path(folder).expanduser().resolve()
        source = (root / filename).resolve()

        # Accept only a direct child of the saved course folder.
        if source.parent != root or not source.is_file():
            raise HTTPException(status_code=403, detail="The selected file is not inside this course's saved folder.")
        if source.suffix.lower() not in {".pdf", ".docx"}:
            raise HTTPException(status_code=400, detail="Only PDF and DOCX outlines are supported.")

        from . import muawin_ai

        result = muawin_ai.preview_outline_bytes(source.read_bytes(), source.name)
        if not result.get("ok"):
            raise HTTPException(status_code=422, detail=result.get("error") or "The outline could not be read.")

        outline = result.get("outline") or {}
        if not outline.get("clos"):
            raise HTTPException(status_code=422, detail="No course learning outcomes were found.")

        safe_teacher = re.sub(r"[^A-Za-z0-9_-]+", "_", teacher).strip("_") or "teacher"
        safe_course = re.sub(r"[^A-Za-z0-9_-]+", "_", course).strip("_") or "course"
        storage = Path(__file__).resolve().parent / "data" / "course_setup_files" / safe_teacher / safe_course
        storage.mkdir(parents=True, exist_ok=True)
        stored_file = storage / source.name
        shutil.copy2(source, stored_file)

        # Upload only after the teacher confirms the detected outline.
        from . import course_setup_automation

        upload_result = course_setup_automation.upload_course_outline(
            course,
            str(stored_file),
            str(session.get("username", "")),
            str(session.get("password", "")),
        )
        if not upload_result.get("ok"):
            ai_db.record_event(
                teacher, "course_outline_upload", "failed", course,
                {"filename": source.name, "error": upload_result.get("error", "Upload failed.")},
            )
            raise HTTPException(
                status_code=502,
                detail=upload_result.get("error") or "Course Outline could not be uploaded to Moellim.",
            )

        saved = muawin_ai.save_outline_for_teacher(
            teacher, course, outline, source.name
        )
        if not saved.get("ok"):
            raise HTTPException(status_code=500, detail=saved.get("error") or "Outline could not be saved.")

        if not ai_db.save_course_document_paths(
            teacher, course, outline_file_path=str(stored_file)
        ):
            raise HTTPException(status_code=500, detail="Outline saved, but its document path could not be saved.")

        ai_db.record_event(
            teacher, "course_outline_confirmed", "success", course,
            {
                "filename": source.name,
                "clos": saved.get("clos"),
                "weeks": saved.get("weeks"),
                "moellim_upload": "verified",
            }
        )

        saved["moellim_upload"] = upload_result
        saved["original_filename"] = source.name
        saved["title"] = outline.get("title") or source.stem
        return saved

    @router.post("/api/setup/folder/scan")
    def folder_scan(course: str, authorization: Optional[str] = Header(None)):
        teacher = _teacher(server, authorization)
        setup = ai_db.get_course_setup(teacher, course)
        folder = setup.get("folder_path")
        if not folder:
            raise HTTPException(status_code=400, detail="Select and save a course folder first.")
        root = Path(folder)
        if not root.is_dir():
            raise HTTPException(status_code=400, detail="Saved folder is no longer available.")
        for p in root.iterdir():
            if p.is_file() and p.suffix.lower() in ALLOWED_LECTURE_EXTS:
                ai_db.save_folder_candidate(teacher, course, str(p.resolve()))
        rows = ai_db.list_folder_candidates(teacher, course)
        candidates = [{"id": r["id"], "name": r["file_name"], "path": r["file_path"],
                       "size_bytes": r["size_bytes"], "modified_at": r["modified_at"],
                       "status": r["status"]} for r in rows]
        ai_db.record_event(teacher, "course_folder_scanned", "success", course, {"candidate_count": len(candidates)})
        return {"course": course, "candidates": candidates,
                "message": "Candidates are suggestions only. Confirm a file manually before using it."}

    @router.post("/api/setup/folder/candidates/{candidate_id}/confirm")
    def folder_candidate_confirm(candidate_id: int, authorization: Optional[str] = Header(None)):
        teacher = _teacher(server, authorization)
        if not ai_db.confirm_folder_candidate(teacher, candidate_id):
            raise HTTPException(status_code=404, detail="Candidate not found for this teacher.")
        ai_db.record_event(teacher, "folder_candidate_confirmed", "success", details={"candidate_id": candidate_id})
        return {"ok": True, "candidate_id": candidate_id, "status": "confirmed"}

    @router.get("/api/setup/class-schedule")
    def class_schedule_get(course: str, authorization: Optional[str] = Header(None)):
        teacher = _teacher(server, authorization)
        course = course.strip()
        if not course:
            raise HTTPException(status_code=400, detail="Select a course first.")
        return {"course": course, "slots": ai_db.get_shared_schedule(teacher, course)}

    @router.put("/api/setup/class-schedule")
    def class_schedule_save(body: Dict[str, Any], authorization: Optional[str] = Header(None)):
        teacher = _teacher(server, authorization)
        course = str(body.get("course") or "").strip()
        slots = body.get("slots")

        if not course or not isinstance(slots, list):
            raise HTTPException(status_code=400, detail="Course and a class session list are required.")
        if len(slots) > 7:
            raise HTTPException(status_code=400, detail="Maximum one class slot per weekday is supported.")

        day_names = {
            "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
            "friday": 4, "saturday": 5, "sunday": 6
        }
        cleaned = []
        seen = set()

        for slot in slots:
            if not isinstance(slot, dict):
                raise HTTPException(status_code=400, detail="Each class slot must be an object.")

            day = slot.get("weekday", slot.get("day"))
            if isinstance(day, str):
                day = day.strip().lower()
                day = day_names.get(day, day)

            try:
                day = int(day)
            except (TypeError, ValueError):
                raise HTTPException(status_code=400, detail="Invalid weekday.")

            if day < 0 or day > 6 or day in seen:
                raise HTTPException(status_code=400, detail="Invalid or duplicate weekday.")

            start = str(slot.get("start_time") or slot.get("start") or "").strip()
            end = str(slot.get("end_time") or slot.get("end") or "").strip()

            def valid_time(value):
                match = re.fullmatch(r"(\d{1,2}):(\d{2})", value)
                if not match:
                    return None
                hour, minute = int(match.group(1)), int(match.group(2))
                if hour > 23 or minute > 59:
                    return None
                return hour * 60 + minute

            start_minutes = valid_time(start)
            end_minutes = valid_time(end)
            if start_minutes is None or end_minutes is None or end_minutes <= start_minutes:
                raise HTTPException(status_code=400, detail=f"Invalid class time for weekday {day}.")

            cleaned.append({
                "weekday": day,
                "start_time": f"{start_minutes // 60:02d}:{start_minutes % 60:02d}",
                "end_time": f"{end_minutes // 60:02d}:{end_minutes % 60:02d}",
                "auto_lecture": slot.get("auto_lecture", True) is True,
                "auto_assignment": slot.get("auto_assignment", False) is True
            })
            seen.add(day)

        already_uploaded_by_fellow = bool(ai_db.get_shared_schedule(teacher, course))

        saved = ai_db.save_schedule(teacher, course, cleaned)
        verified = ai_db.get_schedule(teacher, course)

        if saved is None or len(verified) != len(cleaned):
            raise HTTPException(status_code=500, detail="Class schedule could not be saved and verified.")

        ai_db.record_event(teacher, "class_schedule_confirmed", "success", course,
                           {"slots": len(verified)})

        # Check whether the timetable/class schedule was already uploaded on Moellim by a fellow teacher.
        session = server.get_teacher_session(authorization)
        username = str((session or {}).get("username", "")).strip()
        password = str((session or {}).get("password", "")).strip()

        moellim_schedule_verified = False
        try:
            from . import course_setup_automation
            if hasattr(course_setup_automation, "verify_course_setup_on_moellim"):
                v = course_setup_automation.verify_course_setup_on_moellim(
                    course, username, password
                )
                moellim_schedule_verified = v.get("class_schedule_status") == "verified"
        except Exception as exc:
            print(f"[SETUP] Live Moellim schedule check skipped: {exc}")

        if already_uploaded_by_fellow or moellim_schedule_verified:
            schedule_upload = {
                "ok": True,
                "skipped": True,
                "message": "Class schedule saved. Timetable was already uploaded to Moellim General by a fellow teacher.",
            }
        else:
            # Generate a readable DOCX from the confirmed weekly class timings and upload to Moellim.
            schedule_upload = {
                "ok": False,
                "error": "Class schedule was saved, but the Moellim upload was not attempted.",
            }

            try:
                from docx import Document

                safe_teacher = re.sub(r"[^A-Za-z0-9_-]+", "_", teacher).strip("_") or "teacher"
                safe_course = re.sub(r"[^A-Za-z0-9_-]+", "_", course).strip("_") or "course"
                storage = (
                    Path(__file__).resolve().parent
                    / "data" / "course_setup_files" / safe_teacher / safe_course
                )
                storage.mkdir(parents=True, exist_ok=True)
                timetable_path = storage / "Class_Schedule.docx"

                doc = Document()
                doc.add_heading("Class Schedule", 0)
                doc.add_paragraph(f"Course: {course}")
                doc.add_paragraph("Confirmed weekly class days and timings")

                table = doc.add_table(rows=1, cols=3)
                table.style = "Table Grid"
                headers = table.rows[0].cells
                headers[0].text = "Day"
                headers[1].text = "Start Time"
                headers[2].text = "End Time"

                weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday",
                            "Friday", "Saturday", "Sunday"]

                for slot in verified:
                    day_number = int(slot.get("weekday", 0))
                    row = table.add_row().cells
                    row[0].text = weekdays[day_number]
                    row[1].text = str(slot.get("start_time", ""))
                    row[2].text = str(slot.get("end_time", ""))

                doc.save(str(timetable_path))

                from . import course_setup_automation
                schedule_upload = course_setup_automation.upload_class_schedule_document(
                    course,
                    str(timetable_path),
                    username,
                    password,
                )

            except Exception as exc:
                schedule_upload = {
                    "ok": False,
                    "error": str(exc),
                    "message": "Class schedule was saved in MUAWIN, but its Moellim upload failed.",
                }

        ai_db.record_event(
            teacher,
            "class_schedule_moellim_upload",
            "success" if schedule_upload.get("ok") else "failed",
            course,
            {"result": schedule_upload},
        )

        return {
            "ok": True,
            "course": course,
            "slots_saved": len(verified),
            "slots": verified,
            "moellim_upload": schedule_upload,
        }

    @router.post("/api/tracker/weekly/refresh")
    def weekly_tracker_refresh(body: Dict[str, Any],
                               authorization: Optional[str] = Header(None)):
        teacher = _teacher(server, authorization)
        course = str(body.get("course") or "").strip()
        if not course:
            raise HTTPException(status_code=400, detail="Course is required.")

        try:
            from . import muawin_lecture as automation

            # Inspect the actual weekly sections in the selected Moellim course.
            live_scan = automation.scan_live_course_lecture_weeks(course)
            live_weeks = live_scan["weeks_with_lecture"]

            uploads = ai_db.get_active_lecture_uploads(teacher, course)
            checks = []
            missing = 0
            unknown = 0

            if uploads:
                checks = automation.verify_course_lecture_records(course, uploads)
                for result in checks:
                    if result["status"] == "missing":
                        if ai_db.mark_lecture_upload_missing(
                            teacher, course, result["id"]
                        ):
                            missing += 1
                    elif result["status"] == "unknown":
                        unknown += 1

            current_week = _resolve_live_current_week(teacher, course, live_scan)
            ai_db.create_missing_reminders(
                teacher, course, current_week,
                live_uploaded_weeks=live_weeks
            )

            live_set = {int(w) for w in (live_weeks or []) if w is not None}
            progress = ai_db.weekly_progress(teacher, course)
            for row in progress:
                if int(row["week"]) in live_set:
                    row["lecture_completed"] = True
                    row["status"] = "completed"

            return {
                "ok": True, "course": course, "checked": len(checks),
                "missing": missing, "unknown": unknown, "weeks": progress,
                "current_week": current_week,
                "live_checked_weeks": live_scan["checked_weeks"],
                "live_uploaded_weeks": live_weeks,
                "has_any_live_lecture": live_scan["has_any_lecture"],
            }
        except HTTPException:
            raise
        except Exception as exc:
            logger.exception(
                "[WEEKLY TRACKER] Refresh failed for course: %s",
                course
            )

            raise HTTPException(
                status_code=502,
                detail=(
                    "Live Moellim verification failed; "
                    f"saved progress was preserved: {exc}"
                )
            ) from exc

    @router.get("/api/tracker/weekly")
    def weekly_tracker(course: str, authorization: Optional[str] = Header(None)):
        teacher = _teacher(server, authorization)
        progress = ai_db.weekly_progress(teacher, course)
        return {"course": course, "weeks": progress,
                "summary": {"expected": len(progress), "completed": sum(1 for x in progress if x["lecture_completed"]),
                            "pending": sum(1 for x in progress if x["expected"] and not x["lecture_completed"])}}

    @router.put("/api/tracker/weekly")
    def weekly_tracker_update(body: Dict[str, Any], authorization: Optional[str] = Header(None)):
        teacher = _teacher(server, authorization)
        course = str(body.get("course") or "").strip()
        weeks = body.get("weeks") or []
        if not course or not isinstance(weeks, list):
            raise HTTPException(status_code=400, detail="Course and weeks are required.")
        if not ai_db.save_expectations(teacher, course, weeks):
            raise HTTPException(status_code=500, detail="Could not save weekly tracker.")
        return {"ok": True, "saved": len(weeks)}

    @router.get("/api/reminders")
    def reminders(course: Optional[str] = None, current_week: Optional[int] = None, authorization: Optional[str] = Header(None)):
        teacher = _teacher(server, authorization)

        if not course:
            return {"reminders": []}

        try:
            from . import muawin_lecture as automation
            live_scan = automation.scan_live_course_lecture_weeks(course)
        except Exception as exc:
            raise HTTPException(
                status_code=503,
                detail=f"Could not verify live Moellim course before loading reminders: {exc}"
            )

        live_weeks = live_scan.get("weeks_with_lecture") or []
        effective_week = (
            int(current_week)
            if current_week is not None
            else _resolve_live_current_week(teacher, course, live_scan)
        )

        # Sync reminders against live Moellim weeks up through effective_week
        ai_db.create_missing_reminders(
            teacher,
            course,
            effective_week,
            live_uploaded_weeks=live_weeks,
        )

        items = ai_db.list_reminders(teacher, course)
        live_set = {int(w) for w in live_weeks if w is not None}
        enriched = []
        for item in items:
            row = dict(item)
            week_num = row.get("week")
            row["week_number"] = week_num
            row["current_week"] = effective_week
            row["lecture_uploaded"] = (
                int(week_num) in live_set if week_num is not None else False
            )
            row["type"] = "missing_lecture"
            enriched.append(row)

        return {"reminders": enriched, "current_week": effective_week}

    @router.post("/api/reminders/{reminder_id}")
    def reminder_action(reminder_id: int, body: Dict[str, Any], authorization: Optional[str] = Header(None)):
        teacher = _teacher(server, authorization)
        action = str(body.get("action") or "")
        until = body.get("until")
        if action == "snooze" and not until:
            raise HTTPException(status_code=400, detail="Provide a snooze-until date/time.")
        if not ai_db.update_reminder(teacher, reminder_id, action, until):
            raise HTTPException(status_code=404, detail="Reminder not found or action is invalid.")
        return {"ok": True, "id": reminder_id, "status": action}

    @router.get("/api/readiness")
    def readiness(course: str, authorization: Optional[str] = Header(None)):
        teacher = _teacher(server, authorization)
        result = ai_db.get_readiness(teacher, course)
        try:
            from . import muawin_ai
            result["outline_ready"] = bool(muawin_ai.find_outline(course, teacher))
        except Exception:
            pass
        return result

    @router.get("/api/setup/events")
    def feature_events(limit: int = 200, authorization: Optional[str] = Header(None)):
        teacher = _teacher(server, authorization)
        return {"events": ai_db.list_events(teacher, limit)}

    server.app.include_router(router)