from pathlib import Path
from datetime import datetime

path = Path("frontend/src/pages/Approvals.tsx")
source = path.read_text(encoding="utf-8")

backup = path.with_name(
    f"Approvals.tsx.backup_clarification_{datetime.now():%Y%m%d_%H%M%S}"
)
backup.write_text(source, encoding="utf-8")

old_filter = """        'waiting_approval',
        'pending_approval',
        'needs_approval',
        'pending',
        'approved',
        'executing',"""

new_filter = """        'waiting_approval',
        'pending_approval',
        'needs_approval',
        'needs_clarification',
        'pending',
        'approved',
        'executing',"""

if old_filter not in source:
    raise SystemExit("STOP: Approval status filter not found. No changes made.")

source = source.replace(old_filter, new_filter, 1)

old_card = '<div className="space-y-4 p-5">'

new_card = '''<div className="space-y-4 p-5">
                  {(workflow.status === 'needs_clarification' ||
                    payload.clarification_question) && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                      <h4 className="text-sm font-bold text-amber-900">
                        Assignment clarification required
                      </h4>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-amber-800">
                        {payload.clarification_question ||
                         (workflow as any).clarification_question ||
                         workflow.error ||
                         'Please provide the missing assignment details.'}
                      </p>
                    </div>
                  )}'''

if old_card not in source:
    raise SystemExit("STOP: Approval card insertion point not found. No changes made.")

source = source.replace(old_card, new_card, 1)
path.write_text(source, encoding="utf-8")

print("PATCH APPLIED")
print("Backup:", backup)
