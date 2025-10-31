# Start E2E environment: Django (127.0.0.1:8000) and static client server (127.0.0.1:3000)
# Usage: From repo root run: .\scripts\start_e2e_env.ps1

Param()

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path | Split-Path -Parent
$clientDir = Join-Path $repoRoot 'client'

Write-Host "Starting Django server from $repoRoot (127.0.0.1:8000)"
Start-Process -NoNewWindow -WorkingDirectory $repoRoot -FilePath "python" -ArgumentList "manage.py runserver 127.0.0.1:8000" -WindowStyle Hidden

Start-Sleep -Seconds 2

Write-Host "Starting static server for client build from $clientDir (127.0.0.1:3000)"
# Use npx serve so there's no global dependency required
Start-Process -NoNewWindow -WorkingDirectory $clientDir -FilePath "npx.cmd" -ArgumentList "serve -s build -l 3000" -WindowStyle Hidden

Write-Host "Servers started (check logs in client/test-results for details)." 
Write-Host "Run Playwright tests with: (cd client; npx playwright test)"
