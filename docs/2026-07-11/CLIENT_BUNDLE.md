# Client Bundle — Frontend Setup & Local Dev Plan

> **Updated 2026-07-25.** Auth provider is ZITADEL (see `docs/2026-07-13/AUTH.md`).

## What Exists (Backend + Edge + Client)

### API Server (`packages/server`)
- Hono + Node.js HTTP server — **9 DDD domains**
- Produces all JSON specs: layouts, content, flags, segments
- Routes: `/api/edge/schema/:siteId`, `/api/edge/personalize`, `/api/tenants/:id/catalog`, etc.
- Runs locally via `pnpm dev` (tsx watch on port 3000)

### Edge Worker (`packages/workers`)
- Cloudflare Workers (Hono router)
- **JWT validation** via `@cfworker/jwt` + ZITADEL JWKS OIDC discovery
- **HMAC signing** to API server (`WORKER_SERVER_SECRET`)
- KV cache for JSON specs (per tenant:segment:path)
- Serves R2 objects at `/_assets/*` (immutable cache, 1 year)
- Bot detection → placeholder HTML (**React 19 SSR still TODO**)
- Runs locally via `wrangler dev` (port 8787)

### Client Bundle (`packages/client`) — scaffold exists
- React 19 + json-render `<Renderer>` in `main.tsx`
- Platform component catalog (Hero, ProductCard, Grid, Stack, Text, Button, Image)
- Module Federation runtime for tenant/marketplace catalogs (`catalog-loader.ts`, `mf-init.ts`)
- rspack dev server on port 5173, proxies `/api` → `:3000`
- **Not yet verified:** production rspack build, seed data, end-to-end render in browser

### CLI (`packages/cli`)
- `noname dev` — stub
- `noname init` — stub

---

## What Is Still Missing

A visitor hitting the site via the **edge worker alone** still gets:
- **Bot**: A `<pre>` dump of the raw JSON spec (placeholder in `api.ts:37`)
- **Human**: Raw JSON response from `c.json(schema)` (`api.ts:40`)

The **client dev server** can render JSON into UI once seed data exists, but there is no deployed R2 bundle yet and no browser login flow wired.

### Client package structure (implemented)

```
packages/client/
├── package.json
├── rspack.config.mjs
├── tsconfig.json
├── index.html
└── src/
    ├── main.tsx            ← React root, json-render <Renderer>
    ├── catalog.ts          ← Zod-validated component catalog
    ├── registry.ts         ← Platform component registry
    ├── catalog-loader.ts   ← Module Federation remote loading
    ├── mf-init.ts          ← MF runtime init
    └── components/
        └── index.tsx       ← Hero, ProductCard, Grid, Stack, Text, Button, Image
```

### How It Works

```
Browser requests https://yogastore.com/products/yoga-mat
             │
             ▼
      Cloudflare Edge Worker (packages/workers)
             │
             ├── GET /_assets/*  ──→ R2 (static JS/CSS, immutable)
             │
             └── GET /:siteId/*  ──→ ZITADEL JWT check → KV cache?
                    │                    │ Hit → return JSON
                    │                    │ Miss → fetch from API server (HMAC headers)
                    │
                    ▼
             API Server (packages/server)
                    │
                    └── /api/edge/schema/:siteId
                         → documents + context + flags
                         → personalized JSON spec

Browser receives:
  1. Static JS from R2 (json-render runtime + catalog) — loaded once, cached
  2. JSON spec from edge worker — per-page, personalized
  
Browser renders:
  json-render <Renderer spec={jsonSpec} registry={componentCatalog} />
```

### Build → R2 → Worker → Browser Pipeline

```
1. pnpm --filter @noname/client build
   → rspack bundles React + json-render + catalog
   → Output: dist/ (index.html, assets/*.js, assets/*.css)

2. Upload dist/ to R2 bucket (noname-assets)
   → wrangler r2 object put noname-assets/index.html --file dist/index.html
   → wrangler r2 object put noname-assets/assets/main.js --file dist/assets/main.js

3. Worker serves from R2 at /_assets/*
   → Already implemented in packages/workers/src/routes/static.ts
```

---

## How Local Dev Works

### Running the backend
```bash
# Terminal 1: API server
pnpm dev                              # starts @noname/server on port 3000
```

### Running the client (recommended for UI dev)
```bash
# Terminal 2: Client dev server (proxies /api → server)
pnpm --filter @noname/client dev      # rspack HMR on port 5173
```

### Running the edge worker (optional — full auth path)
```bash
# Terminal 3: Edge worker
cd packages/workers && wrangler dev   # port 8787
```

### What you can test today
- `GET http://localhost:3000/health` → server health
- `GET http://localhost:3000/api/edge/schema/test-site?segment=default` → JSON spec (with `x-tenant-id` header in dev)
- `http://localhost:5173` → client bundle loads, fetches spec + catalog manifest
- `GET http://localhost:8787/test-site` (wrangler) → worker validates JWT, proxies to server

### What you CANNOT test yet
- No seed/demo layout + content data for a first render
- No `/_assets/*` in production (R2 empty until build + upload)
- No browser OIDC login (ZITADEL OIDC app must be created manually)
- No bot SSR (placeholder JSON dump only)

---

## What Needs To Be Built Next

| Step | Package | What | Status |
|------|---------|------|--------|
| 1 | `packages/client` | Scaffold React + rspack + json-render | ✅ Done |
| 2 | `packages/client` | Platform component catalog | ✅ Done |
| 3 | `packages/client` | Wire `main.tsx` to fetch spec + render | ✅ Done |
| 4 | Seed data | Demo layout + product content in documents domain | ❌ TODO |
| 5 | Root `package.json` | Verify `pnpm build` across packages | ⚠️ Unverified |
| 6 | Deployment script | Upload client `dist/` to R2 after build | ❌ TODO |
| 7 | `packages/workers` | React 19 SSR for bots | ❌ TODO |
| 8 | Auth | ZITADEL OIDC client app + SPA login flow | ⚠️ Manual setup |

### Local dev (full stack)
```bash
# Terminal 1: API server
pnpm --filter @noname/server dev       # port 3000

# Terminal 2: Client dev server
pnpm --filter @noname/client dev       # rspack HMR on port 5173

# Terminal 3: Edge worker (optional)
cd packages/workers && wrangler dev    # port 8787, proxies to server
```

Browser at `http://localhost:5173` loads the client bundle, which fetches JSON from the server (via rspack proxy) or from the worker at `http://localhost:8787/site-id`.

---

## Current Status

```
Server (packages/server)      ████████████████████ ✅ Full DDD, 9 domains
Edge Worker (workers)         ██████████████████░░ ✅ JWT + HMAC + cache. SSR TODO
Client Bundle (packages/client) ████████████░░░░░░░░ 🟡 Scaffold + MF loader. Build unverified
CLI (packages/cli)            ████░░░░░░░░░░░░░░░░ 🟡 Stubs only
```
