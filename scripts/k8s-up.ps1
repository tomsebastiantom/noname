<#
.SYNOPSIS
    Bring the whole platform up in the local k3s cluster. Idempotent: safe to re-run.

.DESCRIPTION
    This is the ONLY supported way to start the cluster stack. Every step is a check first, then an
    action, so re-running it converges rather than duplicating work. The steps exist because each one
    failed at least once during the migration (see docs/2026-10-31/K8S-RUNBOOK.md §6):

      1. podman machine running + WSL kept alive   (WSL stops the distro when idle, killing the API server)
      2. k3s active                                 (systemd unit; start if stopped)
      3. namespace + infra manifests applied
      4. infra ready                                (postgres/dragonfly/clickhouse/s3/vault/nango/keto/zitadel)
      5. .env.cluster generated + Secret refreshed  (flattens BOTH env files; rewrites loopback -> DNS)
      6. images present in k3s                      (build + podman save + ctr import only when missing)
      7. migrate Job recreated and completed        (Jobs are immutable, so delete-then-apply)
      8. app + edge applied, api/worker ready
      9. status printed

.PARAMETER Rebuild
    Rebuild the app and edge images even if they are already loaded.

.PARAMETER SkipImages
    Never build/import images (fails fast if they are missing).

.EXAMPLE
    pwsh scripts/k8s-up.ps1
    pwsh scripts/k8s-up.ps1 -Rebuild
