from fastapi import FastAPI, HTTPException, Header, Request
from fastapi.middleware.cors import CORSMiddleware
import threading
import queue
import re
import os
from concurrent.futures import Future
from pydantic import BaseModel
from typing import Optional, Any
from pathlib import Path
import asyncio
import traceback
import uuid
from secrets import token_urlsafe
from datetime import datetime, timedelta, timezone

from playwright.sync_api import sync_playwright
from backend.live_transcribe_server import (
    router as live_transcribe_router,
)
from . import muawin_lecture as automation
from . import assignment_workflow as assignment_automation
from . import muawin_combined as combined_automation
from . import audit_store
from . import file_assignment as file_assignment_scanner

# ============================================================
# FASTAPI APP
# ============================================================

app = FastAPI(
    title="MUAWIN Backend",
    version="1.0.0",
    description=(
        "MUAWIN bridge between React frontend "
        "and Moellim browser automation."
    ),
)

app.include_router(live_transcribe_router)
# ============================================================
# CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def persist_workflow_audit(request: Request, call_next):
    """Persist workflow lifecycle events without relying on PostgreSQL."""
    started = datetime.now(timezone.utc)
    response = await call_next(request)
    path = request.url.path
    tracked = ("/api/workflows", "/api/assignment-workflows",
               "/api/combined-workflows", "/api/integrations/google-drive")
    if any(path.startswith(prefix) for prefix in tracked):
        try:
            auth = request.headers.get("authorization", "")
            token = auth[7:].strip() if auth.startswith("Bearer ") else ""
            session = user_sessions.get(token) if token else None
            if session and session.get("username"):
                workflow_id = next((part for part in path.split("/")
                                    if part.startswith(("wf-", "awf-", "cwf-"))), None)
                status = "Completed" if response.status_code < 400 else "Failed"
                action = f"{request.method} {path}"
                details = {"http_status": response.status_code,
                           "duration_seconds": round((datetime.now(timezone.utc)-started).total_seconds(), 3)}
                course = None; week = None; file_name = None
                stores = (workflows, assignment_workflows, combined_workflows)
                candidates = [store.get(workflow_id) for store in stores] if workflow_id else []
                def find_value(obj, keys):
                    if isinstance(obj, dict):
                        for key in keys:
                            value = obj.get(key)
                            if value:
                                return value
                        for value in obj.values():
                            found = find_value(value, keys)
                            if found: return found
                    elif isinstance(obj, list):
                        for value in obj:
                            found = find_value(value, keys)
                            if found: return found
                    return None
                wf = next((item for item in candidates if item), {})
                workflow_status = str(wf.get("status") or "").lower() if isinstance(wf, dict) else ""
                if workflow_status in {"failed", "error", "rejected", "cancelled"}:
                    status = "Failed"
                course = find_value(wf, ("course_name", "course"))
                week = find_value(wf, ("week", "week_number"))
                file_value = find_value(wf, ("file_path", "file_name", "selected_file", "file"))
                if file_value:
                    file_name = Path(str(file_value)).name
                audit_store.record_event(
                    teacher_username=session["username"], action=action,
                    status=status, workflow_id=workflow_id, course=str(course) if course else None,
                    week=int(week) if str(week).isdigit() else None,
                    file_name=file_name, details=details)
        except Exception as exc:
            print(f"[AUDIT] Could not persist request event: {exc}")
    return response


# ============================================================
# IN-MEMORY STORES
# ============================================================

workflows: dict[str, dict[str, Any]] = {}

assignment_workflows: dict[str, dict[str, Any]] = {}

combined_workflows: dict[str, dict[str, Any]] = {}

file_assignment_workflows: dict[str, dict[str, Any]] = {}

user_sessions: dict[str, dict[str, Any]] = {}

assignment_dependency_tasks: set[asyncio.Task] = set()

SESSION_DURATION_HOURS = 8

ASSIGNMENT_DEPENDENCY_TIMEOUT_SECONDS = (
    60 * 60
)

ASSIGNMENT_DEPENDENCY_POLL_SECONDS = 1.0


# ============================================================
# REQUEST MODELS
# ============================================================

class InterpretRequest(BaseModel):
    instruction: str
    course: Optional[str] = None
    course_id: Optional[str] = None
    course_code: Optional[str] = None


class PrepareWorkflowRequest(BaseModel):
    instruction: str
    course: Optional[str] = None
    course_id: Optional[str] = None
    course_code: Optional[str] = None


class ApproveRequest(BaseModel):
    heading: Optional[str] = None
    description: Optional[str] = None
    key_points: Optional[list[str]] = None


class RejectRequest(BaseModel):
    reason: Optional[str] = None


class CombinedApproveRequest(BaseModel):
    heading: Optional[str] = None
    description: Optional[str] = None
    key_points: Optional[list[str]] = None
    assignment_title: Optional[str] = None
    assignment_description: Optional[str] = None

class LoginRequest(BaseModel):
    username: str
    password: str


class PrepareFileAssignmentRequest(BaseModel):
    course: str
    file_name: Optional[str] = None


class ConfirmFileAssignmentRequest(BaseModel):
    file_name: str
    week_number: Optional[int] = None
    title: Optional[str] = None
    start_date: Optional[str] = None
    due_date: Optional[str] = None
    total_marks: Optional[float] = None


# ============================================================
# WORKFLOW ID HELPERS
# ============================================================

def make_workflow_id() -> str:
    return f"wf-{uuid.uuid4().hex[:10]}"


def make_assignment_workflow_id() -> str:
    return f"awf-{uuid.uuid4().hex[:10]}"

def make_combined_workflow_id() -> str:
    return f"cwf-{uuid.uuid4().hex[:10]}"
# ============================================================
# JSON-SAFE CONVERSION
# ============================================================

def make_json_safe(value: Any) -> Any:
    """
    Recursively convert backend objects into JSON-safe values.

    Playwright/internal automation objects are never exposed.
    """

    if value is None:
        return None

    if isinstance(value, datetime):
        return value.isoformat()

    if isinstance(value, Path):
        return str(value)

    if isinstance(value, (str, int, float, bool)):
        return value

    if isinstance(value, dict):
        return {
            str(key): make_json_safe(item)
            for key, item in value.items()
            if key not in {
                "automation",
                "_playwright",
                "_assignment_worker",
                "page",
                "browser",
                "context",
                "p",
            }
        }

    if isinstance(value, (list, tuple, set)):
        return [
            make_json_safe(item)
            for item in value
        ]

    if hasattr(value, "__dataclass_fields__"):
        try:
            return {
                str(key): make_json_safe(
                    getattr(value, key)
                )
                for key in value.__dataclass_fields__
                if not str(key).startswith("_")
            }
        except Exception:
            pass

    if hasattr(value, "__dict__"):
        try:
            return {
                str(key): make_json_safe(item)
                for key, item in value.__dict__.items()
                if not str(key).startswith("_")
            }
        except Exception:
            pass

    return str(value)


# ============================================================
# INTENT DETECTION
# ============================================================

# Normalize Urdu/Arabic digits while preserving Urdu script.
def normalize_command_text(instruction: str) -> str:
    text = str(instruction or "").lower().strip()
    digit_map = str.maketrans("????????????????????", "01234567890123456789")
    return " ".join(text.translate(digit_map).split())



def is_assignment_instruction(
    instruction: str,
) -> bool:
    """
    Detect whether a natural-language instruction contains
    an assignment-related intent.
    """

    text = normalize_command_text(instruction)

    assignment_phrases = [
        "create an assignment",
        "create assignment",
        "generate an assignment",
        "generate assignment",
        "make an assignment",
        "make assignment",
        "prepare an assignment",
        "prepare assignment",
        "new assignment",
        "assignment",
        "homework",
        "????????",
        "???????",
        "???????? ??????",
        "???????? ???? ????",
        "???????? ????",
    ]

    return any(
        phrase in text
        for phrase in assignment_phrases
    )


def is_lecture_instruction(instruction: str) -> bool:
    """
    Detect lecture uploads and uploads of named academic
    materials to Moellim.
    """
    text = normalize_command_text(instruction)

    # Short English and Roman Urdu lecture commands
    has_lecture_number = re.search(r"\b(?:lecture|lec)\s*\d+\b", text)
    has_upload_action = re.search(
        r"\b(?:upload|add|karo|kar|bhejo|bhej|daal|dalo)\b", text
    )
    if has_lecture_number and has_upload_action:
        return True

    lecture_phrases = [
        "upload lecture",
        "upload the lecture",
        "upload lecture notes",
        "upload lecture material",
        "upload notes",
        "upload notes to moellim",
        "upload lecture to moellim",
        "add lecture",
        "add lecture notes",
        "add lecture material",
        "add notes",
        "add notes to moellim",
        "????? ????? ????",
        "????? ????? ???",
        "????? ?? ??? ????",
        "????? ???? ????",
        "????? ??????",
        "????? ????? ?? ????? ????",
        "????? ?????",
    ]

    if any(phrase in text for phrase in lecture_phrases):
        return True

    # Support uploads of named academic documents, e.g.
    # "Upload MUAWIN comparison matrix to CS7 MUAWIN Week 6."
    upload_verbs = ("upload", "add")
    destination_phrases = ("to", "into", "in")

    words = text.split()

    if not words or words[0] not in upload_verbs:
        return False

    has_destination = any(
        f" {phrase} " in f" {text} "
        for phrase in destination_phrases
    )

    has_week = "week" in words
    has_course = "cs" in text or "course" in words

    return has_destination and has_week and has_course


def detect_requested_workflows(
    instruction: str,
) -> list[str]:
    """
    Detect all workflow types requested
    inside one natural-language instruction.

    Possible values:
        lecture
        assignment
    """

    workflows_found: list[str] = []

    if is_lecture_instruction(
        instruction
    ):
        workflows_found.append(
            "lecture"
        )

    if is_assignment_instruction(
        instruction
    ):
        workflows_found.append(
            "assignment"
        )

    return workflows_found


# ============================================================
# LECTURE WORKFLOW PUBLIC STATE
# ============================================================

def workflow_public_state(
    wf: dict[str, Any],
) -> dict[str, Any]:

    return {
        "id": wf["id"],
        "status": wf["status"],
        "request": wf["request"],
        "parsed": make_json_safe(
            wf.get("parsed")
        ),
        "course": make_json_safe(
            wf.get("course")
        ),
        "draft": make_json_safe(
            wf.get("draft")
        ),
        "steps": make_json_safe(
            wf.get("steps", [])
        ),
        "result": make_json_safe(
            wf.get("result")
        ),
        "error": wf.get("error"),
    }



# ============================================================
# ASSIGNMENT WORKFLOW PUBLIC STATE
# ============================================================

def assignment_workflow_public_state(
    wf: dict[str, Any],
) -> dict[str, Any]:

    return {
        "id": wf["id"],
        "status": wf["status"],
        "request": wf["request"],
        "parsed": make_json_safe(
            wf.get("parsed")
        ),
        "draft": make_json_safe(
            wf.get("draft")
        ),
        "steps": make_json_safe(
            wf.get("steps", [])
        ),
        "result": make_json_safe(
            wf.get("result")
        ),
        "error": wf.get("error"),
        "missing_fields": wf.get("missing_fields", []),
        "clarification_question": wf.get("clarification_question"),
        "dependency": make_json_safe(
            wf.get("dependency")
        ),
        "course_id": make_json_safe(
            wf.get("course_id")
        ),
        "target_info": make_json_safe(
            wf.get("target_info")
        ),
        "activities": make_json_safe(
            wf.get("activities", [])
        ),
    }


def combined_workflow_public_state(
    wf: dict[str, Any],
) -> dict[str, Any]:
    """Return the frontend-safe state of a combined workflow."""
    return {
        "id": wf["id"],
        "workflow_type": "combined",
        "status": wf["status"],
        "request": wf["request"],
        "parsed": make_json_safe(wf.get("parsed")),
        "draft": make_json_safe(wf.get("draft")),
        "steps": make_json_safe(wf.get("steps", [])),
        "result": make_json_safe(wf.get("result")),
        "error": wf.get("error"),
    }


def verify_combined_workflow_owner(
    wf: Optional[dict[str, Any]],
    authorization: Optional[str],
):
    if not wf:
        raise HTTPException(
            status_code=404,
            detail="Combined workflow not found.",
        )

    session_token = get_session_token(authorization)

    if wf.get("session_token") != session_token:
        raise HTTPException(
            status_code=403,
            detail="You do not have access to this combined workflow.",
        )

    return get_teacher_session(authorization)


def create_combined_steps():
    return [
        {"id": "parse", "label": "Understand combined instruction", "status": "pending"},
        {"id": "login", "label": "Connect to Moellim", "status": "pending"},
        {"id": "course", "label": "Find target course", "status": "pending"},
        {"id": "material", "label": "Locate lecture material", "status": "pending"},
        {"id": "generate", "label": "Prepare assignment and questions", "status": "pending"},
        {"id": "approval", "label": "Teacher approval", "status": "waiting"},
        {"id": "upload", "label": "Upload lecture", "status": "pending"},
        {"id": "verify_lecture", "label": "Verify lecture upload", "status": "pending"},
        {"id": "create", "label": "Create assignment in target week", "status": "pending"},
        {"id": "verify", "label": "Verify assignment", "status": "pending"},
    ]
# ============================================================
# STEP HELPERS
# ============================================================

def update_step(
    wf: dict[str, Any],
    step_id: str,
    status: str,
):
    for step in wf.get("steps", []):

        if step["id"] == step_id:
            step["status"] = status
            break


def create_steps():
    return [
        {
            "id": "parse",
            "label": "Understand teacher instruction",
            "status": "pending",
        },
        {
            "id": "login",
            "label": "Connect to Moellim",
            "status": "pending",
        },
        {
            "id": "course",
            "label": "Find target course",
            "status": "pending",
        },
        {
            "id": "material",
            "label": "Locate lecture material",
            "status": "pending",
        },
        {
            "id": "approval",
            "label": "Teacher approval",
            "status": "waiting",
        },
        {
            "id": "upload",
            "label": "Upload to Moellim",
            "status": "pending",
        },
        {
            "id": "verify",
            "label": "Verify upload",
            "status": "pending",
        },
    ]


def create_assignment_steps():
    return [
        {
            "id": "parse",
            "label": "Understand assignment instruction",
            "status": "pending",
        },
        {
            "id": "login",
            "label": "Connect to Moellim",
            "status": "pending",
        },
        {
            "id": "course",
            "label": "Find target course",
            "status": "pending",
        },
        {
            "id": "week",
            "label": "Find target week",
            "status": "pending",
        },
        {
            "id": "lecture",
            "label": "Extract lecture content",
            "status": "pending",
        },
        {
            "id": "generate",
            "label": "Generate assignment questions",
            "status": "pending",
        },
        {
            "id": "approval",
            "label": "Teacher approval",
            "status": "waiting",
        },
        {
            "id": "create",
            "label": "Create assignment in Moellim",
            "status": "pending",
        },
        {
            "id": "verify",
            "label": "Verify assignment",
            "status": "pending",
        },
    ]


# ============================================================
# LECTURE -> ASSIGNMENT DEPENDENCY HELPERS
# ============================================================

def normalize_dependency_value(
    value: Any,
) -> str:
    """
    Generic dependency normalization.

    Converts values such as:

        "  Lecture 4  "
        "lecture   4"

    into a comparable normalized string.
    """

    if value is None:
        return ""

    return " ".join(
        str(value).strip().lower().split()
    )


