from pathlib import Path
from datetime import datetime, date
import shutil
import re
import py_compile

server = Path("backend/server.py")
combined = Path("backend/muawin_combined.py")
stamp = datetime.now().strftime("%Y%m%d_%H%M%S")

for path in (server, combined):
    backup = path.with_name(path.name + f".backup_combined_upload_{stamp}")
    shutil.copy2(path, backup)
    print("BACKUP:", backup)

src = server.read_text(encoding="utf-8")

helper = r'''
def _combined_match_assignment_date(assignment_auto, start_date):
    """Match an assignment start date to exactly one dated Moellim section."""
    from datetime import date
    import re

    target = date.fromisoformat(str(start_date)[:10])
    month_names = {
        name.lower(): number
        for number, names in enumerate(
            [[], ["January", "Jan"], ["February", "Feb"],
             ["March", "Mar"], ["April", "Apr"], ["May"],
             ["June", "Jun"], ["July", "Jul"], ["August", "Aug"],
             ["September", "Sep"], ["October", "Oct"],
             ["November", "Nov"], ["December", "Dec"]][1:], 1
        )
        for name in names
    }

    matches = []
    pattern = re.compile(
        r"(\d{1,2})\s+([A-Za-z]+)\s*(?:-|–|—|to)\s*"
        r"(\d{1,2})\s+([A-Za-z]+)(?:\s*,?\s*(20\d{2}))?",
        re.IGNORECASE,
    )

    for section in assignment_auto.list_sections():
        heading = str(section.get("heading") or "")
        match = pattern.search(heading)
        if not match:
            continue

        d1, m1, d2, m2, year_text = match.groups()
        month1 = month_names.get(m1.lower())
        month2 = month_names.get(m2.lower())
        if not month1 or not month2:
            continue

        years = [int(year_text)] if year_text else [
            target.year - 1, target.year, target.year + 1
        ]

        for year in years:
            try:
                first = date(year, month1, int(d1))
                end_year = year + (1 if (month2, int(d2)) < (month1, int(d1)) else 0)
                last = date(end_year, month2, int(d2))
            except ValueError:
                continue

            if first <= target <= last:
                explicit_week = assignment_auto._week_in(heading)
                matches.append({
                    "week_number": explicit_week or int(section["num"]),
                    "section_number": int(section["num"]),
                    "heading": heading,
                })
                break

    # Remove duplicate matches caused by overlapping year candidates.
    unique = {
        (item["section_number"], item["week_number"]): item
        for item in matches
    }
    matches = list(unique.values())

    if len(matches) != 1:
        if not matches:
            raise RuntimeError(
                f"Assignment start date {target.isoformat()} does not match "
                "any dated Moellim section. No week was guessed. "
                "Please check the assignment's Allow Submissions From date "
                "and the course section dates."
            )
        raise RuntimeError(
            "The assignment start date matches multiple Moellim sections. "
            "Please clarify the correct date/section before uploading."
        )

    return matches[0]


def _combined_parse_assignment_date(value, end_of_day=False):
    if not value:
        return None
    from datetime import datetime
    for fmt in ("%Y-%m-%d", "%d %B %Y", "%d %b %Y",
                "%d/%m/%Y", "%m/%d/%Y"):
        try:
            parsed = datetime.strptime(str(value).strip(), fmt)
            return parsed.replace(
                hour=23 if end_of_day else 0,
                minute=59 if end_of_day else 0,
            )
        except ValueError:
            pass
    raise ValueError(f"Could not safely interpret assignment date: {value}")


'''

marker = "def prepare_combined_workflow_sync("
if marker not in src:
    raise SystemExit("STOP: combined preparation function not found.")

if "_combined_match_assignment_date" not in src:
    src = src.replace(marker, helper + marker, 1)

# Replace the assignment preparation block, retaining the generated mode.
start = src.index("        if assignment_job:", src.index("def prepare_combined_workflow_sync("))
end = src.index("        # 6. Return drafts for teacher approval.", start)