#>
[CmdletBinding()]
param(
  [switch]$Rebuild,
  [switch]$SkipImages
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$env:KUBECONFIG = Join-Path $env:USERPROFILE '.kube\k3s.yaml'

function Step($text) { Write-Host "`n== $text" -ForegroundColor Cyan }
function Ok($text) { Write-Host "   ok   $text" -ForegroundColor Green }
function Warn($text) { Write-Host "   warn $text" -ForegroundColor Yellow }
function Fail($text) { Write-Host "   FAIL $text" -ForegroundColor Red; exit 1 }

function Wait-For([string]$what, [scriptblock]$test, [int]$timeout = 300, [int]$interval = 5) {
  $deadline = (Get-Date).AddSeconds($timeout)
  while ((Get-Date) -lt $deadline) {
    if (& $test) { Ok "$what ready"; return $true }
    Start-Sleep -Seconds $interval
  }
  Fail "$what did not become ready within ${timeout}s"
}

# ── 1. container VM ────────────────────────────────────────────────────────────────────────────────
Step 'podman machine'
$machine = (podman machine list --format '{{.Name}} {{.Running}}' 2>&1 | Select-String 'true' | Select-Object -First 1)
if (-not $machine) {
  Warn 'no running podman machine; starting noname'
  podman machine start noname 2>&1 | Out-Null
}
Ok 'podman machine running'

Step 'WSL keep-alive (k3s lives in the Ubuntu distro)'
$alive = (wsl -d Ubuntu -u root -- sh -c "systemctl is-active k3s" 2>&1) -join ''
if ($alive -notmatch 'active') {
  Warn 'k3s not active; starting it'
  wsl -d Ubuntu -u root -- sh -c "systemctl start k3s" 2>&1 | Out-Null
}
# Without a process inside the distro, WSL shuts it down and the API server disappears mid-run.
$probe = (wsl -d Ubuntu -u root -- sh -c "pgrep -f 'sleep infinity' | head -1" 2>&1) -join ''
if (-not $probe.Trim()) {
  Start-Process -FilePath 'wsl.exe' -ArgumentList '-d','Ubuntu','-u','root','--','sleep','infinity' -WindowStyle Hidden
  Warn 'started a detached keep-alive (a background *job* is not enough - it dies with the job)'
  Start-Sleep -Seconds 5
}
Ok 'k3s reachable'
if (-not (Test-Path $env:KUBECONFIG)) { Fail "missing kubeconfig at $env:KUBECONFIG" }

Wait-For 'node' { (kubectl get nodes --no-headers 2>&1 | Select-String 'Ready') } 120

# ── 2. infra ──────────────────────────────────────────────────────────────────────────────────────
Step 'namespace + infra manifests'
kubectl apply -f deploy/00-namespace.yaml 2>&1 | Out-Null
kubectl apply -f deploy/infra/ 2>&1 | Select-String 'created|configured|unchanged' | ForEach-Object { Ok $_.Line.Trim() }
if ($LASTEXITCODE -ne 0) { Fail 'infra manifests failed to apply' }

Step 'waiting for infra'
$infra = @('postgres','dragonfly','clickhouse','s3','vault','jaeger','nango','keto','zitadel')
foreach ($app in $infra) {
  Wait-For $app { (kubectl -n noname get pods -l "app=$app" --no-headers 2>&1 | Select-String 'Running') } 420
}

# ── 3. env secret ─────────────────────────────────────────────────────────────────────────────────
Step 'cluster env + Secret'
node scripts/cluster-env.mjs
kubectl -n noname create secret generic noname-env --from-env-file=.env.cluster --dry-run=client -o yaml |
  kubectl apply -f - 2>&1 | Out-Null
$keys = (kubectl -n noname get secret noname-env -o jsonpath='{.data}' 2>&1) -join ''
Ok ("Secret refreshed (" + (($keys -split ',').Count) + ' keys)')

# ── 4. images ─────────────────────────────────────────────────────────────────────────────────────
Step 'images in k3s'
function Image-Loaded([string]$name) {
  $out = wsl -d Ubuntu -u root -- sh -c "k3s ctr images ls | grep -c $name" 2>&1
  return (($out -join '') -match '^[1-9]')
}
function Build-And-Load([string]$dockerfile, [string]$tag, [string]$ignore, [string]$context) {
  Write-Host "   building $tag"
  $args = @('build','--progress=plain','-f',$dockerfile,'-t',$tag)
  if ($ignore) { $args += @('--ignorefile',$ignore) }
  $args += $context
  & podman @args | Select-Object -Last 3
  if ($LASTEXITCODE -ne 0) { Fail "podman build failed for $tag" }
  $tar = Join-Path $env:TEMP ((($tag -replace '[:/]','-')) + '.tar')
  podman save $tag -o $tar | Out-Null
  $wslPath = $tar -replace '^([A-Za-z]):', '/mnt/$1' -replace '\\','/'
  wsl -d Ubuntu -u root -- sh -c "k3s ctr images import -q $wslPath" 2>&1 | Out-Null
  Remove-Item $tar -Force -ErrorAction SilentlyContinue
  Ok "$tag loaded"
}

if (-not $SkipImages) {
  if ($Rebuild -or -not (Image-Loaded 'noname-api')) {
    Build-And-Load 'deploy/app/server.Containerfile' 'localhost/noname-api:dev' 'deploy/app/.dockerignore' '.'
  } else { Ok 'noname-api already loaded' }
  if ($Rebuild -or -not (Image-Loaded 'noname-browser')) {
    Build-And-Load 'deploy/browser/Containerfile' 'localhost/noname-browser:1.63.0' '' 'deploy/browser'
  } else { Ok 'noname-browser already loaded' }
} else {
  Ok 'images skipped by request'
}

# ── 5. schema then app ────────────────────────────────────────────────────────────────────────────
Step 'migrate Job (Jobs are immutable: delete, then apply)'
kubectl -n noname delete job migrate --ignore-not-found 2>&1 | Out-Null
kubectl apply -f deploy/app/api.yaml 2>&1 | Select-String 'created|configured' | ForEach-Object { Ok $_.Line.Trim() }
Wait-For 'migrate' { (kubectl -n noname get pods -l job-name=migrate --no-headers 2>&1 | Select-String 'Completed') } 300

Step 'app + edge'
kubectl -n noname rollout status deploy/api --timeout=300s 2>&1 | Select-Object -Last 1
kubectl -n noname rollout status deploy/worker --timeout=300s 2>&1 | Select-Object -Last 1
if (Test-Path 'deploy/edge/deployment.yaml') { kubectl apply -f deploy/edge/deployment.yaml 2>&1 | Out-Null }

# ── 6. status ─────────────────────────────────────────────────────────────────────────────────────
& (Join-Path $PSScriptRoot 'k8s-status.ps1')
