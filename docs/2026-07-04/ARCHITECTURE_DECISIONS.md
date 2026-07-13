# Architecture Decisions & Package Map
## What lives where, what every package does, and what it's intended to become.

---

> **Framing — "commerce" is an example vertical, not the product.** This document uses commerce (checkout, carts, orders, products) as a concrete illustration. The platform is **identity-agnostic**: its engines, domains, and data model are general-purpose and apply equally to booking, membership, SaaS, content, and any other use case. Commerce is the first vertical we validate against, not the platform's identity.

## Monorepo Structure

```
noname/
├── packages/
│   ├── server/          ← The platform. All domains, all APIs, all DB schemas.
│   ├── workers/         ← Cloudflare Edge Worker. JWT validation, KV cache, SEO prerender.
│   ├── client/          ← json-render runtime + commerce catalog + inline visual editor.
│   ├── cli/             ← Developer tool. init, dev, status, logs, errors.
│   └── browser-sdk/     ← Frontend analytics tracking SDK.
├── docs/2026-05-23/     ← Architecture, build plan, findings, roadmap.
├── docker-compose.yml   ← Postgres + Dragonfly(Redis) + ClickHouse + Logto + Nango(optional)
├── pnpm-workspace.yaml
└── package.json         ← Root scripts: dev, build, lint, typecheck
```

**No admin package.** The visual editor is a lazy-loaded mode inside `packages/client` — not a separate dashboard. No catalog or types packages — those were empty and deleted. The commerce component catalog lives in `packages/client/src/catalog.ts`.

---

## Package Map

### `packages/server` — THE PLATFORM

**What it is:** One Hono + Node.js API server. Pure API. No React. No SSR. No JSX.

**What it does:** All business logic, all domain events, all DB access, all API routes. Everything the platform needs to operate.

**Dependencies:** hono, drizzle-orm, postgres, xstate, zod, @json-render/core

**Dependencies removed (by decision):** react, react-dom, @json-render/react, bullmq, ioredis
- React: Rendering happens at edge (Cloudflare Worker) and client (browser), not on the API server.
- BullMQ: Event bus is in-memory for Phase 0. Queues added when async scale demands it.

**Future intent:** Stays pure API. When scale demands extraction, individual domains can become separate processes — but they'll still be API-only, no rendering. The boundaries are already clear (ports/adapters pattern in the documents domain, generic machine engine for all commerce flows).

**Internal structure:**

```
server/src/
├── index.ts              ← Hono entry point. Registers all domain routes + health check.
├── shared/               ← Cross-domain shared infrastructure.
│   ├── aggregate-root.ts ← DDD aggregate base class. Collects domain events, commits them on flush.
│   ├── domain-error.ts   ← Typed domain errors: NotFoundError, ValidationError.
│   ├── event-bus.ts      ← In-memory event bus. Publish→notify all subscribers synchronously.
│   └── slugify.ts        ← URL slug generation utility.
└── domains/              ← 8 DDD domains. Each has its own ports, schema, API routes.
```

---

### `packages/cli` — THE DEVELOPER TOOL

**What it is:** Commander-based CLI for local development and operations.

**What it does now:** Skeleton with `init`, `dev`, `status` commands (stubs).

**Future intent:**
| Phase | Commands |
|-------|----------|
| Phase 0 | `noname dev`, `noname init`, `noname status` (working) |
| Phase 1 | `noname deploy`, `noname logs`, `noname errors`, `noname db:migrate`, `noname db:studio` |
| Phase 2 | `noname machine:simulate` (test state machines locally) |

**Dependencies:** commander, chalk, execa

---

## Domain Map (8 Domains Inside `server/src/domains/`)

### `documents` — Unified JSON Document Domain (content + layout + backend-logic)

