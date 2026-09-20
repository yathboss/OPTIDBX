param([switch]$Dashboard)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if ($Dashboard) {
    Push-Location (Join-Path $projectRoot 'dashboard')
    try { & npm.cmd run dev -- --host 127.0.0.1 }
    finally { Pop-Location }
} else {
    & "$env:WINDIR/System32/wsl.exe" -d Ubuntu --cd $projectRoot -- bash scripts/run_local_api.sh
}
exit $LASTEXITCODE
