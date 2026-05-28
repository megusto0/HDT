param(
  [int]$Port = 5174,
  [string]$DataDir = 'C:\Users\hecol\AppData\Roaming\HDTBgTracker'
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

Push-Location $root
try {
  & corepack pnpm build
  if ($LASTEXITCODE -ne 0) { throw 'pnpm build failed.' }
}
finally {
  Pop-Location
}

& (Join-Path $PSScriptRoot 'run-service.ps1') -Port $Port -Root $root -DataDir $DataDir