**Status:** ✅ Implemented. Full DDD pattern: ports/adapters, aggregate entities, domain events, Postgres storage.
**Files:** `api.ts`, `entity.ts`, `events.ts`, `ports.ts`, `schema.ts`, `service.ts`, `adapters/postgres.ts`, `index.ts`
**What it does:** The single domain that owns **all versioned JSON documents** ("document-types"). A document-type is just a JSON document with its own versioning, status, and variant axis. NOTE: the domain is named `documents` to avoid colliding with the json-render **spec** (the JSON *format* the edge renders) — that term is unchanged everywhere else. The domain ships with these types:
- **`content`** — authored business data (products, pages, blog, FAQ). Merchant-owned. Media stored as CDN/R2 URLs, not blobs. (`content_entries` JSONB, keyed by `tenantId` + content `type` + `slug`.)
- **`layout`** — json-render layout templates, per-segment variants, versioning. Designer-owned. Admin dashboard, store admin, and any other UI are just `layout` templates named by the caller (e.g. `admin_dashboard`, `admin_store`); the store id or context hash is passed as the `segment`. (`layouts` JSONB, `segment` column.)
- **`backend-logic`** (future) — JSON-defined backend behavior/flows that need their own versioning + variants (e.g. JSON flow definitions). Same shape as the others.

The `content` and `spec` domains were **removed and folded into `documents`**: `content` is now the `content` document-type, and the old `spec` (layout templates) is now the `layout` document-type. The `machines` table that previously lived in `spec/schema.ts` moved to `machines/schema.ts`.

Each type keeps **separate TypeScript ports, separate tables, separate `version`, separate `status`, separate cache keys, and distinct event names** (`content.created`/`content.updated`/`content.deleted`/`content.published`, `layout.created`/`layout.updated`/`layout.published`/`layout.archived`/`layout.variant_created`). All types share one machinery via a **type-registry**: a `DocumentStorage` interface and `createDocumentsService()` implement store / version / publish / cache / events once. The API routes are fully generic (`/api/documents/:type`) and dispatch by a registered `TypeHandler` per type — adding `backend-logic` means registering one handler, with **no route changes**. See `documents-domain.md` for the full rationale.
**Storage:** `content_entries` + `layouts` tables (JSONB). Workers KV cache at edge, keyed per type (content by slug, layout by segment).
**API routes:** `/api/documents/:type` (generic, dispatched by document-type), plus `/api/documents/content-types` for content-type schema management and `/api/documents/:type/:name/resolve` for per-segment layout resolution.
**Future:** Add real Zod-based content validation (validator is currently a stub returning `valid: true`). Connect to AI generation pipeline for automated creation of any type. Diff/patch via @json-render/core `diffToPatches()`. Integrate with `flags` domain — JSON spec conditions reference `$flags` namespace.

### `machines` — State Machine Engine (Generic Workflow Logic)

**Status:** 🟡 Routes stubbed, ports defined, schemas complete. No engine implementation yet.
**Files:** `api.ts`, `ports.ts`, `schema.ts`
**What it does:** EVERY commerce workflow — checkout, booking, refund, subscription, membership, wallet — is an XState machine definition stored as JSONB. The machine engine loads definitions, executes transitions with guards + row locks + side effects + audit logging.
**Tables:** `machine_instances` (running machines), `machine_transitions` (audit log), `carts`, `orders`
**API routes:** `GET/POST /api/machines/definitions`, `POST /api/machines/:machine/:transition`, `GET /api/machines/instances`, `GET /api/machines/instances/:id`
**Why these tables are *example* vertical data (commerce):** In the commerce example, carts and orders are data consumed BY the machine engine during transitions — a checkout machine transitions `pending_payment` → `paid` by checking the `orders` table (guard: payment received) and clearing the `carts` table on success. These are **illustrative only**: they belong to the commerce vertical's machine `context` (JSONB), not as generic `machines`-domain tables. A booking, membership, or SaaS flow has no cart/order. The generic engine persists only `machine_instances` + `machine_transitions`; vertical-specific data lives in the machine's JSONB `context` or a vertical module.
**Future:** Implement the XState engine wrapper (load definition from JSONB, validate transition, execute guards, row-lock, atomic state change, log to analytics). AI can generate new machine definitions via `POST /api/machines/definitions`. State machine guards can call flags domain for flag-gated transitions.

