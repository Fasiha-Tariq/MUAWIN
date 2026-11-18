from __future__ import annotations

import ast
import py_compile
import shutil
from datetime import datetime
from pathlib import Path

ROOT = Path.cwd()
BACKEND = ROOT / "backend"
COMBINED = BACKEND / "muawin_combined.py"
SERVER = BACKEND / "server.py"
ASSIGNMENT = BACKEND / "assignment_workflow.py"

required = [COMBINED, SERVER, ASSIGNMENT]
missing = [str(p) for p in required if not p.is_file()]
if missing:
    raise SystemExit(
        "Run this patch from the MUAWIN project root (the folder containing backend/).\n"
        "Missing: " + ", ".join(missing)
    )


def read_source(path: Path):
    raw = path.read_bytes()
    text = raw.decode("utf-8-sig")
    newline = "\r\n" if "\r\n" in text else "\n"
    return text.replace("\r\n", "\n"), newline


def write_source(path: Path, text: str, newline: str):
    path.write_bytes(text.replace("\n", newline).encode("utf-8"))


def replace_function(source: str, name: str, replacement: str) -> str:
    tree = ast.parse(source)
    nodes = [
        n for n in tree.body
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == name
    ]
    if len(nodes) != 1:
        raise RuntimeError(
            f"Expected exactly one top-level function {name!r}; found {len(nodes)}."
        )
    node = nodes[0]
    lines = source.splitlines(keepends=True)
    start = node.lineno - 1
    end = node.end_lineno
    replacement = replacement.rstrip() + "\n"
    return "".join(lines[:start]) + replacement + "".join(lines[end:])


combined_text, combined_nl = read_source(COMBINED)
server_text, server_nl = read_source(SERVER)
assignment_text, assignment_nl = read_source(ASSIGNMENT)

