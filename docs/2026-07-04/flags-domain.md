# Flags Domain — Implementation Plan

> ⚠️ **Historical plan (2026-07-04)** — flags domain is **fully implemented** (CRUD, evaluate, SSE). See [`../2026-07-27/FLAGS-UI-LIVE-UPDATE-DECISION.md`](../2026-07-27/FLAGS-UI-LIVE-UPDATE-DECISION.md) and [`../2026-07-11/STATUS.md`](../2026-07-11/STATUS.md).

## Date: 2026-07-04

## Purpose

The flags domain is the platform's **feature flag and progressive delivery control plane**. Any authenticated user — store owners, admins — can manage feature toggles that control runtime behavior across the platform: which payment methods are active, which AI agent permissions apply, which layout variants are served to which segments, which integrations are enabled per store, and which experimental features are exposed.

It is NOT a replacement for LaunchDarkly — it is a native platform capability that makes per-visitor toggling manageable, auditable, and queryable. The platform already performs feature-flag-like behavior via JSON spec conditions, context engine segment resolution, and A/B bandit variant routing. This domain makes that behavior explicit and manageable, not scattered across JSON specs and state machine guards. The platform's existing architecture (JSON spec conditions, context engine segment resolution, A/B bandit variant routing) already performs feature-flag-like behavior. This domain makes that behavior **explicit, manageable, auditable, and queryable** as a first-class domain rather than implicit logic scattered across JSON specs and state machine guards.

## Architecture

The flags domain follows the same Domain-Driven Design pattern as all other bounded contexts in `packages/server/src/domains/`:

```
packages/server/src/domains/flags/
├── api.ts          # Hono route handlers (CRUD flags, evaluate, batch-evaluate)
├── ports.ts        # FlagStorage interface + FlagEvaluationContext
├── entity.ts       # FeatureFlag aggregate root (extends AggregateRoot)
├── schema.ts       # Postgres table schema (flags + flag_evaluations)
├── service.ts      # Business logic (validate, evaluate, resolve targeting)
├── events.ts       # Domain events (flag.created, flag.updated, flag.deleted, flag.evaluated)
├── adapters/       # Storage adapters
│   └── postgres.ts # Postgres adapter (flags table + evaluations table)
└── index.ts        # Domain bootstrap (wire adapters, register routes, register listeners)
```

### Target Architecture

```
Flag management path:
  POST /api/flags          → Create flag (boolean, multivariate, percentage rollouts)
  GET  /api/flags          → List flags per tenant
  PUT  /api/flags/:id      → Update targeting rules, default value, rollout percentage
  DELETE /api/flags/:id    → Soft-delete (archive, never hard-delete — flags are auditable)

Flag evaluation path:
  Edge Worker /personalize
    → Resolve context signals → context hash
    → POST /api/flags/evaluate  (tenantId, contextHash, flagKeys[])
    → flags service evaluates targeting rules per context hash
    → Returns { flagKey: value } map
    → JSON spec conditions reference flag values ($flags.enable_apple_pay)
    → Analytics: flag.evaluated event logged per evaluation

Flag analytics path:
  ClickHouse queries for flag evaluation history:
    - How many visitors saw flag X enabled?
    - Conversion rate when flag X is true vs false?
    - Rollout progress for percentage flags?
```

### Event Shape (Flag Definition)

```typescript
{
  flagId:      string;       // UUID
  tenantId:    string;       // store/site ID
  key:         string;       // unique within tenant — e.g. "enable_apple_pay", "checkout_v2", "ai_auto_approve"
  type:        "boolean" | "multivariate" | "percentage";  // evaluation type
  description: string;       // human-readable description
  defaultValue: unknown;     // fallback when no targeting rule matches
  targeting:   TargetingRule[];  // ordered list of rules (first match wins)
  status:      "active" | "inactive" | "archived";
  createdAt:   string;       // ISO-8601
  updatedAt:   string;       // ISO-8601

  // Scope constraints (optional)
  schemaId:    string | null; // if set, flag only evaluated when this template is active
  variantId:   string | null; // if set, flag scoped to specific layout variant
}
```

### Targeting Rules

```typescript
interface TargetingRule {
  priority: number;         // evaluation order (0 = first, higher = later)
  condition: Condition;     // match criteria
  value: unknown;          // flag value when this rule matches
}

type Condition =
  | { type: "segment"; hash: string; }                    // match specific context segment
  | { type: "segment_group"; hashes: string[]; }          // match any of these segments
  | { type: "percentage"; percent: number; seed?: string; }  // deterministic % rollout
  | { type: "property_match"; property: string; operator: string; value: unknown; }  // match context property
  | { type: "always"; }                                   // catch-all rule (last in list)
  | { type: "expression"; expr: string; }                 // arbitrary expression evaluated against context
```