def normalize_course_dependency_value(
    value: Any,
) -> str:
    """
    Normalize course names specifically for dependency
    matching.

    Example:

        CS7 MUAWIN
        CS7 MUAWIN (Female)

    are treated as the same base course for dependency
    matching.

    This intentionally removes ONLY a trailing parenthetical
    qualifier.

    It does not broadly remove arbitrary words from the
    course name.
    """

    normalized = normalize_dependency_value(
        value
    )

    if not normalized:
        return ""

    normalized = re.sub(
        r"\s*\([^)]*\)\s*$",
        "",
        normalized,
    ).strip()

    return normalized


def values_match_dependency(
    left: Any,
    right: Any,
) -> bool:

    return (
        normalize_dependency_value(left)
        == normalize_dependency_value(right)
    )


def courses_match_dependency(
    left: Any,
    right: Any,
) -> bool:
    """
    Compare course names for lecture -> assignment
    dependency matching.

    First performs exact matching.

    If exact matching fails, compares the base course names
    after removing a trailing parenthetical qualifier.

    Example:

        CS7 MUAWIN
        CS7 MUAWIN (Female)

    -> MATCH
    """

    left_exact = normalize_dependency_value(
        left
    )

    right_exact = normalize_dependency_value(
        right
    )

    if not left_exact or not right_exact:
        return False

    # --------------------------------------------------------
    # Exact match
    # --------------------------------------------------------

    if left_exact == right_exact:
        return True

    # --------------------------------------------------------
    # Base-course match
    # --------------------------------------------------------

    left_base = normalize_course_dependency_value(
        left
    )

    right_base = normalize_course_dependency_value(
        right
    )

    return (
        bool(left_base)
        and bool(right_base)
        and left_base == right_base
    )


def extract_assignment_source_lecture(
    parsed: Optional[dict[str, Any]],
    instruction: str,
) -> Optional[str]:
    parsed = parsed or {}

    for key in (
        "source",
        "lecture",
        "source_lecture",
        "lecture_from",
        "lecture_name",
    ):
        value = parsed.get(key)

        if value is None or value == "":
            continue

        # ---------------------------------------------------------
        # Handle structured parser output such as:
        # {"week": None, "lecture": 4, "name": None}
        # ---------------------------------------------------------
        if isinstance(value, dict):
            lecture_number = value.get("lecture")

            if lecture_number is not None:
                return f"Lecture {lecture_number}"

            name = value.get("name")

            if name:
                value = name
            else:
                continue

        # ---------------------------------------------------------
        # Handle a bare numeric lecture value:
        # 4 -> Lecture 4
        # ---------------------------------------------------------
        if isinstance(value, (int, float)):
            return f"Lecture {int(value)}"

        value_text = str(value).strip()

        # ---------------------------------------------------------
        # Handle "Lecture 4", "lecture4", etc.
        # ---------------------------------------------------------
        match = re.search(
            r"(lecture\s*\d+)",
            value_text,
            re.IGNORECASE,
        )

        if match:
            return match.group(1).strip()

        # ---------------------------------------------------------
        # Handle a bare numeric string:
        # "4" -> Lecture 4
        # ---------------------------------------------------------
        match = re.fullmatch(r"\d+", value_text)

        if match:
            return f"Lecture {value_text}"

        return value_text

    # -------------------------------------------------------------
    # Final fallback: extract from the original instruction
    # -------------------------------------------------------------
    match = re.search(
        r"(?:from|using|based on|of)\s+"
        r"(lecture\s*\d+)",
        instruction or "",
        re.IGNORECASE,
    )

    return (
        match.group(1).strip()
        if match
        else None
    )
def find_matching_lecture_workflow(
    session_token: str,
    assignment_parsed: dict[str, Any],
    assignment_instruction: str,
) -> Optional[dict[str, Any]]:
    """
    Find the lecture workflow that the assignment depends on.

    Matching criteria:
        1. Same teacher session
        2. Same course
           - exact OR base-course match
        3. Same week
        4. Same lecture

    IMPORTANT:
    This function prints diagnostic information so that a
    dependency mismatch can be identified instead of silently
    falling back to standalone assignment preparation.
    """

    target_course_raw = assignment_parsed.get(
        "course"
    )

    target_course = normalize_dependency_value(
        target_course_raw
    )

    target_week = assignment_parsed.get(
        "week"
    )

    target_lecture = (
        extract_assignment_source_lecture(
            assignment_parsed,
            assignment_instruction,
        )
    )

    print(
        "\n[DEPENDENCY MATCH] Searching for required lecture..."
    )

    print(
        f"[DEPENDENCY MATCH] Session token: "
        f"{session_token[:12]}..."
    )

    print(
        f"[DEPENDENCY MATCH] Assignment course: "
        f"{target_course_raw!r}"
    )

    print(
        f"[DEPENDENCY MATCH] Assignment week: "
        f"{target_week!r}"
    )

    print(
        f"[DEPENDENCY MATCH] Assignment lecture: "
        f"{target_lecture!r}"
    )

    candidates: list[dict[str, Any]] = []

    terminal_statuses = {
        "completed",
        "rejected",
        "failed",
    }

    for lecture_wf in workflows.values():

        lecture_id = lecture_wf.get(
            "id"
        )

        lecture_session = lecture_wf.get(
            "session_token"
        )

        lecture_status = lecture_wf.get(
            "status"
        )

        lecture_parsed = (
            lecture_wf.get("parsed")
            or {}
        )

        lecture_course = lecture_parsed.get(
            "course"
        )

        lecture_week = lecture_parsed.get(
            "week"
        )

        lecture_name = lecture_parsed.get(
            "lecture"
        )

        print(
            "\n[DEPENDENCY MATCH] Candidate:"
        )

        print(
            f"  ID      : {lecture_id}"
        )

        print(
            f"  Session : "
            f"{'MATCH' if lecture_session == session_token else 'NO MATCH'}"
        )

        print(
            f"  Status  : {lecture_status}"
        )

        print(
            f"  Course  : {lecture_course!r}"
        )

        print(
            f"  Week    : {lecture_week!r}"
        )

        print(
            f"  Lecture : {lecture_name!r}"
        )

        # ----------------------------------------------------
        # SESSION
        # ----------------------------------------------------

        if lecture_session != session_token:

            print(
                "  -> Rejected: different teacher session."
            )

            continue

        # ----------------------------------------------------
        # TERMINAL STATUS
        # ----------------------------------------------------

        if lecture_status in terminal_statuses:

            print(
                f"  -> Rejected: terminal status "
                f"'{lecture_status}'."
            )

            continue

        # ----------------------------------------------------
        # COURSE
        # ----------------------------------------------------

        course_matches = courses_match_dependency(
            lecture_course,
            target_course,
        )

        print(
            f"  -> Course match: "
            f"{course_matches}"
        )

        if not course_matches:

            print(
                "  -> Rejected: course mismatch."
            )

            continue

        # ----------------------------------------------------
        # WEEK
        # ----------------------------------------------------

        week_matches = (
            target_week is None
            or values_match_dependency(
                lecture_week,
                target_week,
            )
        )

        print(
            f"  -> Week match: "
            f"{week_matches}"
        )

        if not week_matches:

            print(
                "  -> Rejected: week mismatch."
            )

            continue

        # ----------------------------------------------------
        # LECTURE
        # ----------------------------------------------------

        lecture_matches = (
            not target_lecture
            or values_match_dependency(
                lecture_name,
                target_lecture,
            )
        )

        print(
            f"  -> Lecture match: "
            f"{lecture_matches}"
        )

        if not lecture_matches:

            print(
                "  -> Rejected: lecture mismatch."
            )

            continue

        # ----------------------------------------------------
        # MATCH FOUND
        # ----------------------------------------------------

        print(
            "\n[DEPENDENCY MATCH] âœ“ MATCH FOUND:"
        )

        print(
            f"  Lecture workflow: {lecture_id}"
        )

        print(
            f"  Course: {lecture_course}"
        )

        print(
            f"  Week: {lecture_week}"
        )

        print(
            f"  Lecture: {lecture_name}"
        )

        candidates.append(
            lecture_wf
        )

    if not candidates:

        print(
            "\n[DEPENDENCY MATCH] âœ— NO MATCH FOUND."
        )

        print(
            "[DEPENDENCY MATCH] "
            f"Total lecture workflows currently stored: "
            f"{len(workflows)}"
        )

        return None

    # Most recently created matching lecture workflow.
    return candidates[-1]
def mark_dependency_task_done(
    task: asyncio.Task,
):
    assignment_dependency_tasks.discard(
        task
    )

    try:
        task.exception()

    except (
        asyncio.CancelledError,
        Exception,
    ):
        pass


def schedule_assignment_dependency_task(
    assignment_wf: dict[str, Any],
    lecture_wf: dict[str, Any],
    session: dict[str, Any],
):

    task = asyncio.create_task(
        prepare_assignment_after_lecture(
            assignment_wf,
            lecture_wf,
            session,
        )
    )

    assignment_dependency_tasks.add(
        task
    )

    task.add_done_callback(
        mark_dependency_task_done
    )


async def prepare_assignment_after_lecture(
    assignment_wf: dict[str, Any],
    lecture_wf: dict[str, Any],
    session: dict[str, Any],
):
    dependency = assignment_wf.setdefault(
        "dependency",
        {},
    )

    lecture_id = lecture_wf.get("id")

    started_at = (
        asyncio.get_running_loop().time()
    )

    print(
        f"\n[DEPENDENCY] Assignment "
        f"{assignment_wf['id']} "
        f"is waiting for lecture workflow "
        f"{lecture_id}."
    )

    while True:

        # ---------------------------------------------------------
        # IMPORTANT:
        # Always get the latest lecture workflow from the global
        # workflows dictionary.
        #
        # This prevents the dependency task from watching a stale
        # dictionary object after the lecture workflow is updated.
        # ---------------------------------------------------------
        current_lecture_wf = workflows.get(
            lecture_id
        )

        if current_lecture_wf is None:

            dependency["status"] = "failed"

            dependency["message"] = (
                "The required lecture workflow "
                "could no longer be found."
            )

            assignment_wf["status"] = "failed"

            assignment_wf["error"] = (
                f"Lecture workflow {lecture_id} "
                "could no longer be found."
            )

            print(
                f"\n[DEPENDENCY] Lecture workflow "
                f"{lecture_id} could not be found."
            )

            return

        # ---------------------------------------------------------
        # Read the CURRENT status.
        # ---------------------------------------------------------
        lecture_status = (
            current_lecture_wf.get(
                "status"
            )
        )

        print(
            f"[DEPENDENCY WATCH] "
            f"Assignment="
            f"{assignment_wf.get('id')} | "
            f"Lecture="
            f"{lecture_id} | "
            f"Lecture status="
            f"{lecture_status}"
        )

        # =========================================================
        # LECTURE COMPLETED
        # =========================================================
        if lecture_status == "completed":

            dependency["status"] = (
                "completed"
            )

            dependency["message"] = (
                "Required lecture has been "
                "uploaded and verified. "
                "Assignment preparation "
                "is starting."
            )

            print(
                f"\n[DEPENDENCY] Lecture workflow "
                f"{lecture_id} completed."
            )

            print(
                "[DEPENDENCY] Starting assignment "
                "preparation."
            )

            try:

                await run_assignment_preparation(
                    assignment_wf,
                    session,
                )

            except Exception as exc:

                traceback.print_exc()

                assignment_wf["status"] = (
                    "failed"
                )

                assignment_wf["error"] = (
                    str(exc)
                )

                dependency["status"] = (
                    "failed"
                )

                dependency["message"] = (
                    "Assignment preparation "
                    "failed after the required "
                    "lecture completed."
                )

                print(
                    f"\n[DEPENDENCY] Assignment "
                    f"{assignment_wf['id']} "
                    f"preparation failed: {exc}"
                )

            return

        # =========================================================
        # LECTURE REJECTED / FAILED
        # =========================================================
        if lecture_status in {
            "rejected",
            "failed",
        }:

            dependency["status"] = (
                "failed"
            )

            dependency["message"] = (
                "The required lecture workflow "
                "did not complete. "
                f"Lecture workflow status: "
                f"{lecture_status}."
            )

            assignment_wf["status"] = (
                "failed"
            )

            assignment_wf["error"] = (
                "Assignment preparation was "
                "stopped because the required "
                "lecture workflow "
                f"({lecture_id}) ended with "
                f"status '{lecture_status}'."
            )

            print(
                f"\n[DEPENDENCY] Assignment "
                f"{assignment_wf['id']} stopped "
                f"because lecture workflow "
                f"{lecture_id} ended as "
                f"'{lecture_status}'."
            )

            return

        # =========================================================
        # TIMEOUT
        # =========================================================
        elapsed = (
            asyncio.get_running_loop().time()
            - started_at
        )

        if (
            elapsed
            >= ASSIGNMENT_DEPENDENCY_TIMEOUT_SECONDS
        ):

            dependency["status"] = (
                "timeout"
            )

            dependency["message"] = (
                "Timed out while waiting for "
                "the required lecture workflow."
            )

            assignment_wf["status"] = (
                "failed"
            )

            assignment_wf["error"] = (
                f"Timed out waiting for lecture "
                f"workflow {lecture_id} "
                "to complete. Please retry "
                "the assignment workflow."
            )

            print(
                f"\n[DEPENDENCY] Assignment "
                f"{assignment_wf['id']} "
                "timed out."
            )

            return

        # =========================================================
        # KEEP WAITING
        # =========================================================
        await asyncio.sleep(
            ASSIGNMENT_DEPENDENCY_POLL_SECONDS
        )

def schedule_assignment_dependency(
    assignment_wf: dict[str, Any],
    lecture_wf: dict[str, Any],
    session: dict[str, Any],
):

    schedule_assignment_dependency_task(
        assignment_wf,
        lecture_wf,
        session,
    )


def select_course_lecture_file(lecture_name: str, course_name: str, session: dict[str, Any]):
    """Select a lecture only from the folder saved for this teacher and course."""
    from . import ai_db

    teacher = str(session.get("username") or "").strip()
    course = str(course_name or "").strip()

    if not teacher or not course:
        raise RuntimeError("Teacher and selected course are required.")

    setup = ai_db.get_course_setup(teacher, course)
    folder_path = (setup or {}).get("folder_path")

    if not folder_path:
        raise RuntimeError(
            f"No local lecture folder is saved for '{course}'. "
            "Please select and save this course's folder in Course Setup."
        )

    selector = automation.MaterialSelector()
    file_path = selector.auto_select(
        lecture_name,
        local_folder=folder_path,
    )

    if not file_path:
        raise RuntimeError(f"No matching lecture found in the saved folder for '{course}'.")

    return selector, file_path

# ============================================================
# AUTHENTICATION / SESSION HELPERS
# ============================================================

def create_teacher_session(
    username: str,
    password: str,
    name: str,
) -> str:

    token = token_urlsafe(
        32
    )

    now = datetime.now(
        timezone.utc
    )

    expires_at = (
        now
        + timedelta(
            hours=SESSION_DURATION_HOURS
        )
    )

    user_sessions[token] = {
        "username": username.strip(),
        "password": password,
        "name": name.strip(),
        "created_at": now,
        "expires_at": expires_at,
    }

    return token