# ---------------------------------------------------------------------------
# 1) Combined parser + content-based marks. This function is used only by the
#    Combined workflow. The selected UI course is always passed in by server.py.
# ---------------------------------------------------------------------------
combined_helper = r'''
def _parse_combined_lecture_job(lecture_request: str, selected_course: Optional[str]) -> Dict:
    """Resolve arbitrary lecture/file names without requiring 'Lecture N'.

    The selected course comes from the UI. A week is taken from an explicit
    Week N, a numbered lecture identity, or a clearly stated ordinal. If the
    destination week cannot be established, ask rather than guessing.
    """
    text = lec.clean_text(lecture_request or "")
    try:
        parsed = lec.parse_request(text)
        if parsed.get("lecture") and parsed.get("lecture") != "Lecture Material":
            if not parsed.get("course") and selected_course:
                parsed["course"] = selected_course.strip()
            return parsed
    except Exception:
        parsed = None

    week_match = list(re.finditer(r"\bweek\s*(\d+)\b", text, re.I))
    lecture_match = re.search(r"\b(?:lecture|lec)\s*(\d+)\b", text, re.I)
    ordinal_map = {
        "first": 1, "1st": 1, "pehla": 1, "pehli": 1,
        "second": 2, "2nd": 2, "dosra": 2, "doosra": 2,
        "third": 3, "3rd": 3, "teesra": 3,
        "fourth": 4, "4th": 4, "chautha": 4,
        "fifth": 5, "5th": 5, "paanchwa": 5,
    }
    ordinal_match = re.search(r"\b(first|1st|pehla|pehli|second|2nd|dosra|doosra|third|3rd|teesra|fourth|4th|chautha|fifth|5th|paanchwa)\b", text, re.I)
    if week_match:
        week = int(week_match[-1].group(1))
    elif lecture_match:
        week = int(lecture_match.group(1))
    elif ordinal_match:
        week = ordinal_map[ordinal_match.group(1).lower()]
    else:
        week = None

    quoted = re.search(r'["\']([^"\']{2,})["\']', text)
    filename = re.search(r"([^\s\"']+\.(?:pdf|pptx?|docx?|txt))\b", text, re.I)
    if lecture_match is None and ordinal_match:
        lecture_name = f"Lecture {week}"
    elif quoted:
        lecture_name = quoted.group(1).strip()
    elif filename:
        lecture_name = filename.group(1).strip()
    else:
        # Remove task wording and destination/deadline clauses, preserving the
        # teacher's own lecture/topic wording for course-folder matching.
        lecture_name = re.sub(
            r"\b(?:please|kindly|upload|add|put|post|share|send|attach|select|"
            r"lecture|material|file|slides?|my|the|this|that|meri|mera|yeh|is|"
            r"ko|karo|kar|do|dein|day|do|week|hafta|mein|me|to|into|on)\b",
            " ", text, flags=re.I,
        )
        lecture_name = re.sub(r"\b\d+\b", " ", lecture_name)
        lecture_name = re.sub(r"\s+", " ", lecture_name).strip(" .,:;-_")

    lecture_name = re.sub(r"\.(?:pdf|pptx?|docx?|txt)$", "", lecture_name, flags=re.I).strip()
    if not lecture_name or lecture_name.casefold() in {"lecture", "material", "file", "slides"}:
        raise ValueError("Which lecture or file should I find in this course's saved folder?")
    if not week:
        raise ValueError(f"I identified '{lecture_name}', but its destination week is unclear. Which week should I use?")
    if not selected_course:
        raise ValueError("Please select a course in MUAWIN before preparing the combined workflow.")
    return {"course": selected_course.strip(), "week": int(week), "lecture": lecture_name, "heading": None}


def _combined_submission_deadline(request: str):
    """Parse an absolute deadline or a relative student-submission duration."""
    from datetime import datetime, timedelta

    text = str(request or "")
    # Natural English: "Give students 5 days to submit" / "5 days for submission".
    relative = re.search(
        r"\b(\d{1,3})\s*(?:days?|d|din)\s*(?:to\s+submit|for\s+submission|"
        r"to\s+hand\s+in|ki\s+deadline|ki\s+submission)\b",
        text,
        re.IGNORECASE,
    )
    if relative:
        due = datetime.now() + timedelta(days=int(relative.group(1)))
        return due.replace(hour=23, minute=59, second=0, microsecond=0)

    # Roman Urdu variants such as "deadline 5 din ki rakhna" are handled by
    # the existing parser; prefixing "Deadline" also handles a short reply.
    due = asg.parse_deadline(text)
    if due is None:
        due = asg.parse_deadline("Deadline: " + text)
    return due


def _choose_combined_marks(lecture_text: str) -> int:
    """Ask the configured AI for suitable marks; use a content-based fallback."""
    try:
        from . import muawin_ai
        if muawin_ai.llm_ready() and __import__("os").getenv("MUAWIN_LLM_QUESTIONS", "1") != "0":
            data = muawin_ai.gemini_json(
                "Choose a fair total-mark value for a university assignment based "
                "only on the depth, breadth, and complexity of this lecture. "
                "Return JSON only: {\"total_marks\": integer}. Choose an integer "
                "from 10 to 30, preferably a multiple of 5. Do not generate questions.\n\n"
                + asg.clean_text(lecture_text)[:12000],
                "You are a university assessment designer. Select a proportionate, "
                "fair assignment mark total; do not assume a fixed default.",
                timeout=30,
            )
            value = int(data.get("total_marks")) if isinstance(data, dict) else 0
            if 10 <= value <= 30:
                return value
    except Exception as exc:
        print(f"[COMBINED] AI marks selection unavailable; using content-based fallback: {exc}")

    concepts = len(asg.select_distinct_concepts(asg.clean_text(lecture_text)))
    # 2-4 concepts -> 10; 5-6 -> 15; 7-8 -> 20; 9-10 -> 25; 11+ -> 30.
    return max(10, min(30, 5 * ((max(2, concepts) + 1) // 2)))

'''

