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

If the model-facing `mcp__browser__*` tools are not listed, do not substitute unverified screenshots or direct DOM claims. Start the same Playwright MCP server over its SSE transport and connect with an MCP client:

```powershell
pnpm exec playwright-mcp --browser chrome --headless --port 8931
```

The MCP client must call `initialize`, `notifications/initialized`, then `tools/call` for `browser_navigate`, `browser_wait_for`, `browser_snapshot`, `browser_fill_form`, `browser_click`, and `browser_console_messages`. Keep the SSE session open for the complete flow so login state is preserved. Record the returned `.playwright-mcp/page-*.yml` and `console-*.log` evidence.

## Step 1: health checks

```bash
curl -sf http://localhost:3000/health || echo "FAIL: API"
curl -sf http://localhost:8080/.well-known/openid-configuration || echo "FAIL: ZITADEL"
curl -sf http://localhost:3003/health || echo "FAIL: NANGO"
curl -sf -H "x-org-id: ${ZITADEL_DEMO_ORG_ID}" \
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
9. Open the seeded commerce checkout and confirm server-derived pricing.
10. Confirm the checkout enters `awaiting_payment` and that a normalized provider callback reaches `paid`.
11. Replay the callback and confirm no duplicate transition.
12. Reload and confirm persisted machine state/context.

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
