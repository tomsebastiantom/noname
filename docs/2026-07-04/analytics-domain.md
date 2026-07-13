# Analytics Domain — Implementation Plan

> **Framing — "commerce" is an example vertical, not the product.** The checkout/booking examples illustrate the general event/attribution model. The platform is **identity-agnostic** and the same analytics pipeline powers any vertical (booking, membership, SaaS, content).

## Purpose

The analytics domain is the platform's **unified event capture, attribution, and query layer**. Every meaningful action — server-side domain events (content.created, layout.published, machine transitions) AND frontend visitor interactions (clicks, scrolls, cart actions, conversions) — flows into this domain for storage, aggregation, and downstream consumption.

It is the **data foundation** for three engines:
1. **A/B Testing** — measures variant performance (which schemaId + variantId + contextHash converts best)
2. **Context/Segmentation** — discovers visitor behavior patterns to create ML-driven segments
3. **ML Feedback Loop** — retrains layout/content generation models from conversion data

## Architecture

The analytics domain follows the same Domain-Driven Design pattern as all other bounded contexts in `packages/server/src/domains/`:

```
packages/server/src/domains/analytics/
├── api.ts          # Hono route handlers (POST /track, GET /events, GET /aggregations)
├── ports.ts        # AnalyticsStorage interface + AnalyticsQuery interface
├── entity.ts       # AnalyticsEvent aggregate root (extends AggregateRoot)
├── schema.ts       # ClickHouse table schema (columnar, time-series optimized)
├── service.ts      # Business logic (validate, enrich, queue, ingest)
├── events.ts       # Domain event listeners (subscribes to ALL other domain events)
├── adapters/       # Storage adapters
│   ├── clickhouse.ts   # ClickHouse write adapter (columnar ingestion)
│   └── clickhouse-query.ts  # ClickHouse read adapter (aggregation queries)
└── index.ts        # Domain bootstrap (register listeners, wire adapters)
```

### Current State (Scaffolding)

| File | Status | What exists |
|------|--------|-------------|
| `events.ts` | Stub | 2 listeners: content.created, layout.published → `console.log` |
| Remaining files | Not yet created | api, ports, entity, schema, service, adapters, index |

### Target Architecture

From `docs/2026-05-23/BUILD_PLAN.md` and `ARCHITECTURE_DECISIONS.md`:

```
Event write path:
  Server domain event (content.created, layout.published, machine.transition)
    → eventBus.publish()
    → analytics/events.ts subscriber
    → analytics service → queue (BullMQ) → ClickHouse ingestion

  Frontend visitor event (click, scroll, add-to-cart, checkout_step, conversion)
    → POST /api/analytics/track
    → analytics service → validate + enrich (schemaId, variantId, contextHash, sessionId)
    → queue (BullMQ) → ClickHouse ingestion

Event read path:
  ML engine queries aggregations directly in ClickHouse
  Store dashboard queries via analytics API
  Context engine discovers segments from behavior patterns
  A/B engine measures variant conversion rates
```

### Event Shape (Final)

Every analytics event carries full attribution context:

```typescript
{
  eventId:     string;        // UUID
  tenantId:    string;        // store/site ID
  eventType:   string;        // "click", "page_view", "add_to_cart", "checkout_start", "conversion", "content.created", "layout.published", "machine.transition", "segment.resolved"
  eventSource: "server" | "frontend";  // origin of the event
  timestamp:   string;        // ISO-8601, ClickHouse DateTime64(3)
  sessionId:   string;        // visitor session identifier

  // Attribution context (schema-level traceability)
  schemaId:    string | null; // layout template ID that was active
  variantId:   string | null; // layout variant ID being served
  contextHash: string | null; // segment hash from context engine

  // Event-specific payload
  meta: Record<string, unknown>; // JSON payload: click target, cart productId, transition from_state/to_state, guard result, duration, error
}
```

## Event Taxonomy (What Gets Captured)

### Server Domain Events (via event bus subscription)

| Domain | Events | Purpose |
|--------|--------|---------|
| **content** | content.created, content.updated, content.deleted, content.published | Track content lifecycle per tenant |
| **layout** (documents domain) | layout.published, layout.variant_created, layout.variant_activated | Track layout variants going live |
| **machines** | machine.transition (every state transition) | Commerce flow audit: checkout, booking, refund, subscription. Who, what transition, guard result, duration, success/failure. |
| **context** | context.segment_resolved | Track which segments are being served, how often, and by what signals |
| **agent** | task.created, task.completed, task.approved, task.rejected | Agent task lifecycle per store |
| **edge** | edge.schema_served, edge.cache_hit, edge.cache_miss | Edge delivery performance per segment |

### Frontend Visitor Events (via POST /api/analytics/track)

