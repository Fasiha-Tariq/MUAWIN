from pathlib import Path
from datetime import datetime
import py_compile
import re
import shutil
import sys

path = Path("backend/server.py")
if not path.is_file():
    raise SystemExit("ERROR: backend/server.py not found. Run this from the MUAWIN project root.")

source = path.read_text(encoding="utf-8")
original = source
backup = path.with_name(
    f"server.py.combined_backup_{datetime.now():%Y%m%d_%H%M%S}"
)

# ---------- Combined-only helper functions ----------
helper_anchor = "def prepare_combined_workflow_sync("
if "def _combined_weekly_rows(" not in source:
    helper = r'''
def _combined_weekly_rows(teacher: str, course: str) -> list[dict]:
    """Read confirmed weekly expectations without changing tracker data."""
    from . import ai_db
    rows = ai_db.weekly_progress(teacher, course)
    return [dict(row) for row in (rows or [])]


def _combined_explicit_week(instruction: str, task: str):
    """Return only a week explicitly associated with this task."""
    text = str(instruction or "")
    task_pattern = (
        r"(?:lecture|lec)\s*(?:number\s*)?\d+"
        if task == "lecture"
        else r"(?:assignment|assign|assessment)\s*(?:number\s*)?\d+"
    )
    week_pattern = r"(?:week|hafta|haftay)\s*(\d+)"
    patterns = (
        rf"{task_pattern}.{{0,45}}?{week_pattern}",
        rf"{week_pattern}.{{0,45}}?{task_pattern}",
    )
    found = set()
    for pattern in patterns:
        for match in re.finditer(pattern, text, re.IGNORECASE):
            found.add(int(match.group(1)))
    if len(found) > 1:
        raise RuntimeError(
            f"More than one explicit {task} week was found. "
            f"Please clarify the {task} destination week."
        )
    return next(iter(found), None)


def _combined_topic_week(rows: list[dict], text: str):
    """Infer a week from topic similarity; never use class-day timings."""
    import difflib

    def words(value):
        return {
            token for token in re.findall(r"[a-z0-9]+", str(value or "").lower())
            if len(token) > 2 and token not in {
                "the", "and", "for", "with", "from", "this", "that",
                "lecture", "assignment", "week", "extended", "notes",
                "slides", "file", "document"
            }
        }

    source_words = words(text)
    if not source_words:
        return None

    scores = []
    for row in rows:
        topic = str(row.get("topic") or "").strip()
        topic_words = words(topic)
        if not topic_words:
            continue
        overlap = len(source_words & topic_words) / max(
            1, len(source_words | topic_words)
        )
        sequence = difflib.SequenceMatcher(
            None, " ".join(sorted(source_words)),
            " ".join(sorted(topic_words))
        ).ratio()
        score = max(overlap, sequence * 0.75)
        scores.append((score, row.get("week"), topic))

    scores.sort(reverse=True, key=lambda item: item[0])
    if not scores or scores[0][0] < 0.16:
        return None
    if len(scores) > 1 and scores[0][0] - scores[1][0] < 0.07:
        return None
    return int(scores[0][1])


def _combined_assignment_date_week(rows: list[dict], start_date):
    """Match assignment issue/start date to saved weekly expectation dates."""
    if not start_date:
        return None
    value = str(start_date).strip()[:10]
    matches = {
        int(row["week"])
        for row in rows
        if row.get("week") is not None
        and str(row.get("due_date") or "").strip()[:10] == value
    }
    return next(iter(matches)) if len(matches) == 1 else None


def _combined_find_assignment_file(teacher: str, course: str, number: int):
    """Find one numbered assignment only inside this course's saved folder."""
    from . import ai_db

    setup = ai_db.get_course_setup(teacher, course)
    folder = (setup or {}).get("folder_path")
    if not folder:
        raise RuntimeError(
            f"No saved folder exists for '{course}'. Configure its folder in Course Setup."
        )

    candidates = file_assignment_scanner.scan_course_assignment_files(folder)
    matches = []
    for item in candidates:
        searchable = " ".join((
            str(item.get("file_name") or ""),
            str(item.get("title") or ""),
        ))
        match = re.search(
            r"(?:assignment|assign|assessment|ass)\s*[-_:# ]*0*(\d+)",
            searchable,
            re.IGNORECASE,
        )
        if match and int(match.group(1)) == int(number):
            matches.append(item)

    if len(matches) != 1:
        if not matches:
            raise RuntimeError(
                f"Assignment {number} was not found in the saved folder for '{course}'."
            )
        raise RuntimeError(
            f"More than one file matches Assignment {number} in the saved "
            f"folder for '{course}'. Rename/select the correct document and retry."
        )

    selected = dict(matches[0])
    selected_path = Path(selected.get("file_path") or "")
    if not selected_path.is_file():
        raise FileNotFoundError(
            f"The selected assignment document is unavailable: {selected_path}"
        )
    if selected_path.suffix.lower() not in {".pdf", ".docx", ".txt"}:
        raise RuntimeError("Combined file assignments support PDF, DOCX and TXT.")
    return selected


'''
    if helper_anchor not in source:
        raise SystemExit("ERROR: combined preparation function anchor not found.")
    source = source.replace(helper_anchor, helper + helper_anchor, 1)