# Insert helpers immediately before parse_combined, avoiding duplicate insertion.
if "def _combined_submission_deadline(" not in combined_text:
    marker = "def parse_combined("
    if combined_text.count(marker) != 1:
        raise SystemExit("Safety stop: could not uniquely locate parse_combined(). No files changed.")
    combined_text = combined_text.replace(marker, combined_helper + "\n" + marker, 1)

parse_replacement = r'''def parse_combined(
    request: str,
    selected_course: Optional[str] = None,
) -> Tuple[Dict, Optional[Dict]]:
    """Parse a lecture upload and, optionally, an assignment generated from it."""
    lecture_part, assign_part = split_request(request)
    lecture_job = _parse_combined_lecture_job(lecture_part, selected_course)

    lecture_name = str(lecture_job.get("lecture") or "").strip()
    if not lecture_name or lecture_name.casefold() in {
        "lecture material", "material", "lecture", "file"
    }:
        raise ValueError(
            "Which lecture or file should I upload? Please provide its name "
            "(for example, Lecture 1) and try again."
        )

    if not lecture_job.get("course") and selected_course:
        lecture_job["course"] = selected_course.strip()
    if not lecture_job.get("course"):
        raise ValueError("Selected course was not provided by the interface.")

    # Lecture number is the default destination week; an explicit lecture week
    # parsed by muawin_lecture remains an override.
    week = lecture_job.get("week")
    if not week:
        match = re.search(r"\b(?:lecture|lec)\s*(\d+)\b", lecture_name, re.IGNORECASE)
        if not match:
            match = re.search(r"\b(?:lecture|lec)\s*(\d+)\b", request, re.IGNORECASE)
        if match:
            week = int(match.group(1))
            lecture_job["week"] = week
    if not week:
        raise ValueError(
            "Which lecture number should I use? For example, Lecture 4 maps to Week 4."
        )

    if not assign_part:
        return lecture_job, None

    title = asg.parse_title(assign_part)
    if not title:
        title = (
            f"{lec.pretty_heading(lecture_job.get('heading') or lecture_name)} "
            "Assignment"
        )

    marks = asg.parse_marks(assign_part)
    deadline = _combined_submission_deadline(request)
    question_types = asg.parse_question_types(assign_part) or None

    # Combined always generates a fresh assignment from the lecture file being
    # uploaded. It never searches for or attaches a pre-existing assignment.
    job = {
        "mode": "generate",
        "course": lecture_job["course"],
        "week": int(week),
        "section": f"Week {int(week)}",
        "title": title,
        "max_grade": marks,
        "duedate": deadline,
        "question_types": question_types,
        "source": {"uploaded": True},
        "raw_request": assign_part,
    }

    # Keep shared validation (including past-date rejection), but undo its
    # standalone 20-mark default so Combined can choose marks from the lecture.
    asg.validate_parsed_request(job)
    if marks is None:
        job["max_grade"] = None
    return lecture_job, job'''
combined_text = replace_function(combined_text, "parse_combined", parse_replacement)