| Event Type | What it captures | Attribution |
|------------|------------------|-------------|
| **page_view** | Visitor lands on a page | schemaId, variantId, contextHash |
| **click** | Click target, component ID, coordinates | schemaId, variantId, contextHash |
| **scroll** | Scroll depth percentage, time to scroll | schemaId, variantId, contextHash |
| **add_to_cart** | productId, quantity, price | schemaId, variantId, contextHash |
| **remove_from_cart** | productId, reason (if explicit) | schemaId, variantId, contextHash |
| **checkout_start** | cart total, item count | schemaId, variantId, contextHash |
| **checkout_step** | step name, completed/failed, error message | schemaId, variantId, contextHash |
| **conversion** | orderId, total, payment method | schemaId, variantId, contextHash |
| **dropoff** | page/step where visitor left, time on page | schemaId, variantId, contextHash |
| **impression** | Component rendered (hero, product card, CTA) | schemaId, variantId, contextHash |

## Storage: ClickHouse (Columnar Time-Series)

### Why ClickHouse

| Property | ClickHouse | Postgres |
|----------|-----------|----------|
| Event aggregation queries | Sub-millisecond | 100-500ms+ |
| Compression | 5-10x vs Postgres | — |
| Time-series analytics | Columnar, built for it | Row-based, slow |
| Data retention TTL | Auto-expire per partition | Manual cleanup |
| Dashboard queries | Native SQL, Grafana-compatible | Can't compete |

### Table Schema (ClickHouse)

```sql
CREATE TABLE analytics_events (
    event_id     UUID,
    tenant_id    UUID,
    event_type   LowCardinality(String),
    event_source LowCardinality(String),
    timestamp    DateTime64(3, 'UTC'),
    session_id   UUID,
    schema_id    Nullable(UUID),
    variant_id   Nullable(UUID),
    context_hash Nullable(String),
    meta         String  -- JSON payload, not parsed into columns (flexibility trumps perf for early phase)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (tenant_id, event_type, timestamp)
TTL timestamp + INTERVAL 90 DAY;
```

### Why MergeTree

- Append-optimized. Analytics is write-once, query-many.
- Partitioned by month — easy data retention, fast partition pruning.
- Ordered by (tenant, event_type, timestamp) — matches 90% of query patterns.
- 90-day TTL — auto-deletes old events. Raw events are not permanent data; aggregations are.

### Local Dev Mode

Per `STACK.md` and `BUILD_PLAN.md`: ClickHouse is in `docker-compose.yml` for local dev. Lightweight dev mode (`--db sqlite`) skips ClickHouse entirely — analytics events log to console or an in-memory ring buffer.

## Cross-Domain Integration

### Event Bus Subscriptions (analytics listens to all domains)

| Event published | Subscribed by analytics | Analytics captures |
|----------------|------------------------|-------------------|
| `content.created` | ✅ (already registered) | tenantId, type, slug, data summary |
| `content.updated` | ❌ (missing) | tenantId, type, slug, changed fields |
| `content.deleted` | ❌ (missing) | tenantId, type, slug, deletion reason |
| `content.published` | ❌ (missing) | tenantId, type, slug, published to |
| `layout.published` | ✅ (already registered) | tenantId, templateName, version, segment |
| `layout.variant_created` | ❌ (missing) | tenantId, templateName, segment, parentVersion |
| `machine.transition` | ❌ (missing) | tenantId, machine, fromState, toState, guardResult, duration, success |
| `context.segment_resolved` | ❌ (missing) | tenantId, segmentHash, signals used |
| `task.created` | ❌ (missing) | tenantId, task type, assigned agent |
| `task.completed` | ❌ (missing) | tenantId, task type, duration, success |
| `task.approved` | ❌ (missing) | tenantId, task type, reviewer |
| `edge.schema_served` | ❌ (missing) | schemaId, variantId, contextHash, cache status |

### Analytics API consumers (who reads from analytics)

| Consumer | What it queries | Purpose |
|----------|----------------|---------|
| **A/B Test Engine** | Conversion rate per (schemaId, variantId, contextHash) | Multi-armed bandit — promote winning variants, deprecate losers |
| **Context Engine** | Behavior patterns by signal → event clustering | ML-driven segment discovery: "visitors from Instagram on mobile who scroll past 60% behave like segment X" |
| **ML Feedback Loop** | Conversions grouped by schemaId + segment | Retrain layout generation: "most successful product pages for mobile-new-visitor segment share these JSON patterns" |
| **Admin Dashboard** | Revenue, conversion rate, top products, funnel analysis, segment comparisons | Merchant KPIs |
| **Agent Domain** | Task effectiveness: "did this agent's generated variant improve conversion?" | Agent performance scoring |
| **Visual Insights** | Heatmaps, drop-off funnels, anomaly detection | ML shows what it found, merchant clicks "Fix This" |