def get_teacher_session(
    authorization: Optional[str],
) -> dict[str, Any]:

    if not authorization:

        raise HTTPException(
            status_code=401,
            detail="Authentication required.",
        )

    if not authorization.startswith(
        "Bearer "
    ):

        raise HTTPException(
            status_code=401,
            detail="Invalid authentication format.",
        )

    token = authorization[7:].strip()

    if not token:

        raise HTTPException(
            status_code=401,
            detail="Authentication token is missing.",
        )

    session = user_sessions.get(
        token
    )

    if not session:

        raise HTTPException(
            status_code=401,
            detail="Session is invalid or has expired.",
        )

    expires_at = session.get(
        "expires_at"
    )

    if (
        expires_at
        and datetime.now(timezone.utc)
        >= expires_at
    ):

        user_sessions.pop(
            token,
            None,
        )

        raise HTTPException(
            status_code=401,
            detail=(
                "Session has expired. "
                "Please log in again."
            ),
        )

    return session


def get_session_token(
    authorization: Optional[str],
) -> str:

    get_teacher_session(
        authorization
    )

    if not authorization:

        raise HTTPException(
            status_code=401,
            detail="Authentication required.",
        )

    return authorization[7:].strip()


def verify_workflow_owner(
    wf: Optional[dict[str, Any]],
    authorization: Optional[str],
):

    if not wf:

        raise HTTPException(
            status_code=404,
            detail="Workflow not found.",
        )

    session_token = get_session_token(
        authorization
    )

    if wf.get(
        "session_token"
    ) != session_token:

        raise HTTPException(
            status_code=403,
            detail=(
                "You do not have access "
                "to this workflow."
            ),
        )

    return get_teacher_session(
        authorization
    )


def verify_assignment_workflow_owner(
    wf: Optional[dict[str, Any]],
    authorization: Optional[str],
):

    if not wf:

        raise HTTPException(
            status_code=404,
            detail="Assignment workflow not found.",
        )

    session_token = get_session_token(
        authorization
    )

    if wf.get(
        "session_token"
    ) != session_token:

        raise HTTPException(
            status_code=403,
            detail=(
                "You do not have access "
                "to this assignment workflow."
            ),
        )

    return get_teacher_session(
        authorization
    )


# ============================================================
# PLAYWRIGHT CLEANUP
# ============================================================

def close_playwright_resources(
    resources: Optional[dict[str, Any]],
):

    if not resources:
        return

    page = resources.get(
        "page"
    )

    context = resources.get(
        "context"
    )

    browser = resources.get(
        "browser"
    )

    p = resources.get(
        "p"
    )

    try:

        if page:
            page.close()

    except Exception:
        pass

    try:

        if context:
            context.close()

    except Exception:
        pass

    try:

        if browser:
            browser.close()

    except Exception:
        pass

    try:

        if p:
            p.stop()

    except Exception:
        pass


# ============================================================
# DEDICATED ASSIGNMENT PLAYWRIGHT WORKER
# ============================================================

class AssignmentPlaywrightWorker:
    """
    Dedicated synchronous Playwright worker for ONE
    assignment workflow.

    FastAPI runs on asyncio while assignment automation
    uses Playwright Sync API.

    The Playwright browser remains on the same dedicated
    thread from preparation through approval and execution.
    """

    def __init__(
        self,
        wf: dict[str, Any],
        session: dict[str, Any],
    ):

        self.wf = wf

        self.session = session

        self.tasks: queue.Queue = queue.Queue()

        self.thread = threading.Thread(
            target=self._run,
            name=(
                f"muawin-assignment-"
                f"{wf['id']}"
            ),
            daemon=True,
        )

        self.started = False

        self.stopped = False

    def start(self):

        if self.started:
            return

        self.started = True

        print(
            "\n[ASSIGNMENT WORKER] "
            f"Starting dedicated thread: "
            f"{self.thread.name}"
        )

        self.thread.start()

    def submit(
        self,
        function,
        *args,
        **kwargs,
    ) -> Future:

        if not self.started:
            self.start()

        if self.stopped:

            future = Future()

            future.set_exception(
                RuntimeError(
                    "Assignment Playwright worker "
                    "has already stopped."
                )
            )

            return future

        future = Future()

        self.tasks.put(
            (
                function,
                args,
                kwargs,
                future,
            )
        )

        return future

    def stop(self):

        if self.stopped:
            return

        self.stopped = True

        try:

            self.tasks.put_nowait(
                None
            )

        except Exception:
            pass

    def _run(self):

        print(
            "\n[ASSIGNMENT WORKER] "
            f"Thread active: "
            f"{threading.current_thread().name}"
        )

        while True:

            task = self.tasks.get()

            if task is None:

                print(
                    "\n[ASSIGNMENT WORKER] "
                    "Stop signal received."
                )

                break

            function, args, kwargs, future = (
                task
            )

            try:

                if not future.cancelled():

                    result = function(
                        *args,
                        **kwargs,
                    )

                    future.set_result(
                        result
                    )

            except BaseException as exc:

                if not future.cancelled():

                    future.set_exception(
                        exc
                    )

        print(
            "\n[ASSIGNMENT WORKER] "
            f"Thread stopped: "
            f"{threading.current_thread().name}"
        )


async def await_worker_future(
    future: Future,
):
    """
    Await a concurrent.futures.Future without
    blocking FastAPI's asyncio event loop.
    """

    return await asyncio.wrap_future(
        future
    )


# ============================================================
# ASSIGNMENT WORKFLOW CLEANUP
# ============================================================

def cleanup_assignment_resources_on_worker(
    wf: dict[str, Any],
):
    """
    Cleanup function that MUST execute on the same
    dedicated assignment Playwright thread.
    """

    resources = wf.get(
        "_playwright"
    )

    if resources:

        close_playwright_resources(
            resources
        )

    wf["_playwright"] = None

    wf["automation"] = None


async def cleanup_assignment_workflow(
    wf: dict[str, Any],
):
    """
    Safely cleanup assignment Playwright resources.

    If a dedicated worker exists, cleanup is executed
    inside that same worker thread.
    """

    worker = wf.get(
        "_assignment_worker"
    )

    if worker:

        try:

            future = worker.submit(
                cleanup_assignment_resources_on_worker,
                wf,
            )

            await await_worker_future(
                future
            )

        except Exception as exc:

            print(
                "\n[ASSIGNMENT CLEANUP] "
                f"Worker cleanup failed: {exc}"
            )

        finally:

            worker.stop()

            wf["_assignment_worker"] = None

        return

    resources = wf.get(
        "_playwright"
    )

    if resources:

        close_playwright_resources(
            resources
        )

    wf["_playwright"] = None

    wf["automation"] = None


# ============================================================
# MOELLIM AUTHENTICATION
# ============================================================

def authenticate_moellim_sync(
    username: str,
    password: str,
):
    print(
    "[COMBINED PREPARE] Running on thread:",
    threading.current_thread().name,
    )
    p = sync_playwright().start()

    browser = None

    context = None

    page = None

    try:

        browser, context = (
            automation.launch_browser(p)
        )

        page = context.new_page()

        moodle = automation.MoodleAutomation(
            page
        )

        print(
            "\n[AUTH] Logging into live Moellim..."
        )

        moodle.login(username, password)

        print(
            f"âœ“ Logged in to Moellim as "
            f"{username}"
        )

        teacher_name = None

        def clean_name(value):

            if not value:
                return None

            value = " ".join(
                str(value).split()
            ).strip()

            if not value:
                return None

            prefixes = [
                "User menu for ",
                "User menu: ",
                "Profile for ",
            ]

            for prefix in prefixes:

                if value.lower().startswith(
                    prefix.lower()
                ):

                    value = value[
                        len(prefix):
                    ].strip()

            if not value:
                return None

            invalid_values = {
                username.strip().lower(),
                "dashboard",
                "profile",
                "log out",
                "logout",
                "login",
                "my courses",
                "home",
                "user menu",
            }

            if value.lower() in invalid_values:
                return None

            return value

        # ----------------------------------------------------
        # METHOD 1: PROFILE LINK
        # ----------------------------------------------------

        try:

            profile_links = page.locator(
                'a[href*="/user/profile.php?id="]'
            )

            for i in range(
                min(
                    profile_links.count(),
                    10,
                )
            ):

                try:

                    link = profile_links.nth(i)

                    href = (
                        link.get_attribute(
                            "href"
                        )
                    )

                    if not href:
                        continue

                    if (
                        "/user/profile.php?id="
                        not in href
                    ):
                        continue

                    candidate = clean_name(
                        link.inner_text()
                    )

                    if candidate:

                        teacher_name = candidate

                        break

                except Exception:
                    pass

        except Exception as exc:

            print(
                "[AUTH] Profile-link inspection failed: "
                f"{exc}"
            )

        # ----------------------------------------------------
        # METHOD 2: USER MENU
        # ----------------------------------------------------

        if not teacher_name:

            try:

                user_menu_selectors = [
                    '[data-region="usermenu"] .userbutton',
                    '[data-region="usermenu"] '
                    '[data-action="toggle-drawer"]',
                    '#user-menu-toggle',
                    '.usermenu .userbutton',
                ]

                for selector in user_menu_selectors:

                    locator = page.locator(
                        selector
                    )

                    for i in range(
                        min(
                            locator.count(),
                            5,
                        )
                    ):

                        element = locator.nth(i)

                        for attribute in [
                            "aria-label",
                            "title",
                        ]:

                            try:

                                candidate = clean_name(
                                    element.get_attribute(
                                        attribute
                                    )
                                )

                                if candidate:

                                    teacher_name = (
                                        candidate
                                    )

                                    break

                            except Exception:
                                pass

                        if teacher_name:
                            break

                        try:

                            candidate = clean_name(
                                element.inner_text()
                            )

                            if candidate:

                                teacher_name = (
                                    candidate
                                )

                                break

                        except Exception:
                            pass

                    if teacher_name:
                        break

            except Exception as exc:

                print(
                    "[AUTH] User-menu inspection failed: "
                    f"{exc}"
                )

        # ----------------------------------------------------
        # METHOD 3: PROFILE PAGE
        # ----------------------------------------------------

        if not teacher_name:

            try:

                profile_links = page.locator(
                    'a[href*="/user/profile.php?id="]'
                )

                profile_href = None

                for i in range(
                    min(
                        profile_links.count(),
                        10,
                    )
                ):

                    try:

                        href = (
                            profile_links
                            .nth(i)
                            .get_attribute(
                                "href"
                            )
                        )

                        if (
                            href
                            and "/user/profile.php?id="
                            in href
                        ):

                            profile_href = href

                            break

                    except Exception:
                        pass

                if profile_href:

                    current_url = page.url

                    page.goto(
                        profile_href,
                        wait_until="domcontentloaded",
                    )

                    page.wait_for_timeout(
                        1000
                    )

                    profile_selectors = [
                        ".page-header-headings h1",
                        "#page-header "
                        ".page-header-headings h1",
                        "#page-header h1",
                        "h1",
                    ]

                    for selector in profile_selectors:

                        locator = page.locator(
                            selector
                        )

                        for i in range(
                            min(
                                locator.count(),
                                5,
                            )
                        ):

                            try:

                                candidate = clean_name(
                                    locator
                                    .nth(i)
                                    .inner_text()
                                )

                                if candidate:

                                    teacher_name = (
                                        candidate
                                    )

                                    break

                            except Exception:
                                pass

                        if teacher_name:
                            break

                    try:

                        page.goto(
                            current_url,
                            wait_until="domcontentloaded",
                        )

                        page.wait_for_timeout(
                            500
                        )

                    except Exception:
                        pass

            except Exception as exc:

                print(
                    "[AUTH] Profile-page inspection failed: "
                    f"{exc}"
                )

        # ----------------------------------------------------
        # FALLBACK
        # ----------------------------------------------------

        if not teacher_name:

            teacher_name = username.strip()

        print(
            f"[AUTH] Logged-in teacher: "
            f"{teacher_name}"
        )

        # ----------------------------------------------------
        # COLLECT COURSES
        # ----------------------------------------------------

        courses = (
            moodle.collect_course_links()
        )

        print(
            "\n[AUTH] Courses found:"
        )

        for course in courses:

            print(
                f"  - {course['name']} "
                f"-> {course['href']}"
            )

        return {
            "authenticated": True,
            "username": username.strip(),
            "name": teacher_name,
            "courses": courses,
        }

    finally:

        close_playwright_resources(
            {
                "p": p,
                "browser": browser,
                "context": context,
                "page": page,
            }
        )


# ============================================================
# HEALTH
# ============================================================

@app.get("/api/health")
async def health():

    return {
        "status": "ok",
        "service": "MUAWIN Backend",
        "automation": "Playwright",
        "llm": "external / optional",
        "lecture_workflows": True,
        "assignment_workflows": True,
    }


# ============================================================
# ROOT
# ============================================================

@app.get("/")
async def root():

    return {
        "service": "MUAWIN Backend",
        "status": "running",
        "docs": "/docs",
    }



# ============================================================
# LOGIN
# ============================================================

@app.post("/api/auth/login")
async def auth_login(request: LoginRequest):
    username = request.username.strip()
    password = request.password

    if not username or not password:
        raise HTTPException(
            status_code=400,
            detail="Moellim username and password are required.",
        )

    try:
        result = await asyncio.to_thread(
            authenticate_moellim_sync,
            username,
            password,
        )

        # Diagnostic logging â€” never print the password.
        courses = result.get("courses", [])

        print("\n========== MUAWIN LOGIN DIAGNOSTICS ==========")
        print("Result type:", type(result).__name__)
        print("Result keys:", list(result.keys()) if isinstance(result, dict) else "NOT A DICT")
        print("Authenticated result received: Yes")
        print("Returned course count:", len(courses) if isinstance(courses, list) else "NOT A LIST")
        print(
            "Sample courses:",
            [
                {
                    "name": c.get("name"),
                    "href": c.get("href"),
                }
                for c in courses[:3]
                if isinstance(c, dict)
            ] if isinstance(courses, list) else courses
        )
        print("===============================================\n")

        if not isinstance(result, dict):
            raise RuntimeError(
                "Moellim authentication returned an unexpected result."
            )

        session_token = create_teacher_session(
            username=username,
            password=password,
            name=result.get("name") or username,
        )

        return {
            "authenticated": True,
            "auth_token": session_token,
            "username": result.get("username") or username,
            "name": result.get("name") or username,
            "courses": courses if isinstance(courses, list) else [],
        }

    except HTTPException:
        raise

    except Exception as exc:
        traceback.print_exc()

        raise HTTPException(
            status_code=401,
            detail=str(exc),
        )

# ============================================================
# INTERPRET INSTRUCTION
# ============================================================

