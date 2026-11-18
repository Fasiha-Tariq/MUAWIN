from pathlib import Path
from datetime import datetime
import shutil
import py_compile

stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
server = Path("backend/server.py")
approval = Path("frontend/src/pages/Approvals.tsx")

for path in (server, approval):
    backup = path.with_name(path.name + f".backup_approval_file_{stamp}")
    shutil.copy2(path, backup)
    print("BACKUP:", backup)

src = server.read_text(encoding="utf-8")

old = '''        wf.update(preparation)

        wf["status"] = "waiting_approval"
        update_step(wf, "approval", "waiting")
'''

new = '''        wf.update(preparation)

        # Keep clarification requests out of the approval queue.
        if wf.get("status") == "needs_clarification":
            wf["clarification_question"] = (
                wf.get("clarification_question")
                or wf.get("error")
                or "Please clarify the assignment details before approval."
            )
            update_step(wf, "approval", "pending")
        else:
            wf["status"] = "waiting_approval"
            update_step(wf, "approval", "waiting")
'''

if old not in src:
    raise SystemExit(
        "STOP: Expected combined preparation status block not found. "
        "No source changes made."
    )

src = src.replace(old, new, 1)

old_public = '''        "error": wf.get("error"),
    }
'''

new_public = '''        "error": wf.get("error"),
        "clarification_question": wf.get("clarification_question"),
    }
'''

if old_public not in src:
    raise SystemExit(
        "STOP: Combined public state block not found. "
        "No source changes made."
    )

src = src.replace(old_public, new_public, 1)
server.write_text(src, encoding="utf-8")

tsx = approval.read_text(encoding="utf-8")

old_preview = '''                          {renderDetail(
                            'Assignment Title',
                            assignmentTitle,
                            'Assignment title not provided'
                          )}

                          {renderDetail(
                            'Total Marks',
'''

new_preview = '''                          {renderDetail(
                            'Assignment Title',
                            assignmentTitle,
                            'Assignment title not provided'
                          )}

                          {assignment.mode === 'file_upload' && (
                            <>
                              {renderDetail(
                                'Original Assignment File',
                                assignment.file_name
                              )}

                              {renderDetail(
                                'Allow Submissions From',
                                assignment.start_date
                              )}

                              {renderDetail(
                                'Matched Moellim Section',
                                assignment.section_heading
                              )}
                            </>
                          )}

                          {renderDetail(
                            'Total Marks',
'''

if old_preview not in tsx:
    raise SystemExit(
        "STOP: Expected assignment preview insertion point not found. "
        "Backend change was applied; frontend was not modified."
    )

tsx = tsx.replace(old_preview, new_preview, 1)

old_heading = '''                            <p className="text-[11px] text-violet-800">
                              Review the assignment before it is
                              created on Moellim.
                            </p>
'''

new_heading = '''                            <p className="text-[11px] text-violet-800">
                              {assignment.mode === 'file_upload'
                                ? 'Review the original assignment file and target section before uploading.'
                                : 'Review the assignment before it is created on Moellim.'}
                            </p>
'''

if old_heading not in tsx:
    raise SystemExit(
        "STOP: Expected assignment preview heading not found. "
        "Backend change was applied; frontend was not modified."
    )

tsx = tsx.replace(old_heading, new_heading, 1)
approval.write_text(tsx, encoding="utf-8")

py_compile.compile(str(server), doraise=True)
print("SUCCESS: Combined clarification status preserved.")
print("SUCCESS: File-upload preview fields added.")
print("Run frontend build separately.")
