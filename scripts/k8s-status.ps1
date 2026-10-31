<#
.SYNOPSIS
    Read-only health summary of the local cluster. Changes nothing.

.DESCRIPTION
    Every check prints OK or FAIL and the command that produced it, so a red line can be investigated
    without guessing. Exit code is 0 only when every check passes.

    Run this instead of re-deriving the state by hand (docs/2026-10-31/K8S-RUNBOOK.md §1).
#>
[CmdletBinding()]
param()

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$env:KUBECONFIG = Join-Path $env:USERPROFILE '.kube\k3s.yaml'

$failures = 0
function Check([string]$label, [scriptblock]$command, [string]$expect = '') {
  $output = try { (& $command 2>&1 | Where-Object { $_ -notmatch 'metrics.k8s.io' } | Out-String).Trim() } catch { "ERROR: $_" }
  $ok = ($output -ne '') -and ($output -notmatch 'ERROR|refused|not found|Unable to connect')
  if ($expect -and $output -notmatch [regex]::Escape($expect)) { $ok = $false }
  if (-not $ok) { $script:failures++ }
  $tag = if ($ok) { ' OK ' } else { 'FAIL' }
  $oneLine = ($output -replace '\s+', ' ')
  if ($oneLine.Length -gt 76) { $oneLine = $oneLine.Substring(0, 76) }
  Write-Host ("  [$tag] " + $label.PadRight(22) + $oneLine) -ForegroundColor $(if ($ok) { 'Green' } else { 'Red' })
}

Write-Host "`ncluster" -ForegroundColor Cyan
Check 'node' { kubectl get nodes --no-headers } 'Ready'
Check 'pods not ready' {
  $bad = kubectl -n noname get pods --no-headers 2>&1 | Where-Object { $_ -match '0/\d' -and $_ -notmatch 'Completed' }
  if ($bad) { $bad -join '; ' } else { 'none' }
} 'none'

Write-Host "`ninfrastructure" -ForegroundColor Cyan
Check 'postgres'    { kubectl -n noname exec deploy/postgres -- psql -U noname -d app -t -A -c 'select 1' } '1'
Check 'dragonfly'   { kubectl -n noname exec deploy/dragonfly -- redis-cli ping } 'PONG'
Check 'clickhouse'  { kubectl -n noname exec deploy/clickhouse -- clickhouse-client --query 'SELECT 1' } '1'
Check 'vault'       { kubectl -n noname exec deploy/vault -- sh -c 'VAULT_ADDR=http://127.0.0.1:8200 vault status 2>&1 | grep Sealed' } 'false'
Check 's3'          { kubectl -n noname exec deploy/s3 -- sh -c 'netstat -tln 2>/dev/null | grep -c 9000' } '1'
Check 'nango'       { kubectl -n noname exec deploy/nango -- node -e "fetch('http://localhost:3003/health').then(r=>r.text()).then(console.log)" } 'ok'
Check 'keto'        { kubectl -n noname exec deploy/keto -- sh -c 'wget -qO- http://127.0.0.1:4466/health/ready 2>/dev/null | head -c 40' } ''
# zitadel ready prints nothing on success and signals through the exit code, so ask the pod instead:
# its readinessProbe already runs that command.
Check 'zitadel'     { kubectl -n noname get pods -l app=zitadel --no-headers } '1/1'

Write-Host "`napplication" -ForegroundColor Cyan
Check 'api /ready' {
  $pod = (kubectl -n noname get pods -l app=api --sort-by=.metadata.creationTimestamp --no-headers 2>&1 | Select-Object -Last 1).Split(' ')[0]
  kubectl -n noname exec $pod -c api -- node -e "fetch('http://127.0.0.1:3000/ready').then(r=>r.text()).then(t=>console.log(t))"
} '"ready":true'
Check 'api /health' {
  $pod = (kubectl -n noname get pods -l app=api --sort-by=.metadata.creationTimestamp --no-headers 2>&1 | Select-Object -Last 1).Split(' ')[0]
  kubectl -n noname exec $pod -c api -- node -e "fetch('http://127.0.0.1:3000/health').then(r=>r.json()).then(j=>console.log(j.status, 'analytics=' + j.analytics.ready))"
} 'ok'
Check 'worker'      { kubectl -n noname get pods -l app=worker --no-headers } 'Running'
Check 'browser CDP' { kubectl -n noname exec deploy/browser -- sh -c 'wget -qO- http://127.0.0.1:3000/ 2>/dev/null | head -c 40' } ''
# Real gap, not a broken check: the seed needs identity re-init first (runbook §7).
Check 'seed data'   {
  $n = (kubectl -n noname exec deploy/postgres -- psql -U noname -d app -t -A -c 'select count(*) from machine_definitions' 2>&1) -join ''
  "machine_definitions=$($n.Trim())"
} '2'

Write-Host "`nresources" -ForegroundColor Cyan
$mem = (wsl -d Ubuntu -u root -- sh -c "free -m | grep Mem" 2>&1) -join ''
Write-Host ("  [info] " + $mem.Trim())

Write-Host ''
if ($failures -eq 0) {
  Write-Host "  all checks passed" -ForegroundColor Green
  exit 0
}
Write-Host "  $failures check(s) failed - see docs/2026-10-31/K8S-RUNBOOK.md §6 for the failure catalogue" -ForegroundColor Red
exit 1
