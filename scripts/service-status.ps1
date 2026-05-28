param(
  [string]$ServiceName = 'HDTBgTracker'
)

$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($null -eq $service) {
  Write-Host "$ServiceName is not installed."
  exit 1
}

$service | Format-List Name,DisplayName,Status,StartType
