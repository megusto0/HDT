param(
  [string]$ServiceName = 'HDTBgTracker'
)

$ErrorActionPreference = 'Stop'

function Assert-Admin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Run this script from an elevated PowerShell session.'
  }
}

Assert-Admin

$serviceDir = Join-Path $env:ProgramData 'HDTBgTracker\service'
$serviceExe = Join-Path $serviceDir "$ServiceName.exe"

if (!(Test-Path -LiteralPath $serviceExe)) {
  Write-Host "Service wrapper not found: $serviceExe"
  exit 0
}

& $serviceExe stop 2>$null | Out-Null
& $serviceExe uninstall

Write-Host "$ServiceName service uninstalled."