## API Surface (To Be Implemented)

```
POST   /api/analytics/track          → Ingest frontend visitor event
                                       Body: { eventType, sessionId, schemaId, variantId, contextHash, meta }
                                       Response: { eventId, accepted: true }

GET    /api/analytics/events          → Query raw events (filter by tenantId, eventType, timerange)
                                       Query: ?tenantId=...&eventType=conversion&from=...&to=...&limit=100

GET    /api/analytics/aggregations    → Aggregated analytics for dashboard/ML
                                       Query: ?tenantId=...&groupBy=eventType&timerange=7d
                                       Response: { counts, rates, funnels }

GET    /api/analytics/conversions     → Conversion data per variant (for A/B engine)
                                       Query: ?schemaId=...&timerange=14d
                                       Response: { perVariant: [{ variantId, impressions, conversions, rate }] }

POST   /api/analytics/segment-events  → Export behavior events for segment discovery (context engine)
                                       Body: { tenantId, signalCategories, timerange }
                                       Response: { eventClusters, suggestedSegments }
```

## Analytics SDK (Frontend)

The client bundle (json-render runtime + commerce component catalog) needs a lightweight tracking SDK. This is NOT in `packages/server` — it ships as part of the client bundle deployed to Cloudflare R2.

```typescript
// SDK shape (runs in browser, ~2KB gzipped)
interface AnalyticsSDK {
  track(eventType: string, meta?: Record<string, unknown>): void;
  pageView(): void;                          // Auto-called on route change
  identify(sessionId: string): void;         // Set session identifier
  setContext(schemaId: string, variantId: string, contextHash: string): void;  // Set attribution context
}

// Implementation: batched POST to /api/analytics/track
// - Buffers events in-memory (ring buffer, 50 events)
// - Flushes every 5 seconds OR on page unload (sendBeacon)
// - Retries failed batches once
// - Never blocks UI thread (requestIdleCallback when available)
```

### How SDK integrates with json-render

```typescript
// json-render components emit analytics:
// Catalog component wrapper auto-tracks impressions:
<Hero>     → SDK.track("impression", { component: "Hero", props: ... })
<AddToCart> → SDK.track("click", { target: "AddToCart", productId })
<Checkout>  → ... SDK.track("checkout_step", { step: "payment", success: true })

// $state watchers auto-track conversions:
{ $state: "/order/status" } → when changes to "paid" → SDK.track("conversion")
```

## Next Steps

1. Define `AnalyticsEvent` entity extending `AggregateRoot`
2. Define `ports.ts` with `AnalyticsStorage` + `AnalyticsQuery` interfaces
3. Define `schema.ts` — ClickHouse table DDL + Drizzle-equivalent schema
4. Implement `adapters/clickhouse.ts` — write adapter (batch insert, retry)
5. Implement `adapters/clickhouse-query.ts` — aggregation queries
6. Implement `service.ts` — validation, enrichment, queuing, ingest orchestration
7. Implement `api.ts` — POST /track, GET /events, GET /aggregations, GET /conversions
8. Implement `events.ts` — register listeners for ALL domain events (not just 2)
9. Implement `index.ts` — wire domain (create engine with adapter → register API routes → register listeners)
10. Wire into `server/src/index.ts` — `app.route("/api/analytics", createAnalyticsRoutes(...))`
11. Build frontend SDK — lightweight tracking script for the client bundle
12. Wire SDK into json-render component catalog — auto-track impressions, clicks, conversions

## Domain Connections

