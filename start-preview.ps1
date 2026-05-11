$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$frontend = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
$backend = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue

if (-not ($frontend -and $backend)) {
  Start-Process -FilePath 'cmd.exe' -ArgumentList '/k', 'npm run dev:all' -WorkingDirectory $root
  Start-Sleep -Seconds 5
}

Start-Process 'http://127.0.0.1:3000'