### `analytics` — Event Capture & Attribution

**Status:** 🟢 Implemented (2026-07-11). ClickHouse-only with BullMQ async ingestion.
**Files:** `api.ts`, `ports.ts`, `service.ts`, `listeners.ts`, `queue.ts`, `worker.ts`, `adapters/clickhouse.ts`, `index.ts`
**What it does:** Subscribes to ALL domain events via event bus (22 events). Every server event becomes an analytics event with full attribution. Frontend visitor events via `POST /api/analytics/track`. Query API for events, aggregations, conversion rates.
**API routes:** `POST /api/analytics/track`, `GET /api/analytics/events`, `GET /api/analytics/aggregations`, `GET /api/analytics/conversions`
**Write path:** Event → BullMQ queue (`analytics-events`) → worker batches 50 events or every 2s → ClickHouse `INSERT`. Critical audit events (`machine.transition`, `task.failed`) bypass the queue and write directly to ClickHouse.
**Storage:** ClickHouse only. MergeTree engine, monthly partitions, 90-day TTL, ordered by `(tenant_id, event_type, timestamp)`. Table created on startup via `ensureClickHouseTable()`. No Postgres fallback — `schema.ts` and Postgres adapter removed.
**Future:** A/B engine queries `GET /api/analytics/conversions`, ML feedback loop, admin dashboard, agent performance scoring.

### `agent` — AI Agent Manager

**Status:** 🟢 Implemented (2026-07-11). BullMQ + Mastra-ready architecture.
**Files:** `api.ts`, `ports.ts`, `entity.ts`, `events.ts`, `schema.ts`, `service.ts`, `queue.ts`, `worker.ts`, `tools.ts`, `adapters/postgres.ts`, `index.ts`
**What it does:** Human-in-the-loop AI agents. Merchant assigns tasks → BullMQ enqueues → Worker picks up → AgentExecutor (Mastra-ready) executes → merchant reviews diff → approves/rejects. Three permission levels: auto (read-only analysis), human_approval (drafts), denied (pricing, PII, payments).
**API routes:** `POST /api/agents/tasks`, `GET /api/agents/tasks`, `GET /api/agents/tasks/:id`, `PUT /api/agents/tasks/:id/approve`, `PUT /api/agents/tasks/:id/reject`
**Architecture decision (2026-07-11):** BullMQ added back for async task execution from day one. No Phase 0 synchronous shortcuts. Worker has pluggable `AgentExecutor` interface — currently calls AI Pipeline directly, swap to Mastra agent runtime in Phase 1 without changing domain code. Tools defined in Mastra-compatible format (`AgentTool` with name, description, schema, execute).

### `ai-pipeline` — AI Generation Pipeline

**Status:** 🟢 Implemented (2026-07-11). Mock LLM with real provider structure.
**Files:** `api.ts`, `ports.ts`, `schema.ts`, `service.ts`, `index.ts`
**What it does:** LLM calls for generating layouts, content, and machine definitions. Consumed by the agent domain — agents call the pipeline to execute generation tasks. Mock responses when no API key configured; real LLM call when OPENAI_API_KEY or ANTHROPIC_API_KEY is set.
**API routes:** `POST /api/ai/generate/layout`, `POST /api/ai/generate/content`, `POST /api/ai/generate/machine`
**Future:** Multi-model abstraction layer (OpenAI, Claude, fine-tuned models). Prompt templates for commerce-specific generation. Token cost tracking per generation. **Add `POST /api/ai/generate/flag` for AI-generated flag definitions.**

### `context` — Context Engine (Visitor Signals → Segment)

