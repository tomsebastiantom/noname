# Core Infrastructure Services — What We Need To Run This Platform

> **Updated 2026-07-25.** Auth provider: **ZITADEL** (migrated from Logto, 2026-07-13). See `docs/2026-07-13/AUTH.md`.

**Date:** 2026-07-04
**Scope:** Production-grade infrastructure for the noname platform (Phase 0 → Phase 4).
**Context:** The platform runs as a self-hosted monorepo (Docker Compose for local dev, K8s for production). Every service must be scalable, observable, and runnable on our own infrastructure.

---

> **Framing — "commerce" is an example vertical, not the product.** Infrastructure examples reference commerce (carts, checkout, orders), but the platform is **identity-agnostic**: the same services power booking, membership, SaaS, content, and any other use case. Commerce is the first vertical we validate against, not the platform's identity.

## Required Services (9 Core)

| Service | Purpose | Phase | Why We Need It | What Happens If Missing |
|---------|---------|-------|----------------|------------------------|
| **Postgres 16** | Primary relational DB — JSONB for content, relational for ACID (orders/payments/inventory) | 0 | Stores everything: content entries (JSONB), machine definitions (JSONB), orders, payments, bookings, user metadata, store settings. One DB with multiple schemas per tenant. | Platform cannot function. Every domain (content, spec, machines, analytics, agent) relies on Postgres. |
| **ZITADEL** | Auth (self-hosted) | 0 | Multi-tenant auth. One ZITADEL instance serves platform admins + store customers. JWT validation at Cloudflare edge via `@cfworker/jwt`. Console at `:8080`. | No user login. No tenant isolation. Must build auth UI from scratch. |
| **DragonflyDB / Redis** | In-memory cache + job queue backend | 0 → Phase 1+ for queues | Cart sessions (TTL), rate limiting counters, state machine locks. BullMQ queue backend when async scale demanded (Phase 1+). | Cart data lost between requests. No rate limiting. No async job processing (emails, agent tasks, Nango side effects block the request path). |
| **ClickHouse** | Columnar analytics/time-series DB | 0 | Schema-level event attribution (schemaId + variantId + contextHash). 100x faster than Postgres for aggregation queries. 5-10x compression. ML training data, dashboard aggregations, conversion funnels. | Analytics queries crush Postgres at scale. No ML feedback loop. No per-variant conversion tracking. Attribution blind. |
| **Cloudflare Workers** | Edge layer — JWT validation, SEO prerender, per-segment JSON caching | 0 | Stops invalid requests before they hit origin (JWT validation <5ms). Caches JSON specs per segment hash (sub-50ms delivery). Renders SEO pages to HTML via React 19 stream. Auth redirect to ZITADEL login on invalid token. | All requests hit origin server. No edge caching. 200ms+ latency globally. No SEO prerendering. JWT validation happens server-side, costing CPU per rejected request. |
| **Cloudflare R2** | Media/file storage + client bundle hosting | 0 | Zero egress fees. Global CDN. Images auto-format/resize. Immutable JS client bundle (json-render runtime + commerce catalog) versioned and cached worldwide. | Pay egress fees elsewhere (S3). Slower global delivery. No CDN image optimization. |
| **Cloudflare Stream** | Video hosting + transcoding | 0 (optional) / 1+ | Auto-transcodes to HLS. Adaptive bitrate. Built-in player. Thumbnails, captions. Zero egress. | Must handle video transcoding ourselves or pay per-stream fees elsewhere. |
| **BullMQ** | Async job queue (Redis-backed) | Phase 1+ | AI agent tasks, analytics event ingestion (event → ClickHouse), email sending, Nango side effects, video transcoding. Durable, retries, delays, dead-letter queue. | Blocking request path for heavy work. No retry/durability for AI agent tasks. Lost analytics events on spike. |
| **Mastra** | AI agent framework (TypeScript-native) | Phase 1 | Tool-based agent model with guardrails (auto/approval/denied). Memory window (30 days). Agent orchestration for layout generation, content writing, analytics analysis, A/B test variant creation. | No structured agent orchestration. Must build agent tooling from scratch. No permission model for AI actions. |

---

## Phase 2+ Additions

| Service | Purpose | Phase | Why |
|---------|---------|-------|-----|
| **Nango** (self-hosted Docker) | External API integration (800+ APIs) | Phase 2+ | OAuth token management, rate limiting, retries, sync, actions, webhooks. XState orchestrates flow, Nango handles API calls. Self-hosted needs: Postgres (own DB `nango`) + Redis. Optionally Elasticsearch for logs. | Must build every integration manually (OAuth, token refresh, rate limits, retries per API). 800+ APIs maintained ourselves. |
| **Typesense** | Product search (full-text, typo-tolerant, faceted) | Phase 2+ | Self-hosted or managed. Replaces Postgres full-text search when 100k+ products. Fast, typo-tolerant, faceted filtering. | Postgres full-text search degrades at 100k+ products. No typo tolerance. No faceted search. |

