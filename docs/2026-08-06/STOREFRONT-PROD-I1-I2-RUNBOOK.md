# Storefront production — I1 + I2 runbook

> **Date:** 2026-08-06  
> **IDs:** **I2** R2 client deploy · **I1** Bot SSR  
> **Related:** [`CLIENT_BUNDLE.md`](../2026-07-11/CLIENT_BUNDLE.md) · [`MASTER-STATUS.md`](./MASTER-STATUS.md)

---

## What this is (and is not)

| In scope | Out of scope |
|----------|----------------|
| Public **storefront** on edge (visitors, SEO) | Admin UI (`/admin/*`) — stays on dev server or separate deploy |
| `packages/client` production build → **R2** | Picking final CI (GitHub Actions vs Vela) — **not a blocker** |
| **Bot SSR** in `packages/workers` | Agents, comms, CMS features |

**Pipeline note:** You can ship I2 with a **manual script** first. Wire CI later — same commands, no rework of I1/I2 code.

---

## Architecture target

```
Visitor browser                    Googlebot
      │                                 │
      ▼                                 ▼
Cloudflare Worker (packages/workers)
      │
      ├── GET /_assets/*  ──→ R2 (JS/CSS from client build)     ← I2
      │
      ├── GET /products/yoga-mat (human)
      │        → HTML shell + load JS from /_assets/
      │
      └── GET /products/yoga-mat (bot)
               → React SSR stream (title, product text in HTML)  ← I1
               → fetch JSON spec from API (same as today)
```

**Local dev today:** rspack `:5173` — **not** this path. I1/I2 only matter for **prod-like** edge + R2.

---

## I2 — Client bundle deploy to R2

### Goal

Production stores load React + json-render from `https://{store}/_assets/…`, not from `:5173`.

### Checklist

| # | Task | Owner | Status |
|---|------|-------|--------|
| I2.1 | Production rspack build succeeds | client | ✅ |
| I2.2 | `publicPath` / asset URLs match `/_assets/` | client | ✅ |
| I2.3 | Upload script (manual OK) | `pnpm deploy:client-r2` | ✅ |
| I2.4 | Worker serves uploaded files (`static.ts`) | workers | ✅ |
| I2.5 | HTML entry + storefront route | workers `storefront.ts` | ✅ |
| I2.6 | Smoke: page renders without `:5173` | QA | [ ] |

### Concrete example — build

```bash
# From repo root
NODE_ENV=production pnpm --filter @noname/client build

# Expect output under packages/client/dist/
ls packages/client/dist/
# index.html  main.<hash>.js  main.<hash>.css  (+ chunks)
```

### Concrete example — upload (dev bucket)

```bash
# Build + upload (uses wrangler; local wrangler dev bucket with DEPLOY_R2_LOCAL=1)
pnpm deploy:client-r2

# Or local-only bucket for wrangler dev:
DEPLOY_R2_LOCAL=1 pnpm deploy:client-r2
```

Manual single file (alternative):

```bash
cd packages/client && NODE_ENV=production pnpm build
wrangler r2 object put noname-assets/_assets/index.html --file dist/index.html --local
```

**Prod:** use bucket `noname-assets-prod` and `--env production` per `wrangler.toml`.

### Concrete example — verify

```bash
# Worker dev (R2 binding to local/minio or remote)
cd packages/workers && wrangler dev

# Asset should 200
curl -sI "http://localhost:8787/_assets/main.js" | head -1
# HTTP/1.1 200 OK

# Browser: storefront loads JS (once HTML route serves shell — see I2.5)
```

### Files to touch (I2)

| File | Change |
|------|--------|
| `packages/client/rspack.config.mjs` | `output.publicPath: "/_assets/"` for production |
| `scripts/deploy-client-r2.sh` (new) | build + sync dist → R2 |
| `packages/workers/src/routes/static.ts` | Already maps `/_assets/*` → R2 key |
| Optional: worker HTML route | Serve `index.html` shell for SPA paths |

### Example success criteria

- [ ] `curl http://localhost:8787/_assets/main.*.js` returns JS (not 404)
- [ ] Opening store URL in browser shows rendered homepage **without** port 5173
- [ ] Network tab: scripts from `/_assets/`, API from `/api/…`

