from pathlib import Path
from datetime import datetime
import shutil
import re
import py_compile

root = Path("backend")
combined = root / "muawin_combined.py"
server = root / "server.py"

stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
for path in (combined, server):
    backup = path.with_name(path.name + f".backup_before_combined_file_upload_{stamp}")
    shutil.copy2(path, backup)
    print("BACKUP:", backup)

source = combined.read_text(encoding="utf-8")
start = source.index("def parse_combined(")
end = source.index("\ndef describe_questions_source(", start)

new_function = '''def parse_combined(
    request: str,
    selected_course: Optional[str] = None,
) -> Tuple[Dict, Optional[Dict]]:
    """Parse lecture plus either an existing assignment file or a generated assignment."""
    lecture_part, assign_part = split_request(request)
    lecture_job = lec.parse_request(lecture_part)

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
        raise ValueError("Selected course was not provided.")
    if not assign_part:
        return lecture_job, None

    # Existing-file upload is distinct from assignment generation.
    upload_requested = bool(re.search(
        r"\\\\b(?:upload|uplaod|attach|add)\\\\b",
        assign_part,
        re.IGNORECASE,
    ))
    if upload_requested:
        number_match = re.search(
            r"\\\\bassignment\\\\s*(?:number\\\\s*)?(\\\\d+)\\\\b",
            assign_part,
            re.IGNORECASE,
        )
        number = int(number_match.group(1)) if number_match else None
        job = {
            "mode": "file_upload",
            "course": lecture_job["course"],
            "assignment_number": number,
            "title": f"Assignment {number}" if number is not None else "",
            "raw_request": assign_part,
            "source": "selected_course_folder",
        }
        return lecture_job, job

    # Preserve the existing generated-assignment behavior.
    week = lecture_job["week"]
    title = asg.parse_title(assign_part)
    if not title:
        title = f"{lec.pretty_heading(lecture_job.get('heading') or lecture_job['lecture'])} Assignment"
    job = {
        "mode": "generate",
        "course": lecture_job["course"],
        "week": week,
        "section": f"Week {week}",
        "title": title,
        "max_grade": asg.parse_marks(assign_part),
        "duedate": asg.parse_deadline(assign_part),
        "question_types": asg.parse_question_types(assign_part),
        "source": clean_source(asg.parse_source(assign_part)),
        "raw_request": assign_part,
    }
    asg.validate_parsed_request(job)
    return lecture_job, job
'''

source = source[:start] + new_function + source[end:]
combined.write_text(source, encoding="utf-8")

py_compile.compile(str(combined), doraise=True)
print("SUCCESS: parser updated and Python compilation passed.")
print("IMPORTANT: Do not prepare or execute a combined workflow yet; the file-selection and upload branch is the next patch.")