@app.post("/api/assistant/interpret")
async def interpret_instruction(
    request: InterpretRequest,
    authorization: Optional[str] = Header(None),
):

    get_teacher_session(
        authorization
    )

    original_instruction = request.instruction.strip()
    instruction = original_instruction
    assignment_mode = "not_applicable"

    # Use Gemini to understand natural teacher commands.
    # Existing parsers remain the fallback if AI interpretation is unavailable.
    try:
        from . import muawin_ai

        course_context = (
            getattr(request, "course", None)
            or getattr(request, "course_name", None)
            or getattr(request, "selected_course", None)
            or ""
        )

        ai_interpretation = muawin_ai.interpret_teacher_command(
            original_instruction,
            str(course_context),
        )

        if ai_interpretation:
            instruction = ai_interpretation["canonical_instruction"]
            assignment_mode = ai_interpretation.get(
                "assignment_mode", "not_applicable"
            )
            print(
                "[MUAWIN AI] Command interpreted:",
                ai_interpretation.get("intent"),
                "| confidence:",
                ai_interpretation.get("confidence"),
            )

    except Exception as ai_error:
        print(f"[MUAWIN AI] Interpreter fallback: {ai_error}")
        instruction = original_instruction

    if not instruction:

        raise HTTPException(
            status_code=400,
            detail="Instruction cannot be empty.",
        )

    try:

        lower_instruction = (
            instruction.lower()
        )

        requested_workflows = (
            detect_requested_workflows(
                instruction
            )
        )

        # Preserve the AI interpreter's distinction between an
        # existing assignment document and a newly generated assignment.
        if (
            assignment_mode == "existing_file_upload"
            and "assignment" not in requested_workflows
        ):
            requested_workflows.append("assignment")

        if not requested_workflows:

            raise HTTPException(
                status_code=400,
                detail=(
                    "MUAWIN could not identify "
                    "a supported workflow action."
                ),
            )

        # ====================================================
        # MULTI-ACTION
        # ====================================================

        if len(requested_workflows) > 1:

            actions = []

            lecture_instruction = None

            assignment_instruction = None

            # ------------------------------------------------
            # LECTURE PORTION
            # ------------------------------------------------

            if "lecture" in requested_workflows:

                lecture_match = re.search(
                    r"(.+?)(?=\s+(?:and|then|also)\s+"
                    r"(?:create|generate|make|prepare)\s+"
                    r"(?:an\s+)?assignment\b)",
                    instruction,
                    re.IGNORECASE,
                )

                if lecture_match:

                    lecture_instruction = (
                        lecture_match.group(1)
                        .strip(" ,.")
                    )

                else:

                    lecture_match = re.search(
                        r"(.+?(?:upload|add).+?"
                        r"lecture.+?)(?=\s+and\s+"
                        r"|\s+then\s+|\s+also\s+|$)",
                        instruction,
                        re.IGNORECASE,
                    )

                    if lecture_match:

                        lecture_instruction = (
                            lecture_match.group(1)
                            .strip(" ,.")
                        )

            # ------------------------------------------------
            # ASSIGNMENT PORTION
            # ------------------------------------------------

            if "assignment" in requested_workflows:

                assignment_match = re.search(
                    r"((?:create|generate|make|prepare)\s+"
                    r"(?:an\s+)?assignment\b.*)$",
                    instruction,
                    re.IGNORECASE,
                )

                if assignment_match:

                    assignment_instruction = (
                        assignment_match.group(1)
                        .strip(" ,.")
                    )

                else:

                    assignment_match = re.search(
                        r"((?:create|generate|make|prepare)"
                        r".+?assignment\b.*)$",
                        instruction,
                        re.IGNORECASE,
                    )

                    if assignment_match:

                        assignment_instruction = (
                            assignment_match.group(1)
                            .strip(" ,.")
                        )

            # =================================================
            # LECTURE ACTION
            # =================================================

            if "lecture" in requested_workflows:

                lecture_request = (
                    lecture_instruction
                    or instruction
                )

                lecture_parsed = (
                    automation.parse_request(
                        lecture_request
                    )
                )

                actions.append(
                    {
                        "intent":
                            "Upload Lecture",

                        "workflow_type":
                            "lecture",

                        "raw_instruction":
                            lecture_request,

                        "course":
                            lecture_parsed.get(
                                "course"
                            ),

                        "week":
                            lecture_parsed.get(
                                "week"
                            ),

                        "lecture":
                            lecture_parsed.get(
                                "lecture"
                            ),

                        "heading":
                            lecture_parsed.get(
                                "heading"
                            ),
                    }
                )

            # =================================================
            # ASSIGNMENT ACTION
            # =================================================

            if "assignment" in requested_workflows:

                assignment_request = (
                    assignment_instruction
                    or instruction
                )

                assignment_parsed = (
                    assignment_automation
                    .parse_request(
                        assignment_request
                    )
                )

                actions.append(
                    {
                        "intent":
                            "Create Assignment",

                        "workflow_type":
                            "assignment",

                        "raw_instruction":
                            assignment_request,

                        "course":
                            assignment_parsed.get(
                                "course"
                            ),

                        "week":
                            assignment_parsed.get(
                                "week"
                            ),

                        "title":
                            assignment_parsed.get(
                                "title"
                            ),

                        "marks":
                            assignment_parsed.get(
                                "max_grade"
                            ),

                        "deadline":
                            make_json_safe(
                                assignment_parsed.get(
                                    "duedate"
                                )
                            ),

                        "question_types":
                            make_json_safe(
                                assignment_parsed.get(
                                    "question_types"
                                )
                            ),

                        "source":
                            assignment_parsed.get(
                                "source"
                            ),
                    }
                )

            # =================================================
            # MULTI-ACTION RESPONSE
            # =================================================

            return {
                "intent":
                    "Multiple Actions",

                "workflow_type":
                    "multi",

                "is_multi_action":
                    True,

                "detected_actions": [
                    action["intent"]
                    for action in actions
                ],

                "actions":
                    actions,

                "raw_instruction":
                    instruction,
            }

        # ====================================================
        # SINGLE ASSIGNMENT
        # ====================================================

        if (
            requested_workflows[0]
            == "assignment"
        ):

            if assignment_mode == "existing_file_upload":
                return {
                    "intent": "Upload Existing Assignment",
                    "workflow_type": "file_assignment",
                    "assignment_mode": "existing_file_upload",
                    "is_multi_action": False,
                    "detected_actions": ["Upload Existing Assignment"],
                    "course": request.course,
                    "raw_instruction": instruction,
                }

            parsed = (
                assignment_automation
                .parse_request(
                    instruction
                )
            )

            return {
                "intent":
                    "Create Assignment",

                "workflow_type":
                    "assignment",

                "assignment_mode":
                    "generate_new",

                "is_multi_action":
                    False,

                "detected_actions": [
                    "Create Assignment"
                ],

                "course":
                    parsed.get(
                        "course"
                    ),

                "week":
                    parsed.get(
                        "week"
                    ),

                "title":
                    parsed.get(
                        "title"
                    ),

                "marks":
                    parsed.get(
                        "max_grade"
                    ),

                "deadline":
                    make_json_safe(
                        parsed.get(
                            "duedate"
                        )
                    ),

                "question_types":
                    make_json_safe(
                        parsed.get(
                            "question_types"
                        )
                    ),

                "source":
                    parsed.get(
                        "source"
                    ),

                "raw_instruction":
                    instruction,
            }

        # ====================================================
        # SINGLE LECTURE
        # ====================================================

        parsed = (
            automation.parse_request(
                instruction
            )
        )

        return {
            "intent":
                (
                    "Upload Lecture"
                    if "upload"
                    in lower_instruction
                    else
                    "Execute Moellim Workflow"
                ),

            "workflow_type":
                "lecture",

            "is_multi_action":
                False,

            "detected_actions": [
                "Upload Lecture"
            ],

            "course":
                parsed.get(
                    "course"
                ),

            "week":
                parsed.get(
                    "week"
                ),

            "lecture":
                parsed.get(
                    "lecture"
                ),

            "heading":
                parsed.get(
                    "heading"
                ),

            "raw_instruction":
                instruction,
        }

    except HTTPException:
        raise

    except Exception as exc:

        traceback.print_exc()

        raise HTTPException(
            status_code=400,
            detail=str(exc),
        )


# ============================================================
# LECTURE WORKFLOW - PREPARE
# ============================================================

@app.post("/api/workflows/prepare")
async def prepare_workflow(
    request: PrepareWorkflowRequest,
    authorization: Optional[str] = Header(None),
):

    session = get_teacher_session(
        authorization
    )

    instruction = request.instruction.strip()

    if not instruction:

        raise HTTPException(
            status_code=400,
            detail="Instruction cannot be empty.",
        )

    # ========================================================
    # DEFENSIVE ROUTING
    #
    # Assignment-only instructions are redirected.
    #
    # Combined lecture + assignment commands remain lecture
    # parent workflows and are NOT redirected.
    # ========================================================

    if (
        is_assignment_instruction(
            instruction
        )
        and not is_lecture_instruction(
            instruction
        )
    ):

        print(
            "\n[ROUTER] Assignment-only instruction "
            "detected in /api/workflows/prepare."
        )

        print(
            "[ROUTER] Redirecting to assignment workflow."
        )

        return await prepare_assignment_workflow(
            PrepareWorkflowRequest(
                instruction=instruction
            ),
            authorization,
        )

    session_token = get_session_token(
        authorization
    )

    workflow_id = make_workflow_id()

    wf: dict[str, Any] = {

        "id":
            workflow_id,

        "status":
            "preparing",

        "request":
            instruction,

        "session_token":
            session_token,

        "username":
            session["username"],

        "teacher_name":
            session["name"],

        "parsed":
            None,

        "course":
            None,

        "draft":
            None,

        "steps":
            create_steps(),

        "result":
            None,

        "error":
            None,

        "file_path":
            None,

        "course_name":
            None,

        "course_href":
            None,

        "week":
            None,

        "lecture":
            None,
    }

    workflows[
        workflow_id
    ] = wf

    try:

        print(
            "\n" + "=" * 70
        )

        print(
            "MUAWIN WORKFLOW PREPARATION"
        )

        print(
            "=" * 70
        )

        print(
            f"\nTeacher: "
            f"{session['name']}"
        )

        print(
            f"Moellim ID: "
            f"{session['username']}"
        )

        print(
            f"Instruction: "
            f"{instruction}"
        )

        parsed = automation.parse_request(
            instruction
        )

        selected_course = (
            request.course or request.course_code or ""
        ).strip()

        if not parsed.get("course") and selected_course:
            parsed["course"] = selected_course

        if selected_course:
            wf["course"] = selected_course
            wf["course_name"] = selected_course

        if request.course_id:
            wf["course_id"] = str(request.course_id)

        wf["parsed"] = parsed

        update_step(
            wf,
            "parse",
            "completed",
        )

        print(
            "\nâœ“ Parsed request:"
            f"\n  Course: {parsed.get('course')}"
            f"\n  Week: {parsed.get('week')}"
            f"\n  Lecture: {parsed.get('lecture')}"
            f"\n  Heading: {parsed.get('heading')}"
        )

        preparation = await asyncio.to_thread(
            prepare_moellim_workflow_sync,
            wf,
            session,
        )

        wf.update(
            preparation
        )

        wf["status"] = (
            "waiting_approval"
        )

        update_step(
            wf,
            "approval",
            "waiting",
        )

        print(
            f"\nâœ“ Workflow prepared: "
            f"{workflow_id}"
        )

        return workflow_public_state(
            wf
        )

    except Exception as exc:

        traceback.print_exc()

        wf["status"] = (
            "failed"
        )

        wf["error"] = str(
            exc
        )

        return workflow_public_state(
            wf
        )


# ============================================================
# LECTURE WORKFLOW - PREPARATION WORKER
# ============================================================

def prepare_moellim_workflow_sync(
    wf: dict[str, Any],
    session: dict[str, Any],
) -> dict[str, Any]:

    parsed = wf["parsed"]

    course_query = parsed.get(
        "course"
    )

    week = parsed.get(
        "week"
    )

    lecture = parsed.get(
        "lecture"
    )

    heading = parsed.get(
        "heading"
    )

    if not course_query:

        raise RuntimeError(
            "Could not determine the target course."
        )

    if not week:

        raise RuntimeError(
            "Could not determine the target week."
        )

    if not lecture:

        raise RuntimeError(
            "Could not determine the lecture."
        )

    result: dict[str, Any] = {}

    p = None

    browser = None

    context = None

    page = None

    try:

        print(
            "\n[PREPARE 1] "
            "Starting Playwright session..."
        )

        p = sync_playwright().start()

        browser, context = (
            automation.launch_browser(p)
        )

        page = context.new_page()

        moodle = automation.MoodleAutomation(
            page
        )

        print(
            "\n[PREPARE 2] "
            "Logging into Moellim..."
        )

        print(
            f"Teacher account: "
            f"{session['username']}"
        )

        moodle.login(session.get('username'), session.get('password'))

        print(
            f"âœ“ Logged into Moellim as "
            f"{session['username']}."
        )

        update_step(
            wf,
            "login",
            "completed",
        )

        print(
            "\n[PREPARE 3] "
            "Discovering course..."
        )

        course = moodle.discover_course(
            course_query
        )

        if not course:

            raise RuntimeError(
                f"Course '{course_query}' "
                "was not found on Moellim."
            )

        course_name = course.get(
            "name"
        )

        course_href = course.get(
            "href"
        )

        print(
            f"âœ“ Course found: "
            f"{course_name}"
        )

        update_step(
            wf,
            "course",
            "completed",
        )

        result["course_name"] = (
            course_name
        )

        result["course_href"] = (
            course_href
        )

        print(
            "\n[PREPARE 4] "
            "Opening course..."
        )

        moodle.open_course(
            course
        )

        print(
            f"âœ“ Course opened: "
            f"{course_name}"
        )

        print(
            "\n[PREPARE 5] "
            "Ensuring Edit mode..."
        )

        moodle.ensure_edit_mode()

        print(
            "âœ“ Edit mode ready."
        )

        print(
            f"\n[PREPARE 6] "
            f"Finding Week {week}..."
        )

        week_info = moodle.check_week(
            week
        )

        if week_info:

            print(
                f"âœ“ Week {week} found."
            )

        else:

            print(
                f"! Week {week} not found."
            )

            print(
                "! Teacher approval ke baad "
                "naya week (date based) add hoga."
            )

        print(
            f'\nSearching "{lecture}" '
            "on this computer and Google Drive..."
        )

        selector, file_path = select_course_lecture_file(
            lecture,
            course_query,
            session,
        )

        if not file_path:

            raise RuntimeError(
                f'Lecture material "{lecture}" '
                "could not be found."
            )

        file_path = str(
            file_path
        )

        print(
            f"âœ“ Lecture material found: "
            f"{file_path}"
        )

        update_step(
            wf,
            "material",
            "completed",
        )

        draft = (
            automation.prepare_lecture_preview(
                file_path,
                lecture,
                heading=heading,
            )
        )

        if draft is None:

            draft = {
                "heading":
                    (
                        heading
                        or lecture
                    ),

                "description":
                    (
                        f"Lecture material for "
                        f"{heading or lecture}."
                    ),

                "key_points":
                    [],

                "auto_description":
                    True,
            }

        draft["course"] = (
            course_name
        )

        draft["week"] = (
            week
        )

        draft["file"] = Path(
            file_path
        ).name

        if not week_info:

            draft["note"] = (
                "Moellim mein ye naye weeks "
                "(date based) ban jayenge: "
                f"Week 1, Week {week}"
            )

        result["draft"] = draft

        result["file_path"] = (
            file_path
        )

        result["week"] = (
            week
        )

        result["lecture"] = (
            lecture
        )

        return result

    finally:

        close_playwright_resources(
            {
                "p":
                    p,

                "browser":
                    browser,

                "context":
                    context,

                "page":
                    page,
            }
        )


