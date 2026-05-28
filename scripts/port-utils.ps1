function Test-TcpPortAvailable {
  param(
    [Parameter(Mandatory = $true)]
    [int]$Port
  )

  if ($Port -lt 1 -or $Port -gt 65535) {
    return $false
  }

  $listener = $null
  try {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
    $listener.Start()
    return $true
  }
  catch {
    return $false
  }
  finally {
    if ($null -ne $listener) {
      $listener.Stop()
    }
  }
}

function Get-FreeTcpPort {
  $listener = $null
  try {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    $listener.Start()
    return [int]$listener.LocalEndpoint.Port
  }
  finally {
    if ($null -ne $listener) {
      $listener.Stop()
    }
  }
}

function Resolve-ServicePort {
  param(
    [int]$PreferredPort = 5174
  )

  if (Test-TcpPortAvailable -Port $PreferredPort) {
    return $PreferredPort
  }

  return Get-FreeTcpPort
}
