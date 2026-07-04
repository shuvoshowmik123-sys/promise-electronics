param(
  [int]$Port = 65100,
  [string]$Hostname = "127.0.0.1",
  [ValidateSet("DEBUG", "INFO", "WARN", "ERROR")]
  [string]$LogLevel = "INFO",
  [switch]$Pure
)

$ErrorActionPreference = "Stop"

$opencode = Get-Command opencode -ErrorAction SilentlyContinue
if (-not $opencode) {
  $fallback = Join-Path $env:APPDATA "npm\node_modules\opencode-ai\bin\opencode.exe"
  if (Test-Path $fallback) {
    $opencodePath = $fallback
  } else {
    throw "OpenCode CLI was not found. Run: npm install -g opencode-ai@latest"
  }
} else {
  $opencodePath = $opencode.Source
}

$qaDir = Join-Path (Get-Location) ".qa\opencode"
New-Item -ItemType Directory -Force -Path $qaDir | Out-Null

$version = & $opencodePath --version
Write-Host "[OpenCode] CLI version: $version"
Write-Host "[OpenCode] Starting stable server at http://${Hostname}:$Port"
if ($Pure) {
  Write-Host "[OpenCode] Pure mode enabled: plugins are disabled for stability diagnosis."
}

$args = @(
  "serve",
  "--hostname", $Hostname,
  "--port", "$Port",
  "--print-logs",
  "--log-level", $LogLevel
)

if ($Pure) {
  $args += "--pure"
}

& $opencodePath @args
