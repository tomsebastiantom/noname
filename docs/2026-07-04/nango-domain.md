# Nango Domain — Integration Layer

> ⚠️ **Plan doc (2026-07-04)** — Docker service exists; integration scripts are **Phase 2+**. Current platform status: [`../2026-07-11/STATUS.md`](../2026-07-11/STATUS.md).

> **Framing — "commerce" is an example vertical, not the product.** The booking/checkout/Stripe examples below illustrate the general pattern. The platform is **identity-agnostic** and the same Nango + XState pattern powers any vertical (booking, membership, SaaS, content).

## Purpose

Nango is the platform's **external API integration layer**. It handles all the infrastructure of connecting to 800+ third-party APIs — OAuth token management, rate limiting, retry logic, sync scheduling, webhooks, and environments (dev/staging/prod). Platform developers write **one TypeScript file per integration**, and Nango handles everything else.

Nango is NOT a CLI tool or developer utility. It is a separate Docker service (self-hosted, MIT license) with its own Postgres database, exposed on port 3003, that sits alongside the monorepo.

## Current State

| Component | Status | Detail |
|-----------|--------|--------|
| Docker service | ✅ Defined | `docker-compose.yml:62-78`, port 3003, `profiles: [integrations]` |
| Postgres database | ✅ Created | `scripts/init-dbs.sh:7` runs `CREATE DATABASE nango` |
| Env vars | ✅ Defined | `.env.example:16-18` — `NANGO_DB_PASSWORD`, `NANGO_SECRET_KEY` |
| Integration scripts | ❌ None | No TypeScript files written for any external API |
| Connection to XState engine | ❌ Not wired | Machine domain stub routes only — no engine wrapper |
| Connection to analytics pipeline | ❌ Not wired | Analytics listeners don't capture machine.transition events |
| LLM/Mastra | ❌ Not wired | Agent domain stub routes only |

Nango is labeled **"Phase 2+"** in `.env.example`. It starts only when explicitly requested: `docker compose --profile integrations up`.

## Architecture: Three Engines, One Platform

Nango is the **third engine** in the three-engine architecture that powers all platform use cases (commerce, booking, membership, SaaS, content):

```
json-render (UI Engine)    →    XState Machine Engine (Logic)    →    NANGO (Integrations)
───────────────────────         ────────────────────────────         ────────────────────────
$state resolution                Guards (pre-conditions)             OAuth token management
$template bindings               Row locks (SELECT FOR UPDATE)       Rate limiting + backoff
actions dispatch                 Atomic state transitions            Retry logic (exponential)
SpecStream (RFC 6902 diffs)      Side effects (email, calendar)      Sync scheduling
SSR (React 19 stream)            Audit logging                      Webhook ingestion
Condition evaluation             Permission checks                  Delta sync (checkpoints)
                                                                    Environments (dev/prod)
                                                                    Tenant isolation
```

### Responsibility Split: XState vs. Nango

| Responsibility | XState | Nango |
|---------------|--------|-------|
| When to call (timing, flow state) | ✅ Orchestrates | ❌ Just executes when called |
| How to call (URL, method, body) | ❌ Never knows | ✅ Defines the integration |
| Auth (OAuth tokens, API keys) | ❌ Never stores | ✅ Manages, refreshes, scopes |
| Retries (backoff, retry count) | ❌ Not needed | ✅ Built-in per integration |
| Rate limits (throttling) | ❌ Not needed | ✅ Handles per-provider limits |
| Error handling (which state next) | ✅ Routes to error state | ✅ Returns clean error to XState |
| Format | Pure JSON (AI-generatable) | TypeScript (developer-written) |

The XState machine definition is **pure JSON** — no API keys, no URLs, no retry logic, no auth tokens. AI can generate machine definitions from natural language descriptions. Nango integrations are **pure TypeScript** — developer-written, tested, versioned. XState orchestrates the flow. Nango manages the external.

### Example: Booking Flow with Stripe + Nango