# ============================================================
# ASSIGNMENT PREPARATION
# ============================================================

async def run_assignment_preparation(
    wf: dict[str, Any],
    session: dict[str, Any],
):

    wf["status"] = (
        "preparing"
    )

    for step_id in (
        "login",
        "course",
        "week",
        "lecture",
        "generate",
    ):

        update_step(
            wf,
            step_id,
            "pending",
        )

    update_step(
        wf,
        "approval",
        "pending",
    )

    worker = AssignmentPlaywrightWorker(
        wf,
        session,
    )

    wf["_assignment_worker"] = (
        worker
    )

    worker.start()

    try:

        future = worker.submit(
            prepare_assignment_workflow_sync,
            wf,
            session,
        )

        preparation = (
            await await_worker_future(
                future
            )
        )

        wf.update(
            preparation
        )

        wf["status"] = (
            "waiting_approval"
        )

        update_step(
            wf,
            "approval",
            "waiting",
        )

        print(
            f"\nâœ“ Assignment workflow prepared: "
            f"{wf['id']}"
        )

    except Exception:

        await cleanup_assignment_workflow(
            wf
        )

        raise


# ============================================================
# ASSIGNMENT WORKFLOW - PREPARE
# ============================================================

@app.post(
    "/api/assignment-workflows/prepare"
)
async def prepare_assignment_workflow(
    request: PrepareWorkflowRequest,
    authorization: Optional[str] = Header(None),
):

    session = get_teacher_session(
        authorization
    )

    session_token = get_session_token(
        authorization
    )

    instruction = (
        request.instruction.strip()
    )

    if not instruction:

        raise HTTPException(
            status_code=400,
            detail=(
                "Assignment instruction "
                "cannot be empty."
            ),
        )

    workflow_id = (
        make_assignment_workflow_id()
    )

    wf: dict[str, Any] = {

        "id":
            workflow_id,

        "status":
            "preparing",

        "request":
            instruction,

        "session_token":
            session_token,

        "username":
            session["username"],

        "teacher_name":
            session["name"],

        "parsed":
            None,

        "draft":
            None,

        "steps":
            create_assignment_steps(),

        "result":
            None,

        "error":
            None,

        "dependency":
            None,

        "automation":
            None,

        "_playwright":
            None,

        "_assignment_worker":
            None,

        "course_id":
            None,

        "target_info":
            None,

        "activities":
            [],
    }

    assignment_workflows[
        workflow_id
    ] = wf

    try:

        print(
            "\n" + "=" * 70
        )

        print(
            "MUAWIN ASSIGNMENT WORKFLOW PREPARATION"
        )

        print(
            "=" * 70
        )

        print(
            f"\nTeacher: "
            f"{session['name']}"
        )

        print(
            f"Moellim ID: "
            f"{session['username']}"
        )

        print(
            f"Instruction: "
            f"{instruction}"
        )

        parsed = assignment_automation.parse_request(
            instruction,
            selected_course=(
                request.course
                or request.course_code
            ),
        )

        assignment_automation.validate_parsed_request(parsed)

        wf["parsed"] = parsed

        update_step(wf, "parse", "completed")

        missing = assignment_automation.get_assignment_missing_details(
            parsed
        )

        print(
            f"[ASSIGNMENT DEBUG] Missing fields: {missing} | "
            f"Parsed request: {parsed}"
        )

        if missing:
            wf["status"] = "needs_clarification"
            wf["missing_fields"] = missing

            questions = {
                "week": "Which week should this assignment cover?",
                "deadline": "What is the assignment submission deadline?",
                "lecture_material": (
                    "I could not identify the relevant lecture material. "
                    "Please provide or select the lecture material."
                ),
            }

            wf["clarification_question"] = " ".join(
                questions[field] for field in missing
            )

            return assignment_workflow_public_state(wf)

        print("\nâœ“ Assignment request parsed:")

        print(f"  Course: {parsed.get('course')}")
        print(f"  Week: {parsed.get('week')}")
        print(f"  Title: {parsed.get('title')}")
        print(f"  Marks: {parsed.get('max_grade')}")
        print(f"  Questions: {parsed.get('question_types')}")

        # ====================================================
        # FIND LECTURE DEPENDENCY
        # ====================================================

        lecture_wf = (
            find_matching_lecture_workflow(
                session_token,
                parsed,
                instruction,
            )
        )

        if lecture_wf:

            lecture_parsed = (
                lecture_wf.get("parsed")
                or {}
            )

            lecture_name = (
                lecture_parsed.get(
                    "lecture"
                )
                or
                extract_assignment_source_lecture(
                    parsed,
                    instruction,
                )
                or
                "required lecture"
            )

            lecture_status = (
                lecture_wf.get(
                    "status"
                )
            )

            wf["dependency"] = {

                "workflow_id":
                    lecture_wf.get("id"),

                "workflow_type":
                    "lecture",

                "status":
                    (
                        "completed"
                        if lecture_status
                        == "completed"
                        else
                        "waiting_for_lecture"
                    ),

                "message":
                    (
                        "Required lecture is already "
                        "uploaded and verified. "
                        "Assignment preparation "
                        "will start."
                        if lecture_status
                        == "completed"
                        else
                        f"Waiting for {lecture_name} "
                        "to be approved, uploaded, "
                        "and verified before preparing "
                        "the assignment."
                    ),

                "course":
                    lecture_parsed.get(
                        "course"
                    ),

                "week":
                    lecture_parsed.get(
                        "week"
                    ),

                "lecture":
                    lecture_name,
            }

            # =================================================
            # LECTURE ALREADY COMPLETED
            # =================================================

            if lecture_status == "completed":

                print(
                    "\n[DEPENDENCY] Required lecture "
                    "is already completed. "
                    "Preparing assignment now."
                )

                await run_assignment_preparation(
                    wf,
                    session,
                )

                return (
                    assignment_workflow_public_state(
                        wf
                    )
                )

            # =================================================
            # WAIT FOR LECTURE
            # =================================================

            print(
                f"\n[DEPENDENCY] Assignment workflow "
                f"{workflow_id} is waiting for "
                f"lecture workflow "
                f"{lecture_wf.get('id')}."
            )

            update_step(
                wf,
                "approval",
                "pending",
            )

            schedule_assignment_dependency(
                wf,
                lecture_wf,
                session,
            )

            return (
                assignment_workflow_public_state(
                    wf
                )
            )

        # ====================================================
        # NO DEPENDENCY
        #
        # This is a standalone assignment. Prepare normally.
        # ====================================================

        print(
            "\n[DEPENDENCY] No matching lecture "
            "workflow found."
        )

        print(
            "[DEPENDENCY] Preparing assignment "
            "as standalone workflow."
        )

        await run_assignment_preparation(
            wf,
            session,
        )

        return (
            assignment_workflow_public_state(
                wf
            )
        )

    except Exception as exc:

        traceback.print_exc()

        wf["status"] = (
            "failed"
        )

        wf["error"] = str(
            exc
        )

        await cleanup_assignment_workflow(
            wf
        )

        return (
            assignment_workflow_public_state(
                wf
            )
        )


# ============================================================
# COMBINED WORKFLOW - PREPARE
# ============================================================

@app.post("/api/combined-workflows/prepare")
async def prepare_combined_workflow(
    request: PrepareWorkflowRequest,
    authorization: Optional[str] = Header(None),
):
    session = get_teacher_session(authorization)
    session_token = get_session_token(authorization)
    instruction = request.instruction.strip()

    if not instruction:
        raise HTTPException(
            status_code=400,
            detail="Combined workflow instruction cannot be empty.",
        )

    # Use the course already selected in the MUAWIN interface.
    selected_course = (
        request.course or request.course_code or ""
    ).strip()
    if not selected_course:
        raise HTTPException(
            status_code=400,
            detail="Selected course was not provided by the interface.",
        )

    # Validate the combined request before opening a browser.
    try:
        lecture_job, assignment_job = (
            combined_automation.parse_combined(
                instruction, selected_course=selected_course
            )
        )
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Could not parse combined instruction: {exc}",
        ) from exc

    workflow_id = make_combined_workflow_id()

    wf: dict[str, Any] = {
        "id": workflow_id,
        "workflow_type": "combined",
        "status": "preparing",
        "request": instruction,
        "session_token": session_token,
        "username": session["username"],
        "teacher_name": session["name"],
        "parsed": {
            "workflow_type": "combined",
            "lecture": lecture_job,
            "assignment": assignment_job,
        },
        "draft": None,
        "steps": create_combined_steps(),
        "result": None,
        "error": None,
        "automation": None,
        "_playwright": None,
        "_assignment_worker": None,
        "_assignment_automation": None,
        "_file_path": None,
        "course": selected_course,
        "course_id": request.course_id,
        "course_code": request.course_code,
    }

    combined_workflows[workflow_id] = wf
    update_step(wf, "parse", "completed")

    worker = AssignmentPlaywrightWorker(wf, session)
    wf["_assignment_worker"] = worker

    try:
        print("\n" + "=" * 70)
        print("MUAWIN COMBINED WORKFLOW PREPARATION")
        print("=" * 70)
        print(f"Workflow: {workflow_id}")
        print(f"Teacher: {session['name']}")
        print(f"Instruction: {instruction}")

        future = worker.submit(
            prepare_combined_workflow_sync,
            wf,
            session,
        )

        preparation = await await_worker_future(future)

        # Preserve the worker and browser resources for approval
        # and execution on the same dedicated thread.
        wf.update(preparation)

        wf["status"] = "waiting_approval"
        update_step(wf, "approval", "waiting")

        print(f"Prepared for teacher approval: {workflow_id}")

    except Exception as exc:
        traceback.print_exc()

        wf["status"] = "failed"
        wf["error"] = str(exc)

        try:
            await cleanup_assignment_workflow(wf)
        except Exception:
            traceback.print_exc()

        print(f"Combined workflow preparation failed: {exc}")

    return combined_workflow_public_state(wf)
# ============================================================
# ASSIGNMENT WORKFLOW - PREPARATION WORKER
# ============================================================

def prepare_assignment_workflow_sync(
    wf: dict[str, Any],
    session: dict[str, Any],
) -> dict[str, Any]:

    instruction = wf["request"]

    p = None

    browser = None

    context = None

    page = None

    try:

        print(
            "\n[ASSIGNMENT PREPARE 1] "
            "Starting Playwright session..."
        )

        current_thread = (
            threading.current_thread()
        )

        print(
            f"[PLAYWRIGHT] Thread: "
            f"{current_thread.name}"
        )

        p = sync_playwright().start()

        browser, context = (
            automation.launch_browser(p)
        )

        page = context.new_page()

        # ====================================================
        # LOGIN
        # ====================================================

        print(
            "\n[ASSIGNMENT PREPARE 2] "
            "Logging into Moellim..."
        )

        print(
            f"Teacher account: "
            f"{session['username']}"
        )

        moodle = automation.MoodleAutomation(
            page
        )

        moodle.login(session.get('username'), session.get('password'))

        print(
            f"âœ“ Logged into Moellim as "
            f"{session['username']}"
        )

        update_step(
            wf,
            "login",
            "completed",
        )

        # ====================================================
        # ASSIGNMENT PREPARATION
        # ====================================================

        print(
            "\n[ASSIGNMENT PREPARE 3] "
            "Preparing assignment..."
        )

        prepared = (
    assignment_automation
    .prepare_assignment_request(
        page,
        instruction,
        selected_course=(
            (wf.get("parsed") or {}).get("course")
        ),
    )
)

        # ====================================================
        # UPDATE STEPS
        # ====================================================

        update_step(
            wf,
            "course",
            "completed",
        )

        update_step(
            wf,
            "week",
            "completed",
        )

        update_step(
            wf,
            "lecture",
            "completed",
        )

        update_step(
            wf,
            "generate",
            "completed",
        )

        print(
            "\nâœ“ Assignment prepared."
        )

        print(
            "âœ“ Browser session will remain "
            "open until approval."
        )

        # ====================================================
        # RETURN PREPARED WORKFLOW
        # ====================================================

        return {

            "parsed":
                prepared.get(
                    "parsed"
                ),

            "draft":
                prepared.get(
                    "draft"
                ),

            "automation":
                prepared.get(
                    "automation"
                ),

            "course_id":
                prepared.get(
                    "course_id"
                ),

            "target_info":
                prepared.get(
                    "target_info"
                ),

            "activities":
                prepared.get(
                    "activities",
                    [],
                ),

            "_playwright": {

                "p":
                    p,

                "browser":
                    browser,

                "context":
                    context,

                "page":
                    page,
            },
        }

    except Exception:

        close_playwright_resources(
            {
                "p":
                    p,

                "browser":
                    browser,

                "context":
                    context,

                "page":
                    page,
            }
        )

        raise