build_replacement = r'''def build_assignment_draft(job: Dict, lecture_text: str, source_label: str,
                           course_name: str) -> Dict:
    # Marks explicitly supplied by the teacher always win. Otherwise choose a
    # content-proportionate total using the configured AI, with a safe fallback.
    if job.get("max_grade") is None:
        job["max_grade"] = _choose_combined_marks(lecture_text)

    if job.get("question_types"):
        # If the teacher explicitly requested question types/counts, honor them.
        questions = asg.generate_assignment(
            lecture_content=lecture_text,
            total_marks=job["max_grade"],
            question_types=job["question_types"],
        )
    else:
        # Otherwise Gemini (when configured) or the content-based fallback
        # chooses a suitable count and mix from short/long/scenario/practical.
        questions = asg.generate_simple_assignment(
            lecture_content=lecture_text,
            total_marks=job["max_grade"],
            question_types=None,
        )
    job["question_types"] = asg.question_type_counts(questions)

    if sum(q.marks for q in questions) != job["max_grade"]:
        raise RuntimeError("Generated marks do not match the selected total marks.")

    warnings: List[str] = []
    if len(lecture_text) < 1500:
        warnings.append(
            f"Lecture text is very short ({len(lecture_text)} characters). "
            "Questions may be limited by the available material."
        )
    if len(asg.extract_concepts(lecture_text)) < sum(job["question_types"].values()):
        warnings.append("The lecture has fewer distinct topics than questions, so topics may repeat.")

    draft = {
        "warnings": warnings,
        "course": course_name,
        "week_number": int(job["week"]),
        "title": job["title"],
        "max_grade": job["max_grade"],
        "duedate": job["duedate"],
        "include_deadline_in_pdf": False,
        "question_types": job["question_types"],
        "questions": questions,
        "source_label": source_label,
        "description": asg.short_description(job["max_grade"]),
    }
    draft["pdf_path"] = asg.make_assignment_pdf(draft)
    print(f"Assignment PDF created without a submission deadline: {draft['pdf_path']}")
    return draft'''
combined_text = replace_function(combined_text, "build_assignment_draft", build_replacement)

# ---------------------------------------------------------------------------
# 2) Shared PDF builder: default behavior remains unchanged for every other
#    workflow; Combined opts out by setting include_deadline_in_pdf=False.
# ---------------------------------------------------------------------------
pdf_old = '''    info = Table(
        [[f"Total Marks: {draft['max_grade']}", f"Deadline: {fmt_due(draft['duedate'])}"],
         ["Name: ______________________", "Reg. No: ________________"]],
        colWidths=[8.3 * cm, 8.3 * cm])'''
pdf_new = '''    if draft.get("include_deadline_in_pdf", True):
        info_rows = [
            [f"Total Marks: {draft['max_grade']}", f"Deadline: {fmt_due(draft['duedate'])}"],
            ["Name: ______________________", "Reg. No: ________________"],
        ]
    else:
        # Combined stores the student submission deadline in Moodle settings,
        # not in the assignment document handed to students.
        info_rows = [
            [f"Total Marks: {draft['max_grade']}", ""],
            ["Name: ______________________", "Reg. No: ________________"],
        ]
    info = Table(info_rows, colWidths=[8.3 * cm, 8.3 * cm])'''
if assignment_text.count(pdf_old) != 1:
    raise SystemExit("Safety stop: expected one make_assignment_pdf info table. No files changed.")
assignment_text = assignment_text.replace(pdf_old, pdf_new, 1)

# ---------------------------------------------------------------------------
# 3) Combined prepare: pause before browser launch when deadline is missing.
# ---------------------------------------------------------------------------
prepare_marker = '    combined_workflows[workflow_id] = wf\n    update_step(wf, "parse", "completed")'
prepare_insert = '''    combined_workflows[workflow_id] = wf
    update_step(wf, "parse", "completed")

    # Ask for the student submission deadline before opening Moellim.
    # The same workflow ID is retained and resumed by /clarify.
    if assignment_job and not assignment_job.get("duedate"):
        wf["status"] = "needs_clarification"
        wf["missing_fields"] = ["deadline"]
        wf["clarification_question"] = (
            "What is the assignment submission deadline? You can give a date "
            "or a duration, for example: 5 days."
        )
        return combined_workflow_public_state(wf)'''
if server_text.count(prepare_marker) != 1:
    raise SystemExit("Safety stop: could not uniquely locate Combined workflow registration. No files changed.")
server_text = server_text.replace(prepare_marker, prepare_insert, 1)

# ---------------------------------------------------------------------------
# 4) Combined prepare only: never extract an old Moellim lecture as source.
#    Always read the exact selected file from the selected course folder.
# ---------------------------------------------------------------------------
server_tree = ast.parse(server_text)
server_funcs = [n for n in server_tree.body if isinstance(n, ast.FunctionDef) and n.name == "prepare_combined_workflow_sync"]
if len(server_funcs) != 1:
    raise SystemExit("Safety stop: expected one prepare_combined_workflow_sync(). No files changed.")
