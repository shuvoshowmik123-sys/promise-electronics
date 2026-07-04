param(
  [int]$Port = 65026,
  [int]$IntervalSeconds = 30,
  [int]$DurationMinutes = 60
)

$ErrorActionPreference = "Continue"

$qaDir = Join-Path (Get-Location) ".qa\opencode"
New-Item -ItemType Directory -Force -Path $qaDir | Out-Null

$logPath = Join-Path $qaDir "sidecar-monitor.log"
$endAt = (Get-Date).AddMinutes($DurationMinutes)

"timestamp,port,listening,states,ownerPid,ownerName,httpStatus,note" | Set-Content -Path $logPath

while ((Get-Date) -lt $endAt) {
  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  $connections = @(Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue)
  $listen = $connections | Where-Object { $_.State -eq "Listen" } | Select-Object -First 1
  $states = ($connections | Group-Object State | ForEach-Object { "$($_.Name):$($_.Count)" }) -join "|"
  $ownerPid = if ($listen) { $listen.OwningProcess } else { "" }
  $ownerName = ""
  if ($ownerPid) {
    $owner = Get-Process -Id $ownerPid -ErrorAction SilentlyContinue
    if ($owner) {
      $ownerName = $owner.ProcessName
    }
  }

  $httpStatus = ""
  $note = ""
  try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port" -UseBasicParsing -TimeoutSec 5
    $httpStatus = [int]$response.StatusCode
  } catch {
    if ($_.Exception.Response) {
      $httpStatus = [int]$_.Exception.Response.StatusCode
      $note = "responded"
    } else {
      $note = ($_.Exception.Message -replace ",", ";")
    }
  }

  "$timestamp,$Port,$([bool]$listen),$states,$ownerPid,$ownerName,$httpStatus,$note" | Add-Content -Path $logPath
  Start-Sleep -Seconds $IntervalSeconds
}

Write-Host "[OpenCode] Monitor complete: $logPath"