def prepare_combined_workflow_sync(
    wf: dict[str, Any],
    session: dict[str, Any],
) -> dict[str, Any]:
    """Prepare a combined workflow on its dedicated worker thread."""

    p = None
    browser = None
    context = None
    page = None

    resources: dict[str, Any] = {}

    try:
        instruction = wf["request"]

        print(
            "[COMBINED PREPARE] Worker thread:",
            threading.current_thread().name,
        )

        # 1. Parse the combined instruction.
        lecture_job, assignment_job = (
            combined_automation.parse_combined(
                instruction, selected_course=wf.get("course")
            )
        )

        wf["parsed"] = {
            "workflow_type": "combined",
            "lecture": lecture_job,
            "assignment": assignment_job,
        }

        update_step(wf, "parse", "completed")

        # 2. Start Playwright and retain each resource immediately.
        print("[COMBINED PREPARE] Starting Playwright...")

        p = sync_playwright().start()
        resources["p"] = p

        print("[COMBINED PREPARE] Launching browser...")

        browser, context = automation.launch_browser(p)

        resources["browser"] = browser
        resources["context"] = context

        page = context.new_page()
        resources["page"] = page

        wf["_playwright"] = resources

        print("[COMBINED PREPARE] Browser started successfully.")

        # Keep the existing login call unchanged.
        moodle = automation.MoodleAutomation(page)
        moodle.login(session.get('username'), session.get('password'))

        wf["automation"] = moodle
        update_step(wf, "login", "completed")

        # 3. Find and open the requested course.
        course = moodle.discover_course(
            lecture_job["course"]
        )

        moodle.open_course(course)
        moodle.ensure_edit_mode()

        course_id = assignment_automation.extract_course_id(
            course["href"]
        )

        update_step(wf, "course", "completed")

        # 4. Find the lecture file without terminal prompts.
        selector, selected_file = select_course_lecture_file(
            lecture_job["lecture"],
            lecture_job["course"],
            session,
        )

        file_path = Path(selected_file)

        if not file_path.exists():
            raise FileNotFoundError(
                f"Lecture file does not exist: {file_path}"
            )

        lecture_draft = automation.prepare_lecture_preview(
            file_path,
            lecture_job["lecture"],
            lecture_job.get("heading"),
        )

        update_step(wf, "material", "completed")

        # 5. Prepare the optional assignment draft.
        
        assignment_draft = None
        assignment_auto = None

        if assignment_job:
                assignment_auto = assignment_automation.AssignmentAutomation(page)
                assignment_auto.open_course(str(course_id))
                assignment_auto.verify_course(assignment_job["course"])

                # Normalize the requested assignment source.
                source_value = assignment_job.get("source") or ""
                source = {}
                source_is_uploaded = False

                if isinstance(source_value, dict):
                    source = source_value.copy()
                    source_is_uploaded = bool(source.get("uploaded"))
                else:
                    source_text = str(source_value).strip()

                    if (
                        "uploaded" in source_text.lower()
                        and "lecture" in source_text.lower()
                    ):
                        source_is_uploaded = True
                    else:
                        lecture_match = re.search(
                            r"\blecture\s*(\d+)\b",
                            source_text,
                            re.IGNORECASE,
                        )
                        week_match = re.search(
                            r"\bweek\s*(\d+)\b",
                            source_text,
                            re.IGNORECASE,
                        )

                        if lecture_match:
                            source = {
                                "lecture": int(lecture_match.group(1))
                            }
                        elif week_match:
                            source = {
                                "week": int(week_match.group(1))
                            }
                        elif source_text:
                            source = {"name": source_text}

                # Use the local file if the source is the lecture
                # being uploaded in this combined workflow.
                if not source_is_uploaded and source.get("lecture") is not None:
                    file_match = re.search(
                        r"\blecture\s*(\d+)\b",
                        file_path.stem,
                        re.IGNORECASE,
                    )
                    if file_match:
                        source_is_uploaded = (
                            int(file_match.group(1))
                            == int(source["lecture"])
                        )

                if source_is_uploaded:
                    print(
                        "[COMBINED PREPARE] Using local assignment source:",
                        file_path.name,
                    )
                    lecture_text = combined_automation.local_lecture_text(
                        file_path
                    )
                    source_label = (
                        f"{file_path.name} (the lecture being uploaded)"
                    )
                else:
                    print(
                        "[COMBINED PREPARE] Using existing course source:",
                        source,
                    )
                    section, _info = assignment_auto.find_week_section(
                        assignment_job["week"]
                    )
                    lecture_text, source_label = (
                        assignment_auto.extract_lecture(
                            source,
                            assignment_job["week"],
                            section,
                        )
                    )

                assignment_draft = combined_automation.build_assignment_draft(
                    assignment_job,
                    lecture_text,
                    source_label,
                    course["name"],
                )
                update_step(wf, "generate", "completed")
                assignment_draft = (
                combined_automation.build_assignment_draft(
                    assignment_job,
                    lecture_text,
                    source_label,
                    course["name"],
                )
            )

                update_step(wf, "generate", "completed")

        # 6. Return drafts for teacher approval.
        # Nothing is uploaded or created during preparation.
        draft = {
            "course": course["name"],
            "week": lecture_job["week"],
            "file_name": file_path.name,
            "lecture": lecture_draft,
            "assignment": assignment_draft,
        }

        return {
            "parsed": wf["parsed"],
            "draft": draft,
            "course_id": str(course_id),
            "automation": moodle,
            "_assignment_automation": assignment_auto,
            "_file_path": str(file_path),
            "_playwright": resources,
        }

    except Exception:
        traceback.print_exc()

        # Clean up any resources that were successfully created.
        if resources:
            close_playwright_resources(resources)

        wf["_playwright"] = None
        wf["automation"] = None

        raise
# ============================================================
# LECTURE WORKFLOW - GET
# ============================================================

@app.get(
    "/api/workflows/{workflow_id}"
)
async def get_workflow(
    workflow_id: str,
    authorization: Optional[str] = Header(None),
):

    wf = workflows.get(
        workflow_id
    )

    verify_workflow_owner(
        wf,
        authorization,
    )

    return workflow_public_state(
        wf
    )


# ============================================================
# ASSIGNMENT WORKFLOW - GET
# ============================================================

@app.get(
    "/api/assignment-workflows/{workflow_id}"
)
async def get_assignment_workflow(
    workflow_id: str,
    authorization: Optional[str] = Header(None),
):

    wf = assignment_workflows.get(
        workflow_id
    )

    verify_assignment_workflow_owner(
        wf,
        authorization,
    )

    return assignment_workflow_public_state(
        wf
    )


# ============================================================
# ASSIGNMENT WORKFLOW - CLARIFICATION / RESUME
# ============================================================

@app.post(
    "/api/assignment-workflows/{workflow_id}/clarify"
)
async def clarify_assignment_workflow(
    workflow_id: str,
    request: dict[str, Any],
    authorization: Optional[str] = Header(None),
):
    # Reuse the logged-in teacher session.
    session = get_teacher_session(authorization)

    wf = assignment_workflows.get(workflow_id)

    verify_assignment_workflow_owner(
        wf,
        authorization,
    )

    if wf.get("status") != "needs_clarification":
        raise HTTPException(
            status_code=400,
            detail=(
                "This assignment workflow is not "
                "waiting for clarification."
            ),
        )

    answer = str(
        request.get("answer", "")
    ).strip()

    if not answer:
        raise HTTPException(
            status_code=400,
            detail="Please provide your clarification answer.",
        )

    # Preserve the original request and append the teacher's answer.
    original_request = str(
        wf.get("request", "")
    ).strip()

    updated_request = (
        original_request
        + "\nTeacher clarification: "
        + answer
    )

    selected_course = (
        (wf.get("parsed") or {}).get("course")
    )

    # Re-parse the same workflow using the saved course.
    parsed = assignment_automation.parse_request(
        updated_request,
        selected_course=selected_course,
    )

    assignment_automation.validate_parsed_request(
        parsed
    )

    missing = (
        assignment_automation
        .get_assignment_missing_details(parsed)
    )

    wf["request"] = updated_request
    wf["parsed"] = parsed
    wf["missing_fields"] = missing

    if missing:
        questions = {
            "week": "Which week should this assignment cover?",
            "deadline": "What is the assignment submission deadline?",
            "lecture_material": (
                "Please provide or select the relevant lecture material."
            ),
        }

        wf["status"] = "needs_clarification"
        wf["clarification_question"] = " ".join(
            questions[field]
            for field in missing
        )

        return assignment_workflow_public_state(wf)

    # Resume the SAME workflow; do not create another workflow ID.
    wf["status"] = "preparing"
    wf["error"] = None
    wf["clarification_question"] = None

    try:
        await run_assignment_preparation(
            wf,
            session,
        )

        return assignment_workflow_public_state(wf)

    except Exception as exc:
        wf["status"] = "failed"
        wf["error"] = str(exc)

        await cleanup_assignment_workflow(wf)

        return assignment_workflow_public_state(wf)


# ============================================================
# LECTURE WORKFLOW - APPROVE
# ============================================================

@app.post(
    "/api/workflows/{workflow_id}/approve"
)
async def approve_workflow(
    workflow_id: str,
    request: ApproveRequest,
    authorization: Optional[str] = Header(None),
):

    wf = workflows.get(
        workflow_id
    )

    verify_workflow_owner(
        wf,
        authorization,
    )

    if wf["status"] == "rejected":

        raise HTTPException(
            status_code=400,
            detail=(
                "Workflow has already been rejected."
            ),
        )

    if wf["status"] == "completed":

        raise HTTPException(
            status_code=400,
            detail=(
                "Workflow has already been completed."
            ),
        )

    if wf["status"] != "waiting_approval":

        raise HTTPException(
            status_code=400,
            detail=(
                "Workflow cannot be approved from "
                f"its current status "
                f"'{wf['status']}'."
            ),
        )

    draft = wf.get(
        "draft"
    ) or {}

    if request.heading is not None:

        draft["heading"] = (
            request.heading
        )

    if request.description is not None:

        draft["description"] = (
            request.description
        )

    if request.key_points is not None:

        draft["key_points"] = (
            request.key_points
        )

    wf["draft"] = draft

    wf["status"] = (
        "approved"
    )

    update_step(
        wf,
        "approval",
        "completed",
    )

    update_step(
        wf,
        "upload",
        "pending",
    )

    print(
        f"\nâœ“ Workflow approved: "
        f"{workflow_id}"
    )

    return workflow_public_state(
        wf
    )


# ============================================================
# ASSIGNMENT WORKFLOW - APPROVE
# ============================================================

@app.post(
    "/api/assignment-workflows/{workflow_id}/approve"
)
async def approve_assignment_workflow(
    workflow_id: str,
    request: ApproveRequest,
    authorization: Optional[str] = Header(None),
):

    wf = assignment_workflows.get(
        workflow_id
    )

    verify_assignment_workflow_owner(
        wf,
        authorization
    )

    if wf["status"] != "waiting_approval":

        raise HTTPException(
            status_code=400,
            detail=(
                "Assignment workflow cannot be "
                "approved from its current status "
                f"'{wf['status']}'."
            ),
        )

    draft = dict(
        wf.get("draft")
        or {}
    )

    if request.description is not None:

        draft["description"] = (
            request.description
        )

    if request.key_points is not None:

        draft["key_points"] = (
            request.key_points
        )

    wf["draft"] = draft

    wf["status"] = (
        "approved"
    )

    update_step(
        wf,
        "approval",
        "completed",
    )

    update_step(
        wf,
        "create",
        "pending",
    )

    print(
        f"\nâœ“ Assignment workflow approved: "
        f"{workflow_id}"
    )

    print(
        f"  Title preserved: "
        f"{draft.get('title')}"
    )

    print(
        f"  Marks preserved: "
        f"{draft.get('max_grade', draft.get('total_marks'))}"
    )

    print(
        f"  PDF preserved: "
        f"{draft.get('pdf_path')}"
    )

    return assignment_workflow_public_state(
        wf
    )


# ============================================================
# LECTURE WORKFLOW - REJECT
# ============================================================

@app.post(
    "/api/workflows/{workflow_id}/reject"
)
async def reject_workflow(
    workflow_id: str,
    request: RejectRequest,
    authorization: Optional[str] = Header(None),
):

    wf = workflows.get(
        workflow_id
    )

    verify_workflow_owner(
        wf,
        authorization,
    )

    if wf["status"] in {
        "completed",
        "running",
    }:

        raise HTTPException(
            status_code=400,
            detail=(
                "Workflow cannot be rejected from "
                f"its current status "
                f"'{wf['status']}'."
            ),
        )

    wf["status"] = (
        "rejected"
    )

    wf["error"] = (
        request.reason
        or
        "Workflow rejected by teacher."
    )

    update_step(
        wf,
        "approval",
        "rejected",
    )

    print(
        f"\nâœ— Workflow rejected: "
        f"{workflow_id}"
    )

    return workflow_public_state(
        wf
    )


# ============================================================
# ASSIGNMENT WORKFLOW - REJECT
# ============================================================

@app.post(
    "/api/assignment-workflows/{workflow_id}/reject"
)
async def reject_assignment_workflow(
    workflow_id: str,
    request: RejectRequest,
    authorization: Optional[str] = Header(None),
):

    wf = assignment_workflows.get(
        workflow_id
    )

    verify_assignment_workflow_owner(
        wf,
        authorization
    )

    if wf["status"] in {
        "success",
        "completed",
        "running",
    }:

        raise HTTPException(
            status_code=400,
            detail=(
                "Assignment workflow cannot be "
                "rejected from its current status "
                f"'{wf['status']}'."
            ),
        )

    wf["status"] = (
        "rejected"
    )

    wf["error"] = (
        request.reason
        or
        "Assignment workflow rejected by teacher."
    )

    update_step(
        wf,
        "approval",
        "rejected",
    )

    await cleanup_assignment_workflow(
        wf
    )

    print(
        f"\nâœ— Assignment workflow rejected: "
        f"{workflow_id}"
    )

    return assignment_workflow_public_state(
        wf
    )


# ============================================================
# LECTURE WORKFLOW - EXECUTE
# ============================================================

@app.post(
    "/api/workflows/{workflow_id}/execute"
)
async def execute_workflow(
    workflow_id: str,
    authorization: Optional[str] = Header(None),
):

    wf = workflows.get(
        workflow_id
    )

    session = verify_workflow_owner(
        wf,
        authorization,
    )

    if wf["status"] != "approved":

        raise HTTPException(
            status_code=400,
            detail=(
                "Workflow cannot be executed because "
                f"its current status is "
                f"'{wf['status']}'. "
                "Teacher approval is required first."
            ),
        )

    file_path = wf.get(
        "file_path"
    )

    if not file_path:

        raise HTTPException(
            status_code=400,
            detail=(
                "Lecture material path is missing. "
                "Please prepare the workflow again."
            ),
        )

    if not Path(
        file_path
    ).exists():

        raise HTTPException(
            status_code=400,
            detail=(
                "Lecture material no longer exists: "
                f"{file_path}"
            ),
        )

    wf["status"] = (
        "running"
    )

    update_step(
        wf,
        "upload",
        "running",
    )

    print(
        "\n" + "=" * 70
    )

    print(
        f"EXECUTING WORKFLOW: "
        f"{workflow_id}"
    )

    print(
        f"Teacher: "
        f"{session['name']}"
    )

    print(
        f"Moellim ID: "
        f"{session['username']}"
    )

    print(
        "=" * 70
    )

    try:

        execution_result = (
            await asyncio.to_thread(
                execute_moellim_workflow_sync,
                wf,
                session,
            )
        )

        wf["result"] = (
            execution_result
        )

        wf["status"] = (
            "completed"
        )

        update_step(
            wf,
            "upload",
            "completed",
        )

        update_step(
            wf,
            "verify",
            "completed",
        )

        print(
            "\nâœ“ WORKFLOW COMPLETED SUCCESSFULLY"
        )

        return workflow_public_state(
            wf
        )

    except Exception as exc:

        traceback.print_exc()

        wf["status"] = (
            "failed"
        )

        wf["error"] = str(
            exc
        )

        update_step(
            wf,
            "upload",
            "failed",
        )

        update_step(
            wf,
            "verify",
            "failed",
        )

        print(
            f"\nâœ— WORKFLOW FAILED: {exc}"
        )

        raise HTTPException(
            status_code=500,
            detail=str(
                exc
            ),
        )


# ============================================================
# ASSIGNMENT WORKFLOW - EXECUTE
# ============================================================

