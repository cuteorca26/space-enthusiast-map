param([switch]$NoBrowser)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$node = Join-Path $root "runtime\node.exe"
$dataDir = Join-Path $root "data"
$logDir = Join-Path $root "logs"
$pidFile = Join-Path $dataDir "server.pid"

if (-not (Test-Path -LiteralPath $node)) {
  throw "Bundled Node.js runtime was not found: $node"
}

function Test-SpaceMap([int]$Port) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/api/sources" -TimeoutSec 2
    return $response.StatusCode -eq 200 -and $response.Content -match "FAA NOTAM"
  } catch {
    return $false
  }
}

function Test-PortInUse([int]$Port) {
  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $task = $client.ConnectAsync("127.0.0.1", $Port)
    return $task.Wait(250) -and $client.Connected
  } catch {
    return $false
  } finally {
    $client.Dispose()
  }
}

$port = 8875
if (-not (Test-SpaceMap $port)) {
  New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
  New-Item -ItemType Directory -Path $logDir -Force | Out-Null
  Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
  while ((Test-PortInUse $port) -and $port -lt 8885) {
    $port += 1
  }
  if (Test-PortInUse $port) {
    throw "Ports 8875-8885 are already in use. The application cannot start."
  }

  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $stdoutLog = Join-Path $logDir "server-$stamp.stdout.log"
  $stderrLog = Join-Path $logDir "server-$stamp.stderr.log"
  $process = Start-Process -FilePath $node -ArgumentList @("server.mjs", "--port=$port") -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog -PassThru
  Set-Content -LiteralPath $pidFile -Value $process.Id -Encoding Ascii
  Set-Content -LiteralPath (Join-Path $dataDir "server-log-path.txt") -Value @($stdoutLog, $stderrLog) -Encoding UTF8
  $ready = $false
  for ($attempt = 0; $attempt -lt 60; $attempt += 1) {
    Start-Sleep -Milliseconds 500
    if (Test-SpaceMap $port) {
      $ready = $true
      break
    }
  }
  if (-not $ready) {
    if ($process.HasExited) {
      $errorText = if (Test-Path -LiteralPath $stderrLog) { (Get-Content -LiteralPath $stderrLog -Raw -ErrorAction SilentlyContinue).Trim() } else { "" }
      throw "The application process exited before startup completed. $errorText Logs: $stderrLog"
    }
    throw "The application did not become ready within 30 seconds. Logs: $stdoutLog ; $stderrLog"
  }
}

$url = "http://127.0.0.1:$port/"
if (-not $NoBrowser) {
  $explorer = Join-Path $env:SystemRoot "explorer.exe"
  if (Test-Path -LiteralPath $explorer) {
    Start-Process -FilePath $explorer -ArgumentList $url | Out-Null
  } else {
    Start-Process -FilePath $url | Out-Null
  }
}
Write-Host "Space Enthusiast Map is running: $url" -ForegroundColor Green
