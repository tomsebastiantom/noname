<#
.SYNOPSIS
    Deliberately (re)initialise platform identity in the cluster, then seed.

.DESCRIPTION
    Identity is the one step that must NOT be automatic. `pnpm init:zitadel` mints *new* org / project /
    client IDs; running it invalidates every existing token and rewrites `.env`, `wrangler.toml`,
    `oidc.json` and the cluster Secret. That is fine when it is intentional and disastrous when it
    happens because a script "converged".

    So it stays a deliberate act, but the four manual steps that used to surround it were the actual
    error surface (forgetting to regenerate the Secret; seeding before identity existed). This script
    performs the whole sequence in order, and refuses to run without an explicit confirmation flag:

      port-forward zitadel:8080  ->  pnpm init:zitadel  ->  regenerate .env.cluster + Secret
        ->  restart api/worker  ->  seed Job  ->  verify  ->  close port-forward

    Why a port-forward: `init:zitadel` runs on the host and talks to `http://localhost:8080`, which is
    also the issuer baked into every token. Inside the cluster that name is served by the
    `localhost-proxy` socat sidecar (see deploy/app/api.yaml), so host and pods agree on the issuer.

.PARAMETER Yes
    Required. Confirms that re-issuing identity is intended.

.PARAMETER SkipSeed
    Initialise identity but do not seed.

.EXAMPLE
    pwsh scripts/k8s-identity.ps1 -Yes
#>
[CmdletBinding()]
param(
  [switch]$Yes,
  [switch]$SkipSeed
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$env:KUBECONFIG = Join-Path $env:USERPROFILE '.kube\k3s.yaml'

if (-not $Yes) {
  Write-Host ''
  Write-Host '  This RE-ISSUES identity:' -ForegroundColor Yellow
  Write-Host '    - new ZITADEL org / project / client IDs'
  Write-Host '    - rewrites .env, wrangler.toml, oidc.json and the cluster Secret'
  Write-Host '    - every existing token becomes invalid'
  Write-Host ''
  Write-Host '  Re-run with -Yes if that is what you want.' -ForegroundColor Yellow
  exit 2
}

function Step($t) { Write-Host "`n== $t" -ForegroundColor Cyan }

# ── 1. zitadel reachable on the host ───────────────────────────────────────────────────────────────
Step 'port-forward zitadel:8080'
$pf = Start-Process -FilePath 'kubectl' -ArgumentList '-n','noname','port-forward','svc/zitadel','8080:8080' `
  -PassThru -WindowStyle Hidden
$ready = $false
for ($i = 0; $i -lt 20; $i++) {
  Start-Sleep -Seconds 1
  try {
    $r = Invoke-WebRequest -Uri 'http://localhost:8080/.well-known/openid-configuration' -TimeoutSec 2 -UseBasicParsing
    if ($r.StatusCode -eq 200) { $ready = $true; break }
  } catch { }
}
if (-not $ready) { Stop-Process -Id $pf.Id -Force; throw 'zitadel not reachable at localhost:8080 after 20s' }
Write-Host '   ok   issuer reachable'

try {
  # ── 2. init identity ─────────────────────────────────────────────────────────────────────────────
  Step 'pnpm init:zitadel (re-issues identity)'
  $env:ZITADEL_ISSUER = 'http://localhost:8080'
  pnpm init:zitadel
  if ($LASTEXITCODE -ne 0) { throw 'init:zitadel failed' }

  # ── 3. Secret from BOTH env files ───────────────────────────────────────────────────────────────
  Step 'regenerate .env.cluster + Secret'
  node scripts/cluster-env.mjs
  kubectl -n noname create secret generic noname-env --from-env-file=.env.cluster --dry-run=client -o yaml |
    kubectl apply -f - | Out-Null
  Write-Host '   ok   Secret refreshed'

  # ── 4. restart so pods pick up the new identity ─────────────────────────────────────────────────
  Step 'restart api + worker'
  kubectl -n noname rollout restart deploy/api deploy/worker | Out-Null
  kubectl -n noname rollout status deploy/api --timeout=300s | Select-Object -Last 1
  kubectl -n noname rollout status deploy/worker --timeout=300s | Select-Object -Last 1

  # ── 5. seed (needs identity + a Ready API) ──────────────────────────────────────────────────────
  if (-not $SkipSeed) {
    Step 'seed Job'
    kubectl -n noname delete job seed --ignore-not-found | Out-Null
    kubectl apply -f deploy/jobs/seed.yaml | Out-Null
    $done = $false
    for ($i = 0; $i -lt 60; $i++) {
      Start-Sleep -Seconds 5
      $state = (kubectl -n noname get pods -l job-name=seed --no-headers 2>&1) -join ' '
      if ($state -match 'Completed') { $done = $true; break }
      if ($state -match 'Error|Failed') { break }
    }
    kubectl -n noname logs job/seed --tail=15
    if (-not $done) { throw 'seed Job did not complete — inspect its logs above' }
    Write-Host '   ok   seed completed'
  }
}
finally {
  if ($pf -and -not $pf.HasExited) { Stop-Process -Id $pf.Id -Force; Write-Host "`n   port-forward closed" }
}

# ── 6. prove it ────────────────────────────────────────────────────────────────────────────────────
Step 'verification'
& (Join-Path $PSScriptRoot 'k8s-status.ps1')