@app.post(
    "/api/assignment-workflows/{workflow_id}/execute"
)
async def execute_assignment_workflow(
    workflow_id: str,
    authorization: Optional[str] = Header(None),
):

    wf = assignment_workflows.get(
        workflow_id
    )

    session = verify_assignment_workflow_owner(
        wf,
        authorization,
    )

    if wf["status"] != "approved":

        raise HTTPException(
            status_code=400,
            detail=(
                "Assignment cannot be executed because "
                f"its current status is "
                f"'{wf['status']}'. "
                "Teacher approval is required first."
            ),
        )

    # ========================================================
    # LIVE AUTOMATION OBJECT
    # ========================================================

    if not wf.get(
        "automation"
    ):

        raise HTTPException(
            status_code=400,
            detail=(
                "The live Moellim browser session is "
                "no longer available. Please prepare "
                "the assignment again."
            ),
        )

    # ========================================================
    # LIVE PLAYWRIGHT SESSION
    # ========================================================

    resources = wf.get(
        "_playwright"
    )

    if not resources:

        raise HTTPException(
            status_code=400,
            detail=(
                "The live browser session is no longer "
                "available. Please prepare the assignment "
                "again."
            ),
        )

    page = resources.get(
        "page"
    )

    if not page:

        raise HTTPException(
            status_code=400,
            detail=(
                "The Moellim browser page is no longer "
                "available. Please prepare the assignment "
                "again."
            ),
        )

    # ========================================================
    # DEDICATED WORKER
    # ========================================================

    worker = wf.get(
        "_assignment_worker"
    )

    if not worker:

        raise HTTPException(
            status_code=400,
            detail=(
                "The assignment Playwright worker is "
                "no longer available. Please prepare "
                "the assignment again."
            ),
        )

    update_step(
        wf,
        "create",
        "running",
    )

    print(
        "\n" + "=" * 70
    )

    print(
        f"EXECUTING ASSIGNMENT WORKFLOW: "
        f"{workflow_id}"
    )

    print(
        f"Teacher: "
        f"{session['name']}"
    )

    print(
        f"Moellim ID: "
        f"{session['username']}"
    )

    print(
        f"Playwright Worker: "
        f"{worker.thread.name}"
    )

    print(
        "=" * 70
    )

    try:

        future = worker.submit(
            assignment_automation
            .execute_prepared_assignment,
            wf,
        )

        result = await await_worker_future(
            future
        )

        wf["result"] = result

        wf["status"] = (
            "completed"
        )

        update_step(
            wf,
            "create",
            "completed",
        )

        update_step(
            wf,
            "verify",
            "completed",
        )

        print(
            "\nâœ“ ASSIGNMENT WORKFLOW COMPLETED"
        )

        return assignment_workflow_public_state(
            wf
        )

    except Exception as exc:

        traceback.print_exc()

        wf["status"] = (
            "failed"
        )

        wf["error"] = str(
            exc
        )

        update_step(
            wf,
            "create",
            "failed",
        )

        update_step(
            wf,
            "verify",
            "failed",
        )

        print(
            f"\nâœ— ASSIGNMENT WORKFLOW FAILED: "
            f"{exc}"
        )

        raise HTTPException(
            status_code=500,
            detail=str(
                exc
            ),
        )

    finally:

        await cleanup_assignment_workflow(
            wf
        )


# ============================================================
# LECTURE WORKFLOW - EXECUTION WORKER
# ============================================================

def execute_moellim_workflow_sync(
    wf: dict[str, Any],
    session: dict[str, Any],
) -> dict[str, Any]:

    parsed = wf["parsed"]

    course_query = parsed.get(
        "course"
    )

    week = parsed.get(
        "week"
    )

    lecture = parsed.get(
        "lecture"
    )

    file_path = wf.get(
        "file_path"
    )

    draft = (
        wf.get("draft")
        or {}
    )

    if not course_query:

        raise RuntimeError(
            "Target course is missing."
        )

    if not week:

        raise RuntimeError(
            "Target week is missing."
        )

    if not lecture:

        raise RuntimeError(
            "Lecture name is missing."
        )

    if not file_path:

        raise RuntimeError(
            "Lecture file path is missing."
        )

    if not Path(
        file_path
    ).exists():

        raise RuntimeError(
            f"Lecture file does not exist: "
            f"{file_path}"
        )

    p = None

    browser = None

    context = None

    page = None

    try:

        print(
            "\n[EXECUTION 1] "
            "Starting fresh Playwright session..."
        )

        p = sync_playwright().start()

        browser, context = (
            automation.launch_browser(p)
        )

        page = context.new_page()

        moodle = automation.MoodleAutomation(
            page
        )

        print(
            "\n[EXECUTION 2] "
            "Logging into Moellim..."
        )

        print(
            "Using authenticated teacher: "
            f"{session['username']}"
        )

        moodle.login(session.get('username'), session.get('password'))

        print(
            "âœ“ Logged in successfully as "
            f"{session['username']}."
        )

        print(
            "\n[EXECUTION 3] "
            f"Finding course: "
            f"{course_query}"
        )

        course = moodle.discover_course(
            course_query
        )

        if not course:

            raise RuntimeError(
                f"Course '{course_query}' "
                "was not found."
            )

        print(
            "âœ“ Course found: "
            f"{course.get('name')}"
        )

        print(
            "\n[EXECUTION 4] "
            "Opening course..."
        )

        moodle.open_course(
            course
        )

        print(
            "âœ“ Course opened."
        )

        print(
            "\n[EXECUTION 5] "
            "Ensuring Edit mode..."
        )

        moodle.ensure_edit_mode()

        print(
            "âœ“ Edit mode ready."
        )

        print(
            "\n[EXECUTION 6] "
            "Uploading approved lecture:"
            f"\n  Lecture: {lecture}"
            f"\n  Week: {week}"
            f"\n  File: {file_path}"
        )

        success = (
            moodle.upload_approved_lecture(
                week_number=week,
                file_path=Path(
                    file_path
                ),
                draft=draft,
            )
        )

        if not success:

            raise RuntimeError(
                "Moellim upload operation "
                "returned False."
            )

        print(
            "\nâœ“ Upload operation completed."
        )

        print(
            "\n[EXECUTION 7] "
            "Moellim verification completed."
        )

        return {
            "verified":
                True,

            "course":
                course.get(
                    "name"
                ),

            "week":
                week,

            "lecture":
                lecture,

            "file":
                Path(
                    file_path
                ).name,

            "teacher":
                session["name"],

            "moellim_username":
                session["username"],

            "message":
                (
                    "Lecture uploaded and verified "
                    "in the same week."
                ),
        }

    finally:

        close_playwright_resources(
            {
                "p":
                    p,

                "browser":
                    browser,

                "context":
                    context,

                "page":
                    page,
            }
        )


# ============================================================
# LIST LECTURE WORKFLOWS
# ============================================================

@app.get(
    "/api/workflows"
)
async def list_workflows(
    authorization: Optional[str] = Header(None),
):

    session_token = get_session_token(
        authorization
    )

    return [
        workflow_public_state(
            wf
        )
        for wf in workflows.values()
        if wf.get(
            "session_token"
        ) == session_token
    ]


# ============================================================
# LIST ASSIGNMENT WORKFLOWS
# ============================================================

@app.get(
    "/api/assignment-workflows"
)
async def list_assignment_workflows(
    authorization: Optional[str] = Header(None),
):

    session_token = get_session_token(
        authorization
    )

    return [
        assignment_workflow_public_state(
            wf
        )
        for wf in assignment_workflows.values()
        if wf.get(
            "session_token"
        ) == session_token
    ]

# ============================================================
# COMBINED WORKFLOW - LIST
# ============================================================

@app.get("/api/combined-workflows")
async def list_combined_workflows(
    authorization: Optional[str] = Header(None),
):
    session_token = get_session_token(authorization)

    return [
        combined_workflow_public_state(wf)
        for wf in combined_workflows.values()
        if wf.get("session_token") == session_token
    ]


# ============================================================
# COMBINED WORKFLOW - GET DETAILS
# ============================================================

@app.get("/api/combined-workflows/{workflow_id}")
async def get_combined_workflow(
    workflow_id: str,
    authorization: Optional[str] = Header(None),
):
    wf = combined_workflows.get(workflow_id)

    verify_combined_workflow_owner(wf, authorization)

    return combined_workflow_public_state(wf)


# ============================================================
# COMBINED WORKFLOW - APPROVE
# ============================================================

@app.post("/api/combined-workflows/{workflow_id}/approve")
async def approve_combined_workflow(
    workflow_id: str,
    request: CombinedApproveRequest,
    authorization: Optional[str] = Header(None),
):
    wf = combined_workflows.get(workflow_id)

    verify_combined_workflow_owner(wf, authorization)

    if wf["status"] != "waiting_approval":
        raise HTTPException(
            status_code=400,
            detail=(
                "Combined workflow cannot be approved from "
                f"its current status '{wf['status']}'."
            ),
        )

    draft = wf.get("draft") or {}
    lecture_draft = draft.get("lecture") or {}
    assignment_draft = draft.get("assignment")

    # Save teacher-approved lecture details.
    if request.heading is not None:
        lecture_draft["heading"] = request.heading

    if request.description is not None:
        lecture_draft["description"] = request.description

    if request.key_points is not None:
        lecture_draft["key_points"] = request.key_points

    draft["lecture"] = lecture_draft

    # Save teacher-approved assignment details.
    if assignment_draft is not None:
        if request.assignment_title is not None:
            assignment_draft["title"] = request.assignment_title

        if request.assignment_description is not None:
            assignment_draft["description"] = (
                request.assignment_description
            )

        draft["assignment"] = assignment_draft

    wf["draft"] = draft
    wf["status"] = "approved"

    update_step(wf, "approval", "completed")
    update_step(wf, "upload", "pending")

    print(f"\nCombined workflow approved: {workflow_id}")

    return combined_workflow_public_state(wf)


# ============================================================
# COMBINED WORKFLOW - REJECT
# ============================================================

@app.post("/api/combined-workflows/{workflow_id}/reject")
async def reject_combined_workflow(
    workflow_id: str,
    request: RejectRequest,
    authorization: Optional[str] = Header(None),
):
    wf = combined_workflows.get(workflow_id)

    verify_combined_workflow_owner(wf, authorization)

    if wf["status"] in {"running", "completed"}:
        raise HTTPException(
            status_code=400,
            detail=(
                "Combined workflow cannot be rejected from "
                f"its current status '{wf['status']}'."
            ),
        )

    wf["status"] = "rejected"
    wf["error"] = (
        request.reason or "Combined workflow rejected by teacher."
    )

    update_step(wf, "approval", "rejected")

    try:
        await cleanup_assignment_workflow(wf)
    except Exception:
        traceback.print_exc()

    print(f"\nCombined workflow rejected: {workflow_id}")

    return combined_workflow_public_state(wf)


# ============================================================
# COMBINED WORKFLOW - EXECUTION HELPER
# Must run on the same worker thread as preparation.
# ============================================================

def execute_combined_workflow_sync(
    wf: dict[str, Any],
) -> dict[str, Any]:
    lecture_job = (wf.get("parsed") or {}).get("lecture") or {}
    assignment_job = (wf.get("parsed") or {}).get("assignment")

    draft = wf.get("draft") or {}
    lecture_draft = draft.get("lecture") or {}
    assignment_draft = draft.get("assignment")

    moodle = wf.get("automation")
    assignment_auto = wf.get("_assignment_automation")
    file_path = wf.get("_file_path")
    course_id = wf.get("course_id")

    if moodle is None:
        raise RuntimeError("Moellim automation session is unavailable.")

    if not file_path or not Path(file_path).exists():
        raise FileNotFoundError(
            f"Lecture material is missing: {file_path}"
        )

    # 1. Upload the lecture first.
    update_step(wf, "upload", "running")

    lecture_result = moodle.upload_approved_lecture(
        week_number=lecture_job["week"],
        file_path=Path(file_path),
        draft=lecture_draft,
    )

    update_step(wf, "upload", "completed")
    update_step(wf, "verify_lecture", "completed")

    result = {
        "workflow_type": "combined",
        "course": draft.get("course"),
        "lecture": make_json_safe(lecture_result),
        "assignment": None,
    }

    # A lecture-only request can finish here.
    if not assignment_job:
        return result

    # 2. Only create the assignment after the lecture upload succeeds.
    if assignment_auto is None:
        raise RuntimeError(
            "Assignment automation session is unavailable."
        )

    if not course_id:
        raise RuntimeError("The target course ID is missing.")

    update_step(wf, "create", "running")

    assignment_auto.open_course(str(course_id))
    assignment_auto.verify_course(assignment_job["course"])

    # Regenerate the PDF so it reflects the teacher-approved draft.
    assignment_draft["pdf_path"] = (
        assignment_automation.make_assignment_pdf(assignment_draft)
    )

    assignment_result = assignment_auto.create_approved_assignment(
        assignment_draft
    )

    update_step(wf, "create", "completed")
    update_step(wf, "verify", "completed")

    result["assignment"] = make_json_safe(assignment_result)

    return result


# ============================================================
# COMBINED WORKFLOW - EXECUTE
# ============================================================

@app.post("/api/combined-workflows/{workflow_id}/execute")
async def execute_combined_workflow(
    workflow_id: str,
    authorization: Optional[str] = Header(None),
):
    wf = combined_workflows.get(workflow_id)

    session = verify_combined_workflow_owner(wf, authorization)

    if wf["status"] != "approved":
        raise HTTPException(
            status_code=400,
            detail=(
                "Combined workflow cannot be executed from status "
                f"'{wf['status']}'. Teacher approval is required."
            ),
        )

    worker = wf.get("_assignment_worker")
    resources = wf.get("_playwright") or {}

    if worker is None or not resources.get("page"):
        raise HTTPException(
            status_code=400,
            detail=(
                "The prepared browser session is unavailable. "
                "Please prepare the combined workflow again."
            ),
        )

    wf["status"] = "running"

    update_step(wf, "upload", "running")

    print("\n" + "=" * 70)
    print(f"EXECUTING COMBINED WORKFLOW: {workflow_id}")
    print(f"Teacher: {session['name']}")
    print("=" * 70)

    try:
        future = worker.submit(
            execute_combined_workflow_sync,
            wf,
        )

        execution_result = await await_worker_future(future)

        wf["result"] = execution_result
        wf["status"] = "completed"

        print(f"\nCombined workflow completed: {workflow_id}")

        return combined_workflow_public_state(wf)

    except Exception as exc:
        traceback.print_exc()

        wf["status"] = "failed"
        wf["error"] = str(exc)

        print(f"\nCombined workflow failed: {exc}")

        raise HTTPException(
            status_code=500,
            detail=str(exc),
        ) from exc

    finally:
        try:
            await cleanup_assignment_workflow(wf)
        except Exception:
            traceback.print_exc()


# ============================================================
# PERSISTENT AUDIT LOG + GOOGLE DRIVE CONNECTION
# ============================================================
@app.get("/api/activity-logs")
async def get_activity_logs(authorization: Optional[str] = Header(None), limit: int = 200):
    session = get_teacher_session(authorization)
    rows = audit_store.list_events(session["username"], limit=limit)
    return [{
        "id": str(row["id"]),
        "timestamp": row["created_at"],
        "courseCode": row.get("course") or "",
        "courseTitle": row.get("course") or "",
        "action": row["action"],
        "workflowName": row.get("workflow_id") or "MUAWIN workflow",
        "status": "Failed" if row["status"] == "Failed" else "Completed",
        "operator": row["teacher_username"],
        "details": " | ".join(filter(None, [row.get("file_name"), row.get("action"), row.get("details", {}).get("http_status") and f'HTTP {row["details"]["http_status"]}'])),
        "moellimRef": row.get("workflow_id"),
        "week": row.get("week"),
        "fileName": row.get("file_name"),
    } for row in rows]


@app.get("/api/integrations/google-drive/status")
async def google_drive_status(authorization: Optional[str] = Header(None)):
    get_teacher_session(authorization)
    token_file = automation.BASE_DIR / os.getenv("GOOGLE_TOKEN_FILE", "token.json")
    credentials_file = automation.BASE_DIR / os.getenv("GOOGLE_CREDENTIALS_FILE", "credentials.json")
    service = automation.drive_service_silent()
    email = None
    if service:
        try:
            email = service.about().get(fields="user(emailAddress)").execute().get("user", {}).get("emailAddress")
        except Exception:
            pass
    return {"connected": bool(service), "account": email,
            "credentials_configured": credentials_file.exists(),
            "token_saved": token_file.exists(),
            "message": "Google Drive connected." if service else "Google Drive is not connected. Configure OAuth credentials and connect again."}


