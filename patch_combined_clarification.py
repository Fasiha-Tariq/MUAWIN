from pathlib import Path
from datetime import datetime

path = Path("backend/server.py")
source = path.read_text(encoding="utf-8")

backup = path.with_name(
    f"server.py.backup_clarification_{datetime.now():%Y%m%d_%H%M%S}"
)
backup.write_text(source, encoding="utf-8")

old = '''    except Exception:
        traceback.print_exc()

        # Clean up any resources that were successfully created.
        if resources:
            close_playwright_resources(resources)

        wf["_playwright"] = None
        wf["automation"] = None

        raise
'''

new = '''    except Exception as exc:
        traceback.print_exc()

        # Preserve the prepared lecture and browser session when
        # an existing assignment file needs teacher clarification.
        if (
            locals().get("assignment_job", {}).get("mode") == "file_upload"
            and locals().get("lecture_draft") is not None
            and locals().get("assignment_auto") is not None
            and locals().get("file_path") is not None
        ):
            question = str(exc)
            wf["status"] = "needs_clarification"
            wf["error"] = question
            wf["clarification_question"] = question
            wf["_playwright"] = resources
            wf["automation"] = locals().get("moodle")
            wf["_assignment_automation"] = locals().get("assignment_auto")
            wf["_file_path"] = str(locals()["file_path"])

            return {
                "parsed": wf["parsed"],
                "draft": {
                    "course": locals()["course"]["name"],
                    "week": locals()["lecture_job"]["week"],
                    "file_name": locals()["file_path"].name,
                    "lecture": locals()["lecture_draft"],
                    "assignment": None,
                },
                "course_id": str(locals()["course_id"]),
                "automation": locals().get("moodle"),
                "_assignment_automation": locals().get("assignment_auto"),
                "_file_path": str(locals()["file_path"]),
                "_playwright": resources,
                "status": "needs_clarification",
                "clarification_question": question,
            }

        # Preserve the original cleanup behavior for all other failures.
        if resources:
            close_playwright_resources(resources)

        wf["_playwright"] = None
        wf["automation"] = None
        raise
'''

if old not in source:
    raise SystemExit("PATCH STOPPED: expected cleanup block was not found. No changes made.")

source = source.replace(old, new, 1)

old_filter = '''        'waiting_approval',
        'pending_approval',
        'needs_approval',
        'pending',
'''
# Frontend is patched separately; this file only contains backend changes.

path.write_text(source, encoding="utf-8")
print("PATCH APPLIED")
print("Backup:", backup)