```
┌─────────────────────────────────────────────────────────────┐
│                    ANALYTICS DOMAIN                          │
│                                                             │
│  WRITE PATHS (events in):                                   │
│                                                             │
│  Server domains ─→ eventBus ─→ analytics/events.ts         │
│  (content, documents, machines, context, agent, edge)            │
│       │                                                     │
│       ▼                                                     │
│  analytics/service.ts                                       │
│    → enrich (add tenantId, timestamp, sessionId)            │
│    → queue (BullMQ)                                         │
│    → adapters/clickhouse.ts → INSERT INTO analytics_events │
│                                                             │
│  Frontend ─→ POST /api/analytics/track                     │
│  (clicks, scrolls, cart, checkout, conversions)             │
│       │                                                     │
│       ▼                                                     │
│  analytics/service.ts (same pipeline)                       │
│    → validate (schemaId, variantId, contextHash required)   │
│    → enrich                                                    │
│    → queue → ClickHouse                                     │
│                                                             │
│  READ PATHS (events out):                                   │
│                                                             │
│  adapters/clickhouse-query.ts                               │
│       │                                                     │
│       ├──→ A/B engine: conversionRate(schemaId, variantId) │
│       ├──→ Context engine: behaviorPatterns → new segments │
│       ├──→ ML feedback: topConvertingLayouts per segment   │
│       ├──→ Admin dashboard: revenue, funnel, heatmaps      │
│       └──→ Agent domain: task effectiveness scoring        │
└─────────────────────────────────────────────────────────────┘
```

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Storage** | ClickHouse only (not Postgres) | Columnar time-series. 100x faster for aggregations. 5-10x compression. Already in docker-compose. |
| **Write path** | Async via BullMQ queue | Analytics writes never block the request path. No timeout. Retry on ClickHouse downtime. |
| **Event schema** | `meta` as JSON String (not parsed columns) | Flexibility for early phase — any event type can add new fields without schema migration. Move to parsed columns when query patterns stabilize at scale. |
| **Read path** | Direct ClickHouse SQL queries | ML and dashboard need raw aggregation power. ClickHouse handles 100M+ events/day in sub-ms. |
| **Partitioning** | Monthly (`toYYYYMM(timestamp)`) | 90-day TTL auto-drops old partitions. Query pruning by time range. |
| **Frontend SDK** | Batched (50 events / 5 seconds) + sendBeacon on unload | Minimizes HTTP overhead. Guarantees last events sent (sendBeacon survives page unload). No UI thread blocking. |
| **Attribution** | Mandatory schemaId + variantId + contextHash on every frontend event | Without attribution, analytics data cannot connect conversions to specific layouts/segments. The entire ML feedback loop depends on this. |
| **Event bus scope** | All domain events → analytics listener | Every server event becomes an analytics event. This is the "auto-logged" guarantee from the architecture docs — machine transitions, content lifecycle, spec publishing are always tracked. |
| **Local dev fallback** | Console logger or in-memory ring buffer when ClickHouse is unavailable | Per STACK.md: lightweight dev with `--db sqlite` skips ClickHouse. Events still capture, just not persisted. |

---

## BullMQ Async Pipeline (2026-07-11)

> **Decision:** Separate `analytics-events` queue (not reuse `agent-tasks`). Batch worker drains 50 events or every 2s. ClickHouse swapped via `AnalyticsStorage` interface. Postgres adapter deleted.

### Why separate queue from agent-tasks

| Dimension | Agent Tasks | Analytics Events |
|-----------|------------|-----------------|
| Volume | Low (tens/hour) | High (thousands/sec) |
| Duration | Long (LLM calls) | Instant (write to DB) |
| Retry | 3 attempts, exponential | Fire-and-forget |
| Concurrency | 4 | 1 (serial batch) |

Agent jobs would starve behind analytics writes on a shared queue.

### Write path

```
Server events → eventBus → listeners.ts → service.ingestServerEvent()
Frontend events → POST /api/analytics/track → service.track()
                                                        │
                                              ┌─────────▼─────────┐
                                              │ analytics-events    │  BullMQ queue
                                              │ (DragonflyDB)      │  ─ attempts: 1
                                              └────────┬───────────┘  ─ fire-and-forget
                                                       │
                                                       ▼
                                              ┌─────────────────┐
                                              │  Batch Worker    │  ─ drain 50 events or 2s
                                              │  concurrency: 1  │  ─ serial INSERT to ClickHouse
                                              └─────────────────┘
```

**Audit exceptions:** `machine.transition` and `task.failed` bypass the queue — write directly to ClickHouse for durability.

### Queue design

| Setting | Value | Rationale |
|---------|-------|-----------|
| Queue name | `analytics-events` | Separate from `agent-tasks` |
| attempts | 1 | Fire-and-forget. Analytics events are disposable |
| concurrency | 1 | Serial batch insert avoids lock contention |
| removeOnComplete | `{ count: 0 }` | Discard immediately after processing |
| removeOnFail | `{ count: 100 }` | Keep small window for debugging |

### Shared infra

Both queues share the same Redis/DragonflyDB (`localhost:6379`). Connection extracted to `shared/redis.ts`. BullMQ isolates queues internally via key prefixes.

### Files

| File | Action | Purpose |
|------|--------|---------|
| `shared/redis.ts` | **NEW** | Shared Redis connection helper |
| `analytics/queue.ts` | **NEW** | `analytics-events` queue |
| `analytics/worker.ts` | **NEW** | Batch worker |
| `analytics/service.ts` | **MODIFY** | Enqueue via BullMQ instead of direct storage |
| `analytics/index.ts` | **MODIFY** | Wire worker startup |
| `agent/queue.ts` | **MODIFY** | De-duplicate `getConnection()` |
| `adapters/clickhouse.ts` | **NEW** | MergeTree, 90-day TTL, monthly partitions |
| `adapters/postgres.ts` | **DELETED** | Analytics is ClickHouse-only |
| `schema.ts` | **DELETED** | Postgres analytics schema removed |
| `drizzle.ts` | **MODIFY** | Analytics schema removed from Drizzle |