from pathlib import Path
from datetime import datetime
import shutil
import re
import py_compile

combined = Path("backend/muawin_combined.py")
server = Path("backend/server.py")
stamp = datetime.now().strftime("%Y%m%d_%H%M%S")

for path in (combined, server):
    backup = path.with_name(path.name + f".backup_fix_combined_{stamp}")
    shutil.copy2(path, backup)
    print("BACKUP:", backup)

# Fix parser regex escaping.
text = combined.read_text(encoding="utf-8")
text = text.replace(r'r"\\b(?:upload|uplaod|attach|add)\\b"',
                    r'r"\b(?:upload|uplaod|attach|add)\b"')
text = text.replace(r'r"\\bassignment\\s*(?:number\\s*)?(\\d+)\\b"',
                    r'r"\bassignment\s*(?:number\s*)?(\d+)\b"')
combined.write_text(text, encoding="utf-8")

# Remove the duplicated generated assignment draft call.
text = server.read_text(encoding="utf-8")
duplicate = '''                update_step(wf, "generate", "completed")
                assignment_draft = (
                combined_automation.build_assignment_draft(
                    assignment_job,
                    lecture_text,
                    source_label,
                    course["name"],
                )
            )

                update_step(wf, "generate", "completed")
'''
if duplicate not in text:
    raise SystemExit("STOP: Duplicate block did not match exactly. No server.py change made.")

text = text.replace(
    duplicate,
    '''                update_step(wf, "generate", "completed")
''',
    1,
)
server.write_text(text, encoding="utf-8")

py_compile.compile(str(combined), doraise=True)
py_compile.compile(str(server), doraise=True)

print("SUCCESS: Regex and duplicate-generation fixes compiled.")