fn = server_funcs[0]
server_lines = server_text.splitlines(keepends=True)
fn_text = "".join(server_lines[fn.lineno - 1:fn.end_lineno])
source_anchor = 'source_value = assignment_job.get("source")'
build_anchor = 'assignment_draft = combined_automation.build_assignment_draft('
if fn_text.count(source_anchor) != 1 or fn_text.count(build_anchor) != 1:
    raise SystemExit(
        "Safety stop: Combined preparation source-selection block differs from the reviewed version. "
        "No files changed."
    )
source_pos = fn_text.index(source_anchor)
build_pos = fn_text.index(build_anchor, source_pos)
replacement_source = '''# Combined assignment week always follows the lecture destination.
                assignment_job["week"] = int(lecture_job["week"])
                assignment_auto.find_week_section(assignment_job["week"])

                # Use only the exact lecture file selected from this course's
                # saved folder. Do not search old Moellim course materials.
                lecture_text = combined_automation.local_lecture_text(file_path)
                source_label = f"{file_path.name} (the lecture being uploaded)"

                '''
fn_text = fn_text[:source_pos] + replacement_source + fn_text[build_pos:]
server_text = "".join(server_lines[:fn.lineno - 1]) + fn_text + "".join(server_lines[fn.end_lineno:])

# ---------------------------------------------------------------------------
# 5) Combined clarification/resume endpoint. Supports the same workflow ID.
# ---------------------------------------------------------------------------
clarify_replacement = r'''@app.post("/api/combined-workflows/{workflow_id}/clarify")
async def clarify_combined_workflow(
    workflow_id: str,
    request: dict[str, Any],
    authorization: Optional[str] = Header(None),
):
    session = verify_combined_workflow_owner(
        combined_workflows.get(workflow_id), authorization
    )
    wf = combined_workflows[workflow_id]

    if wf.get("status") != "needs_clarification" or "deadline" not in (wf.get("missing_fields") or []):
        raise HTTPException(
            status_code=400,
            detail="This combined workflow is not waiting for a submission-deadline clarification.",
        )

    answer = str(request.get("answer", "")).strip()
    if not answer:
        raise HTTPException(status_code=400, detail="Please provide the assignment submission deadline.")

    updated_request = str(wf.get("request") or "").strip() + "\nDeadline: " + answer
    try:
        lecture_job, assignment_job = combined_automation.parse_combined(
            updated_request, selected_course=wf.get("course")
        )
        if not assignment_job or not assignment_job.get("duedate"):
            wf["clarification_question"] = (
                "I could not identify that submission deadline. Please provide a date "
                "or a duration such as 5 days."
            )
            return combined_workflow_public_state(wf)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not apply the deadline: {exc}") from exc

    wf["request"] = updated_request
    wf["parsed"] = {
        "workflow_type": "combined",
        "lecture": lecture_job,
        "assignment": assignment_job,
    }
    wf["status"] = "preparing"
    wf["error"] = None
    wf["missing_fields"] = []
    wf["clarification_question"] = None
    wf["draft"] = None
    wf["steps"] = create_combined_steps()
    update_step(wf, "parse", "completed")

    worker = AssignmentPlaywrightWorker(wf, session)
    wf["_assignment_worker"] = worker
    try:
        future = worker.submit(prepare_combined_workflow_sync, wf, session)
        preparation = await await_worker_future(future)
        wf.update(preparation)
        wf["status"] = "waiting_approval"
        update_step(wf, "approval", "waiting")
    except Exception as exc:
        traceback.print_exc()
        wf["status"] = "failed"
        wf["error"] = str(exc)
        try:
            await cleanup_assignment_workflow(wf)
        except Exception:
            traceback.print_exc()

    return combined_workflow_public_state(wf)'''

