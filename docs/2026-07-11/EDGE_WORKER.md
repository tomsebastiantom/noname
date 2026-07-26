# Edge Worker — Architecture & Build Plan

> **Updated 2026-07-25.** Auth: ZITADEL OIDC + `@cfworker/jwt` + HMAC to server. See `docs/2026-07-13/AUTH.md`.

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
│  1. JWT validation (ZITADEL JWKS via @cfworker/jwt)   │
│     → Invalid: 302 redirect to ZITADEL login            │
│     → Valid: extract tenantId, userId, role           │
│                                                       │
│  2. HMAC sign headers for API server trust            │
│     → x-tenant-id, x-user-id, x-role, x-auth-hmac   │
│                                                       │
│  3. Route:                                            │
│     /:siteId/*   → API route (dynamic, personalized)  │
│     /_assets/*   → R2 static assets                  │
│                                                       │
│  4. KV Cache check:                                   │
│     key = tenantId:segment:path                       │
│     Hit → return cached JSON/HTML (<5ms)              │
│     Miss → fetch from API server → cache → return     │
│                                                       │
│  5. SEO Prerender (bot detection):                    │
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
│    → tenant.ts verifies HMAC                          │
│    → DB: Postgres                                    │
└──────────────────────────────────────────────────────┘
```

## Package Structure

```
packages/workers/
├── package.json          # Dependencies: hono, @cfworker/jwt, wrangler
├── tsconfig.json         # Cloudflare Workers types
├── wrangler.toml         # ZITADEL_ISSUER, API_ORIGIN
├── .dev.vars             # WORKER_SERVER_SECRET (not checked in)
└── src/
    ├── index.ts          # Worker entry point (Hono router)
    ├── auth.ts           # JWT validation (ZITADEL JWKS via parseJwt + getKey)
    ├── cache.ts          # KV cache read/write
    ├── renderer.ts       # HMAC headers + fetchSchema/personalizeSchema. SSR TODO.
    ├── routes/
    │   ├── api.ts        # Proxy requests to edge API server
    │   └── static.ts     # Serve R2 assets
    └── types.ts          # Shared types
```

## Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| Worker entry point (`index.ts`) | ✅ | Hono router, route matching |
| JWT validation (`auth.ts`) | ✅ | `@cfworker/jwt`, issuer check, redirect to ZITADEL login |
| HMAC signing (`renderer.ts`) | ✅ | `crypto.subtle.sign` HMAC-SHA256 to server |
| KV cache (`cache.ts`) | ✅ | Read/write with TTL |
| API proxy (`routes/api.ts`) | ✅ | Fetches schema, bot placeholder HTML |
| Static assets (`routes/static.ts`) | ✅ | R2 serving at `/_assets/*` |
| SEO prerender (React 19 SSR) | ❌ | Bot gets `<pre>` JSON dump — TODO |
| Personalization wiring | ⚠️ | `personalizeSchema` called but result unused in `api.ts` |

## JWT Validation (`src/auth.ts`) — implemented

- Read JWT from cookie or `Authorization` header
- Validate via `parseJwt` + `getKey` against ZITADEL JWKS (OIDC discovery)
- Extract: tenantId (org claim), userId (`sub`), role
- Invalid/missing: 302 redirect to `{ZITADEL_ISSUER}/ui/v2/login/login?authRequest=...`
- Forward signed HMAC headers to API server via `renderer.ts`

## KV Cache (`src/cache.ts`) — implemented

| Key helper | Pattern | Used for |
|------------|---------|----------|
| `slugCacheKey(slug)` | `slug:{slug}` | Store slug → org id (Phase 3) |
| `cacheKey(orgId, segment, path)` | `{orgId}:{segment}:{path}` | Edge schema cache (`path` = `schema:{orgId}` today) |
| `staticCacheKey(path)` | `static:{path}` | Static asset helper |

- Read: before API call — return if hit
- Write: after fetching from API server
- TTL: 300s for schema (configurable in `renderer.ts`)

See [`documents-domain.md`](../2026-07-10/documents-domain.md) § KV Cache Key Scheme for **planned** content/layout/html keys (not implemented in the worker yet).

## SEO Prerenderer — NOT YET IMPLEMENTED

- Detect bot via User-Agent (Googlebot, Bingbot, etc.) — ✅ detection exists
- Bot request → fetch JSON spec → **React 19 `renderToReadableStream()` → HTML** — ❌ TODO
- Human request → return raw JSON (client renders in browser) — ✅
- Rendered HTML cached in KV — ❌ TODO

## How It Integrates With What We Built

| Worker needs | Calls | Server domain |
|-------------|-------|--------------|
| Layout spec for a site/segment | `GET /api/edge/schema/:siteId?segment=` | `edge.service.getSchema()` → `layout.resolve()` + `flags.evaluate()` |
| Personalized layout per visitor | `POST /api/edge/personalize` | `edge.service.personalize()` → `context.segmentForRequest()` + `layout.resolve()` + `flags.evaluate()` |
| JWT validation | ZITADEL OIDC discovery + JWKS | ZITADEL (external, `:8080`) |
| Server trust | HMAC headers | `shared/tenant.ts` on API server |

## Dependencies

| Package | Purpose |
|---------|---------|
| `hono` | HTTP framework (edge-native, already used on server) |
| `@cfworker/jwt` | JWT validation + JWKS resolution (Workers-compatible) |
| `@json-render/core` | JSON→component resolution (for SEO prerender — future) |
| `react` + `react-dom` | React 19 `renderToReadableStream()` for SEO (future) |
| `wrangler` | Cloudflare Workers CLI (dev, deploy) |
| `@cloudflare/workers-types` | TypeScript types for Workers runtime |

## Remaining Build Order

1. ~~Create `packages/workers/` package with configs~~ ✅
2. ~~Worker entry point with Hono router~~ ✅
3. ~~KV cache layer~~ ✅
4. ~~JWT validation middleware~~ ✅
5. ~~API proxy to server edge routes~~ ✅
6. ~~HMAC signing to server~~ ✅
7. SEO prerenderer (React 19 SSR) — **next**
8. Wire personalization result in `api.ts`
9. Deploy to Cloudflare Workers via wrangler

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| No DB access from worker | Calls API server instead | Keeps worker lightweight (<50ms cold start), avoids connection pooling at 300+ locations, PII stays centralized |
| React 19 for SEO only | `renderToReadableStream()` for bots | SEO needs HTML; humans get JSON for client-side interactivity |
| KV cache per segment | `tenantId:segment:path` key | Different visitors get different layouts; separate cache entries per segment |
| Hono for worker | Same framework as API server | TypeScript consistency, familiar patterns, edge-native |
| HMAC worker→server | Shared secret | Prevents direct API server access bypassing edge JWT validation |
| `@cfworker/jwt` not `jose` | Workers-native JWT lib | No Node crypto dependencies; JWKS caching built-in |
