# Edge Worker — Architecture & Build Plan

## What It Is

The **Cloudflare Edge Worker** is a lightweight function deployed at 300+ global Cloudflare locations. It sits between visitors and the API server, handling JWT validation, JSON schema delivery, per-segment personalization, SEO prerendering, and KV caching.

The Edge Worker does **NOT** have direct database access. It calls the API server's `/api/edge/*` routes (built in `packages/server/src/domains/edge/`) which have DB access via the documents, context, and flags domains.

## Architecture

```
Visitor (browser)
    │
    ▼
┌──────────────────────────────────────────────────────┐
│  CLOUDFLARE EDGE WORKER  (300+ locations)             │
│                                                       │
│  1. JWT validation (against Logto JWKS)               │
│     → Invalid: 302 redirect to Logto login            │
│     → Valid: extract tenantId, userId, role           │
│                                                       │
│  2. Route:                                            │
│     /:siteId/*   → API route (dynamic, personalized)  │
│     /_assets/*   → R2 static assets                  │
│                                                       │
│  3. KV Cache check:                                   │
│     key = tenantId:segment:path                       │
│     Hit → return cached JSON/HTML (<5ms)              │
│     Miss → fetch from API server → cache → return     │
│                                                       │
│  4. SEO Prerender (bot detection):                    │
│     Bot? → Render JSON spec to HTML via React 19      │
│     Human? → Return JSON spec (client renders)        │
│                                                       │
│  API calls:                                           │
│    GET /api/edge/schema/:siteId?segment=default       │
│    POST /api/edge/personalize                         │
└───────────────────┬──────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────────┐
│  API SERVER  (packages/server)                        │
│  /api/edge/schema/:siteId                            │
│  /api/edge/personalize                               │
│    → documents.service.layout.resolve()              │
│    → context.engine.segmentForRequest()              │
│    → flags.service.evaluate()                        │
│    → DB: Postgres                                    │
└──────────────────────────────────────────────────────┘
```

## Package Structure

```
packages/workers/
├── package.json          # Dependencies: hono, @json-render/core, wrangler
├── tsconfig.json         # Cloudflare Workers types
├── wrangler.toml         # Cloudflare Workers config
└── src/
    ├── index.ts          # Worker entry point (Hono router)
    ├── auth.ts           # JWT validation (Logto JWKS)
    ├── cache.ts          # KV cache read/write
    ├── renderer.ts       # React 19 SSR for SEO (bot detection)
    ├── routes/
    │   ├── api.ts        # Proxy requests to edge API server
    │   └── static.ts     # Serve R2 assets
    └── types.ts          # Shared types
```

## What Needs To Be Built

### 1. Worker Entry Point (`src/index.ts`)
- Hono router mounted on Cloudflare Workers
- Route matching: `/:siteId/*` → API flow, `/_assets/*` → R2
- Bot detection: User-Agent check for search engine crawlers
- CORS headers for client SDK

### 2. JWT Validation (`src/auth.ts`)
- Read JWT from cookie or `Authorization` header
- Validate signature against Logto JWKS endpoint
- Extract: tenantId, userId, role
- Attach to forwarded request headers (`x-tenant-id`, `x-user-id`)
- Invalid/missing: 302 redirect to Logto login with `redirect_uri`
- Cache JWKS in KV (TTL: 1 hour)

### 3. KV Cache (`src/cache.ts`)
- Cache key: `{tenantId}:{segment}:{path}`
- Write: after fetching from API server
- Read: before API call — return if hit
- TTL: 60 seconds for personalized, 5 minutes for default segment
- Purge on content publish (via `layout.published` event webhook)

### 4. SEO Prerenderer (`src/renderer.ts`)
- Detect bot via User-Agent (Googlebot, Bingbot, etc.)
- Bot request → fetch JSON spec + content → React 19 `renderToReadableStream()` → HTML
- Human request → return raw JSON (client renders in browser)
- Rendered HTML cached in KV (longer TTL than JSON)
- Inject SEO metadata (title, description, OG tags) from layout spec

### 5. API Proxy (`src/routes/api.ts`)
- `GET /:siteId/*` → fetch from API server `/api/edge/schema/:siteId`
- Forward tenant context headers
- Handle API errors gracefully (fallback to cached version)

### 6. Static Assets (`src/routes/static.ts`)
- `GET /_assets/*` → serve from Cloudflare R2
- Immutable caching headers (1 year)
- Client bundle (json-render runtime + commerce catalog)

## Dependencies

| Package | Purpose |
|---------|---------|
| `hono` | HTTP framework (edge-native, already used on server) |
| `@json-render/core` | JSON→component resolution (for SEO prerender) |
| `react` + `react-dom` | React 19 `renderToReadableStream()` for SEO |
| `wrangler` | Cloudflare Workers CLI (dev, deploy) |
| `@cloudflare/workers-types` | TypeScript types for Workers runtime |

## How It Integrates With What We Built

| Worker needs | Calls | Server domain |
|-------------|-------|--------------|
| Layout spec for a site/segment | `GET /api/edge/schema/:siteId?segment=` | `edge.service.getSchema()` → `layout.resolve()` + `flags.evaluate()` |
| Personalized layout per visitor | `POST /api/edge/personalize` | `edge.service.personalize()` → `context.segmentForRequest()` + `layout.resolve()` + `flags.evaluate()` |
| JWT validation | `GET {LOGTO_ENDPOINT}/oidc/jwks` | Logto (external, not our server) |

## Build Order

1. Create `packages/workers/` package with configs
2. Worker entry point with Hono router
3. KV cache layer
4. JWT validation middleware
5. API proxy to server edge routes
6. SEO prerenderer (React 19 SSR)
7. Static asset serving from R2
8. Deploy to Cloudflare Workers via wrangler

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| No DB access from worker | Calls API server instead | Keeps worker lightweight (<50ms cold start), avoids connection pooling at 300+ locations, PII stays centralized |
| React 19 for SEO only | `renderToReadableStream()` for bots | SEO needs HTML; humans get JSON for client-side interactivity |
| KV cache per segment | `tenantId:segment:path` key | Different visitors get different layouts; separate cache entries per segment |
| Hono for worker | Same framework as API server | TypeScript consistency, familiar patterns, edge-native |