@app.post("/api/integrations/google-drive/connect")
async def google_drive_connect(authorization: Optional[str] = Header(None)):
    session = get_teacher_session(authorization)
    try:
        service = await asyncio.to_thread(automation.connect_google_drive_interactive)
        account = service.about().get(fields="user(emailAddress)").execute().get("user", {}).get("emailAddress")
        audit_store.record_event(teacher_username=session["username"], action="Google Drive connected",
                                 status="Completed", details={"google_account": account})
        return {"connected": True, "account": account, "message": "Google Drive connected successfully."}
    except Exception as exc:
        audit_store.record_event(teacher_username=session["username"], action="Google Drive connection",
                                 status="Failed", details={"error": str(exc)})
        raise HTTPException(status_code=400, detail=f"Google Drive connection failed: {exc}")


# ============================================================
# FILE-BASED ASSIGNMENT WORKFLOW
# Isolated from AI assignment and combined workflows.
# ============================================================

def file_assignment_public_state(wf: dict[str, Any]) -> dict[str, Any]:
    result = {
        "id": wf["id"],
        "workflow_type": "file_assignment",
        "status": wf["status"],
        "request": wf.get("request"),
        "course": wf.get("course"),
        "candidates": [],
        "draft": make_json_safe(wf.get("draft")),
        "missing_fields": wf.get("missing_fields", []),
        "clarification_question": wf.get("clarification_question"),
        "error": wf.get("error"),
        "result": make_json_safe(wf.get("result")),
    }

    for item in wf.get("candidates", []):
        result["candidates"].append({
            key: make_json_safe(item.get(key))
            for key in (
                "file_name", "file_size", "is_assignment_candidate",
                "confidence", "extraction_status", "warnings",
                "title", "start_date", "due_date", "total_marks",
                "clos", "rubric_notes", "instructions", "description",
                "week_numbers", "week_number",
            )
        })

    return result


def verify_file_assignment_owner(
    wf: Optional[dict[str, Any]],
    authorization: Optional[str],
):
    if not wf:
        raise HTTPException(status_code=404, detail="File assignment workflow not found.")

    token = get_session_token(authorization)
    if wf.get("session_token") != token:
        raise HTTPException(status_code=403, detail="You do not have access to this workflow.")

    return get_teacher_session(authorization)



def _infer_assignment_destination_week(session: dict, course_name: str, start_date: str):
    """Match assignment start date against actual dated Moellim sections."""
    import re
    from datetime import date, datetime

    if not start_date:
        return None

    assignment_date = date.fromisoformat(str(start_date)[:10])
    p = browser = context = page = None

    try:
        p = sync_playwright().start()
        browser, context = automation.launch_browser(p)
        page = context.new_page()

        moodle = automation.MoodleAutomation(page)
        moodle.login(session.get("username"), session.get("password"))

        course_info = moodle.discover_course(course_name)
        moodle.open_course(course_info)

        assignment_auto = assignment_automation.AssignmentAutomation(page)
        course_id = assignment_automation.extract_course_id(
            course_info.get("href", "")
        )
        if not course_id:
            raise RuntimeError("Could not identify the selected Moellim course.")

        assignment_auto.course_id = str(course_id)
        assignment_auto.course_url = page.url
        assignment_auto.verify_course(course_name)

        dated_sections = []
        pattern = re.compile(
            r"(\d{1,2})\s+([A-Za-z]+)\s*[-–—]\s*"
            r"(\d{1,2})\s+([A-Za-z]+)"
        )

        sections = assignment_auto.list_sections()
        print("[FILE ASSIGNMENT] Moellim section headings:", [(item.get("num"), item.get("heading")) for item in sections])
        for section in sections:
            heading = section.get("heading", "")
            match = pattern.search(heading)
            if not match:
                continue

            day1, month1, day2, month2 = match.groups()

            def parse_month_day(day, month):
                for fmt in ("%d %B", "%d %b"):
                    try:
                        return datetime.strptime(
                            f"{day} {month}", fmt
                        ).month, int(day)
                    except ValueError:
                        pass
                return None

            first = parse_month_day(day1, month1)
            last = parse_month_day(day2, month2)
            if not first or not last:
                continue

            start_month, start_day = first
            end_month, end_day = last

            for year in (assignment_date.year - 1,
                         assignment_date.year,
                         assignment_date.year + 1):
                try:
                    range_start = date(year, start_month, start_day)
                    end_year = year + (
                        1 if (end_month, end_day) < (start_month, start_day)
                        else 0
                    )
                    range_end = date(end_year, end_month, end_day)
                except ValueError:
                    continue

                if range_start <= assignment_date <= range_end:
                    explicit_week = assignment_auto._week_in(heading)
                    week_number = explicit_week or int(section["num"])
                    dated_sections.append({
                        "week_number": week_number,
                        "section_number": int(section["num"]),
                        "heading": heading,
                    })

        if len(dated_sections) == 1:
            return dated_sections[0]["week_number"]

        if len(dated_sections) > 1:
            raise RuntimeError("Assignment start date matched multiple Moellim sections.")

        return None

    finally:
        for resource in (page, context, browser):
            try:
                if resource:
                    resource.close()
            except Exception:
                pass
        try:
            if p:
                p.stop()
        except Exception:
            pass


@app.post("/api/file-assignment-workflows/prepare")
async def prepare_file_assignment_workflow(
    request: PrepareFileAssignmentRequest,
    authorization: Optional[str] = Header(None),
):
    session = get_teacher_session(authorization)
    token = get_session_token(authorization)

    course = request.course.strip()
    if not course:
        raise HTTPException(status_code=400, detail="Select a course first.")

    from . import ai_db

    setup = ai_db.get_course_setup(
        str(session.get("username") or "").strip(),
        course,
    )
    folder = (setup or {}).get("folder_path")

    if not folder:
        raise HTTPException(
            status_code=400,
            detail=f"No saved assignment/lecture folder found for '{course}'. Save its folder in Course Setup first.",
        )

    try:
        candidates = file_assignment_scanner.scan_course_assignment_files(folder)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not scan the saved course folder: {exc}")

    if request.file_name:
        candidates = [
            item for item in candidates
            if item.get("file_name", "").casefold() == request.file_name.strip().casefold()
        ]

    workflow_id = f"fawf-{uuid.uuid4().hex[:10]}"
    selected = candidates[0] if len(candidates) == 1 else None

    wf = {
        "id": workflow_id,
        "workflow_type": "file_assignment",
        "status": "no_match" if not candidates else "waiting_confirmation",
        "session_token": token,
        "username": session.get("username"),
        "course": course,
        "folder_path": str(Path(folder).resolve()),
        "request": {"course": course, "file_name": request.file_name},
        "candidates": candidates,
        "draft": None,
        "missing_fields": [],
        "clarification_question": None,
        "error": None,
        "result": None,
    }

    if selected:
        wf["selected_file_name"] = selected["file_name"]
        wf["draft"] = dict(selected)

        start_date = wf["draft"].get("start_date")
        inferred_week = None

        if start_date:
            try:
                inferred_week = _infer_assignment_destination_week(
                    session, course, start_date
                )
            except Exception as exc:
                print(f"[FILE ASSIGNMENT] Week mapping could not be verified: {exc}")

        wf["draft"]["week_number"] = inferred_week

        if inferred_week is None:
            wf["missing_fields"].append("week_number")
            wf["clarification_question"] = (
                "I could not match the assignment start date to a dated Moellim "
                "week section. Which week should receive this assignment?"
            )

    elif not candidates:
        wf["error"] = (
            "No assignment document was found in the selected course folder. "
            "Add a PDF, DOCX, or TXT assignment file and try again."
        )

    file_assignment_workflows[workflow_id] = wf
    return file_assignment_public_state(wf)


@app.get("/api/file-assignment-workflows")
async def list_file_assignment_workflows(
    authorization: Optional[str] = Header(None),
):
    token = get_session_token(authorization)
    return [
        file_assignment_public_state(wf)
        for wf in file_assignment_workflows.values()
        if wf.get("session_token") == token
    ]


@app.get("/api/file-assignment-workflows/{workflow_id}")
async def get_file_assignment_workflow(
    workflow_id: str,
    authorization: Optional[str] = Header(None),
):
    wf = file_assignment_workflows.get(workflow_id)
    verify_file_assignment_owner(wf, authorization)
    return file_assignment_public_state(wf)


@app.post("/api/file-assignment-workflows/{workflow_id}/confirm")
async def confirm_file_assignment_metadata(
    workflow_id: str,
    request: ConfirmFileAssignmentRequest,
    authorization: Optional[str] = Header(None),
):
    wf = file_assignment_workflows.get(workflow_id)
    verify_file_assignment_owner(wf, authorization)

    if wf.get("status") != "waiting_confirmation":
        raise HTTPException(status_code=400, detail="This workflow is not waiting for confirmation.")

    selected = next(
        (
            item for item in wf.get("candidates", [])
            if item.get("file_name", "").casefold() == request.file_name.strip().casefold()
        ),
        None,
    )
    if not selected:
        raise HTTPException(status_code=400, detail="Select an assignment file from the displayed candidates.")

    prepared_draft = wf.get("draft") or {}
    draft = dict(selected)

    for field in ("title", "start_date", "due_date", "total_marks"):
        value = getattr(request, field)
        if value is not None:
            draft[field] = value

    if request.week_number is not None:
        if request.week_number < 1:
            raise HTTPException(status_code=400, detail="Week number must be positive.")
        draft["week_number"] = request.week_number
    elif (
        prepared_draft.get("week_number") is not None
        and draft.get("start_date") == selected.get("start_date")
    ):
        draft["week_number"] = prepared_draft["week_number"]
    else:
        raise HTTPException(
            status_code=422,
            detail="Please confirm the destination week. The start date has no verified matching Moellim section.",
        )

    wf["selected_file_name"] = selected["file_name"]
    wf["draft"] = draft
    wf["missing_fields"] = []
    wf["clarification_question"] = None
    wf["status"] = "waiting_approval"

    return file_assignment_public_state(wf)

from pathlib import Path
from datetime import datetime
import re


def _execute_file_assignment_sync(wf, session):
    p = browser = context = page = None
    resources = {}

    try:
        p = sync_playwright().start()
        browser, context = automation.launch_browser(p)
        page = context.new_page()
        resources = {"p": p, "browser": browser, "context": context, "page": page}

        moodle = automation.MoodleAutomation(page)
        moodle.login(session.get("username"), session.get("password"))
        moodle.open_course(wf["course"])
        moodle.ensure_edit_mode()

        draft = dict(wf["draft"])
        file_path = Path(draft.get("file_path") or "")
        if not file_path.is_file():
            raise FileNotFoundError("The selected assignment document is no longer available.")

        if file_path.suffix.lower() not in {".pdf", ".docx", ".txt"}:
            raise RuntimeError("Only PDF, DOCX and TXT assignment documents are supported.")

        assignment_auto = assignment_automation.AssignmentAutomation(page)
        match = re.search(r"[?&]id=(\d+)", page.url)
        if not match:
            raise RuntimeError("Could not verify the selected Moellim course.")

        assignment_auto.course_id = match.group(1)
        assignment_auto.course_url = page.url
        assignment_auto.verify_course(wf["course"])

        week = int(draft["week_number"])
        section, info = assignment_auto.find_week_section(week)
        if not section or not info:
            raise RuntimeError(f"Week {week} could not be verified in Moellim.")

        assignment_auto.section_num = info["num"]
        draft["pdf_path"] = str(file_path)
        before = assignment_auto.snapshot_before(draft)

        assignment_auto.open_assignment_form(assignment_auto.section_num)

        description = str(draft.get("description") or "")
        extra = []
        if draft.get("clos"):
            extra.append("CLOs: " + ", ".join(map(str, draft["clos"])))
        if draft.get("instructions"):
            extra.append("Instructions:\n" + str(draft["instructions"]))
        if draft.get("rubric_notes"):
            extra.append("Rubric:\n" + str(draft["rubric_notes"]))
        if extra:
            description += "\n\n" + "\n\n".join(extra)

        draft["description"] = description
        assignment_auto.fill_assignment_settings(draft)

        marks = draft.get("total_marks")
        if marks is not None:
            assignment_auto.set_max_grade(float(marks))

        def parse_date(value, end_of_day=False):
            if not value:
                return None
            for fmt in ("%d %B %Y", "%d %b %Y", "%Y-%m-%d",
                        "%d/%m/%Y", "%m/%d/%Y"):
                try:
                    parsed = datetime.strptime(str(value).strip(), fmt)
                    return parsed.replace(
                        hour=23 if end_of_day else 0,
                        minute=59 if end_of_day else 0
                    )
                except ValueError:
                    continue
            raise ValueError(f"Could not safely interpret assignment date: {value}")

        start_date = parse_date(draft.get("start_date"))
        due_date = parse_date(draft.get("due_date"), True)

        if start_date:
            assignment_auto.set_date("allowsubmissionsfromdate", start_date)
        if due_date:
            assignment_auto.set_date("duedate", due_date)

        assignment_auto.attach_pdf(file_path)
        assignment_auto.verify_attachment(file_path)
        assignment_auto.save_assignment()
        assignment_auto.verify_saved(draft, before)

        return {
            "success": True,
            "course": wf["course"],
            "week_number": week,
            "title": draft.get("title"),
            "file_name": file_path.name,
            "message": "Assignment saved and verification completed in Moellim."
        }

    finally:
        if resources:
            close_playwright_resources(resources)
        elif p:
            try:
                p.stop()
            except Exception:
                pass


@app.post("/api/file-assignment-workflows/{workflow_id}/approve")
async def approve_file_assignment_workflow(
    workflow_id: str,
    authorization: Optional[str] = Header(None),
):
    wf = file_assignment_workflows.get(workflow_id)
    verify_file_assignment_owner(wf, authorization)

    if wf.get("status") != "waiting_approval":
        raise HTTPException(status_code=409, detail="Workflow is not awaiting approval.")

    wf["status"] = "approved"
    return file_assignment_public_state(wf)


@app.post("/api/file-assignment-workflows/{workflow_id}/execute")
async def execute_file_assignment_workflow(
    workflow_id: str,
    authorization: Optional[str] = Header(None),
):
    wf = file_assignment_workflows.get(workflow_id)
    session = verify_file_assignment_owner(wf, authorization)

    if wf.get("status") != "approved":
        raise HTTPException(status_code=409, detail="Approve this assignment before execution.")

    wf["status"] = "running"

    try:
        result = await asyncio.to_thread(
            _execute_file_assignment_sync, wf, session
        )
        wf["result"] = result
        wf["status"] = "completed"
        return file_assignment_public_state(wf)

    except Exception as exc:
        traceback.print_exc()
        wf["status"] = "failed"
        wf["error"] = str(exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/file-assignment-workflows/{workflow_id}/reject")
async def reject_file_assignment_workflow(
    workflow_id: str,
    authorization: Optional[str] = Header(None),
):
    wf = file_assignment_workflows.get(workflow_id)
    verify_file_assignment_owner(wf, authorization)

    if wf.get("status") not in {"waiting_approval", "approved"}:
        raise HTTPException(
            status_code=409,
            detail="This file assignment cannot be rejected in its current state."
        )

    wf["status"] = "rejected"
    wf["error"] = "Rejected by teacher."
    return file_assignment_public_state(wf)

