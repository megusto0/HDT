param(
  [int]$Port = 5174,
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$DataDir = (Join-Path $env:APPDATA 'HDTBgTracker')
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'port-utils.ps1')

$serverDist = Join-Path $Root 'server\dist\index.js'
$webDist = Join-Path $Root 'webapp\dist'

if (!(Test-Path -LiteralPath $serverDist)) {
  throw "Server build not found: $serverDist. Run corepack pnpm build first."
}

if (!(Test-Path -LiteralPath (Join-Path $webDist 'index.html'))) {
  throw "Web build not found: $webDist. Run corepack pnpm build first."
}

$resolvedPort = Resolve-ServicePort -PreferredPort $Port
if ($resolvedPort -ne $Port) {
  Write-Warning "Port $Port is already in use. Starting on free port $resolvedPort."
}

New-Item -ItemType Directory -Force -Path $DataDir | Out-Null

$portState = [ordered]@{
  port = $resolvedPort
  url = "http://localhost:$resolvedPort"
  updatedAt = (Get-Date).ToString('o')
}
$portState | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $DataDir 'service-port.json') -Encoding UTF8

$env:NODE_ENV = 'production'
$env:PORT = [string]$resolvedPort
$env:WEB_ORIGIN = "http://localhost:$resolvedPort"
$env:STATIC_DIR = $webDist
$env:HDT_BG_TRACKER_DATA = $DataDir

Set-Location -LiteralPath (Join-Path $Root 'server')
& node $serverDist
exit $LASTEXITCODE
