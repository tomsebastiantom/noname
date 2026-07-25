# Status & Next Steps — 2026-07-11 (updated 2026-07-25)

## All Domains

```
documents/   ████████████████████ ✅ Full DDD + assets + richtext + merge + validator
machines/    ████████████████████ ✅ Engine + guards + Postgres adapter
flags/       ████████████████████ ✅ Full DDD + evaluation engine + SSE streaming
context/     ████████████████████ ✅ Engine + signal extraction + Postgres adapter
agent/       ████████████████████ ✅ Full DDD + BullMQ async queues + Mastra-ready tools
ai-pipeline/ ████████████████████ ✅ Service + mock LLM + real provider structure
analytics/   ████████████████████ ✅ ClickHouse + BullMQ async pipeline + 44 event subscriptions
edge/        ████████████████████ ✅ Service bridging docs/context/flags for CDN delivery
tenant/      ████████████████████ ✅ Catalog manifests + R2 bundle storage + MF build worker
shared/      ████████████████████ ✅ AggregateRoot, eventBus, DomainError, respond, SSE manager, Redis helper
```

## Packages

| Package | Status | Stack |
|---------|--------|-------|
| `server` | ✅ Full DDD, 9 domains | Hono + Drizzle + XState + ClickHouse + BullMQ + OpenTelemetry |
| `browser-sdk` | ✅ 6 modules, Datadog RUM parity | Vanilla TS, Vite library mode. 5.26 KB gzipped core |
| `workers` | ✅ JWT + HMAC + cache. SSR pending | Hono + CF Workers + `@cfworker/jwt`. Bot SSR still stubbed |
| `client` | 🟡 Scaffold + catalog + MF loader | React 19 + json-render + Module Federation. Rspack build unverified |
| `cli` | 🟡 Stubs only | Commander |

## Browser SDK Modules

| Module | Status | Key features |
|--------|--------|-------------|
| Analytics | ✅ | track, pageView, batched (50/5s), sendBeacon |
| Errors | ✅ | onerror, unhandledrejection, console.error, dedup, breadcrumbs |
| Trace | ✅ | W3C traceparent (2KB), fetch() interceptor, span lifecycle |
| Performance | ✅ | LCP/INP/CLS/TTFB/FCP + navigation timing + resource timing |
| Flags | ✅ | Bulk init + SSE push + single-flag refetch + onUpdate callbacks |
| Replay | ✅ | rrweb (dynamic import), 60s ring buffer, 5% sampling, mask-by-default |

## Auth Migration (2026-07-13 — 2026-07-18)

| Area | What |
|------|------|
| **Provider** | Logto removed. ZITADEL self-hosted via Docker Compose (`:8080`). |
| **Edge JWT** | Real signature verification via `@cfworker/jwt` + JWKS OIDC discovery. |
| **HMAC trust** | Worker signs `tenantId:userId:role` with `WORKER_SERVER_SECRET`; server verifies with `timingSafeEqual`. |
| **Dev mode** | Client can proxy directly to server without edge worker; missing HMAC logs a warning only. |
| **Remaining** | OIDC client app for browser login must be created in ZITADEL console. See `docs/2026-07-13/AUTH.md`. |

## Today's Changes (2026-07-11)

| Area | What |
|------|------|
| **Analytics storage** | Postgres removed. ClickHouse adapter (MergeTree, 90-day TTL, monthly partitions). |
| **Analytics pipeline** | BullMQ `analytics-events` queue + batch worker (50 events or 2s). Audit events bypass queue. |
| **Event subscriptions** | 44 subscriptions across all domains (was 22). Every domain event auto-logged. |
| **Segment discovery** | `POST /api/analytics/segment-events` — groups by (event_type, context_hash). |
| **SSE flag delivery** | `GET /api/flags/stream` endpoint + `shared/sse-manager.ts`. SSE push on flag changes. |
| **Shared Redis** | `shared/redis.ts` — extracted duplicated connection. Used by agent + analytics queues. |
| **Browser SDK** | Renamed from analytics-sdk. 6 modules. Single `init()` call. Vite build. Datadog RUM parity. |
| **Client build** | Switched from Vite to rspack for Module Federation compatibility. |

## Key Architecture Decisions

- **Pure API server** — Hono + Node.js, no React, no SSR, no JSX
- **BullMQ** — Async task execution from day one. Two queues: `agent-tasks` (retry, concurrency 4) and `analytics-events` (fire-and-forget, concurrency 1)
- **In-memory event bus** — Synchronous cross-domain events. 44 subscriptions across all domains
- **Mastra-ready agent** — Agent tools defined in Mastra-compatible format. Plug in later without changing domain code
- **ClickHouse for analytics** — Columnar time-series. Postgres removed from analytics entirely
- **SSE for flags** — Not polling. Bulk init + push deltas. LaunchDarkly model
- **rspack everywhere** — Client uses rspack (MF compatibility). Browser-sdk uses Vite (simpler library builds, no MF needed). Server uses tsc + rspack programmatically
- **Flags built natively** — Not LaunchDarkly. Integrates with context engine, analytics, and json-render
- **Identity-agnostic** — Commerce is first vertical, not the only one

## Build

```
browser-sdk:  tsc ✅  vite build ✅  (5.26 KB gzipped)
client:       tsc ✅  rspack build ⚠️
server:       tsc ✅
```

## What NOT To Build Now

| Component | Reason |
|-----------|--------|
| Mastra agent framework | AgentExecutor interface provides pluggable swap point |
| Nango integrations | Stripe Connect adapter wired directly |
| Cloudflare Workers (edge code) | API-side JSON delivery sufficient |
| Typesense search | Postgres full-text OK for <100k products |
| GrapesJS visual editor | JSON specs served directly |
| Shopify adapter | Standalone mode first |
| Stripe Connect | Mock payment flow for now |
| Logto auth integration | Replaced by ZITADEL (2026-07-13). Browser OIDC client app still manual setup. |
| Network body capture | PII risk. Allowlist-only (FullStory model) when needed |
| Source map upload | Phase 3 when error monitoring is production-deployed |
| Canvas recording in replay | Expensive, opt-in only |
