from pathlib import Path
from datetime import datetime
import py_compile
import re
import shutil

SERVER = Path('backend/server.py')
if not SERVER.is_file():
    raise SystemExit('ERROR: Run this script from the MUAWIN project root (backend/server.py not found).')

source = SERVER.read_text(encoding='utf-8-sig')

helper_name = 'select_combined_course_lecture_file'
if f'def {helper_name}(' in source:
    raise SystemExit('STOP: Combined strict selector already exists. No files changed.')

function_marker = 'def prepare_combined_workflow_sync('
if source.count(function_marker) != 1:
    raise SystemExit('STOP: Could not uniquely locate prepare_combined_workflow_sync. No files changed.')

old_call = '''        selector, selected_file = select_course_lecture_file(
            lecture_job["lecture"],
            lecture_job["course"],
            session,
        )'''
if source.count(old_call) != 1:
    raise SystemExit('STOP: Expected Combined file-selection call was not found exactly once. No files changed.')

helper = '''def select_combined_course_lecture_file(
    lecture_name: str,
    course_name: str,
    session: dict[str, Any],
):
    """Strictly select a Combined lecture from its saved course folder only.

    Unlike the shared selector, this never silently picks the newest file when
    multiple files have the same best match rank.
    """
    from . import ai_db

    teacher = str(session.get("username") or "").strip()
    course = str(course_name or "").strip()
    requested = str(lecture_name or "").strip()

    if not teacher or not course:
        raise RuntimeError("Teacher and selected course are required.")
    if not requested or requested.lower() in {"lecture material", "material"}:
        raise RuntimeError(
            "Please specify the lecture name or exact file name so MUAWIN "
            "does not select a different file by guesswork."
        )

    setup = ai_db.get_course_setup(teacher, course)
    folder_path = (setup or {}).get("folder_path")
    if not folder_path:
        raise RuntimeError(
            f"No local lecture folder is saved for '{course}'. "
            "Please save this course's folder in Course Setup first."
        )

    folder = Path(folder_path).expanduser()
    if not folder.is_dir():
        raise FileNotFoundError(
            f"The saved lecture folder for '{course}' does not exist: {folder}"
        )

    # This search is explicitly restricted to the saved course folder.
    candidates = automation.find_local_files(requested, folder=str(folder))
    ranked = []
    for candidate in candidates:
        rank = automation.match_rank(candidate.get("name", ""), requested)
        if rank > 0:
            ranked.append((rank, candidate))

    if not ranked:
        raise FileNotFoundError(
            f"No file matching '{requested}' was found inside the saved folder "
            f"for '{course}'. Please check the file name or choose the correct "
            "lecture file; MUAWIN will not substitute another file."
        )

    best_rank = max(rank for rank, _ in ranked)
    best_matches = [item for rank, item in ranked if rank == best_rank]

    # Deduplicate repeated references to the same physical file only.
    unique_matches = {}
    for item in best_matches:
        path = Path(item["path"]).expanduser().resolve()
        unique_matches[str(path).casefold()] = (item, path)

    if len(unique_matches) > 1:
        choices = []
        for _, (item, path) in sorted(unique_matches.items()):
            try:
                display_path = str(path.relative_to(folder.resolve()))
            except ValueError:
                display_path = str(path)
            choices.append(f"- {display_path}")
        raise RuntimeError(
            "More than one file matches the requested lecture equally well. "
            "Please specify the exact file name so MUAWIN can select the "
            "correct one:\\n" + "\\n".join(choices)
        )

    selected_item, selected_path = next(iter(unique_matches.values()))
    if not selected_path.is_file():
        raise FileNotFoundError(
            f"The selected lecture file is no longer available: {selected_path}"
        )

    print(
        "[COMBINED PREPARE] Strict course-folder match:",
        selected_path.name,
    )
    return automation.MaterialSelector(), selected_path


'''

# Insert helper immediately before the Combined preparation worker.
source = source.replace(function_marker, helper + function_marker, 1)
# Replace only the one call in the Combined worker. The standalone call remains untouched.
source = source.replace(old_call, old_call.replace('select_course_lecture_file(', 'select_combined_course_lecture_file('), 1)

# Verify the standalone helper definition and its call remain unchanged.
if source.count('def select_course_lecture_file(') != 1:
    raise SystemExit('STOP: Shared selector definition count changed. No file written.')
if source.count('selector, file_path = select_course_lecture_file(') != 1:
    raise SystemExit('STOP: Standalone Lecture selector call changed or missing. No file written.')
if source.count('selector, selected_file = select_combined_course_lecture_file(') != 1:
    raise SystemExit('STOP: Combined selector replacement verification failed. No file written.')

stamp = datetime.now().strftime('%Y%m%d_%H%M%S')
backup = SERVER.with_name(f'server_before_combined_strict_file_selection_{stamp}.py')
shutil.copy2(SERVER, backup)

# Preserve a possible UTF-8 BOM if present.
original_bytes = SERVER.read_bytes()
bom = b'\xef\xbb\xbf' if original_bytes.startswith(b'\xef\xbb\xbf') else b''
SERVER.write_bytes(bom + source.encode('utf-8'))

try:
    py_compile.compile(str(SERVER), doraise=True)
except Exception:
    shutil.copy2(backup, SERVER)
    raise

print('Combined strict file-selection patch applied.')
print(f'Backup: {backup}')
print('Syntax check: PASS')
print('Changed file: backend/server.py only')
print('Shared select_course_lecture_file(): unchanged')
print('Standalone Lecture call at the existing workflow: unchanged')
print('Standalone File Assignment workflow: untouched')
print('Combined Execute/upload code: untouched')
print('No live Moellim action was performed.')
