$path = ".\frontend\src\pages\Approvals.tsx"
$s = Get-Content $path -Raw

$old = @"
                  {/* Main workflow description */}
                  <div>
"@

$new = @"
                  {!(payload.workflowType === 'file_assignment' || payload.fileAssignment) && (
                  <>
                  {/* Main workflow description */}
                  <div>
"@

if (-not $s.Contains($old)) { throw "Main preview start not found" }
$s = $s.Replace($old, $new)

$old = @"
                  {/* General workflow details */}
"@

$new = @"
                  </>
                  )}
                  {!(payload.workflowType === 'file_assignment' || payload.fileAssignment) && (
                  <>
                  {/* General workflow details */}
"@

if (-not $s.Contains($old)) { throw "General details start not found" }
$s = $s.Replace($old, $new)

$old = @"
                  {(payload.workflowType === 'file_assignment' ||
"@

$new = @"
                  </>
                  )}
                  {(payload.workflowType === 'file_assignment' ||
"@

if (-not $s.Contains($old)) { throw "File assignment preview start not found" }
$s = $s.Replace($old, $new)

$old = @"
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {renderDetail(
                          'Original File',
"@

$new = @"
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {renderDetail('Course', firstValue(payload.course, payload.courseName, workflow.courseCode))}
                        {renderDetail('Assignment', firstValue(assignmentTitle, payload.assignment_title, payload.assignmentTitle, asRecord(payload.fileAssignment).draft?.title, workflow.title))}
                        {renderDetail(
                          'Original File',
"@

if (-not $s.Contains($old)) { throw "File preview fields insertion point not found" }
$s = $s.Replace($old, $new)

Set-Content $path $s -Encoding UTF8
Write-Host "SUCCESS: File assignment preview updated."
