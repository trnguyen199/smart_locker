$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$SimEntry = Join-Path $Root 'simulation\backend\dist\backend\src\index.js'

if (-not (Test-Path $SimEntry)) {
    Write-Host "Building simulation..." -ForegroundColor Yellow
    Push-Location (Join-Path $Root 'simulation')
    cmd /c npm run build
    Pop-Location
}

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " SMART LOCKER UNIFIED DEMO LAUNCHER" -ForegroundColor Cyan
Write-Host " Web + API: http://127.0.0.1:8000" -ForegroundColor Green
Write-Host " Simulation 3D + Hardware: http://127.0.0.1:3001" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Cyan

$simJob = Start-Process -FilePath "node" -ArgumentList @($SimEntry) -WorkingDirectory (Join-Path $Root 'simulation') -PassThru -NoNewWindow
try {
    Set-Location $Root
    php -S 127.0.0.1:8000 router.php
} finally {
    if ($simJob -and -not $simJob.HasExited) {
        Stop-Process -Id $simJob.Id -Force -ErrorAction SilentlyContinue
    }
}