new_block = '''        if assignment_job:
            assignment_auto = assignment_automation.AssignmentAutomation(page)
            assignment_auto.open_course(str(course_id))
            assignment_auto.verify_course(assignment_job["course"])

            if assignment_job.get("mode") == "file_upload":
                from . import ai_db

                folder_setup = ai_db.get_course_setup(
                    str(session.get("username") or ""),
                    lecture_job["course"],
                )
                assignment_folder = (folder_setup or {}).get("folder_path")
                if not assignment_folder:
                    raise RuntimeError(
                        "No saved folder exists for this course. "
                        "Please save the course folder in Course Setup."
                    )

                candidates = file_assignment_scanner.scan_course_assignment_files(
                    assignment_folder
                )
                requested_number = assignment_job.get("assignment_number")

                if requested_number is None:
                    raise RuntimeError(
                        "Which assignment file should I upload? "
                        "Please specify its assignment number."
                    )

                number_pattern = re.compile(
                    rf"\\bassignment\\s*[_ -]*0*{int(requested_number)}\\b",
                    re.IGNORECASE,
                )
                selected_candidates = [
                    item for item in candidates
                    if number_pattern.search(
                        str(item.get("file_name") or "")
                    ) or number_pattern.search(
                        str(item.get("title") or "")
                    )
                ]

                if not selected_candidates:
                    raise RuntimeError(
                        f"No Assignment {requested_number} file was found "
                        "in the saved folder for this course. "
                        "The lecture file will not be used as an assignment."
                    )

                if len(selected_candidates) > 1:
                    names = ", ".join(
                        str(item.get("file_name") or "Unnamed file")
                        for item in selected_candidates[:5]
                    )
                    raise RuntimeError(
                        f"More than one Assignment {requested_number} file "
                        f"was found: {names}. Please make the filename unique."
                    )

                candidate = selected_candidates[0]
                assignment_file_path = Path(candidate["file_path"])
                if not assignment_file_path.is_file():
                    raise FileNotFoundError(
                        "The selected assignment file is no longer available."
                    )

                start_date = candidate.get("start_date")
                if not start_date:
                    raise RuntimeError(
                        f"{assignment_file_path.name} has no readable "
                        "'Allow Submissions From' date. Please correct "
                        "the assignment document before uploading."
                    )

                section_match = _combined_match_assignment_date(
                    assignment_auto,
                    start_date,
                )

                assignment_draft = {
                    "mode": "file_upload",
                    "title": candidate.get("title") or assignment_file_path.stem,
                    "file_name": assignment_file_path.name,
                    "start_date": start_date,
                    "due_date": candidate.get("due_date"),
                    "total_marks": candidate.get("total_marks"),
                    "clos": candidate.get("clos"),
                    "instructions": candidate.get("instructions") or "",
                    "description": candidate.get("description") or "",
                    "week_number": section_match["week_number"],
                    "section_number": section_match["section_number"],
                    "section_heading": section_match["heading"],
                }

                # Keep the local path private; never expose it in the approval draft.
                wf["_assignment_file_path"] = str(assignment_file_path)
                update_step(wf, "generate", "completed")

            else:
                # Preserve the existing AI-generated assignment workflow.
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
                            r"\\blecture\\s*(\\d+)\\b",
                            source_text,
                            re.IGNORECASE,
                        )
                        week_match = re.search(
                            r"\\bweek\\s*(\\d+)\\b",
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
                        r"\\blecture\\s*(\\d+)\\b",
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
                        source,
                        assignment_job["week"],
                        section,
                    )

                assignment_draft = combined_automation.build_assignment_draft(
                    assignment_job,
                    lecture_text,
                    source_label,
                    course["name"],
                )
                assignment_draft["mode"] = "generate"
                update_step(wf, "generate", "completed")

'''

src = src[:start] + new_block + src[end:]

# Replace only the assignment execution body.
exec_start = src.index("    # Regenerate the PDF so it reflects the teacher-approved draft.", src.index("def execute_combined_workflow_sync("))
exec_end = src.index('    result["assignment"] = make_json_safe(assignment_result)', exec_start)