**Status:** 🟡 Routes + ports stubbed. No signal resolution logic.
**Files:** `api.ts`, `ports.ts`, `schema.ts`
**What it does:** Ingests visitor signals (device, referrer, location, time, behavior history) → classifies into segments → returns segment hash. Edge worker uses segment hash to pick the right JSON spec for this visitor.
**Tables:** `segments` (segment definitions), `context_cache` (visitor→segment mapping)
**Future:** Implement signal taxonomy from TECH.md. Connect to ML for automated segment discovery. Per-segment A/B test variant routing. **Provide context hash + context properties to flags domain for flag evaluation.**

### `edge` — Edge Worker Interface

**Status:** 🟢 Implemented (2026-07-11). Full integration with documents + context + flags domains.
**Files:** `api.ts`, `ports.ts`, `service.ts`, `index.ts`
**What it does:** Bridge between Cloudflare Edge Worker and platform domains. `GET /api/edge/schema/:siteId?segment=` returns layout spec + flag values for a given segment. `POST /api/edge/personalize` resolves visitor context (headers → segment), evaluates flags, returns personalized layout. Injects layout service, context engine, and flag service via dependency injection.
**API routes:** `GET /api/edge/schema/:siteId`, `POST /api/edge/personalize`
**Future:** Cloudflare Worker code (separate runtime) for SEO prerender — worker fetches spec + data → renders HTML via React 19 stream → caches in Workers KV. Client bundle (json-render runtime + commerce catalog) shipped as immutable JS from R2.

### `flags` — Feature Flags & Progressive Delivery (NEW — added 2026-07-04)

**Status:** 🟢 Implemented (2026-07-11). Full DDD stack with Postgres.
**Files:** None yet. Plan covers: `api.ts`, `ports.ts`, `entity.ts`, `schema.ts`, `service.ts`, `events.ts`, `adapters/postgres.ts`, `index.ts`
**What it does:** Feature flag management and evaluation. Store owners toggle features (payment methods, checkout layouts, AI features). A/B bandit uses multivariate flags for variant routing. AI agents generate flag definitions. Edge worker evaluates flags per visitor context. json-render conditions reference `$flags` namespace.
**Tables:** `flags` (Postgres — definitions + targeting rules), `flag_evaluations` (Postgres Phase 0 → ClickHouse at scale)
**Decision:** Built natively, not LaunchDarkly. Platform already has context engine + segment resolution + JSON spec conditions. Native flags integrate with analytics (flag.evaluated events), A/B engine (multivariate variant routing), and AI agents (flag generation) without a third-party dependency.

---

## Platform Architecture (Three Layers + Visual Editor)

```
Layer 1: API SERVER (packages/server)
  Hono + Node.js + Postgres + Dragonfly(Redis) + ClickHouse + Logto
  Pure API. No React. No SSR. No JSX. 8 DDD domains.
  Deployed as Docker container.

Layer 2: EDGE WORKER (Cloudflare Workers, packages/workers)
  JWT validation: check admin/customer JWT → 302 redirect to Logto if invalid.
  SEO prerender: JSON spec + data → React 19 stream → HTML → KV cache.
  Editor gating: ?edit=true → verify admin JWT → serve client + editor chunks.
  JSON delivery: cached specs per segment → client bundle for interactivity.
  Deployed on Cloudflare Workers (300+ global locations).

Layer 3: CLIENT BUNDLE (Cloudflare R2 + CDN, packages/client)
  json-render runtime + commerce component catalog.
  Normal mode: hydrates JSON specs to interactive React trees in browser.
  Edit mode: same components + lazy-loaded editing overlay (click any component → edit props → save).
  Immutable JS assets. Versioned. Global CDN delivery.
  Editor chunks are code-split; zero bytes for visitors.
```

### Visual Editor (packages/client/src/editor/)

The visual editor is a **mode of the client bundle**, not a separate package. A merchant navigates to any page with `?edit=true`, clicks a rendered component, and edits its props in a slide-out panel. The same json-render catalog defines both rendering behavior AND edit metadata per component. The editor is lazy-loaded via dynamic `import()` — normal visitors never download it.