```
XSTATE MACHINE (JSON definition):
──────────────────────────────────
"booking": {
  states: {
    "pending_payment": {
      on: { "CHARGE": { target: "paid", guard: "cardValid" } }
      entry: { type: "chargeCard", params: { amount: "$total" } }
    },
    "paid": {
      on: { "FULFILL": "fulfilled" }
      entry: { type: "syncToQuickBooks", params: { invoice: "$order" } }
    },
    "fulfilled": {
      entry: { type: "trackShipment", params: { tracking: "$trackingId" } }
      invoke: { src: "shippoTracker", onDone: "completed", onError: "delayed" }
    }
  }
}

NANGO INTEGRATION (TypeScript — one file each):
───────────────────────────────────────────────
stripe.charges.create({ amount, currency, source })
  → Nango handles: OAuth to Stripe Connect, retry on rate limit, token refresh
  → Returns: { success, chargeId } or { error, code }

quickbooks.invoice.create({ customerId, items, total })
  → Nango handles: OAuth to QuickBooks, sync scheduling, delta checkpoints
  → Returns: { success, invoiceId } or { error, code }

shippo.shipments.track({ trackingNumber, carrier })
  → Nango handles: carrier API integration, retry on carrier downtime
  → Returns: { status, location, eta } or { error, code }

MACHINE ENGINE WRAPPER (our code — packages/server/src/domains/machines/):
──────────────────────────────────────────────────────────────────────────
export async function executeTransition(machineName, transition, context) {
  // 1. Load machine definition from DB (JSONB)
  const machineDef = await db.query("SELECT definition FROM machines WHERE name = $1", [machineName]);

  // 2. Create XState machine from definition
  const xstateMachine = createMachine(machineDef);

  // 3. Check commerce-specific guards
  if (transition.guard === "slotAvailable") {
    const slot = await db.query("SELECT status FROM slots WHERE id = $1 FOR UPDATE", [context.slotId]);
    if (slot.status !== "available") throw new GuardError("Slot unavailable");
  }

  // 4. XState executes the transition
  const result = interpret(xstateMachine).start(context);
  result.send(transition.event);

  // 5. Handle side effects — delegate to Nango
  if (transition.sideEffect === "nangoSync") {
    await nango.trigger("syncToQuickBooks", { orderId: context.orderId });
  }
  if (transition.sideEffect === "sendEmail") {
    await bullmq.add("email", { to: context.email, template: "booking-confirmed" });
  }

  // 6. Log transition to analytics
  await analytics.logTransition({ machineName, from, to: result.state.value, context });

  return { newState: result.state.value };
}
```

## Data & Event Flow: How External APIs Feed Into The System

```
EXTERNAL API EVENT (Stripe webhook, QuickBooks sync, Shippo tracking update, email delivery)
        │
        ▼
    NANGO receives/processes the webhook or sync result
        │  Auth validation, rate limit, retry if needed
        ▼
    Nango returns clean result to Machine Engine Wrapper
        │  { success: true, data: {...} } or { error: "rate_limited", retryAfter: 30 }
        ▼
    Machine Engine Wrapper executes transition:
        1. Check guard (pre-condition — is this state valid?)
        2. Row lock (SELECT FOR UPDATE — no double-booking)
        3. Atomic state transition (UPDATE state WHERE current_state = X)
        4. Queue side effects (BullMQ: next Nango call, email, calendar)
        5. Publish event to event bus
        │
        ▼
    eventBus.publish("machine.transition", {
        tenantId, machineName, fromState, toState,
        actor, params, guardResult, duration, success, error
    })
        │
        ▼
    ANALYTICS DOMAIN subscriber (analytics/events.ts):
        enrich with schemaId + variantId + contextHash
        queue to BullMQ → ClickHouse ingestion (columnar time-series)
        │
        ├──→ A/B TEST ENGINE: Which variant drove this conversion?
        ├──→ CONTEXT ENGINE: Which segments trigger this flow most?
        ├──→ ML FEEDBACK LOOP: Retrain layout/content generation models
        └──→ ADMIN DASHBOARD: Real-time business flow health
```

## Event Taxonomy: What Nango-Driven Events Produce

Every Nango-triggered action produces analytics events auto-logged with full attribution:

| Source | Event | Attribution | Purpose |
|--------|-------|-------------|---------|
| Nango → Stripe | `machine.transition` (pending_payment → paid) | schemaId, variantId, contextHash | Track payment success/failure per layout variant |
| Nango → QuickBooks | `machine.transition` (paid → synced) | schemaId, variantId, contextHash | Audit trail: order → accounting sync |
| Nango → Shippo | `machine.transition` (fulfilled → shipped) | schemaId, variantId, contextHash | Track fulfillment flow health |
| Nango → Email provider | `machine.transition` side effect | schemaId, variantId, contextHash | Email delivery success rate |
| Nango → Calendar | `machine.transition` side effect | schemaId, variantId, contextHash | Booking flow completion audit |

### Analytics Event Shape

```typescript
{
  eventId:     string;         // UUID
  tenantId:    string;         // store/site ID
  eventType:   "machine.transition";
  eventSource: "server";
  timestamp:   string;         // ISO-8601, ClickHouse DateTime64(3)
  sessionId:   string;
  schemaId:    string;         // layout template active during this flow
  variantId:   string;         // layout variant being served
  contextHash: string;         // segment hash from context engine
  meta: {
    machineName:    "booking" | "checkout" | "subscription" | "refund";
    fromState:      string;
    toState:        string;
    actor:          string;    // customer ID or system
    guardResult:    boolean;
    duration:       number;    // ms from request to transition complete
    success:        boolean;
    error:          string | null;
    nangoCallId:    string;    // trace back to Nango logs
    sideEffects:    string[];  // ["syncToQuickBooks", "sendConfirmationEmail"]
  }
}
```

## Discovery: How The Platform Surfaces Nango Integrations

Nango integrations are discovered and exposed across the platform automatically:

```
Developer writes ONE TypeScript file:
  integrations/sync-to-quickbooks.ts

Nango registers it as an available action.

PLATFORM DISCOVERY:
  ├──→ json-render catalog: new action "nango.syncToQuickBooks"
  │      UI can trigger via { action: "nango.syncToQuickBooks", params: {...} }
  │
  ├──→ XState machine definitions: available as side effect
  │      Machine can invoke via { invoke: { src: "nango.syncToQuickBooks" } }
  │
  ├──→ AI agents: AI knows about it via catalog.prompt()
  │      Agent can suggest: "Add QuickBooks sync to your checkout flow"
  │
  └──→ Admin dashboard: listed under Store → Integrations
         Merchant can enable/disable per integration
```

## API Surface (Planned — Not Yet Implemented)

```
GET    /api/integrations              → List available Nango integrations for this tenant
                                         Response: { integrations: [{ name, status, lastSync, health }] }

POST   /api/integrations/:name/sync   → Trigger a sync manually
                                         Body: { params }
                                         Response: { jobId, status: "queued" }

GET    /api/integrations/:name/logs   → Fetch Nango sync/action logs
                                         Query: ?from=...&to=...&status=failed

POST   /api/integrations/webhook/:name → Nango webhook receiver
                                          Forwarded from external API → Nango → our server
```

## Connection Map: Nango ↔ All Domains

