# Observability & distributed traces

> **Date:** 2026-08-03 (updated)  
> **Status:** **Shipped — traces admin, browser span export, analytics cross-link**  
> **Related:** [`ACCESS-AND-ROLES.md`](./ACCESS-AND-ROLES.md) · [`DISTRIBUTED-TRACING.md`](../2026-07-11/DISTRIBUTED-TRACING.md) · [`OBSERVABILITY-AUTH-MODEL.md`](../2026-07-27/OBSERVABILITY-AUTH-MODEL.md)

---

## One sentence

**Three observability systems:** OpenTelemetry traces (infra/debug, Jaeger), ClickHouse events (product analytics), rrweb replay (session UX). Admin **Observability** section groups Analytics, Flags, Replay, and **Distributed traces** — org-filtered Jaeger lite behind `traces:view`, with browser span export and analytics ↔ trace cross-link.

---

## Three systems — do not conflate

| System | Data | Question it answers | Admin path | Permission |
|--------|------|---------------------|------------|------------|
| **OpenTelemetry** | Spans (browser, HTTP, PG, Redis, workers) | “Why was this request slow / where did it fail?” | **Distributed traces** | `traces:view` |
| **Browser SDK → ClickHouse** | Events (`page_view`, `content.updated`, …) | “What happened in the product?” | **Analytics** | `analytics:view` |
| **Browser SDK → R2/CH** | rrweb chunks | “What did the user see?” | **Session replay** | `session:replay` |

Feature flags: **Feature flags** admin, `flags:write`.

---

## What exists today (shipped)

### Server — OpenTelemetry

Bootstrap: `packages/server/src/tracing.ts`. HTTP spans tagged with `org.id` via `orgTracingMiddleware`.

Export: OTLP HTTP → Jaeger (`OTEL_EXPORTER_OTLP_ENDPOINT`, default `http://localhost:4318/v1/traces`).

### Browser SDK — traceparent + span export

`@noname/browser-sdk` (`packages/browser-sdk/src/modules/trace.ts`):

| Capability | Details |
|------------|---------|
| **W3C propagation** | `traceparent` on patched `fetch` |
| **Span export** | Batched `POST /api/analytics/spans` → server re-exports to Jaeger as **`noname-browser`** |
| **Auto spans** | `document.load`, `fetch METHOD /path` |
| **Manual spans** | `sdk.trace.startSpan(name).end()` |
| **Sampling** | `exportSpans: true`, `sampleRate: 1` on `.localhost`, `0.1` elsewhere |

Wired in `packages/client/src/platform/browser-observability.ts`.

### Analytics ↔ trace cross-link

Frontend events include `meta.traceId` and `meta.spanId` (current tab trace context).

Admin **Analytics → Recent events** shows **View trace** when the user has `traces:view`. Navigates to `/admin/settings/traces?traceId=…` and opens the span waterfall.

### Admin UI

| Page | Path | Permission |
|------|------|------------|
| Analytics | `/admin/settings/analytics` | `analytics:view` |
| Session replay | `/admin/settings/replay` | `session:replay` |
| Feature flags | `/admin/settings/flags` | `flags:write` |
| **Traces** | `/admin/settings/traces` | `traces:view` |

Sidebar: **Settings** (auth, users, scope, login) · **Observability** (analytics, flags, replay, traces) · **Account**.

Route rules: `packages/client/src/auth/admin-routes.ts`.

### Server proxy (Jaeger)

```http
GET /api/analytics/traces?limit=50&lookback=1h
GET /api/analytics/traces/:traceId
POST /api/analytics/spans   ← browser span ingest
```

All filtered by `org.id`. Jaeger query internal only — not exposed to browser.

### Demo user

| Email | Password | Role |
|-------|----------|------|
| `trace@zitadel.localhost` | `NonameTrace1!` | `trace_viewer` |

---

## Example trace (storefront browse)

```
noname-browser   document.load                    120ms
noname-browser   fetch GET /api/edge/schema/…      45ms
  └─ noname-server GET /api/edge/schema/…        142ms
       ├─ pg.query …
       └─ …
```

Generate traffic: browse storefront, use admin, run `pnpm seed:demo`.

---

## Local dev

```bash
podman compose up -d    # Postgres, Redis, ClickHouse, Jaeger
pnpm dev                # API :3000
pnpm --filter @noname/workers dev   # Edge :8787
pnpm --filter @noname/client dev    # Client :5173
pnpm seed:demo
```

| URL | Purpose |
|-----|---------|
| http://yogastore.localhost:5173/admin/settings/analytics | Product events |
| http://yogastore.localhost:5173/admin/settings/traces | Distributed traces |
| http://localhost:16686 | Jaeger UI (dev, no RBAC) |

---

## Files (reference)

| Area | Path |
|------|------|
| OTel bootstrap | `packages/server/src/tracing.ts` |
| Org tag on HTTP | `packages/server/src/shared/org-tracing.ts` |
| Browser trace + export | `packages/browser-sdk/src/modules/trace.ts` |
| Browser observability wiring | `packages/client/src/platform/browser-observability.ts` |
| Span ingest + OTel re-export | `packages/server/src/domains/analytics/browser-span-ingest.ts`, `browser-span-export.ts` |
| Jaeger proxy | `packages/server/src/domains/analytics/jaeger-client.ts`, `routes/traces.ts` |
| Traces admin UI | `packages/client/src/admin/components/traces/TracesAdmin.tsx` |
| Analytics cross-link | `packages/client/src/admin/components/analytics/AnalyticsEventsAdmin.tsx` |
| Admin permissions | `packages/client/src/auth/admin-routes.ts` |
| Seed | `scripts/seed/demo.ts`, `scripts/seed/demo-users.ts` |

---

## Optional later

- Full `@opentelemetry/sdk-trace-web` in browser (replace hand-roll if bundle budget allows)
- Link error reports → traces admin from error `traceId`
- Production sampling tuning per org tier