See [`VISUAL_EDITOR.md`](../docs/2026-07-11/VISUAL_EDITOR.md) for the full design.

---

## Key Architecture Decisions (Recorded Here)

| Decision | What we chose | Why |
|----------|--------------|-----|
| **Server role** | Pure API server. Hono + Node.js. No React, no SSR, no JSX. | React is only for rendering — that happens at edge (SEO prerender) and client (interactivity). API server focuses on business logic. Modeled after Shopify (Core API vs Oxygen storefront). |
| **Rendering** | Split: Edge SEO prerender + Client interactive bundle. | SEO pages rendered once at edge, cached. Interactive pages rendered in browser from JSON specs. No server-side rendering overhead. |
| **Auth** | Logto (separate Docker service) for all auth. JWT validated at Cloudflare edge. Invalid → redirect to Logto login. | PII isolation (passwords never touch API server). Edge validation stops bad requests before origin. Multi-tenancy built into Logto organizations. |
| **Workflow logic** | All workflows are XState machines in the machines domain — commerce is just the first example. No separate commerce ports/adapters/service. | Cart, checkout, refund, subscription (commerce example) — every flow is an XState machine definition (JSONB) executed by the generic machine engine. One `POST /api/machines/:machine/:transition` endpoint serves all flows. Adding a new flow = adding a new JSON definition, not new code. |
| **Event bus** | In-memory for Phase 0. BullMQ queues for async task execution (agent domain). | BullMQ re-added (2026-07-11) for agent task queue. Redis (DragonflyDB) backing. In-memory event bus still used for synchronous cross-domain events. |
| **Monorepo** | Two packages: server + cli. | Admin, catalog, types packages were empty and deleted. Server is the monolith (WordPress model). CLI is the developer tool. |
| **Database** | Postgres (JSONB for content + relational for ACID) + ClickHouse (analytics) + Dragonfly/Redis (future queues/cache). | One DB approach: JSONB where flexible, relational where ACID needed (orders, payments). ClickHouse for time-series analytics from day one. |
| **Platform identity** | Identity-agnostic. Commerce is the first vertical, not the only vertical. | Same architecture (json-render + XState + Content API + ClickHouse) powers commerce, booking, membership, SaaS — different catalogs + machines, same engine. |
| **Feature flags** | Built natively as a `flags` domain. NOT LaunchDarkly or any third-party flag service. | Platform already has context engine, segment resolution, JSON spec conditions, A/B bandit — native flags integrate seamlessly with these domains (flag.evaluated analytics events, multivariate A/B routing, AI-generated flag definitions, $flags namespace in json-render conditions). LaunchDarkly would be a separate service, separate billing, separate latency hop for behavior the platform already performs. |
| **Unified JSON document domain** | `content`, `layout`, and future `backend-logic` are document-TYPES inside ONE `documents` domain — not separate domains. Each type keeps its own `version`, `status`, cache key, and distinct event name. Named `documents` (not `spec`) to avoid colliding with the json-render **spec** format. | All are the same kind of thing: a versioned JSON document with variants. Forcing each into its own DDD domain duplicates identical ports/adapters/versioning/cache code N times. One domain + a type registry avoids that. Data stays separate (separate tables/JSONB); only the domain boundary collapses. Merging the *documents* (one JSON blob) was rejected — that causes version collisions and cache-blast. See `documents-domain.md`. |
| **Visual editor** | Inline click-to-edit mode inside `packages/client`, not GrapesJS drag-drop canvas, not a separate admin dashboard. | The visual editor IS the storefront — same URL, same components, same catalog. A `withEditing` HOC wraps each component for edit mode. Lazy-loaded via dynamic `import()` so visitors never download edit code (~50KB). Catalog defines both render props AND edit fields per component. Inline editing (like Shopify Theme Editor) is simpler to implement and more intuitive for merchants than a separate drag-drop builder. GrapesJS may be added later as an optional page-builder mode. See [`VISUAL_EDITOR.md`](../docs/2026-07-11/VISUAL_EDITOR.md). |