### Flag Evaluation Context (What gets passed to evaluate())

```typescript
interface FlagEvaluationContext {
  tenantId:    string;
  contextHash: string;       // deterministic segment hash from context engine
  contextProperties: {       // raw context signals (for property_match rules)
    device:     "mobile" | "desktop" | "tablet";
    region:     string;      // e.g. "JP", "US"
    referral:   string;      // e.g. "instagram", "google", "direct"
    userTier:   string;      // e.g. "new", "returning", "VIP"
    locale:     string;
    // extensible — new signal categories added by context engine
  };
  schemaId:    string | null; // active template (for flag scoping)
  variantId:   string | null; // active variant (for flag scoping)
}
```

## Flag Types and Use Cases

### Boolean Flags

The simplest toggle. On/off for a feature.

| Flag key | Scope | Usage |
|----------|-------|-------|
| `enable_apple_pay` | Per-store | Apple Pay button appears in checkout |
| `enable_google_pay` | Per-store | Google Pay button appears in checkout |
| `enable_one_tap_checkout` | Per-store + segment | 1-tap checkout for returning VIPs |
| `enable_social_proof` | Per-template | Social proof widget renders |
| `enable_ai_product_descriptions` | Per-store | AI generates product descriptions |
| `enable_rage_click_detection` | Per-store | Session replay flags rage clicks |
| `enable_sticky_cta_mobile` | Per-template + segment | Sticky add-to-cart on mobile |

### Multivariate Flags

Multiple string/number values. A/B test variants, payment method selection, theme selection.

| Flag key | Values | Usage |
|----------|--------|-------|
| `checkout_layout` | `"one-page"`, `"three-step"`, `"express"` | Which checkout layout variant |
| `product_page_hero` | `"image-first"`, `"video-first"`, `"minimal"` | Hero variant per segment |
| `recommendation_algorithm` | `"ml-bundle"`, `"manual"`, `"trending"` | Which product recommendation engine |
| `payment_gateway_order` | `["stripe","paypal","apple"]`, `["paypal","stripe"]`, ... | Payment method display order |
| `theme_mode` | `"light"`, `"dark"`, `"system"` | Color mode |

### Percentage Flags (Progressive Rollouts)

Deterministic percentage-based rollout. Same visitor always gets the same evaluation (hash-based), enabling gradual feature deployment.

| Flag key | Rollout | Usage |
|----------|---------|-------|
| `new_checkout_v2` | 5% initially → 25% → 100% | Gradual rollout of redesigned checkout |
| `ai_generated_hero` | 10% of new visitors | Canary test AI-generated hero images |
| `experimental_search` | 1% → 5% → 20% | Progressive rollout of Typesense-powered search |
| `edge_ml_inference` | 50% of mobile JP visitors | Test edge ML personalization in target market |

## API Surface (To Be Implemented)

```
POST   /api/flags                          → Create a feature flag
                                              Body: { key, type, description, defaultValue, targeting, schemaId?, variantId? }
                                              Response: { flagId, key, type, status: "active" }

GET    /api/flags                          → List flags for tenant
                                              Query: ?status=active&schemaId=...&type=boolean
                                              Response: { flags: [...] }

GET    /api/flags/:id                      → Get single flag definition
                                              Response: { flagId, key, type, defaultValue, targeting, ... }

PUT    /api/flags/:id                      → Update flag (targeting rules, default value, status)
                                              Body: { targeting?, defaultValue?, status? }
                                              Response: { flagId, key, ...updated fields }

DELETE /api/flags/:id                      → Archive flag (soft-delete — never hard-delete)
                                              Response: { flagId, status: "archived" }

POST   /api/flags/evaluate                 → Evaluate flags for a given context
                                              Body: { tenantId, contextHash, contextProperties, flagKeys?, schemaId?, variantId? }
                                              Response: { evaluations: [{ flagKey, value, matchedRule, reason }] }

POST   /api/flags/evaluate-batch           → Batch evaluate for multiple visitors (bulk evaluation for edge cache warming)
                                              Body: { tenantId, evaluations: [ EvaluationContext ] }
                                              Response: { results: [{ contextHash, evaluations }] }

GET    /api/flags/:id/evaluations           → Evaluation history for a flag (analytics)
                                              Query: ?from=...&to=...&segmentHash=...
                                              Response: { evaluations: [{ timestamp, contextHash, value, matchedRule }] }
```

