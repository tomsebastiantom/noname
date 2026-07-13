# Client Bundle — Frontend Setup & Local Dev Plan

## What Exists (Backend + Edge)

### API Server (`packages/server`)
- Hono + Node.js HTTP server
- Produces all JSON specs: layouts, content, flags, segments
- Routes: `/api/edge/schema/:siteId`, `/api/edge/personalize`, etc.
- Runs locally via `pnpm dev` (tsx watch on port from env)

### Edge Worker (`packages/workers`)
- Cloudflare Workers (Hono router)
- Validates JWT (placeholder — real `jose` validation TODO)
- KV cache for JSON specs (per tenant:segment:path)
- Serves R2 objects at `/_assets/*` (immutable cache, 1 year)
- Bot detection → placeholder HTML (real React 19 SSR TODO)
- Runs locally via `wrangler dev`

### CLI (`packages/cli`)
- `noname dev` — stub
- `noname init` — stub

---

## What Is Missing — The Client Bundle

There is **no frontend package**. A visitor hitting the site today gets:
- **Bot**: A `<pre>` dump of the raw JSON spec (placeholder in `api.ts:37`)
- **Human**: Raw JSON response from `c.json(schema)` (`api.ts:40`)

The browser has no JS to render that JSON into a UI. The client bundle is what makes that happen.

### What the Client Bundle Needs

```
packages/client/
├── package.json
├── rspack.config.mjs
├── tsconfig.json
├── index.html              (entry point for local dev)
└── src/
    ├── main.tsx            (React root, json-render <Renderer>)
    ├── catalog.ts          (Component catalog — maps json-render types → React components)
    └── components/
        ├── Hero.tsx
        ├── ProductCard.tsx
        ├── AddToCart.tsx
        └── ...             (commerce component catalog)
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
             └── GET /:siteId/*  ──→ JWT check → KV cache?
                    │                    │ Hit → return JSON
                    │                    │ Miss → fetch from API server
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

## How Local Dev Works Right Now

### Running the backend
```bash
# Terminal 1: API server
pnpm dev                              # starts @noname/server on port from env
```

### Running the edge worker
```bash
# Terminal 2: Edge worker (if wrangler configured)
cd packages/workers
wrangler dev                          # local CF Workers runtime
```

### What you can test
- `GET http://localhost:3000/health` → server health
- `GET http://localhost:3000/api/edge/schema/test-site?segment=default` → JSON spec
- `GET http://localhost:8787/test-site` (wrangler port) → worker proxies to server → returns JSON

### What you CANNOT test
- No browser renders the JSON into a UI
- No `/_assets/*` serves anything (R2 is empty)
- No JWT validation works (placeholder decode only)

---

## What Needs To Be Built

| Step | Package | What |
|------|---------|------|
| 1 | `packages/client` | Scaffold React + rspack project with json-render runtime |
| 2 | `packages/client` | Build component catalog (Hero, ProductCard, AddToCart, etc.) |
| 3 | `packages/client` | Wire `main.tsx` to fetch JSON from edge worker, render via `<Renderer>` |
| 4 | Root `package.json` | Add `build` script: server tsc + client rspack build |
| 5 | Deployment script | Upload client `dist/` to R2 after build |
| 6 | `packages/workers` | Wire real JWT validation (jose library) |
| 7 | `packages/workers` | Wire real React 19 SSR for bots (renderer.ts) |

### Local dev after client exists
```bash
# Terminal 1: API server
pnpm --filter @noname/server dev       # port 3000

# Terminal 2: Client dev server
pnpm --filter @noname/client dev       # rspack HMR on port 5173

# Terminal 3: Edge worker
cd packages/workers && wrangler dev    # port 8787, proxies to server
```

Browser at `http://localhost:5173` loads the client bundle, which fetches JSON from the worker (`http://localhost:8787/site-id`), which fetches from the server (`http://localhost:3000/api/edge/schema/site-id`).

---

## Current Status

```
Server (packages/server)   ████████████████████ ✅ Full DDD, 8 domains
Edge Worker (workers)       ████████████████░░░░ ✅ Routes + cache + auth stub, SSR TODO
Client Bundle (packages/client) ░░░░░░░░░░░░░░░░░░░░ ❌ Not started
CLI (packages/cli)          ████░░░░░░░░░░░░░░░░ 🟡 Stubs only
```