new_exec = '''    if assignment_job.get("mode") == "file_upload":
        from pathlib import Path

        assignment_file = Path(wf.get("_assignment_file_path") or "")
        if not assignment_file.is_file():
            raise FileNotFoundError(
                "The selected original assignment file is no longer available."
            )
        if assignment_file.suffix.lower() not in {".pdf", ".docx", ".txt"}:
            raise RuntimeError(
                "Only PDF, DOCX and TXT assignment documents are supported."
            )

        assignment_draft["course"] = assignment_job["course"]
        assignment_draft["pdf_path"] = str(assignment_file)
        week = int(assignment_draft["week_number"])

        section, info = assignment_auto.find_week_section(week)
        if not section or not info:
            raise RuntimeError(
                "The date-matched assignment section could not be verified."
            )

        if int(info["num"]) != int(assignment_draft["section_number"]):
            raise RuntimeError(
                "The target Moellim section changed after preparation. "
                "Please prepare the combined workflow again."
            )

        assignment_auto.section_num = int(assignment_draft["section_number"])
        before = assignment_auto.snapshot_before(assignment_draft)
        assignment_auto.open_assignment_form(assignment_auto.section_num)

        description_lines = [
            "Please download and solve the attached assignment file."
        ]
        marks = assignment_draft.get("total_marks")
        if marks is not None and str(marks).strip():
            marks_text = str(marks).strip()
            if marks_text.endswith(".0"):
                marks_text = marks_text[:-2]
            description_lines.extend(["", f"Total Marks: {marks_text}"])

        clos = assignment_draft.get("clos")
        if isinstance(clos, (list, tuple, set)):
            clo_text = ", ".join(
                str(item).strip() for item in clos if str(item).strip()
            )
        else:
            clo_text = str(clos or "").strip()
            if clo_text.lower().startswith("clos:"):
                clo_text = clo_text[5:].strip()
        if clo_text:
            description_lines.append(f"Mapped CLO: {clo_text}")

        instructions = str(assignment_draft.get("instructions") or "").strip()
        if instructions:
            description_lines.extend(["", instructions])

        assignment_draft["description"] = "\\n".join(description_lines)

        assignment_auto.expand_all()
        assignment_auto._set_value(
            assignment_auto.page.locator("#id_name").first,
            assignment_draft["title"],
        )
        assignment_auto.set_description(assignment_draft["description"])
        assignment_auto._ensure_checked(
            assignment_auto.page.locator("#id_showdescription")
        )
        assignment_auto.expand_all()
        assignment_auto._ensure_checked(
            assignment_auto.page.locator("#id_assignsubmission_file_enabled")
        )

        if marks is not None:
            marks_value = float(marks)
            if not marks_value.is_integer() or not 1 <= marks_value <= 100:
                raise ValueError(
                    "Maximum grade must be a whole number between 1 and 100."
                )
            assignment_auto.set_max_grade(int(marks_value))

        start_date = _combined_parse_assignment_date(
            assignment_draft.get("start_date")
        )
        due_date = _combined_parse_assignment_date(
            assignment_draft.get("due_date"), True
        )
        if start_date:
            assignment_auto.set_date("allowsubmissionsfromdate", start_date)
        if due_date:
            assignment_auto.set_date("duedate", due_date)

        assignment_auto.attach_pdf(assignment_file)
        assignment_auto.verify_attachment(assignment_file)
        assignment_auto.save_assignment()
        assignment_auto.verify_saved(assignment_draft, before)

        assignment_result = {
            "success": True,
            "course": assignment_job["course"],
            "week_number": week,
            "title": assignment_draft.get("title"),
            "file_name": assignment_file.name,
            "message": "Original assignment file uploaded and verified in Moellim.",
        }

    else:
        # Existing generated-assignment behavior remains unchanged.
        assignment_draft["pdf_path"] = (
            assignment_automation.make_assignment_pdf(assignment_draft)
        )
        assignment_result = assignment_auto.create_approved_assignment(
            assignment_draft
        )

    update_step(wf, "create", "completed")
    update_step(wf, "verify", "completed")

'''

src = src[:exec_start] + new_exec + src[exec_end:]

server.write_text(src, encoding="utf-8")

py_compile.compile(str(server), doraise=True)
py_compile.compile(str(combined), doraise=True)
print("SUCCESS: Combined existing-assignment upload branch installed.")
print("SUCCESS: Both backend modules compile.")
print("Do not run a live Moellim execute test yet.")