---

## I1 — Bot SSR (React 19 stream in worker)

### Goal

Crawlers get **real HTML** (product title, description) for SEO and link previews. Humans still get SPA + hydration.

### Checklist

| # | Task | Owner | Status |
|---|------|-------|--------|
| I1.1 | Bot detection (User-Agent) | workers `bot-ssr.ts` | ✅ |
| I1.2 | Fetch page JSON spec (reuse edge → API path) | workers `storefront.ts` | ✅ |
| I1.3 | Lightweight HTML from spec (text extraction) | workers `bot-ssr.ts` | ✅ |
| I1.4 | Human path unchanged (JS shell from I2) | workers | ✅ |
| I1.5 | `curl -A Googlebot` smoke | QA | [ ] |

### Concrete example — bot request (after I1)

```bash
curl -s -A "Mozilla/5.0 (compatible; Googlebot/2.1)" \
  "http://localhost:8787/yogastore/products/yoga-mat" \
  | head -40

# Expect HTML containing merchant content, e.g.:
# <title>Yoga Mat | Yoga Store</title>
# <h1>Premium Yoga Mat</h1>
# NOT raw JSON, NOT empty <div id="root"></div> only
```

### Concrete example — human request (unchanged)

```bash
curl -s -A "Mozilla/5.0 (Macintosh; Chrome/120)" \
  "http://localhost:8787/yogastore/" \
  | head -20

# Expect HTML shell with <script src="/_assets/main.*.js">
```

### Pseudocode (worker route)

```typescript
// packages/workers/src/routes/storefront.ts (new, illustrative)

if (isBot(request)) {
  const spec = await fetchPageSpec(env, orgId, path);
  const html = await renderSpecToHtml(spec, registry); // React 19 renderToReadableStream
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

return serveSpaShell(c); // index.html from R2 + spec bootstrap for client
```

### Files to touch (I1)

| File | Change |
|------|--------|
| `packages/workers/src/routes/storefront.ts` (new) | Bot vs human branching |
| `packages/workers/src/index.ts` | Mount storefront routes before static |
| Shared render helper | Reuse `@noname/client` catalog/registry or slim worker bundle |
| Tests | Bot UA → HTML contains known seed product title |

### Example success criteria

- [ ] Googlebot curl returns `<title>` matching CMS content
- [ ] Normal browser still hydrates and analytics/replay work
- [ ] No admin routes SSR’d (storefront paths only)

---

## Recommended order

```
1. I2.1–I2.3   Build + manual R2 upload script
2. I2.5–I2.6   Storefront HTML shell + human smoke
3. I1.1–I1.3   Bot SSR on same spec fetch
4. I1.5         Bot curl smoke
5. (Later)      Plug upload script into CI — any pipeline
```

**Do I2 before I1** — bots need meaningful HTML; humans need JS on R2 first.

---

## Local stack for testing (concrete)

```bash
# Terminal 1 — API
podman compose up -d
pnpm db:push && pnpm seed:demo
pnpm --filter @noname/server dev

# Terminal 2 — build + upload client (I2)
NODE_ENV=production pnpm --filter @noname/client build
# run deploy script or wrangler r2 object put …

# Terminal 3 — edge
cd packages/workers && wrangler dev

# Terminal 4 — smoke
curl -sI "http://localhost:8787/_assets/main.js"
curl -s -A Googlebot "http://localhost:8787/…" | head
```

Demo store: `http://yogastore.localhost:5173` (dev) → prod target `yogastore` slug on worker host.

---

## What blocks production (real vs not)

| Blocker? | Item |
|----------|------|
| ❌ No | Unfinalized CI pipeline |
| ❌ No | Writing I1/I2 code locally |
| ✅ Yes | Empty R2 bucket (I2 not run) |
| ✅ Yes | Storefront not routed through worker in prod |
| ⚠️ Later | Prod `API_ORIGIN`, ZITADEL issuer in `wrangler.toml` `[env.production]` |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-08-06 | Created I1/I2 runbook with concrete commands and checklists |