```
┌─────────────────────────────────────────────────────────────────────┐
│                         NANGO (Docker service, port 3003)            │
│                                                                     │
│  OAuth tokens    Rate limiting    Retry logic    Sync scheduling    │
│  Webhooks        Delta sync       Environments    Tenant isolation   │
│                                                                     │
│  Integration scripts (TypeScript, one per API):                     │
│    stripe-charge.ts       quickbooks-sync.ts    shippo-track.ts     │
│    mailchimp-sync.ts      calendar-sync.ts      slack-notify.ts     │
│    ... 800+ available                                              │
└──────────┬──────────────────────────────────────────────────────────┘
           │
           │ Called by:
           ▼
┌─────────────────────────────────────────────────────────────────────┐
│  MACHINES DOMAIN (packages/server/src/domains/machines/)            │
│                                                                     │
│  Machine Engine Wrapper:                                            │
│    executeTransition(machine, transition, context)                  │
│      → If transition.invoke === "nango.syncToQuickBooks"            │
│      → Call nango.trigger("syncToQuickBooks", params)               │
│      → Return result to XState for next state routing               │
│                                                                     │
│  Publishes: machine.transition event                                │
└──────────┬──────────────────────────────────────────────────────────┘
           │ eventBus.publish()
           ▼
┌─────────────────────────────────────────────────────────────────────┐
│  ANALYTICS DOMAIN (packages/server/src/domains/analytics/)          │
│                                                                     │
│  Subscribes to: machine.transition                                  │
│    → Enrich with attribution (schemaId, variantId, contextHash)     │
│    → Queue to BullMQ                                                │
│    → Insert into ClickHouse (columnar, monthly partitions, 90d TTL) │
│                                                                     │
│  Consumed by:                                                       │
│    ├──→ A/B Test Engine: conversion rate per variant                │
│    ├──→ Context Engine: behavior clustering → new segments          │
│    ├──→ ML Feedback Loop: top converting patterns per segment       │
│    └──→ Admin Dashboard: revenue, funnel, heatmaps                  │
└─────────────────────────────────────────────────────────────────────┘
           │
           │ Also consumed by:
           ▼
┌─────────────────────────────────────────────────────────────────────┐
│  AGENT DOMAIN (packages/server/src/domains/agent/)                  │
│                                                                     │
│  "Analyze my checkout funnel — where are payments failing?"         │
│    → Agent queries analytics domain                                 │
│    → Analytics queries ClickHouse for machine.transition events     │
│    → Returns: "12% of Stripe charges fail for mobile-new segment"   │
│    → Agent suggests: "Optimize checkout layout for mobile-new"      │
│    → Generates variant → Merchant approves → Published              │
└─────────────────────────────────────────────────────────────────────┘
```

## Phase Timeline

| Phase | When | Nango role |
|-------|------|-----------|
| **Phase 0: Foundation** (current, weeks 1-6) | Now | Docker service configured, DB created. No integration scripts. No wiring to machines domain. |
| **Phase 1: Launch** (weeks 7-18) | Soon | Stripe Connect adapter integration. Payment flow via Nango. Shopify adapter mode. |
| **Phase 2: Intelligence** (weeks 19-34) | Future | Full Nango deployment. QuickBooks sync, carrier tracking, email provider, calendar. Multi-currency via Nango adapters. |
| **Phase 3: Scale** (weeks 35-50) | Later | B2B integrations (Net-30 invoicing, bulk pricing). Marketplace multi-vendor flows. |
| **Phase 4: Ecosystem** (weeks 51-76) | Much later | Enterprise connectors. Custom Nango integrations per enterprise client. |

## Implementation Tasks (Deferred to Phase 2+)

1. **Write Nango integration scripts** — one TypeScript file per external API needed
2. **Implement machine engine wrapper** (`machines/domain`) — XState wrapper that loads JSON definitions from DB, executes transitions with guards/locks, and delegates side effects to Nango
3. **Register analytics subscriber for machine.transition** — every state transition auto-logged to ClickHouse with full attribution
4. **Wire BullMQ queues** — async execution for Nango calls, LLM generation, analytics ingestion
5. **Implement ClickHouse write adapter** — events flow from BullMQ → ClickHouse (MergeTree engine, monthly partitions, 90-day TTL)
6. **Wire Nango discovery into json-render catalog** — Nango actions appear as available UI actions and XState side effects
7. **Build admin integration dashboard** — merchant can view, enable/disable, and monitor Nango integrations per store
8. **Implement webhook receiver** — Nango forwards external API webhooks to our server for state machine processing

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Integration platform** | Nango (self-hosted, MIT) | 800+ APIs pre-built. OAuth, rate limiting, retries handled. Same Postgres server, different database. No external SaaS dependency. |
| **Orchestrator vs. integrator** | XState orchestrates flow, Nango executes calls | XState machine definitions stay pure JSON (AI-generatable). Nango handles auth/retries/rate limits. Clean separation: WHEN vs. HOW. |
| **Nango → event bus** | Machine engine wrapper publishes events, analytics subscribes | Every Nango-triggered action becomes an analytics event with full attribution. ML feedback loop depends on this data. |
| **Nango deployment** | Same docker-compose.yml, separate database, optional profile | Single infrastructure repo. Nango starts only when needed (`--profile integrations`). No extra deployment complexity. |
| **Integration discovery** | Nango actions auto-registered in json-render catalog + XState side effects | AI agents know about available integrations via catalog.prompt(). UI can trigger Nango actions directly. Machines can invoke as side effects. |