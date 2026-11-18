$path = ".\frontend\src\pages\Approvals.tsx"
$s = Get-Content $path -Raw

$main = '(?m)^(\s*)\{/\* Main workflow description \*/\}\r?\n'
$general = '(?m)^(\s*)\{/\* General workflow details \*/\}\r?\n'
$file = '(?m)^(\s*)\{\(payload\.workflowType === ''file_assignment'' \|\|'

if ([regex]::Matches($s, $main).Count -ne 1 -or
    [regex]::Matches($s, $general).Count -ne 1 -or
    [regex]::Matches($s, $file).Count -ne 1) {
    throw "Expected markers not found exactly once. No changes saved."
}

$s = [regex]::Replace($s, $main, {
    param($m)
    $i = $m.Groups[1].Value
    return $i + "{!(payload.workflowType === 'file_assignment' || payload.fileAssignment) && (<>`r`n" + $m.Value
}, 1)

$s = [regex]::Replace($s, $general, {
    param($m)
    $i = $m.Groups[1].Value
    return $i + "</>)}`r`n" + $i + "{!(payload.workflowType === 'file_assignment' || payload.fileAssignment) && (<>`r`n" + $m.Value
}, 1)

$s = [regex]::Replace($s, $file, {
    param($m)
    return $m.Groups[1].Value + "</>)}`r`n" + $m.Value
}, 1)

$original = "(?m)^(\s*)\{renderDetail\(\r?\n\s*'Original File',"
if ([regex]::Matches($s, $original).Count -ne 1) {
    throw "Original File field not found exactly once. No changes saved."
}

$s = [regex]::Replace($s, $original, {
    param($m)
    return $m.Value -replace "'Original File',", "'Course',`r`n                          firstValue(payload.course, payload.courseName, workflow.courseCode)`r`n                        )}`r`n                        {renderDetail(`r`n                          'Assignment',`r`n                          firstValue(assignmentTitle, payload.assignment_title, payload.assignmentTitle, asRecord(payload.fileAssignment).draft?.title, workflow.title)`r`n                        )}`r`n                        {renderDetail(`r`n                          'Original File',"
}, 1)

Set-Content -Path $path -Value $s -Encoding UTF8
Write-Host "SUCCESS: Preview updated. Backend untouched." -ForegroundColor Green
