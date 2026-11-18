

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from . import muawin_lecture as lec
from . import assignment_workflow as asg

# Keep these aliases for compatibility with existing code.
automation = lec
assignment_automation = asg



try:
    from playwright.sync_api import sync_playwright  # noqa: E402
except ImportError:                                   # dry-run still works
    sync_playwright = None

UNREADABLE_SUFFIXES = {".ppt", ".doc"}        # old binary Office formats
SAME_LECTURE_WORDS = {"uploaded", "upload", "new", "current", "same", "above",
                      "just", "this", "that", "lecture", "file", "material"}


# ============================================================
# REQUEST PARSER  (lecture part + assignment part)
# ============================================================
def split_request(request: str) -> Tuple[str, str]:
    """'Upload ... Week 4 and create ... assignment ...' -> (lecture part, assignment part)"""
    request = lec.clean_text(request)
    m = re.search(r"\b(?:create|make|generate|build|prepare)\b", request, re.I) \
        or re.search(r"\bassignment\b", request, re.I)
    if not m:
        return request, ""
    lecture_part = request[: m.start()]
    lecture_part = re.sub(
        r"(?:[\s,;.]|\b(?:and|then|also|plus|aur|with)\b)+$", "", lecture_part,
        flags=re.I).strip()
    return lecture_part, request[m.start():].strip()


def clean_source(source: Dict) -> Dict:
    """Mark references to the current lecture as the lecture being uploaded."""
    source = source or {"week": None, "lecture": None, "name": None}
    name = source.get("name")
    if name and set(asg.norm_text(name).split()) <= SAME_LECTURE_WORDS:
        return {"uploaded": True}
    return source




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