---

## Service Deep Dive — What Each Service Actually Needs

### 1. Postgres 16 — The Primary Database

**Role:** Stores everything that must be persisted with ACID guarantees.

**Databases (3, via `scripts/compose/init-dbs.sh`):**

| Database | Used By | Stores |
|----------|---------|--------|
| `app` | Platform server (packages/server) | Content entries (products, pages, blog — JSONB), machine definitions (JSONB), layout templates/variants (JSONB), orders/payments/inventory (relational tables for ACID), user metadata, store settings, agent tasks, segments, context cache |
| `zitadel` | ZITADEL auth service | User identities, passwords (hashed), OAuth tokens, organizations, roles, MFA configs, sessions, audit logs |
| `nango` | Nango (Phase 2+) | Integration configs, OAuth connections/tokens, sync records, action execution logs |

**Scaling path:**
- Phase 0 (local dev): Docker container, single instance, no replication
- Phase 1 (launch): K8s StatefulSet with persistent volume, read replica for analytics queries
- Phase 3 (scale): **Vela** (https://github.com/simplyblock/vela) — serverless Postgres on K8s with compute/storage separation, instant cloning for staging/QA branches, independent scaling of compute/RAM/IOPS per tenant

**Vela adds:** Git-like branching for DBs (clone prod → test migrations safely), RBAC/IAM, auto-generated REST/GraphQL APIs, edge functions, file storage, AI vector embeddings toolkit. It wraps Postgres with a full platform layer — but the core is still vanilla Postgres underneath.

**Vela is the foundational infrastructure layer.** The entire stack runs on Vela-managed K8s Postgres with tenant isolation via database-level cloning (not just column-level `storeId` filtering). Each store gets its own isolated Postgres branch if needed, with independent compute scaling. Vela's built-in Keycloak-based auth is available but we intentionally use ZITADEL instead (see auth decision below).

### 2. DragonflyDB → Redis

**Role:** Ephemeral fast storage + BullMQ queue backend.

**What it stores:**

| Data Type | Key Pattern | TTL | Why Redis |
|-----------|-------------|-----|-----------|
| Cart sessions | `cart:{visitorId}` | 24h | Ephemeral. Lost on expiry = user rebuilds cart. Fast read/write. |
| Rate limiting counters | `ratelimit:{ip}:{endpoint}` | 1min window | Atomic INCR. Fast expiry cleanup. |
| State machine locks | `lock:machine:{machineId}` | Duration of transition | Prevents concurrent transitions on same machine instance. |
| BullMQ queues (Phase 1+) | BullMQ internal keys | Persisted by BullMQ | Durable job storage. Retries, delays, dead-letter. |
| Session cache | `session:{sessionId}` | Session TTL | Fast session lookup without Postgres query. |

**Why DragonflyDB over vanilla Redis:** Higher throughput (multi-threaded), lower memory usage, Redis-compatible protocol. Same API, better density for K8s deployment.

### 3. ClickHouse — Analytics/Time-Series

**Role:** Columnar storage for event analytics. Postgres is never used for analytics queries.

**What it stores:**

```sql
-- Event schema (from TECH.md)
events (
  storeId      String,
  schemaId     String,
  variantId    String,
  contextHash  String,
  eventType    String,     -- 'page_view', 'add_to_cart', 'checkout_start', 'conversion'
  timestamp    DateTime64(3),
  sessionId    String,
  meta         JSON         -- extra context: device, referrer, component path
)
```

**Why ClickHouse (not Postgres for analytics):**
- 100x faster than Postgres for `count(*) group by schemaId` queries
- 5-10x compression (columnar storage)
- Native time-series functions, materialized views, TTL-based retention
- Sub-millisecond aggregation on millions of rows

**Scaling path:**
- Phase 0: Single ClickHouse container, local dev skips it (console logging)
- Phase 1+: ClickHouse cluster with sharding per tenant group
- Phase 3+: Tiered storage (hot data in memory, cold data on object storage)

### 4. ZITADEL — Auth Service

**Role:** Identity provider for platform + store customers. Self-hosted Docker. MPL-2.0 license.

**What it provides (we never build):**

| Feature | Provided By | We Build |
|---------|-------------|----------|
| Login/register pages | ZITADEL pre-built UI | Nothing — embed via iframe/redirect |
| Password reset | ZITADEL email templates | Nothing |
| Social login (Google, Apple, GitHub) | ZITADEL connectors | Nothing |
| Magic link passwordless | ZITADEL built-in | Nothing |
| MFA (TOTP, SMS, authenticator) | ZITADEL built-in | Configurable per org |
| Multi-tenancy (each store = org) | ZITADEL organizations | Store creation creates ZITADEL org via API |
| Admin console (user management) | ZITADEL admin UI | Nothing — use ZITADEL's console |
| JWT issuance/validation | ZITADEL | Cloudflare Worker validates JWT at edge (calls ZITADEL JWKS endpoint) |

**Infrastructure needs:**
- Postgres database `zitadel` (separate from `app` DB — PII isolation)
- Docker container with persistent volume for `/app/data`
- Accessible from Cloudflare Workers (JWT validation fetches JWKS)
- Accessible from platform server (admin API calls)

### 5. Cloudflare Workers — Edge Layer

**Role:** Three responsibilities at the edge, before requests hit the API server.

**Worker 1 — Auth Gateway:**
```
Request → Read JWT from cookie/Authorization header
  → Validate signature against ZITADEL JWKS
  → Check expiry
  → Valid? → Extract tenantId, userId, role → Forward to API server
  → Invalid? → HTTP 302 → https://auth.{store}.com/sign-in?redirect_uri={original_url}
```

**Worker 2 — JSON Schema Delivery:**
```
Request for storefront page
  → Check Workers KV for cached JSON spec (key: {storeId}:{template}:{segment}:{slug})
  → Hit? → Return JSON (<20ms)
  → Miss? → Fetch spec + data from API server → Cache → Return
```

**Worker 3 — SEO Prerenderer:**
```
Request for SEO-critical page (product, collection, blog)
  → Check Workers KV for prerendered HTML
  → Hit? → Return HTML (<10ms)
  → Miss? → Fetch JSON spec + product data from API server
         → @json-render/core resolveElementProps() + React 19 renderToPipeableStream()
         → Stream HTML → Cache in KV → Return
```

**Dependencies:** Workers KV (cache), R2 (media), ZITADEL JWKS endpoint

### 6. Cloudflare R2 — Media + Bundle Hosting

**Role:** Zero-egress file storage and CDN for immutable assets.

**What it stores:**

| Asset | Cache Key | TTL | Purpose |
|-------|-----------|-----|---------|
| Client JS bundle | `bundle:{versionHash}` | 1 year (immutable) | json-render runtime + commerce catalog. Global CDN delivery. |
| Product images | `media:{storeId}:{imageHash}` | 1 year | Auto-format, resize via Cloudflare Image CDN. |
| Video files | Via Stream, not R2 directly | — | R2 stores originals if needed; Stream handles transcoding. |
| User uploads | `uploads:{storeId}:{fileHash}` | Store-defined | CMS media library. |

**Why R2 (not S3):** Zero egress fees. No surprise bandwidth bills. Same Cloudflare ecosystem as Workers/KV.

### 7. BullMQ — Async Job Queues (Phase 1+)

**Role:** Moves heavy work off the request path. Redis-backed.

**Queue topology:**

| Queue Name | Producer | Consumer | Purpose |
|------------|----------|----------|---------|
| `agent-tasks` | Agent domain API | Mastra agent workers | AI generation tasks (layout, content, machine defs). Durable, retries on LLM failure. |
| `analytics-events` | Event capture middleware | ClickHouse writer workers | Buffer events in memory → batch write to ClickHouse. Decouples event capture from DB write latency. |
| `email-outbound` | State machine side effects | Email worker (Resend/Postmark) | Order confirmations, shipping, password resets, agent task completion notifications. |
| `nango-side-effects` | State machine transitions | Nango action worker | Sync to QuickBooks, trigger webhooks, execute Nango actions after state machine transitions. |
| `video-transcode` | CMS media upload | Cloudflare Stream API worker | Upload origin video → wait for Stream transcoding → update media record. |

**Why BullMQ (not raw Redis lists):** Durable (persisted in Redis), retry with exponential backoff, delayed jobs, dead-letter queue, progress tracking, job events for observability.

### 8. Mastra — AI Agent Framework (Phase 1)

**Role:** Agent orchestration with guardrails and memory.

**Core capability:** Mastra provides the agent runtime with tool-based execution. We provide the tools (generateLayout, analyzeAnalytics, generateContent, etc.) and the permission model (auto/approval/denied). BullMQ queues agent tasks. Mastra workers pick them up.

**Not needed in Phase 0:** Phase 0 uses direct LLM calls with manual prompting. Mastra comes in Phase 1 when we need structured agent orchestration with guardrails and memory.

### 9. Nango — External API Integrations (Phase 2+)

**Role:** Managed OAuth + rate limiting + retries for 800+ external APIs.

**Infrastructure needs (from Nango's official docker-compose):**

| Dependency | Why | In Our Setup |
|------------|-----|-------------|
| Postgres (database `nango`) | Stores integration configs, OAuth connections/tokens, sync records, action logs | Already in our Postgres — `scripts/compose/init-dbs.sh` creates `nango` DB |
| Redis (7.2+) | Job queue backend for sync jobs, action execution, webhook processing | Shared with our DragonflyDB instance (same Redis protocol) |
| Elasticsearch (optional) | Log storage if `NANGO_LOGS_ENABLED=true` | Not needed for Phase 2 launch — Postgres handles basic logging |

**How Nango integrates with our platform:**
- XState machine definitions reference Nango actions as side effects (`invoke: { src: "nango.syncToQuickBooks" }`)
- Agent domain can trigger Nango actions via tool calls
- Nango connector catalog is discoverable via our plugin system
- Self-hosted Nango runs alongside our server in the same K8s cluster

---

## Infrastructure Topology (K8s Production View)

```
┌──────────────────────────────────────────────────────────────────┐
│                        KUBERNETES CLUSTER                         │
│                                                                   │
│  ┌─────────────────────────┐   ┌─────────────────────────────┐  │
│  │ POSTGRES (Vela or        │   │ DRAGONFLYDB (Redis compat)  │  │
│  │ StatefulSet)             │   │ StatefulSet, 3 replicas     │  │
│  │  ├─ DB: app              │   │  ├─ Cart sessions           │  │
│  │  ├─ DB: zitadel            │   │  ├─ Rate limit counters     │  │
│  │  └─ DB: nango            │   │  ├─ State machine locks     │  │
│  └─────────────────────────┘   │  └─ BullMQ queues (Phase 1+) │  │
│                                 └─────────────────────────────┘  │
│  ┌─────────────────────────┐   ┌─────────────────────────────┐  │
│  │ CLICKHOUSE               │   │ ZITADEL (Deployment)          │  │
│  │ StatefulSet, 2 replicas  │   │  ├─ Auth UI                 │  │
│  │  ├─ Event ingestion      │   │  ├─ JWKS endpoint           │  │
│  │  ├─ ML training queries  │   │  └─ Admin console           │  │
│  │  └─ Dashboard SQL        │   └─────────────────────────────┘  │
│  └─────────────────────────┘                                      │
│                                                                    │
│  ┌─────────────────────────┐   ┌─────────────────────────────┐  │
│  │ PLATFORM SERVER          │   │ NANGO (Phase 2+)            │  │
│  │ Deployment, 3 replicas   │   │ Deployment, 2 replicas      │  │
│  │  ├─ 9 DDD domains        │   │  ├─ OAuth token mgmt       │  │
│  │  ├─ Hono API routes      │   │  ├─ Sync/action workers    │  │
│  │  └─ In-memory event bus  │   │  └─ Connect UI              │  │
│  └─────────────────────────┘   └─────────────────────────────┘  │
│                                                                    │
│  ┌─────────────────────────┐   ┌─────────────────────────────┐  │
│  │ BULLMQ WORKERS (Ph 1+)   │   │ MASTRA AGENTS (Phase 1)     │  │
│  │  ├─ agent-tasks          │   │  ├─ Layout Gen LLM          │  │
│  │  ├─ analytics-events     │   │  ├─ Content Gen LLM         │  │
│  │  ├─ email-outbound       │   │  └─ Analytics Analysis      │  │
│  │  └─ nango-side-effects   │   └─────────────────────────────┘  │
│  └─────────────────────────┘                                      │
└──────────────────────────────────────────────────────────────────┘

                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│                    CLOUDFLARE EDGE (Global)                        │
│                                                                   │
│  ┌───────────────────────────┐   ┌───────────────────────────┐  │
│  │ WORKER: Auth Gateway      │   │ WORKER: Schema Delivery    │  │
│  │  ├─ JWT validation (<5ms) │   │  ├─ KV: JSON specs cache   │  │
│  │  ├─ Redirect to ZITADEL     │   │  ├─ KV: Prerendered HTML   │  │
│  │  └─ Attach tenantId/userId│   │  └─ SEO renderer (React 19)│  │
│  └───────────────────────────┘   └───────────────────────────┘  │
│                                                                   │
│  ┌───────────────────────────┐   ┌───────────────────────────┐  │
│  │ KV: Cache by segment hash │   │ R2: Media + Client Bundle  │  │
│  └───────────────────────────┘   └───────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Local Development (docker-compose.yml)

| Service | Prod Equivalent | Local Dev | Notes |
|---------|----------------|-----------|-------|
| Postgres | Vela on K8s / K8s StatefulSet | Docker container (port 5432) | 3 DBs: app, zitadel, nango. Script at `scripts/compose/init-dbs.sh` |
| DragonflyDB | K8s StatefulSet (3 replicas) | Docker container (port 6379) | Redis-compatible. No password for local dev. |
| ClickHouse | K8s StatefulSet (2 replicas) | Docker container (port 8123/9000) | Analytics queries work locally. |
| ZITADEL | K8s Deployment | Docker container (port 8080) | Self-hosted. Console + OIDC. |
| Nango | K8s Deployment (Phase 2+) | Docker container (port 3003, profile: integrations) | Optional. Separate DB `nango`. |
| Platform Server | K8s Deployment (3 replicas) | Docker container (`app`, port 3000) | `build: .` from Dockerfile. |
| Cloudflare Workers | Global edge workers | `wrangler dev` | Local dev via wrangler CLI. |
| R2 | Global object storage | `wrangler dev` (local) | wrangler simulates R2 locally. |

---

## Scaling Thresholds — When To Upgrade Each Service

| Service | Current (Phase 0) | Scale Trigger | Upgrade To | Phase |
|---------|-------------------|---------------|------------|-------|
| Postgres | Docker, single instance | >50 stores → K8s StatefulSet + read replica. >500 stores → Vela | Phase 1-2: K8s StatefulSet + PgBouncer. Phase 3-4: Vela (compute/storage separation, instant branching per tenant, per-store DB isolation) | Phase 1 → Phase 3 |
| DragonflyDB | Docker, single instance | >1000 concurrent cart sessions, >100 agent tasks/min | K8s StatefulSet, 3 replicas, sentinel for HA | Phase 1 |
| ClickHouse | Docker, single instance | >100M analytics events/day | ClickHouse cluster with sharding per tenant group, tiered storage | Phase 2 |
| ZITADEL | Docker, single instance | >10k concurrent users, global latency >100ms | Multi-region ZITADEL deployment, regional Postgres replicas for JWKS | Phase 3 |
| BullMQ | Not used (Phase 0) | >10 async jobs/min, >100 events/sec | BullMQ with Redis cluster, dedicated worker pods per queue type | Phase 1 |
| Nango | Profile: integrations (Phase 0) | >10 active integrations/store, >100 sync jobs/day | K8s deployment, 2 replicas, dedicated Redis instance (separate from platform Redis) | Phase 2 |
| Cloudflare Workers | 3 workers (auth, schema, SEO) | Global traffic >1M req/day, >50ms p95 in any region | Additional worker routes per region, Workers for Platforms (multi-tenant isolation) | Phase 2 |

### Postgres Scaling — Full Progression

| Phase | Stores | Setup | Why |
|-------|--------|-------|-----|
| **Phase 0** | 0 (internal) | Docker container | Single instance, 3 DBs (app, zitadel, nango). Zero ops overhead. |
| **Phase 1** | 50 | K8s StatefulSet + 1 read replica | Read replica offloads analytics queries from primary. PgBouncer for connection pooling. Standard Helm chart. |
| **Phase 2** | 200 | K8s StatefulSet + 2 read replicas + PgBouncer + Patroni (HA) | Patroni handles automatic failover. Multiple read replicas distribute query load across domains. Still column-level tenant isolation (`storeId`). |
| **Phase 3** | 500 | Consider Vela | At 500 stores, tenant isolation via `storeId` columns becomes cumbersome. Some high-value tenants want dedicated staging/QA environments. Vela's instant cloning + compute/storage separation becomes valuable. But K8s StatefulSet still works if tenant diversity is low. |
| **Phase 4** | 5,000 | Vela is the right choice | Per-tenant database isolation required (not just column-level). Enterprise tenants demand independent scaling (one tenant's load spike shouldn't affect others). Branching for enterprise QA workflows. Vela's KubeVirt/NVMe-oF overhead is justified — it replaces a custom multi-tenant isolation system that would take 6+ months to build. |

**Vela entry threshold:** Phase 3-4 (>500 stores). Before 500 stores, K8s StatefulSet + Patroni + PgBouncer is simpler, cheaper, and well-understood. Vela adds KubeVirt VMs + NVMe-oF storage fabric — operational complexity worth it only when tenant isolation, independent scaling, and DB branching become hard requirements that would otherwise need custom infrastructure engineering.

---

## Nango Specific — What It Needs From Our Infrastructure

Nango's self-hosted docker-compose requires 3 services we already provide:

| Nango Requirement | Our Setup | Shared/Dedicated | Decision |
|-------------------|-----------|-----------------|----------|
| **Postgres** (database: `nango`) | Postgres 16, DB `nango` already created by `scripts/compose/init-dbs.sh` | Shared Postgres instance, separate database | Fine for Phase 2. Separate Postgres instance only if Nango load affects platform queries. |
| **Redis** (7.2+) | DragonflyDB on port 6379 | Shared DragonflyDB instance | Fine for Phase 2. Nango uses Redis for job queues (sync, actions). Separate Redis if Nango queue load competes with cart/rate-limit ops. |
| **Elasticsearch** (optional) | Not needed initially | Skip | `NANGO_LOGS_ENABLED=false` by default. Logs go to Postgres. Add Elasticsearch only if log volume is high. |

**Nango env vars we already configure (docker-compose.yml):**
- `NANGO_DB_HOST: postgres` → our shared Postgres
- `NANGO_DB_NAME: nango` → dedicated database within Postgres
- `NANGO_DB_USER: noname` → shared user
- `NANGO_DB_PASSWORD: ${NANGO_DB_PASSWORD:-nango_dev}` → env variable
- `NANGO_SECRET_KEY: ${NANGO_SECRET_KEY:-dev_secret_key}` → env variable
- Redis connection: Nango server connects to our DragonflyDB (same port 6379, Redis protocol)

---

## Cost Summary (Monthly Estimates)

| Service | Phase 0 (Local Dev) | Phase 1 (Launch, 50 stores) | Phase 3 (Scale, 500 stores) |
|---------|--------------------|-----------------------------|----------------------------|
| Postgres | $0 (Docker) | $50-100 (managed K8s PV) | $300-500 (Vela or managed Postgres cluster) |
| DragonflyDB | $0 (Docker) | $20-50 (K8s pod) | $100-200 (3-node Redis cluster) |
| ClickHouse | $0 (Docker) | $50-100 (K8s pod + PV) | $200-500 (ClickHouse cluster + tiered storage) |
| ZITADEL | $0 (Docker, self-hosted) | $0-30 (K8s pod + PV) | $50-100 (multi-region deployment) |
| Cloudflare Workers | $0 (free tier) | $5-30 (1M+ req) | $50-100 (10M+ req) |
| Cloudflare R2 | $0 (free tier) | $5-20 (100GB) | $50-100 (1TB, zero egress) |
| Cloudflare Stream | $0 (not used) | $10-50 (100 min stored) | $50-200 (1000 min stored) |
| BullMQ + Redis | $0 (not used Phase 0) | $20-50 (worker pods) | $100-200 (dedicated workers) |
| Mastra | $0 (npm, not Phase 0) | $0 (npm package) | $0 (npm package) |
| Nango | $0 (not Phase 2) | $0 (Phase 2, self-hosted, MIT) | $50-100 (dedicated Postgres + Redis if needed) |
| LLM API (OpenAI/Claude) | $0 (Phase 0, own keys) | $100-500 (included in subscriptions) | $500-2000 (heavy AI usage) |
| **Total** | **$0** | **~$260-830** | **~$1450-3500** |

Note: LLM costs are the largest variable. On self-hosted free tier, user brings their own API key. On managed plans ($99-499/mo), we cover LLM costs within action limits.

---

## Simplified Infrastructure Vision (Vela as Base Platform)

With Vela as the K8s Postgres platform, the entire infrastructure reduces to 4 layers:

```
┌──────────────────────────────────────────────────────────────────┐
│                    CLOUDFLARE EDGE (Global CDN + Workers)         │
│  JWT validation, SEO prerender, JSON spec caching, R2 media      │
└──────────────────────────┬───────────────────────────────────────┘
                           │
┌──────────────────────────┴───────────────────────────────────────┐
│             DRAGONFLYDB (Redis-compatible cache + queue backend)  │
│  Cart sessions (TTL), rate limiting, BullMQ queues, locks         │
└──────────────────────────┬───────────────────────────────────────┘
                           │
┌──────────────────────────┴───────────────────────────────────────┐
│             CLICKHOUSE (Columnar analytics / time-series)         │
│  Schema-level event attribution, ML training, dashboard queries   │
└──────────────────────────┬───────────────────────────────────────┘
                           │
┌──────────────────────────┴───────────────────────────────────────┐
│   VELA (Serverless Postgres on K8s — the foundation)              │
│                                                                   │
│   ├─ Postgres: content (JSONB), orders (relational), machine defs │
│   ├─ DB cloning: instant tenant isolation, staging/QA branches    │
│   ├─ Compute/storage separation: scale CPU/IOPS independently     │
│   ├─ Auto APIs: REST/GraphQL generated from schema                │
│   ├─ Auth (built-in Keycloak): available but we use ZITADEL instead │
│   ├─ File storage: S3-compatible, zero egress                     │
│   └─ AI vector toolkit: pgvector embeddings                       │
│                                                                   │
│   Extensions (runs inside Vela K8s or alongside):                 │
│   ├─ ZITADEL (auth service): multi-tenant, pre-built UIs, MFA       │
│   │   Uses Vela Postgres (DB: zitadel)                              │
│   ├─ PLATFORM SERVER (Hono + Node.js): 9 DDD domains              │
│   │   Uses Vela Postgres (DB: app), DragonflyDB, ClickHouse       │
│   ├─ NANGO (Phase 2+, integrations): 800+ APIs                    │
│   │   Uses Vela Postgres (DB: nango), DragonflyDB for queues      │
│   └─ BULLMQ WORKERS + MASTRA AGENTS (Phase 1+): async processing  │
│       Uses DragonflyDB for queue backend                          │
└──────────────────────────────────────────────────────────────────┘
```

**Key insight:** Vela replaces managing raw Postgres containers/StatefulSets. Everything else (DragonflyDB, ClickHouse, ZITADEL, Nango, server, workers) runs as services on top of Vela's K8s platform — they consume Vela-managed Postgres via connection strings, DragonflyDB for caching/queues, ClickHouse for analytics. The entire infrastructure becomes: **Vela (foundation) + 3 supporting services (DragonflyDB, ClickHouse, Cloudflare Edge) + application services (ZITADEL, Nango, platform server, workers).**

**Why ZITADEL over Vela's built-in Keycloak:**
- **Vela uses Keycloak because Vela is a platform for platforms** — it manages multiple organizations, projects, and database branches across different teams. Keycloak's enterprise IAM model (realms, federated SSO, fine-grained RBAC across organizations) maps naturally to a "database platform for developers." Vela's README describes it as "centralized authentication and identity provider, shared globally across all organizations and projects" — this is platform-level auth for managing the Vela instance itself and its tenants.
- **We use ZITADEL because we're a SaaS application, not a database platform** — our auth is B2C (store customers) + B2B (store owners). ZITADEL is purpose-built for multi-tenant SaaS: pre-built sign-in/admin UIs per tenant organization, magic link passwordless, MFA, social login connectors (Google/Apple/GitHub), and org-per-store isolation that maps 1:1 to our "each store = a ZITADEL organization" model.
- Keycloak is enterprise IAM (Apache 2.0, Java-based, 21k stars) — designed for corporate SSO, complex realm hierarchies, federation protocols (SAML, OIDC). Weighs hundreds of MB, needs Java runtime, configuration is XML-heavy. Overkill for "store owner logs in, store customer logs in."
- ZITADEL is lightweight (MPL-2.0, TypeScript, 12k stars) — Docker image ~200MB, Node.js runtime, configuration via API/admin UI. Designed exactly for "one SaaS platform with many tenant orgs, each with their own branded sign-in."
- We already committed to ZITADEL in ARCHITECTURE_DECISIONS.md and docker-compose.yml.
- **If we moved to Vela, we'd still run ZITADEL alongside it** — Vela's Keycloak handles platform-level auth (who can create DB branches, manage projects). Our ZITADEL handles application-level auth (store owners, store customers). Different concerns, different identity providers. Vela's Keycloak becomes available as a bonus, not a replacement.

### Strategic Option: Fork Vela to Replace Keycloak with ZITADEL

**Vela is Apache 2.0 licensed.** We can modify it to use ZITADEL as the auth provider instead of Keycloak. This unifies the entire stack under one auth system — no dual identity providers, no Keycloak Java runtime, no XML realm configuration.

**What this gives us:**
- **One auth provider for everything** — platform-level (who manages Vela DB branches) and application-level (store owners + customers) both use ZITADEL. Single user directory, single admin console, single JWKS endpoint for edge validation.
- **No Keycloak operational burden** — eliminates Java runtime, XML realm configs, Keycloak-specific upgrade/migration headaches. Our entire infra auth stack is Node.js/TypeScript.
- **Reuse our ZITADEL expertise** — we already know ZITADEL's API, org model, JWT structure. Vela's auth integration points (API gateway Kong, Studio UI, Controller) are known interfaces we can redirect to ZITADEL.

**What this costs:**
- **Engineering effort to fork and modify Vela** — Vela's auth integration touches Kong API gateway (JWT validation middleware), Vela Studio (admin UI auth), and Vela Controller (API auth). Each integration point needs ZITADEL equivalents. Estimate 2-4 weeks of Rust/TypeScript work.
- **Ongoing fork maintenance** — every Vela upstream release needs merge/rebase. Keycloak-specific changes won't apply; we maintain our ZITADEL auth layer.
- **Risk if Vela auth model diverges** — if Vela adds Keycloak-specific features (custom SPI extensions, realm-based tenant isolation), our ZITADEL fork needs equivalent implementations.

**Verdict:** Valuable at Phase 3+ if we commit to Vela as the foundation. Not worth it in Phase 0-2 when Vela isn't in use yet. At Phase 3, the fork cost (2-4 weeks) is justified by the operational simplification (no Keycloak, unified auth). Before Phase 3, maintain ZITADEL separately — no Keycloak exists in our stack yet anyway.

**Alternative: Run Vela's Keycloak + our ZITADEL side-by-side.** Less engineering, two auth providers. Keycloak only handles Vela platform auth (small user set: our team + store owners who need DB branching access). ZITADEL handles all application auth (store customers + store admin dashboard). The operational overhead of Keycloak is low because its user base is tiny — just platform operators.

**Tenant isolation via Vela DB cloning:**
- Phase 0-2: column-level isolation (`storeId` on every record)
- Phase 3+: Vela instant cloning → optional database-per-tenant for high-value stores needing full data isolation
- Vela branching → every store can have a staging/QA clone of their production database for testing AI-generated layout changes before launch

---

## Discussion Topics / Open Decisions

### DECISION: Vela as Foundation Platform
**Status:** Target for Phase 3+. Not required before launch. Overkill for Phase 0-2.
**Rationale:** Vela's serverless Postgres with compute/storage separation and instant cloning makes tenant isolation, scaling, and QA environments trivial. But it's heavier infrastructure (requires KubeVirt, NVMe-oF). Phase 0-2 runs on vanilla K8s Postgres StatefulSet. Phase 3 migration to Vela adds multi-tenant DB isolation without changing application code.
**Tradeoff:** Operational complexity of KubeVirt VMs + NVMe storage fabric vs. building our own tenant isolation, DB cloning, and scaling tooling from scratch. Vela is the buy-over-build choice for Postgres infrastructure.

**Overkill analysis — Why not Vela in Phase 0-2:**
- **KubeVirt/NVMe-oF are heavy infra:** Need a team that understands VM orchestration on K8s, NVMe over Fabrics, and custom storage controllers. Premature at 50-200 stores.
- **We don't need instant cloning yet:** `pg_dump` / `pg_restore` or Postgres template databases work fine for staging environments at <200 stores.
- **We don't need compute/storage separation yet:** All tenants have similar load profiles until 500+ stores with diverse traffic patterns.
- **We don't need auto-generated APIs:** Our Hono + Drizzle ORM provides deliberate DDD domain APIs. Vela's PostgREST/pg_graphql auto-generation adds unused surface area.
- **Vela replaces things we don't build ourselves until Phase 3+:** Tenant isolation, DB branching, independent scaling — these are Phase 3-4 problems Vela solves. Building them from scratch at Phase 0-2 is premature; buying Vela at Phase 0-2 is paying for infrastructure complexity you don't need yet.
- **What we should build instead in Phase 0-2:** AI agent manager, commerce engine, json-render catalog, context engine, A/B testing. Postgres is a commodity at this scale — spend engineering time on differentiation, not database infrastructure.

1. **Postgres scaling: Vanilla StatefulSet vs. Vela?**
   - Vela gives us Git-like DB branching (clone prod → test migrations safely), compute/storage separation (scale independently), RBAC/IAM, auto-generated REST/GraphQL APIs.
   - Vanilla K8s StatefulSet is simpler to operate, more predictable, and has broader community support.
   - Tradeoff: Vela adds operational complexity (KubeVirt VMs, NVMe-oF storage layer) but gives us instant DB cloning for tenant isolation and QA environments.

2. **Shared vs. dedicated Redis for Nango?**
   - Phase 2: share DragonflyDB (Nango queue load is low at 50-200 stores).
   - Phase 3+: dedicate Redis instance if Nango sync job volume competes with platform cart/rate-limit throughput.

3. **BullMQ: Phase 0 or Phase 1?**
   - Current decision (from ARCHITECTURE_DECISIONS.md): BullMQ removed for Phase 0. In-memory event bus. BullMQ added when async scale demands it.
   - Risk: AI agent tasks in Phase 0 block the Hono request path (LLM calls are slow). Acceptable for demo/internal use. Must add BullMQ before public launch (Phase 1, deliverable 1.7).

4. **ClickHouse: Local dev skip is safe?**
   - Stack plan says local dev can skip ClickHouse (events to console).
   - Phase 1 launch: ClickHouse is critical for attribution analytics. Must be production-grade before first paying store.

5. **Multi-tenancy at K8s level?**
   - Current plan: one Postgres instance, tenant isolation via `storeId` column + separate ZITADEL organizations.
   - Vela alternative: instant DB clone per tenant → full isolation at DB level, not column-level. More secure, more resource intensive.

---

## References

- `docs/2026-05-23/STACK.md` — Complete technology reference, what each service does
- `docs/2026-05-23/TECH.md` — Technical architecture, data layer, auth architecture
- `docs/2026-05-23/BUILD_PLAN.md` — Domain map, event-driven patterns, scaling thresholds
- `docs/2026-07-04/ARCHITECTURE_DECISIONS.md` — Monorepo structure, domain map, key decisions
- `docker-compose.yml` — Current local dev setup (Postgres, DragonflyDB, ClickHouse, ZITADEL, Nango)
- `scripts/compose/init-dbs.sh` — Postgres database initialization (app, zitadel, nango)
- Nango official `docker-compose.yaml` — Self-hosting requirements (Postgres + Redis + optional Elasticsearch)
- Vela: https://github.com/simplyblock/vela — Serverless Postgres on K8s with Git-like branching