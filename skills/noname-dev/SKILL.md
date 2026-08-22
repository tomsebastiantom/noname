---
name: noname-dev
description: >-
  Restart the full Noname local dev stack (podman infra reset +
  init:zitadel + db:push + seed:demo) and verify end-to-end via
  browser MCP. Use when you need a clean, verified environment
  before changing code so regressions are caught immediately.
whenToUse: >-
  Before any noname change: reset infra (down -v / up -d),
  restart server (:3000), edge (:8787), client (:5173),
  seed demo, then open browser at yogastore.localhost:5173
  and run smoke tests through mcp__browser__* tools.
---

# Noname Dev Skill — Restart + Verify

## First step: reset infra (destructive but clean)

```bash
podman compose down -v          # delete filesystem (postgres, clickhouse, zitadel_keys, etc.)
podman compose up -d           # restart everything
```

Wait until all healthy (`podman compose ps`). ZITADEL takes ~30s.

## Second step: init auth + DB

```bash
pnpm init:zitadel              # creates .env ZITADEL_* values + zitadel_keys
pnpm --filter @noname/server db:push
```

## Third step: start all three app processes

In separate terminals (or background jobs):

```bash
# Terminal 1 — API
pnpm dev                        # server :3000 (tsx watch)

# Terminal 2 — Edge
pnpm --filter @noname/workers dev   # :8787 (wrangler)

# Terminal 3 — Client
pnpm --filter @noname/client dev    # :5173 (rspack)
```

Add `yogastore.localhost` to `C:\Windows\System32\drivers\etc\hosts`:

```
127.0.0.1  yogastore.localhost
```

## Fourth step: seed demo

```bash
pnpm seed:demo
```

This creates `yogastore` store slug, demo layouts, users (`admin@zitadel.localhost` / `NonameAdmin1!`).

## Fifth step: verify via browser MCP

The browser MCP server is registered in the DSH web profile (`mcp-client` plugin). Once connected, these tools are available:

- `mcp__browser__navigate` — navigate to URL
- `mcp__browser__snapshot` — screenshot + DOM state
- `mcp__browser__click` — click element by selector
- `mcp__browser__fill` — fill form fields
- `mcp__browser__wait_for_navigation` — wait for page load

Smoke-test script (`skills/noname-dev/verify.sh`):

```bash
#!/bin/bash
# Verify the full stack after a clean restart

# 1. Health endpoints
curl -sf http://localhost:3000/health || exit 1
curl -sf http://localhost:8080/.well-known/openid-configuration || exit 1
curl -sf http://localhost:4466/health/ready || exit 1

# 2. Client loads (proxy /api → edge)
# Open browser MCP and navigate to yogastore.localhost:5173
# Confirm storefront loads, login page at /login works,
# admin at /admin renders.
# Confirm visual editor `/?edit=true` loads.

# 3. API routes (after seed:demo)
curl -sf -H "x-org-id: 387316114289393674" \
  http://localhost:3000/api/tenants/resolve/yogastore || exit 1
```

## Skill reference files

- `skills/noname-dev/verify.sh` — smoke test script
- `skills/noname-dev/reference.md` — detailed verification checklist
- `docs/MANUAL-VERIFICATION-CHECKLIST.md` — repo-level regression checklist
