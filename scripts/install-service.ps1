param(
  [string]$ServiceName = 'HDTBgTracker',
  [string]$DisplayName = 'HDT Battlegrounds Tracker',
  [int]$Port = 5174,
  [string]$DataDir = 'C:\Users\hecol\AppData\Roaming\HDTBgTracker',
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'port-utils.ps1')

function Assert-Admin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Run this script from an elevated PowerShell session.'
  }
}

function XmlEscape([string]$value) {
  return [System.Security.SecurityElement]::Escape($value)
}

Assert-Admin

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$serviceDir = Join-Path $env:ProgramData 'HDTBgTracker\service'
$logsDir = Join-Path $env:ProgramData 'HDTBgTracker\logs'
$winswVersion = '2.12.0'
$winswUrl = "https://github.com/winsw/winsw/releases/download/v$winswVersion/WinSW.NET461.exe"
$serviceExe = Join-Path $serviceDir "$ServiceName.exe"
$serviceXml = Join-Path $serviceDir "$ServiceName.xml"

New-Item -ItemType Directory -Force -Path $serviceDir, $logsDir | Out-Null

if (!$SkipBuild) {
  Push-Location $root
  try {
    & corepack pnpm install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) { throw 'pnpm install failed.' }
    & corepack pnpm build
    if ($LASTEXITCODE -ne 0) { throw 'pnpm build failed.' }
  }
  finally {
    Pop-Location
  }
}

if (!(Test-Path -LiteralPath $serviceExe)) {
  Invoke-WebRequest -Uri $winswUrl -OutFile $serviceExe
}

$runScript = Join-Path $root 'scripts\run-service.ps1'
$escapedRunScript = XmlEscape $runScript
$escapedRoot = XmlEscape $root
$escapedDataDir = XmlEscape $DataDir
$escapedLogs = XmlEscape $logsDir
$escapedDisplay = XmlEscape $DisplayName

New-Item -ItemType Directory -Force -Path $DataDir | Out-Null

& $serviceExe stop 2>$null | Out-Null
& $serviceExe uninstall 2>$null | Out-Null

$resolvedPort = Resolve-ServicePort -PreferredPort $Port
if ($resolvedPort -ne $Port) {
  Write-Warning "Port $Port is already in use. Installing service on free port $resolvedPort."
}

@"
<service>
  <id>$ServiceName</id>
  <name>$escapedDisplay</name>
  <description>Local API and web dashboard for HDT Battlegrounds Tracker.</description>
  <executable>powershell.exe</executable>
  <arguments>-NoProfile -ExecutionPolicy Bypass -File "$escapedRunScript" -Port $resolvedPort -Root "$escapedRoot" -DataDir "$escapedDataDir"</arguments>
  <workingdirectory>$escapedRoot</workingdirectory>
  <logpath>$escapedLogs</logpath>
  <log mode="roll-by-size">
    <sizeThreshold>10485760</sizeThreshold>
    <keepFiles>8</keepFiles>
  </log>
  <onfailure action="restart" delay="10 sec" />
</service>
"@ | Set-Content -LiteralPath $serviceXml -Encoding UTF8

& $serviceExe install
& $serviceExe start

Write-Host "$DisplayName service installed and started."
Write-Host "Dashboard: http://localhost:$resolvedPort"