## Cross-Domain Integration

### How the edge domain uses flags

```
Visitor request
  → Edge Worker /personalize
  → Context engine resolves signals → contextHash
  → Flags domain POST /evaluate → { flagKey: value } map
  → documents domain (layout type) queries layout WHERE segment = contextHash
  → JSON spec conditions resolve with $flags namespace:
      "condition": "{{$flags.enable_social_proof}}"
      "condition": "{{$flags.checkout_layout === 'express'}}"
  → Render personalized page (SEO prerender or client bundle)
  → Analytics: flag.evaluated event logged with attribution
```

### How the A/B engine uses flags

```
A/B bandit detects winning variant
  → Creates/updates multivariate flag (e.g. "checkout_layout")
  → Sets targeting: winner gets 80% traffic, challengers split 20%
  → Flag evaluation distributes traffic deterministically
  → Analytics tracks conversion per flag value
  → Bandit re-evaluates → updates flag targeting
  → Loop: flag → evaluation → analytics → bandit → updated flag
```

### How AI agents use flags

```
Merchant assigns task: "Add Apple Pay for mobile visitors in Japan"
  → AI agent generates flag definition:
      key: "enable_apple_pay_mobile_jp"
      type: "boolean"
      targeting: [
        { condition: { segment: "seg_a3f2b1" }, value: true },  // mobile-JP-returning
        { condition: { always: true }, value: false }
      ]
  → Merchant reviews flag definition (not code)
  → Merchant approves → flag created → live
  → Edge worker evaluates flag per request
  → Analytics tracks flag evaluation + conversion
```

### Domain event subscribers

| Event published | Subscribed by | Purpose |
|----------------|---------------|---------|
| `flag.created` | analytics domain | Track flag creation volume |
| `flag.updated` | analytics domain | Track targeting changes |
| `flag.evaluated` | analytics domain | Track flag exposure (per contextHash, per value) |
| `flag.evaluated` | A/B engine | Feed evaluation data into bandit |
| `flag.archived` | audit domain (future) | Permanent audit trail |

## Storage: Postgres (Relational + JSONB)

### Why Postgres, Not ClickHouse

| Property | Postgres | ClickHouse |
|----------|----------|------------|
| Flag definitions (small, rare writes, frequent reads) | Ideal — relational with JSONB for targeting rules | Overkill — columnar is for millions of time-series rows |
| Targeting rules (JSON structure) | JSONB with GIN indexes | Would work but unnecessary |
| Evaluation history | Small volume (1 row per visitor per page view) | ClickHouse preferred at scale |
| Consistency (ACID) | Required — flag state changes must be atomic | Eventually consistent |

### Decision: Split storage

- **Flag definitions + targeting rules** → Postgres (`flags` table in `server/src/domains/flags/schema.ts`). Drizzle ORM. JSONB for `targeting` array. GIN index on `tenant_id`. Unique constraint on `(tenant_id, key)`.
- **Flag evaluation history** → Postgres for Phase 0 (simplicity, already running). Migrate to ClickHouse at scale (millions of evaluations/day). Evaluation events also published to event bus → analytics domain stores in ClickHouse with full attribution.

### Tables

```sql
-- flags table (Postgres)
CREATE TABLE flags (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL,
    key           TEXT NOT NULL,
    type          TEXT NOT NULL CHECK (type IN ('boolean', 'multivariate', 'percentage')),
    description   TEXT,
    default_value JSONB NOT NULL,
    targeting     JSONB NOT NULL DEFAULT '[]',
    status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
    schema_id     UUID,
    variant_id    UUID,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, key)
);

CREATE INDEX idx_flags_tenant_status ON flags (tenant_id, status);
CREATE INDEX idx_flags_schema ON flags (tenant_id, schema_id) WHERE schema_id IS NOT NULL;
```

```sql
-- flag_evaluations table (Postgres — Phase 0, migrate to ClickHouse at scale)
CREATE TABLE flag_evaluations (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flag_id       UUID NOT NULL REFERENCES flags(id),
    tenant_id     UUID NOT NULL,
    context_hash  TEXT NOT NULL,
    value         JSONB NOT NULL,
    matched_rule  INTEGER,     -- index of targeting rule that matched (null if default)
    reason        TEXT,        -- "targeting_rule_2", "default_value", "error_fallback"
    schema_id     UUID,
    variant_id    UUID,
    evaluated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_flag_evals_flag_time ON flag_evaluations (flag_id, evaluated_at DESC);
CREATE INDEX idx_flag_evals_context ON flag_evaluations (tenant_id, context_hash, evaluated_at DESC);
```