# ---------- Replace combined preparation assignment block ----------
start = "        # 5. Prepare the optional assignment draft."
end = "        # 6. Return drafts for teacher approval."
if start not in source or end not in source:
    raise SystemExit("ERROR: combined preparation block anchors did not match.")

prep_block = r'''        # 5. Resolve lecture and optional assignment independently.
        assignment_draft = None
        assignment_auto = None

        weekly_rows = _combined_weekly_rows(
            str(session.get("username") or ""),
            lecture_job["course"],
        )

        explicit_lecture_week = _combined_explicit_week(
            instruction, "lecture"
        )
        if explicit_lecture_week is not None:
            lecture_job["week"] = explicit_lecture_week
        else:
            lecture_evidence = " ".join(str(lecture_draft.get(key) or "") for key in (
                "heading", "description", "key_points"
            ))
            lecture_evidence += " " + file_path.stem
            inferred_lecture_week = _combined_topic_week(
                weekly_rows, lecture_evidence
            )
            if inferred_lecture_week is not None:
                lecture_job["week"] = inferred_lecture_week
            elif not lecture_job.get("week"):
                raise RuntimeError(
                    "I could not identify the lecture's destination week "
                    "from the saved weekly topics. Please specify the lecture week."
                )

        assignment_mode = (
            str((assignment_job or {}).get("mode") or "generate").lower()
            if assignment_job else None
        )

        if assignment_job:
            assignment_auto = assignment_automation.AssignmentAutomation(page)
            assignment_auto.open_course(str(course_id))
            assignment_auto.verify_course(assignment_job["course"])

            if assignment_mode == "file_upload":
                assignment_number = assignment_job.get("assignment_number")
                if assignment_number is None:
                    raise RuntimeError(
                        "The assignment number is missing from the combined request."
                    )

                selected_assignment = _combined_find_assignment_file(
                    str(session.get("username") or ""),
                    lecture_job["course"],
                    int(assignment_number),
                )
                assignment_path = Path(selected_assignment["file_path"])

                explicit_assignment_week = _combined_explicit_week(
                    instruction, "assignment"
                )
                assignment_week = explicit_assignment_week

                if assignment_week is None:
                    assignment_week = _combined_assignment_date_week(
                        weekly_rows, selected_assignment.get("start_date")
                    )

                if assignment_week is None:
                    assignment_evidence = " ".join(str(
                        selected_assignment.get(key) or ""
                    ) for key in (
                        "title", "description", "instructions",
                        "rubric_notes", "clos", "file_name"
                    ))
                    assignment_week = _combined_topic_week(
                        weekly_rows, assignment_evidence
                    )

                if assignment_week is None:
                    raise RuntimeError(
                        "I could not safely infer the assignment's destination "
                        "week from its date or saved weekly topics. Please specify "
                        "the assignment week; the lecture week will not be reused."
                    )

                assignment_job["week"] = int(assignment_week)
                assignment_job["file_path"] = str(assignment_path)
                assignment_job["file_name"] = assignment_path.name
                assignment_job["metadata"] = selected_assignment

                assignment_draft = {
                    "title": selected_assignment.get("title")
                        or assignment_path.stem,
                    "description": selected_assignment.get("description") or "",
                    "total_marks": selected_assignment.get("total_marks"),
                    "max_grade": selected_assignment.get("total_marks"),
                    "start_date": selected_assignment.get("start_date"),
                    "due_date": selected_assignment.get("due_date"),
                    "clos": selected_assignment.get("clos") or [],
                    "file_name": assignment_path.name,
                    "file_path": str(assignment_path),
                    "week_number": int(assignment_week),
                    "mode": "file_upload",
                }

                print(
                    "[COMBINED PREPARE] Original assignment selected:",
                    assignment_path.name,
                    "| target week:",
                    assignment_week,
                )
                update_step(wf, "generate", "completed")

            else:
                # Preserve the existing generated-assignment workflow.
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
                            source = {"lecture": int(lecture_match.group(1))}
                        elif week_match:
                            source = {"week": int(week_match.group(1))}
                        elif source_text:
                            source = {"name": source_text}

                if not source_is_uploaded and source.get("lecture") is not None:
                    file_match = re.search(
                        r"\blecture\s*(\d+)\b",
                        file_path.stem,
                        re.IGNORECASE,
                    )
                    if file_match:
                        source_is_uploaded = (
                            int(file_match.group(1)) == int(source["lecture"])
                        )

                if source_is_uploaded:
                    lecture_text = combined_automation.local_lecture_text(file_path)
                    source_label = f"{file_path.name} (the lecture being uploaded)"
                else:
                    section, _info = assignment_auto.find_week_section(
                        assignment_job["week"]
                    )
                    lecture_text, source_label = assignment_auto.extract_lecture(
                        source, assignment_job["week"], section
                    )

                assignment_draft = combined_automation.build_assignment_draft(
                    assignment_job,
                    lecture_text,
                    source_label,
                    course["name"],
                )
                update_step(wf, "generate", "completed")

'''
source = source.replace(
    source[source.index(start):source.index(end)],
    prep_block,
    1,
)

