<#
  SecureSphere one-click launcher for Windows (local development mode).

  Double-click start.bat, or run:  powershell -ExecutionPolicy Bypass -File start.ps1
  Options:
    -SetupOnly   install dependencies and prepare the database, but do not start servers
    -NoBrowser   do not open the browser automatically

  Safe to run repeatedly: every step skips work that is already done.
#>
param(
    [switch]$SetupOnly,
    [switch]$NoBrowser
)

# Native tools (alembic, npm) log to stderr; failures are detected via $LASTEXITCODE instead.
$ErrorActionPreference = 'Continue'
$Root = $PSScriptRoot
$Backend = Join-Path $Root 'backend'
$Frontend = Join-Path $Root 'frontend'
$Python = Join-Path $Backend '.venv\Scripts\python.exe'
$AppUrl = 'http://localhost:5180'

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Red }
function Info($msg) { Write-Host "    $msg" -ForegroundColor Gray }
function Fail($msg) {
    Write-Host "`nERROR: $msg" -ForegroundColor Yellow
    Read-Host 'Press Enter to close'
    exit 1
}

Write-Host ''
Write-Host '  SECURESPHERE  local launcher' -ForegroundColor White

# --- 1. Tools ---------------------------------------------------------------
Step 'Checking required tools'
$uv = (Get-Command uv -ErrorAction SilentlyContinue).Source
if (-not $uv) {
    $uv = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Filter uv.exe -Recurse -ErrorAction SilentlyContinue |
        Select-Object -First 1 -ExpandProperty FullName
}
if (-not $uv) {
    Fail "uv (Python manager) is not installed. Install it with:`n    winget install --id astral-sh.uv -e`nthen run this launcher again."
}
Info "uv:   $uv"
$npm = (Get-Command npm -ErrorAction SilentlyContinue).Source
if (-not $npm) { Fail 'Node.js is not installed. Install it from https://nodejs.org (LTS) and run this launcher again.' }
Info "node: $(node -v)"

# --- 2. Backend -------------------------------------------------------------
Step 'Installing backend dependencies (Python 3.12 via uv)'
Push-Location $Backend
try {
    & $uv sync --frozen --quiet
    if ($LASTEXITCODE -ne 0) { Fail 'uv sync failed (see output above).' }

    if (-not (Test-Path '.env')) {
        Info 'Creating backend/.env for local development'
        @(
            'SS_ENVIRONMENT=development'
            "SS_FRONTEND_URL=$AppUrl"
            "SS_CORS_ORIGINS=$AppUrl,http://127.0.0.1:5180"
        ) | Set-Content -Encoding ascii '.env'
    }

    Step 'Preparing the database (migrations)'
    & $Python -m alembic upgrade head
    if ($LASTEXITCODE -ne 0) { Fail 'Database migration failed.' }

    $adminCount = & $Python -c "from sqlalchemy import select, func; from app.core.database import SessionLocal; from app.models import User; db=SessionLocal(); print(db.scalar(select(func.count()).select_from(User).where(User.role=='admin')))" 2>$null
    if ([int]$adminCount -eq 0) {
        Step 'Create your administrator account'
        Info 'No admin exists yet. Choose the email and password you will sign in with.'
        Info 'Password: at least 12 characters, not containing your email or name.'
        $email = Read-Host '    Admin email (e.g. you@example.com)'
        $name = Read-Host '    Your name'
        if (-not $name) { $name = 'Administrator' }
        do {
            & $Python -m app.cli create-admin --email $email --name $name
            $ok = $LASTEXITCODE -eq 0
            if (-not $ok) {
                Write-Host '    Try again.' -ForegroundColor Yellow
                $email = Read-Host '    Admin email'
            }
        } until ($ok)

        $seed = Read-Host '    Add 120 sample security events so the charts have data? (y/N)'
        if ($seed -match '^[yY]') { & $Python -m app.cli seed-demo | Out-Null; Info 'Sample events added (labelled "sample").' }
    } else {
        Info "Administrator account already exists ($adminCount)."
    }
} finally {
    Pop-Location
}

# --- 3. Frontend ------------------------------------------------------------
Step 'Installing frontend dependencies'
Push-Location $Frontend
try {
    if (-not (Test-Path 'node_modules')) {
        npm ci --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { Fail 'npm ci failed (see output above).' }
    } else {
        Info 'Already installed.'
    }
} finally {
    Pop-Location
}

if ($SetupOnly) {
    Step 'Setup complete. Run start.bat to launch the app.'
    exit 0
}

# --- 4. Launch --------------------------------------------------------------
function Test-Port($port) {
    $null -ne (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}
if (Test-Port 8000) { Fail 'Port 8000 is already in use. Close the program using it (or a previous SecureSphere window) and try again.' }
if (Test-Port 5180) { Fail 'Port 5180 is already in use. Close the program using it (or a previous SecureSphere window) and try again.' }

Step 'Starting the API (port 8000) and the web app (port 5180)'
$Host.UI.RawUI.WindowTitle = 'SecureSphere (close this window to stop)'
# Both servers share this console: their logs appear here and Ctrl+C / closing the window stops both.
$api = Start-Process -FilePath $Python -WorkingDirectory $Backend -NoNewWindow -PassThru -ArgumentList @(
    '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000'
)
$web = Start-Process -FilePath 'npm.cmd' -WorkingDirectory $Frontend -NoNewWindow -PassThru -ArgumentList @('run', 'dev')

function Stop-Servers {
    foreach ($p in @($api, $web)) {
        if ($p -and -not $p.HasExited) {
            # /T also stops the node/vite child that npm started.
            & taskkill.exe /PID $p.Id /T /F 2>&1 | Out-Null
        }
    }
}

try {
    Info 'Waiting for the servers to start...'
    $deadline = (Get-Date).AddSeconds(60)
    $ready = $false
    while ((Get-Date) -lt $deadline -and -not $api.HasExited -and -not $web.HasExited) {
        try {
            $res = Invoke-WebRequest "$AppUrl/api/v1/health/ready" -UseBasicParsing -TimeoutSec 2
            if ($res.StatusCode -eq 200) { $ready = $true; break }
        } catch { Start-Sleep -Milliseconds 800 }
    }
    if (-not $ready) {
        Stop-Servers
        Fail 'The servers did not start. Scroll up in this window for the error message.'
    }

    Write-Host ''
    Write-Host "  SecureSphere is running at $AppUrl" -ForegroundColor Green
    Write-Host '  API docs:  http://localhost:8000/api/docs'
    Write-Host '  Reset-password emails (dev): backend\var\dev_mail\'
    Write-Host '  To stop: press Ctrl+C or close this window.' -ForegroundColor Yellow
    Write-Host ''
    if (-not $NoBrowser) { Start-Process $AppUrl }

    while (-not $api.HasExited -and -not $web.HasExited) { Start-Sleep -Seconds 1 }
    if ($api.HasExited) { Write-Host 'The API stopped unexpectedly (see the log above).' -ForegroundColor Yellow }
    if ($web.HasExited) { Write-Host 'The web server stopped unexpectedly (see the log above).' -ForegroundColor Yellow }
} finally {
    Stop-Servers
    Write-Host 'SecureSphere stopped.'
}