## Implementation Tasks (Ordered)

1. **`ports.ts`** — Define `FlagStorage` + `FlagEvaluationPort` interfaces
2. **`entity.ts`** — `FeatureFlag` aggregate root extending `AggregateRoot`
3. **`schema.ts`** — Postgres table definitions (Drizzle)
4. **`events.ts`** — Domain event constants (`flag.created`, `flag.updated`, `flag.deleted`, `flag.evaluated`)
5. **`adapters/postgres.ts`** — CRUD adapter + evaluation insert
6. **`service.ts`** — Business logic:
   - `createFlag()` — validate key uniqueness per tenant, normalize targeting rules
   - `evaluateFlags()` — iterate flags, match targeting rules (first-match-wins), return value map
   - `updateFlag()` — validate, update targeting, publish `flag.updated`
   - `archiveFlag()` — soft-delete, publish `flag.deleted`
7. **`api.ts`** — Hono routes for CRUD + evaluate + evaluate-batch
8. **`index.ts`** — Wire domain (create engine with adapter → register API routes → register event listeners)
9. **Wire into `server/src/index.ts`** — `app.route("/api/flags", createFlagsRoutes(...))`
10. **Integration with edge domain** — edge worker calls flags evaluate during personalization
11. **Integration with json-render** — add `$flags` namespace to expression evaluation context

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Flag storage** | Postgres (definitions + evaluations) | Small data volume. ACID for flag state changes. Already running. ClickHouse migration for evaluation history at scale. |
| **Not LaunchDarkly** | Build natively | Platform already has context engine, segment resolution, JSON spec conditions — adding a separate flag service duplicates evaluation logic. Native flags integrate with analytics, A/B engine, and AI agents seamlessly. |
| **First-match-wins targeting** | Ordered rules, priority 0 evaluated first | Simple. Predictable. Matches how most flag services work (LaunchDarkly, Flagsmith). Users read top-to-bottom. |
| **Deterministic percentage rollout** | Hash-based (tenantId + flagKey + contextHash), not random | Same visitor always gets same evaluation. Prevents flickering. Enables consistent analytics attribution. Gradual rollout with predictable cohort enlargement. |
| **Soft-delete only** | Archive, never hard-delete | Flags drive production behavior. Deleting a flag that's referenced in JSON specs or state machines would cause errors. Archiving preserves the definition for audit + rollback. |
| **Evaluation context** | Full context properties passed, not just hash | `property_match` targeting rules need raw properties (device, region, etc.). Context hash alone isn't enough for matching. Context engine already collects these signals. |
| **JSONB targeting** | Targeting rules stored as JSONB array | Flexible schema — new condition types added without migration. GIN index enables JSON path queries. Consistent with content/documents domain patterns. |
| **Edge evaluation** | Server-side POST /evaluate (not edge-native) | Phase 0: server evaluates. Cache results short-term (60s). Phase 2+: edge worker evaluates lightweight targeting rules inline for sub-5ms latency. Percentage and segment rules cached; property_match rules evaluated at edge. |
| **$flags namespace** | Expression context extension, not a new json-render binding type | json-render already supports expression conditions (`$template`, `$state`, `$cond`). `$flags` is an additional namespace in the same expression engine — no render-layer changes needed. |
| **Evaluation analytics** | Dual-write: Postgres + eventBus → ClickHouse | Immediate availability via Postgres (admin dashboard). Full attribution + time-series in ClickHouse (ML feedback loop). Event bus guarantees analytics domain captures every evaluation. |

## Domain Connections