# Preserve the existing route decorator when replacing only the function body.
try:
    server_text = replace_function(server_text, "clarify_combined_workflow", clarify_replacement.split("\n", 1)[1])
except RuntimeError as exc:
    if "found 0" not in str(exc):
        raise
    # Add the new route after prepare_combined_workflow; it uses existing server helpers.
    tree = ast.parse(server_text)
    prep_nodes = [n for n in tree.body if isinstance(n, ast.AsyncFunctionDef) and n.name == "prepare_combined_workflow"]
    if len(prep_nodes) != 1:
        raise SystemExit("Safety stop: cannot place Combined clarification endpoint. No files changed.")
    lines = server_text.splitlines(keepends=True)
    insert_at = prep_nodes[0].end_lineno
    server_text = "".join(lines[:insert_at]) + "\n\n" + clarify_replacement + "\n\n" + "".join(lines[insert_at:])

# ---------------------------------------------------------------------------
# Guardrails and atomic write with timestamped backups.
# ---------------------------------------------------------------------------
checks = {
    "Combined parser always generates from uploaded lecture": '"source": {"uploaded": True}' in combined_text and '"mode": "generate"' in combined_text,
    "Combined accepts arbitrary lecture/file names": "def _parse_combined_lecture_job(" in combined_text and "lecture_name = filename.group(1).strip()" in combined_text,
    "Combined parser keeps teacher marks optional": '"max_grade": marks' in combined_text,
    "English relative deadline supported": "to\\s+submit" in combined_text,
    "Combined marks are content/AI selected when omitted": "_choose_combined_marks(lecture_text)" in combined_text,
    "Combined PDF suppresses deadline": '"include_deadline_in_pdf": False' in combined_text,
    "shared PDF keeps old default": 'draft.get("include_deadline_in_pdf", True)' in assignment_text,
    "server asks before browser when deadline missing": 'wf["missing_fields"] = ["deadline"]' in server_text,
    "server uses selected lecture file only": "combined_automation.local_lecture_text(file_path)" in server_text,
    "server validates same lecture week": 'assignment_job["week"] = int(lecture_job["week"])' in server_text,
    "same-ID clarification endpoint exists": '@app.post("/api/combined-workflows/{workflow_id}/clarify")' in server_text,
}
failed = [k for k, v in checks.items() if not v]
if failed:
    raise SystemExit("Safety stop: validation failed: " + "; ".join(failed) + ". No files changed.")

# Compile patched in-memory source before touching project files.
compile(combined_text, str(COMBINED), "exec")
compile(server_text, str(SERVER), "exec")
compile(assignment_text, str(ASSIGNMENT), "exec")

stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
backups = [
    (COMBINED, COMBINED.with_name(f"muawin_combined_before_combined_fix_{stamp}.py")),
    (SERVER, SERVER.with_name(f"server_before_combined_fix_{stamp}.py")),
    (ASSIGNMENT, ASSIGNMENT.with_name(f"assignment_workflow_before_combined_fix_{stamp}.py")),
]
originals = {path: path.read_bytes() for path, _ in backups}
try:
    for original, backup in backups:
        shutil.copy2(original, backup)
    write_source(COMBINED, combined_text, combined_nl)
    write_source(SERVER, server_text, server_nl)
    write_source(ASSIGNMENT, assignment_text, assignment_nl)
    for path in required:
        py_compile.compile(str(path), doraise=True)
except Exception:
    for path, raw in originals.items():
        path.write_bytes(raw)
    raise

print("MUAWIN Combined Workflow patch applied.")
print("Changed files (Combined-specific behavior only):")
for path in required:
    print("  -", path)
print("Timestamped backups:")
for _, backup in backups:
    print("  -", backup)
print("Syntax checks: PASS for all three files.")
print("No standalone Lecture or standalone File Assignment routes/functions were edited.")
print("No live Moellim upload or Execute was performed.")
