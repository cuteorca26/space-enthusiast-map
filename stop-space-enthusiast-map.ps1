$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$node = Join-Path $root "runtime\node.exe"
$pidFile = Join-Path $root "data\server.pid"

if (-not (Test-Path -LiteralPath $pidFile)) {
  Write-Host "No running release process was recorded." -ForegroundColor Yellow
  exit 0
}

$serverPid = [int](Get-Content -LiteralPath $pidFile -Raw).Trim()
$process = Get-Process -Id $serverPid -ErrorAction SilentlyContinue
if ($process) {
  $path = $process.Path
  if ($path -and ([System.IO.Path]::GetFullPath($path) -ne [System.IO.Path]::GetFullPath($node))) {
    throw "The recorded process is not the bundled application runtime. It was not stopped."
  }
  Stop-Process -Id $serverPid -Force
}
Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
Write-Host "Space Enthusiast Map has stopped." -ForegroundColor Green