```
┌─────────────────────────────────────────────────────────────┐
│                      FLAGS DOMAIN                            │
│                                                             │
│  MANAGEMENT PATHS:                                          │
│                                                             │
│  Admin dashboard ─→ POST /api/flags                        │
│  AI agents       ─→ POST /api/flags (generate + review)     │
│  A/B engine      ─→ PUT /api/flags/:id (update rollout)    │
│       │                                                     │
│       ▼                                                     │
│  Postgres (flags table + evaluations table)                 │
│                                                             │
│  EVALUATION PATH:                                           │
│                                                             │
│  Edge Worker /personalize                                   │
│       │                                                     │
│       ├─→ Context Engine: resolve signals → contextHash     │
│       ├─→ Flags Domain: POST /evaluate → { flag: value }   │
│       ├─→ documents Domain (layout type): layout query + flag-aware rendering  │
│       └─→ Analytics: flag.evaluated event logged            │
│                                                             │
│  INTEGRATION SURFACE:                                       │
│                                                             │
│  json-render conditions:                                    │
│    "condition": "{{$flags.enable_social_proof}}"            │
│    "condition": "{{$flags.checkout_layout === 'express'}}"  │
│                                                             │
│  State machine guards:                                       │
│    guard: (ctx) → flags.evaluate(ctx.tenantId, ctx.contextHash, ['new_checkout_v2'])['new_checkout_v2'] │
│                                                             │
│  Catalog handlers:                                          │
│    handler: (props) → { flags: await flagsService.evaluate(...) } │
│                                                             │
│  ANALYTICS FEEDBACK LOOP:                                   │
│                                                             │
│  flag.evaluated events ─→ ClickHouse                       │
│       │                                                     │
│       ├─→ A/B bandit: conversionRate(flagKey, flagValue)   │
│       ├─→ Admin dashboard: flag exposure analytics          │
│       └─→ ML feedback: which flag values drive best results │
└─────────────────────────────────────────────────────────────┘

---

## SSE Flag Delivery (2026-07-11)

> **Decision:** Replaced polling with Server-Sent Events. Bulk fetch on SDK `init()`, SSE pushes individual flag change notifications. Client refetches only the changed flag. LaunchDarkly model.

### Why SSE over Polling

| Dimension | Polling (30s) | SSE |
|-----------|--------------|-----|
| **Latency** | Up to 30s delay | <100ms after flag change |
| **Bandwidth** | ALL flags every 30s | Zero when idle. Single flag refetch on change |
| **Server load** | N × every 30s | N persistent connections. Near-zero when idle |
| **Real-time** | No | Yes |

### Architecture

```
Server: flag updated → flushEvents → eventBus → SSE Manager → stream.write()
Client: EventSource → onmessage → POST /evaluate { flagKeys: [key] } → cache → onUpdate
```

**1. Init:** `POST /api/flags/evaluate` → bulk fetch all flags → cache locally.
**2. Connect:** `GET /api/flags/stream?tenantId=X` → 30s heartbeat keeps alive.
**3. Change:** SSE pushes `{ key: "flag-name" }` → client re-fetches single flag.
**4. Reconnect:** EventSource auto-reconnect → full refetch to catch missed changes.

### Server Files

| File | Action | Purpose |
|------|--------|---------|
| `shared/sse-manager.ts` | **NEW** | Per-tenant SSE client tracking + broadcast |
| `flags/api.ts` | **MODIFY** | `GET /api/flags/stream` SSE endpoint |
| `flags/index.ts` | **MODIFY** | `eventBus.subscribe("flag.*")` → SSE broadcast |

### SSE Manager API

```typescript
addClient(tenantId, stream): string     // Register stream, returns id
broadcast(tenantId, { key }): void      // Push to all tenant clients
getClientCount(tenantId?): number       // Observability metric
```

### Client Integration (`browser-sdk/modules/flags.ts`)

```typescript
// On init:
const flags = await fetch("/api/flags/evaluate", { method: "POST", body: JSON.stringify({ context }) });
flagsCache = new Map(flags.evaluations.map(f => [f.flagKey, f.value]));

// Open SSE:
const es = new EventSource(`/api/flags/stream?tenantId=${tenantId}`);
es.onmessage = async (event) => {
  const { key } = JSON.parse(event.data);
  const res = await fetch("/api/flags/evaluate", { method: "POST", body: JSON.stringify({ context, flagKeys: [key] }) });
  const { evaluations } = await res.json();
  flagsCache.set(evaluations[0].flagKey, evaluations[0].value);
  notifyCallbacks(evaluations[0].flagKey, evaluations[0].value);
};
```

### SSE Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **SSE, not WebSocket** | `EventSource` API | Unidirectional is sufficient. No upgrade handshake. Works through proxies. Auto-reconnect built-in. |
| **SSE carries key only** | `{ "key": "flag-name" }` | Minimal payload. Client re-fetches value. Avoids per-client evaluation on server. |
| **Single flag refetch** | `flagKeys: ["changed-flag"]` | Only the changed flag is re-evaluated, not all 100+ flags. |
| **Heartbeat** | Every 30s | Keeps connection alive through proxies/load balancers. |
| **Reconnect → refetch all** | Full evaluate on reconnect | Missed changes during disconnection are caught. |
| **Per-tenant isolation** | `Map<TenantId, Map<StreamId, Stream>>` | Tenant A's changes never reach Tenant B's SSE streams. |
```