from pathlib import Path
from datetime import datetime

path = Path("frontend/src/pages/Approvals.tsx")
source = path.read_text(encoding="utf-8")

backup = path.with_name(
    f"Approvals.tsx.backup_disable_clarification_{datetime.now():%Y%m%d_%H%M%S}"
)
backup.write_text(source, encoding="utf-8")

old = """onClick={() => handleAuthorize(workflow)}
                        disabled={isCurrentlyExecuting}"""

new = """onClick={() => handleAuthorize(workflow)}
                        disabled={
                          isCurrentlyExecuting ||
                          workflow.status === 'needs_clarification'
                        }"""

if old not in source:
    raise SystemExit("STOP: Authorize button code not found. No changes made.")

source = source.replace(old, new, 1)

old_label = """{isCurrentlyExecuting
                          ? 'Executing...'
                          : 'Authorize & Execute on Moellim'}"""

new_label = """{isCurrentlyExecuting
                          ? 'Executing...'
                          : workflow.status === 'needs_clarification'
                            ? 'Clarification Required'
                            : 'Authorize & Execute on Moellim'}"""

if old_label not in source:
    raise SystemExit("STOP: Authorize button label not found. No changes made.")

source = source.replace(old_label, new_label, 1)
path.write_text(source, encoding="utf-8")

print("SAFETY PATCH APPLIED")
print("Backup:", backup)