# ---------- Replace combined execution assignment branch ----------
exec_start = "    # 2. Only create the assignment after the lecture upload succeeds."
exec_end = "    result[\"assignment\"] = make_json_safe(assignment_result)\n\n    return result"
if exec_start not in source or exec_end not in source:
    raise SystemExit("ERROR: combined execution block anchors did not match.")

exec_block = r'''    # 2. Process the assignment only after the lecture upload succeeds.
    if not assignment_job:
        return result

    if assignment_auto is None:
        raise RuntimeError("Assignment automation session is unavailable.")
    if not course_id:
        raise RuntimeError("The target course ID is missing.")

    update_step(wf, "create", "running")
    assignment_auto.open_course(str(course_id))
    assignment_auto.verify_course(assignment_job["course"])

    if str(assignment_job.get("mode") or "generate").lower() == "file_upload":
        # Attach the teacher's original document; do not generate a PDF.
        assignment_draft = dict(assignment_draft or {})
        original_file = Path(assignment_draft.get("file_path") or "")
        if not original_file.is_file():
            raise FileNotFoundError(
                f"The original assignment document is unavailable: {original_file}"
            )

        assignment_week = int(assignment_job["week"])
        section, info = assignment_auto.find_week_section(assignment_week)
        if not section or not info:
            raise RuntimeError(
                f"Assignment destination Week {assignment_week} "
                "could not be verified in Moellim."
            )

        assignment_auto.section_num = info["num"]
        assignment_draft["pdf_path"] = str(original_file)
        assignment_draft["course"] = assignment_job["course"]
        before = assignment_auto.snapshot_before(assignment_draft)

        assignment_auto.open_assignment_form(assignment_auto.section_num)

        assignment_draft["description"] = (
            f"<p>Please download and solve the attached assignment "
            f"{original_file.suffix.lstrip('.').upper()}.</p>"
            f"<p><strong>Total Marks: "
            f"{assignment_draft.get('total_marks') or assignment_draft.get('max_grade') or 0}"
            f"</strong></p>"
        )

        marks = normalize_assignment_marks(
            assignment_draft.get("total_marks")
        )
        if marks is not None:
            assignment_draft["max_grade"] = marks
        else:
            assignment_draft.pop("max_grade", None)

        from datetime import datetime

        def parse_combined_date(value, end_of_day=False):
            if not value:
                return None
            for fmt in (
                "%d %B %Y", "%d %b %Y", "%Y-%m-%d",
                "%d/%m/%Y", "%m/%d/%Y",
            ):
                try:
                    parsed_date = datetime.strptime(str(value).strip(), fmt)
                    return parsed_date.replace(
                        hour=23 if end_of_day else 0,
                        minute=59 if end_of_day else 0,
                    )
                except ValueError:
                    continue
            raise ValueError(
                f"Could not safely interpret assignment date: {value}"
            )

        start_date = parse_combined_date(
            assignment_draft.get("start_date")
        )
        due_date = parse_combined_date(
            assignment_draft.get("due_date"), True
        )

        if due_date is not None:
            assignment_draft["duedate"] = due_date
        else:
            assignment_draft.pop("duedate", None)

        assignment_auto.fill_assignment_settings(assignment_draft)
        if start_date:
            assignment_auto.set_date(
                "allowsubmissionsfromdate", start_date
            )

        assignment_auto.verify_attachment(original_file)
        assignment_auto.save_assignment()
        assignment_auto.verify_saved(assignment_draft, before)

        assignment_result = {
            "success": True,
            "course": assignment_job["course"],
            "week_number": assignment_week,
            "title": assignment_draft.get("title"),
            "file_name": original_file.name,
            "message": (
                "Original assignment document attached, saved "
                "and verified in Moellim."
            ),
        }

    else:
        # Preserve the existing generated-assignment behavior.
        assignment_draft["pdf_path"] = (
            assignment_automation.make_assignment_pdf(assignment_draft)
        )
        assignment_result = assignment_auto.create_approved_assignment(
            assignment_draft
        )

    update_step(wf, "create", "completed")
    update_step(wf, "verify", "completed")
    result["assignment"] = make_json_safe(assignment_result)

    return result'''
source = source.replace(
    source[source.index(exec_start):source.index(exec_end) + len(exec_end)],
    exec_block,
    1,
)

# Write only after every anchor has matched.
shutil.copy2(path, backup)
try:
    path.write_text(source, encoding="utf-8")
    py_compile.compile(str(path), doraise=True)
except Exception:
    shutil.copy2(backup, path)
    raise

print("PATCH APPLIED.")
print(f"Backup: {backup}")
print("Python compilation: PASSED")
print("Changed file: backend/server.py")
print("Standalone assignment routes/scanner were not targeted.")
