---
name: noname-dev
description: >-
  Clean restart of the full Noname local stack (podman infra +
  API server + edge worker + client) followed by seed and
  browser-MCP smoke tests. Stops any existing server/edge/client
  processes and wipes compose volumes before rebuilding from scratch.
whenToUse: >-
  Before any code change in noname: kill existing server/edge/client,
  wipe and restart podman infra, run init:zitadel + db:push,
  start all three dev processes, seed demo, then test via
  mcp__browser__* through browser MCP.
---

# Noname Dev Skill — Full Clean Restart

## Step 1: kill everything that exists

```bash
# Kill any running noname server / edge / client / tsx / wrangler / node
# from previous runs.
Get-Process node | Where-Object { $_.ProcessName -eq 'node' } | ForEach-Object {
  Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
}
# Also via pwsh command: kill any process using ports 3000 / 8787 / 5173
```

In PowerShell (what this environment uses):

```powershell
# Only kill node processes tied to this repo or using its ports.
# Avoid killing unrelated node processes (e.g. Adobe, DSH, system services).
$targetPorts = @('3000', '8787', '5173')
$repoRoot = 'C:\Workspace\noname'
Get-Process -Name node | Where-Object {
  # Check by port usage (via TCP connections) or by working directory.
  $p = $_
  $ports = (Get-NetTCPConnection -OwningProcess $p.Id -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in $targetPorts })
  $hasPort = [bool]$ports
  $inRepo = ($p.Path -like '*noname*' -or ($p.StartInfo -ne $null -and $p.StartInfo.Arguments -like '*noname*'))
  $hasPort -or $inRepo
} | Stop-Process -Force -ErrorAction SilentlyContinue
```

Wait 5s: `Start-Sleep -Seconds 5`

## Step 2: delete infra filesystem (clean reset)

```bash
podman compose down -v        # delete volumes: postgres, clickhouse, zitadel_keys
```

Wait until all containers exit (`podman ps -a` shows nothing or only Exited).

## Step 3: restart everything with podman

```bash
podman compose up -d         # starts postgres, dragonfly, clickhouse,
                             # zitadel, keto, vault, s3, jaeger
```

Wait ~30s (`curl -sf http://localhost:8080/.well-known/openid-configuration` must return 200).

## Step 4: init auth + push DB

```bash
pnpm init:zitadel              # refreshes .env + zitadel_keys/
pnpm --filter @noname/server db:push
```

## Step 5: start all three app processes (background)

Use managed background jobs (`run_in_background: true` on pwsh):

```bash
# API server (:3000)
cd C:\Workspace\noname
npm_config_cache=C:\Workspace\noname\.tools\npm-cache \
  npm_config_prefix=C:\Workspace\noname\.tools\npm-global \
  pnpm --filter @noname/server dev

# Edge worker (:8787)
npm_config_cache=C:\Workspace\noname\.tools\npm-cache \
  npm_config_prefix=C:\Workspace\noname\.tools\npm-global \
  pnpm --filter @noname/workers dev

# Client (:5173)
npm_config_cache=C:\Workspace\noname\.tools\npm-cache \
  npm_config_prefix=C:\Workspace\noname\.tools\npm-global \
  pnpm --filter @noname/client dev
```

Add to hosts if missing:

```powershell
Add-Content 'C:\Windows\System32\drivers\etc\hosts' '127.0.0.1 yogastore.localhost' -ErrorAction SilentlyContinue
```

Wait for all three to bind (`netstat -a | Select-String '3000|8787|5173'` shows LISTENING).

## Step 6: seed demo

```bash
pnpm seed:demo
```

Creates store slug `yogastore`, demo users (`admin@zitadel.localhost` / `NonameAdmin1!`), and published layouts.

## Step 7: verification via browser MCP

The browser MCP server (`@playwright/mcp` via `kilo.json`) connects through `dsh-mcp-client`. Once registered, these model-facing tools exist:

- `mcp__browser__navigate`
- `mcp__browser__snapshot`
- `mcp__browser__fill`
- `mcp__browser__click`
- `mcp__browser__wait_for_navigation`

Smoke-flow (run manually or through the harness):

1. `mcp__browser__navigate` → `http://yogastore.localhost:5173/` (storefront)
2. Confirm page loads (no console errors, `BODY` contains "Get started free")
3. `mcp__browser__navigate` → `http://yogastore.localhost:5173/login`
4. Confirm login form renders
5. `mcp__browser__navigate` → `http://yogastore.localhost:5173/admin`
6. Confirm admin dashboard loads (requires JWT via login)
7. `mcp__browser__navigate` → `http://yogastore.localhost:5173/?edit=true`
8. Confirm visual editor loads

API side checks:

```bash
curl -sf http://localhost:3000/health
curl -sf -H "x-org-id: 387316114289393674" \
  http://localhost:3000/api/tenants/resolve/yogastore
```

## Credentials (for verification + browser MCP)

The repo stores the OpenRouter API key in `key` (repo root, gitignored) and `.env`:

- `.env`: `OPENAI_API_KEY=<see .env (gitignored, not committed)>`
- `key`: `<see repo root key file (gitignored, not committed)>`
- `docs/2026-08-22/BROWSER-AGENT-COLLAB-SMOKE-RESULTS.md`: references the key and notes it should move to Vault (`VAULT_MOUNT=secret`, `VAULT_PATH_PREFIX=noname`).

The `kilo.json` (repo root) registers the Playwright MCP server:

```json
{
  "mcp": {
    "playwright": {
      "type": "local",
      "command": ["npx", "@playwright/mcp@latest"],
      "enabled": true,
      "timeout": 30000
    }
  }
}
```

This connects through `dsh-mcp-client`. Once the `mcp__browser__*` tools are registered (see Step 7), use them with these credentials available to the agent.

## Skill files

- `skills/noname-dev/SKILL.md` — this workflow
- `skills/noname-dev/reference.md` — detailed checklist
- `skills/noname-dev/verify.sh` — bash smoke-test script
- `.dsh/skills/noname-dev/` — same content, discoverable by DSH filesystem provider
