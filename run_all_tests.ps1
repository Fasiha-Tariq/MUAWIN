$ErrorActionPreference = "Stop"

Write-Host "`n==========================================" -ForegroundColor Cyan
Write-Host " 1/3: Running Backend Pytest Suite" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
python -m pytest backend/tests -v

Write-Host "`n==========================================" -ForegroundColor Cyan
Write-Host " 2/3: Running Frontend Vitest Suite" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Push-Location frontend
npx vitest run

Write-Host "`n==========================================" -ForegroundColor Cyan
Write-Host " 3/3: Running Full-Stack Playwright E2E" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
npx playwright test
Pop-Location

Write-Host "`nALL MUAWIN SYSTEM TESTS PASSED SUCCESSFULLY!" -ForegroundColor Green