def parse_combined(
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
    return lecture_job, job

def describe_questions_source(job: Dict) -> str:
    src = job["source"]
    if any(src.values()):
        return asg.describe_source(src, job["week"])
    return "the lecture being uploaded"


# ============================================================
# LECTURE TEXT + ASSIGNMENT DRAFT
# ============================================================
def local_lecture_text(file_path: Path) -> str:
    if file_path.suffix.lower() in UNREADABLE_SUFFIXES:
        raise RuntimeError(
            f"'{file_path.name}' (.ppt/.doc) se text nahi parha ja sakta. "
            "Isay .pptx / .docx / .pdf mein save karein, ya request mein "
            "'from Lecture N' / 'from the Week N lecture' likhein.")
    text = asg.local_file_to_text(file_path)
    if len(text.strip()) < 80:
        raise RuntimeError(
            f"'{file_path.name}' mein parhne layak text nahi mila (scanned/image slides?). "
            "Assignment create nahi hogi. Text wali file use karein.")
    return text


def build_assignment_draft(job: Dict, lecture_text: str, source_label: str,
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
    return draft



# ============================================================
# ONE COMBINED TEACHER REVIEW
# ============================================================
def combined_review(course: str, week: int, file_name: str, others: int,
                    lecture_draft: Dict, assign_draft: Dict, week_note: str) -> str:
    """Returns: approve | reject | change_file.  (e / t edit in place)"""
    while True:
        print()
        lec.divider()
        print("TEACHER REVIEW - lecture + assignment (ek hi approval)")
        lec.divider()
        if week_note:
            print(f"âš  {week_note}")
        print(f"Course        : {course}")
        print(f"Week          : {week}")
        print()
        print("[1] LECTURE UPLOAD")
        print(f"    File        : {file_name}")
        if others:
            print(f"                  (+{others} aur matching file(s): 'f' dabayein)")
        print(f"    Heading     : {lecture_draft['heading']}")
        print(f"    Description : {lecture_draft['description']}")
        print()
        print("[2] ASSIGNMENT  (same week)")
        print(f"    Title       : {assign_draft['title']}")
        print(f"    Total marks : {assign_draft['max_grade']}")
        print(f"    Deadline    : {asg.fmt_due(assign_draft['duedate'])}")
        print("    Questions   : " + ", ".join(
            f"{c} {t}" for t, c in assign_draft["question_types"].items()))
        print(f"    Questions from : {assign_draft['source_label']}")
        print(f"    PDF preview : {assign_draft['pdf_path']}")
        for w in assign_draft.get("warnings", []):
            print(f"    âš  WARNING   : {w}")
        print()
        lec.divider()
        print(asg.questions_to_text(assign_draft["questions"]))
        lec.divider()
        print("ENTER = Approve (upload + assignment) | e = edit lecture text | "
              "t = edit assignment title | f = change file | n = cancel")

        choice = input("Your choice: ").strip().lower()
        if choice in ("", "y", "yes"):
            return "approve"
        if choice in ("n", "no"):
            return "reject"
        if choice == "f":
            return "change_file"
        if choice == "t":
            new_title = input(f"Assignment title [{assign_draft['title']}]: ").strip()
            if new_title:
                assign_draft["title"] = new_title
            continue
        if choice == "e":
            new_heading = input("New lecture heading (Enter = keep): ").strip()
            if new_heading:
                lecture_draft["heading"] = new_heading
                if lecture_draft.get("auto_description"):
                    lecture_draft["description"] = f"Lecture material for {new_heading}."
            new_desc = input("New lecture description (Enter = keep): ").strip()
            if new_desc:
                lecture_draft["description"] = new_desc
                lecture_draft["auto_description"] = False
            continue
        print("Invalid choice.")


# ============================================================
# DRY RUN (no browser)
# ============================================================
def dry_run(lecture_job: Dict, job: Optional[Dict], lecture_file: Optional[str]) -> int:
    if not (job and lecture_file):
        return 0
    try:
        text = local_lecture_text(Path(lecture_file))
        demo = build_assignment_draft(job, text, Path(lecture_file).name, job["course"])
    except Exception as exc:
        print(f"\nâœ— {exc}")
        return 1
    print()
    lec.divider()
    print(asg.questions_to_text(demo["questions"]))
    lec.divider()
    print(f"âœ“ PDF created: {demo['pdf_path']}")
    return 0


# ============================================================
# MAIN
# ============================================================
def main() -> int:
    ap = argparse.ArgumentParser(description="MUAWIN combined: lecture upload + assignment")
    ap.add_argument("--request", type=str, help="Teacher request (otherwise asked once)")
    ap.add_argument("--yes", action="store_true", help="Skip approval (testing only)")
    ap.add_argument("--headless", action="store_true")
    ap.add_argument("--dry-run", action="store_true",
                    help="Only parse the request (with --lecture-file: also questions + PDF)")
    ap.add_argument("--lecture-file", type=str,
                    help="Local lecture file to test question generation (with --dry-run)")
    args = ap.parse_args()

    print()
    print("=" * 70)
    print("MUAWIN - LECTURE + ASSIGNMENT (COMBINED)")
    print("=" * 70)

    request = args.request
    if not request:
        print("Teacher request:")
        print('  Example: Upload Lecture 5 to CS7 MUAWIN Week 4 and create a 10 marks '
              'assignment titled "CS7 Week 4 Assignment 2" with 3 short and 2 long '
              'questions. Deadline: 25 October 2026, 11:59 PM')
        request = input("> ").strip()
    if not request:
        print("ERROR: Empty teacher request.")
        return 1

    try:
        lecture_job, job = parse_combined(request)
    except ValueError as exc:
        print(f"\nâœ— {exc}")
        return 1

    print("\nâœ“ Request understood")
    print(f"  Course      : {lecture_job['course']}")
    print(f"  Week        : {lecture_job['week']}")
    print(f"  Lecture     : {lecture_job['lecture']}"
          + (f"  (heading: {lecture_job['heading']})" if lecture_job.get("heading") else ""))
    if job:
        print(f"  Assignment  : {job['title']}")
        print(f"  Marks       : {job['max_grade']}")
        print(f"  Deadline    : {asg.fmt_due(job['duedate'])}")
        print(f"  Questions   : {job['question_types']}")
        print(f"  Questions from: {describe_questions_source(job)}")
    else:
        print("  Assignment  : (not requested - only the lecture will be uploaded)")

    if args.dry_run:
        return dry_run(lecture_job, job, args.lecture_file)

    if sync_playwright is None:
        print("\nâœ— Playwright is not installed. Run:\n"
              "   python -m pip install playwright python-dotenv pypdf reportlab\n"
              "   python -m playwright install chromium")
        return 1
    if not (lec.MOELLIM_USERNAME and lec.MOELLIM_PASSWORD):
        print(f"\nERROR: Moellim username/password .env mein nahi mile: {lec.ENV_FILE}")
        return 1
    if args.headless:
        lec.HEADLESS = True

    log: Dict = {"request": request, "workflow": "combined", **lecture_job}
    if job:
        log["assignment"] = {"title": job["title"], "max_grade": job["max_grade"],
                             "duedate": job["duedate"].isoformat(),
                             "question_types": job["question_types"]}
    status = 1

    with sync_playwright() as p:
        browser, context = lec.launch_browser(p)
        page = context.new_page()
        moodle = lec.MoodleAutomation(page)
        week = lecture_job["week"]

        try:
            # ---------- login / course / week (ONE session for both) ----------
            moodle.login()
            course = moodle.discover_course(lecture_job["course"])
            print(f"\nâœ“ Matched course: {course['name']}")
            log["course_matched"] = course["name"]
            course_id = asg.extract_course_id(course["href"])
            moodle.open_course(course)
            moodle.ensure_edit_mode()

            target_week = moodle.check_week(week)
            week_note = ""
            if not target_week:
                last = max((s["section_number"] for s in moodle.discover_sections()), default=0)
                week_note = ("Moellim mein ye naye weeks (date based) ban jayenge: "
                             + ", ".join(f"Week {w}" for w in range(last + 1, week + 1)))
                if job and any(job["source"].values()):
                    raise RuntimeError(
                        f"Week {week} abhi Moellim mein nahi hai, aur questions kisi aur "
                        "material se lene hain. Pehle week banayein ya 'from ...' hata dein.")

            auto = asg.AssignmentAutomation(page) if job else None

            # ---------- find lecture file ----------
            print("\n[6] Finding lecture material...")
            selector = lec.MaterialSelector()
            file_path = selector.auto_select(lecture_job["lecture"])
            if not file_path:
                print("\n! Material selection cancelled. Nothing was uploaded or created.")
                log["status"] = "cancelled"
                lec.log_activity(log)
                return 1

            lecture_draft = lec.prepare_lecture_preview(
                file_path, lecture_job["lecture"], lecture_job.get("heading"))

            # ---------- questions source (external material is read-only here) ----------
            external_text: Optional[Tuple[str, str]] = None
            if job and any(job["source"].values()):
                auto.open_course(course_id)
                auto.verify_course(job["course"])
                section, _info = auto.find_week_section(week)
                external_text = auto.extract_lecture(job["source"], week, section)

            def make_draft() -> Dict:
                if external_text:
                    text, label = external_text
                else:
                    text = local_lecture_text(file_path)
                    label = f"{file_path.name} (the lecture being uploaded)"
                return build_assignment_draft(job, text, label, course["name"])

            assign_draft = make_draft() if job else None

            # ---------- ONE REVIEW ----------
            print("\n[7] Teacher Review")
            decision = "approve"
            if not args.yes:
                while True:
                    if job:
                        decision = combined_review(
                            course["name"], week, file_path.name,
                            len(selector.other_matches(file_path.name)),
                            lecture_draft, assign_draft, week_note)
                    else:
                        lecture_draft.update(
                            course=course["name"], week=week, file=file_path.name,
                            note=week_note,
                            others=len(selector.other_matches(file_path.name)))
                        decision = lec.teacher_review(lecture_draft)
                    if decision != "change_file":
                        break
                    new_file = selector.change_file(file_path.name)
                    if new_file:
                        file_path = new_file
                        old = lecture_draft
                        lecture_draft = lec.prepare_lecture_preview(
                            file_path, lecture_job["lecture"], lecture_job.get("heading"))
                        lecture_draft["heading"] = old["heading"]
                        if job:
                            assign_draft = make_draft()
            log["file"] = file_path.name
            if decision == "reject":
                print("\n! Teacher cancelled. Nothing was uploaded or created.")
                log["status"] = "rejected"
                lec.log_activity(log)
                return 1
            print("\nâœ“ Teacher approved.")

            # ---------- STEP A: upload the lecture ----------
            print("\n[8] Uploading lecture to Moellim...")
            verified = moodle.upload_approved_lecture(
                week_number=week, file_path=file_path, draft=lecture_draft)
            if not verified:
                raise RuntimeError("Lecture upload could not be verified. "
                                   "Assignment was NOT created.")
            log["heading"] = lecture_draft["heading"]
            log["lecture_status"] = "success"
            print("\nâœ“ LECTURE UPLOADED + VERIFIED")

            if not job:
                log["status"] = "success"
                lec.log_activity(log)
                status = 0
                return 0

            # ---------- STEP B: create the assignment in the same week ----------
            print("\n[9] Creating assignment in the same week...")
            try:
                auto.open_course(course_id)
                try:
                    auto.verify_course(job["course"])
                    assign_draft["course"] = job["course"]
                except RuntimeError:
                    auto.verify_course(course["name"])
                    assign_draft["course"] = course["name"]

                # the title may have been edited in the review
                assign_draft["pdf_path"] = asg.make_assignment_pdf(assign_draft)
                auto.create_approved_assignment(assign_draft)
            except Exception as exc:
                log["assignment_status"] = "failed"
                log["status"] = "partial"
                log["error"] = str(exc)
                print("\n" + "=" * 70)
                print("LECTURE UPLOAD HO GAYI, LEKIN ASSIGNMENT FAIL HUI")
                print("=" * 70)
                print(f"ERROR: {exc}")
                print("Lecture dobara upload mat karein - sirf assignment workflow chalayein:")
                print("   python assignment_workflow.py")
                lec.log_activity(log)
                try:
                    page.screenshot(path=str(lec.BASE_DIR / "muawin_error.png"), full_page=True)
                except Exception:
                    pass
                return 1

            result = {
                "status": "success",
                "course": assign_draft["course"],
                "course_id": str(course_id),
                "week": job["section"],
                "moodle_section": dict(auto.week_info),
                "lecture_file": file_path.name,
                "lecture_heading": lecture_draft["heading"],
                "lecture_source": assign_draft["source_label"],
                "title": assign_draft["title"],
                "pdf_file": str(assign_draft["pdf_path"]),
                "max_grade": assign_draft["max_grade"],
                "duedate": assign_draft["duedate"].isoformat(),
                "question_types": assign_draft["question_types"],
                "question_count": len(assign_draft["questions"]),
                "questions": [q.__dict__ for q in assign_draft["questions"]],
                "message": "Lecture uploaded and assignment created (PDF attached) in the same week.",
            }
            saved = asg.save_result(result)

            print()
            print("=" * 70)
            print("MUAWIN COMBINED WORKFLOW COMPLETED SUCCESSFULLY")
            print("=" * 70)
            print(f"Course     : {assign_draft['course']}  |  Week {week}")
            print(f"Lecture    : {lecture_draft['heading']}  ({file_path.name})")
            print(f"Assignment : {assign_draft['title']}  |  {assign_draft['max_grade']} marks  |  "
                  f"{asg.fmt_due(assign_draft['duedate'])}")
            print("\nâœ“ Lecture uploaded + verified\nâœ“ Assignment created + verified "
                  "(grade, deadline, PDF, same week)")
            print(f"Result saved to: {saved}")
            log["assignment_status"] = "success"
            log["status"] = "success"
            lec.log_activity(log)
            status = 0
            return 0

        except Exception as e:
            print("\n" + "=" * 70)
            print("MUAWIN WORKFLOW FAILED")
            print("=" * 70)
            print(f"\nERROR TYPE: {type(e).__name__}")
            print(f"ERROR: {e}")
            log["status"] = "failed"
            log["error"] = str(e)
            lec.log_activity(log)
            try:
                shot = lec.BASE_DIR / "muawin_error.png"
                page.screenshot(path=str(shot), full_page=True)
                print(f"\nDebug screenshot:\n{shot}")
            except Exception:
                pass
            return 1
        except KeyboardInterrupt:
            print("\nCancelled by user.")
            return 130
        finally:
            print("\nBrowser automation finished.")
            if status != 0 and log.get("status") in ("failed", "partial"):
                input("Press ENTER to close browser...")
            else:
                lec.pause(4)
            try:
                browser.close()
            except Exception:
                pass


if __name__ == "__main__":
    raise SystemExit(main())
