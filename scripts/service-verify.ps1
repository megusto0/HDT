param(
  [string]$ServiceName = 'HDTBgTracker',
  [int]$Port = 5174,
  [string]$DataDir = 'C:\Users\hecol\AppData\Roaming\HDTBgTracker'
)

$ErrorActionPreference = 'Stop'

$portStatePath = Join-Path $DataDir 'service-port.json'
if (!$PSBoundParameters.ContainsKey('Port') -and (Test-Path -LiteralPath $portStatePath)) {
  try {
    $portState = Get-Content -LiteralPath $portStatePath -Raw | ConvertFrom-Json
    if ($portState.port) {
      $Port = [int]$portState.port
    }
  }
  catch {
    Write-Warning "Could not read service port state from $portStatePath. Falling back to port $Port."
  }
}

$result = [ordered]@{
  serviceName = $ServiceName
  port = $Port
  dataDir = $DataDir
  serviceInstalled = $false
  serviceStatus = $null
  statsDbExists = Test-Path -LiteralPath (Join-Path $DataDir 'stats.db')
  gamesDirExists = Test-Path -LiteralPath (Join-Path $DataDir 'games')
  health = $null
  summary = $null
  recentGames = $null
  dashboardStatus = $null
}

$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($null -ne $service) {
  $result.serviceInstalled = $true
  $result.serviceStatus = [string]$service.Status
}

try {
  $result.health = Invoke-RestMethod -Uri "http://localhost:$Port/api/health" -TimeoutSec 3
}
catch {
  $result.health = @{ error = $_.Exception.Message }
}

try {
  $result.summary = Invoke-RestMethod -Uri "http://localhost:$Port/api/summary" -TimeoutSec 5
}
catch {
  $result.summary = @{ error = $_.Exception.Message }
}

try {
  $result.recentGames = Invoke-RestMethod -Uri "http://localhost:$Port/api/games?limit=3" -TimeoutSec 5
}
catch {
  $result.recentGames = @{ error = $_.Exception.Message }
}

try {
  $response = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:$Port/" -TimeoutSec 5
  $result.dashboardStatus = $response.StatusCode
}
catch {
  $result.dashboardStatus = $_.Exception.Message
}

$result | ConvertTo-Json -Depth 8
