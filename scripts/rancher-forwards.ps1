# Keep the Rancher cluster's infra reachable from Windows.
#
# Why a scheduled task and not a script in a terminal: processes spawned from an agent/terminal job are killed
# when that job ends, so `kubectl port-forward` children die with the shell that started them. Task Scheduler owns
# this process, so the forwards survive.
#
# Registered as task `NonameRancherForwards` (at logon + now). Stop with:
#   Stop-ScheduledTask -TaskName NonameRancherForwards
#
# Ports mirror scripts/rancher.mjs; keep the two in sync.

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo
$log = Join-Path $repo ".rancher-forwards.log"
function Write-Log($message) {
  "$(Get-Date -Format o) $message" | Out-File -FilePath $log -Append -Encoding utf8
}

# Task Scheduler does not always inherit the user PATH, so resolve kubectl explicitly.
$kubectl = (Get-Command kubectl -ErrorAction SilentlyContinue).Source
if (-not $kubectl) {
  $candidate = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages"
  $kubectl = (Get-ChildItem $candidate -Recurse -Filter kubectl.exe -ErrorAction SilentlyContinue |
    Select-Object -First 1 -ExpandProperty FullName)
}
if (-not $kubectl) {
  Write-Log "kubectl not found; aborting"
  exit 1
}
Write-Log "start; kubectl=$kubectl"

$forwards = @(
  @{ Name = "postgres";   Local = 25432; Remote = 5432 },
  @{ Name = "dragonfly";  Local = 16379; Remote = 6379 },
  @{ Name = "clickhouse"; Local = 18123; Remote = 8123 },
  @{ Name = "vault";      Local = 18200; Remote = 8200 },
  @{ Name = "keto";       Local = 14466; Remote = 4466 },
  @{ Name = "keto";       Local = 14467; Remote = 4467 },
  @{ Name = "s3";         Local = 19000; Remote = 9000 },
  @{ Name = "zitadel";    Local = 8080;  Remote = 8080 }
)

while ($true) {
  $children = @()
  foreach ($f in $forwards) {
    $children += Start-Process -FilePath $kubectl `
      -ArgumentList @("-n", "noname", "port-forward", "--address", "127.0.0.1", "svc/$($f.Name)", "$($f.Local):$($f.Remote)") `
      -WindowStyle Hidden -PassThru
  }

  # Re-check every 60 s; if any forward died, restart the whole set (cheap and idempotent).
  while ($true) {
    Start-Sleep -Seconds 60
    $dead = @($children | Where-Object { $_.HasExited })
    if ($dead.Count -gt 0) {
      foreach ($c in @($children | Where-Object { -not $_.HasExited })) {
        Stop-Process -Id $c.Id -Force -ErrorAction SilentlyContinue
      }
      break
    }
  }
  Start-Sleep -Seconds 3
}
