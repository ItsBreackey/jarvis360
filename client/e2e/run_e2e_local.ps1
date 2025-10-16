# Convenience helper to run Playwright E2E locally.
# Usage: From repo root run: \"& .\client\e2e\run_e2e_local.ps1\"

Param()

Write-Host "Building client..."
Push-Location "$(Join-Path $PSScriptRoot '..')"
npm ci
npm run build
Pop-Location

Write-Host "Starting Django and serve (in background)..."
Set-Location "$(Resolve-Path $PSScriptRoot\'..\..')"
& venv\Scripts\Activate.ps1
Start-Process -NoNewWindow -FilePath python -ArgumentList 'manage.py','runserver','127.0.0.1:8000'
Start-Process -NoNewWindow -FilePath npx -ArgumentList 'serve','-s','build','-l','3000' -WorkingDirectory "$(Join-Path $PSScriptRoot '..')"

Write-Host "Waiting 3s for servers to start..."
Start-Sleep -s 3

Write-Host "Running Playwright tests..."
Set-Location "$(Join-Path $PSScriptRoot '..')"
$env:E2E_AUTO_START='1'
npx playwright test e2e/tests/login_upload_save.spec.js --project=chromium --reporter=list

Write-Host "E2E run finished. You may need to stop the background servers manually." 
