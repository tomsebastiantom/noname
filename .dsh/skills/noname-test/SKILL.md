---
name: noname-test
description: >-
  Verify the running Noname stack through browser MCP (Playwright)
  and direct API checks. Assumes the stack is already running
  (started by noname-dev or manually). Tests login, storefront,
  admin, and visual editor.
whenToUse: >-
  After noname-dev has started the stack (or after manual start).
  Use mcp__browser__* tools to navigate, fill, click, and snapshot
  the UI at yogastore.localhost:5173.
---

# Noname Test Skill — Verify via Browser MCP

This skill verifies the stack WITHOUT restarting it.

## Prerequisites

- `noname-dev` has run (stack running on :3000, :8787, :5173)
- `hosts` file has `127.0.0.1 yogastore.localhost`
- `.env` and `key` credentials loaded (see noname-dev/reference.md)
- Browser MCP (`@playwright/mcp`) registered via `kilo.json` and `dsh-mcp-client`

## Step 1: health checks

```bash
curl -sf http://localhost:3000/health || echo "FAIL: API"
curl -sf http://localhost:8080/.well-known/openid-configuration || echo "FAIL: ZITADEL"
curl -sf -H "x-org-id: 387316114289393674" \
  http://localhost:3000/api/tenants/resolve/yogastore || echo "FAIL: tenant"
```

## Step 2: browser MCP smoke tests

Use `mcp__browser__*` (registered by dsh-mcp-client):

1. `mcp__browser__navigate` → `http://yogastore.localhost:5173/`
2. Confirm page loads (`snapshot` shows storefront body, "Get started free")
3. `mcp__browser__navigate` → `http://yogastore.localhost:5173/login`
4. Confirm login form renders
5. `mcp__browser__navigate` → `http://yogastore.localhost:5173/admin`
6. Confirm admin dashboard loads (requires auth — use demo user or JWT from seed)
7. `mcp__browser__navigate` → `http://yogastore.localhost:5173/?edit=true`
8. Confirm visual editor loads

## Step 3: regression checks (manual or automated)

- No console errors in browser MCP results
- `mcp__browser__snapshot` images check correctly saved (via attachment store)
- `mcp__browser__fill` on login form works (fill fields with demo user `admin@zitadel.localhost` / `NonameAdmin1!`)
- `mcp__browser__click` on submit/login button completes

## Step 4: report

Output a short report:

- Health endpoints (PASS/FAIL)
- Browser navigation flows (PASS/FAIL with snapshot URLs)
- Any console errors or missing elements
