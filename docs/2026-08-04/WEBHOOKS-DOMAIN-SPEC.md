# Webhooks domain spec (Phase I-f)

> **Date:** 2026-08-04  
> **Status:** Spec — implement after I-a–I-e baseline  
> **Related:** [`INTEGRATIONS-VAULT-NANGO-AGENTS-ROADMAP.md`](./INTEGRATIONS-VAULT-NANGO-AGENTS-ROADMAP.md) · [`nango-domain.md`](../2026-07-04/nango-domain.md) · [`PLATFORM-PALETTE-SECRETS-NOTIFICATIONS.md`](./PLATFORM-PALETTE-SECRETS-NOTIFICATIONS.md)

---

## One-line summary

**Webhooks = HTTP callbacks between systems.** Inbound: provider → platform (verify, idempotent, async fan-out). Outbound: platform → merchant URL (queued retries). **Separate domain** from OAuth connect (`integrations`) and user email (`notifications`).

---

## Three paths — do not merge

| # | Direction | Example | Owner today | Owner target |
|---|-----------|---------|-------------|--------------|
| 1 | Inbound, **OAuth connect** | Nango “connection created” → save `connectionId` | ✅ `integrations` `POST /api/integrations/nango/webhook` | **Stay in integrations** |
| 2 | Inbound, **provider business event** | Stripe `payment_intent.succeeded` | ❌ | **`domains/webhooks`** |
| 3 | Outbound, **platform → merchant** | POST `https://merchant.app/hooks` when order paid | ❌ | **`domains/webhooks`** (v1.1) |

| | Notifications | Webhooks |
|--|---------------|----------|
| Target | Person (email address) | URL (merchant or platform endpoint) |
| Payload | Rendered html/subject | JSON event envelope |
| Worker | `email-outbound` → Resend | `webhook-inbound` / `webhook-outbound` |

---

## What we copy (no new OSS product)

Adapt patterns already in the repo — same shape as **notifications** and **analytics**:

```
                    notifications          webhooks (target)
Route (sync)   →    enqueue / insert   →    verify + receipt + enqueue
BullMQ queue   →    email-outbound     →    webhook-inbound | webhook-outbound
Worker         →    Resend send        →    eventBus.publish + optional HTTP POST
Postgres       →    comms_deliveries   →    webhook_receipts | webhook_outbound_log
Secrets        →    Vault comms BYOK   →    Vault subscription signing secret (outbound)
Internal fan-out →  (none)            →    shared/event-bus
```

| Piece | Reuse |
|-------|--------|
| Queue infra | `shared/bullmq-queue.ts`, Dragonfly, `BULLMQ_QUEUES` |
| Cross-replica events | `shared/event-bus.ts` (Redis pub/sub) |
| Org scope | `tenant_settings`, `integrations.nango` map for `connectionId` → org |
| HMAC verify | Node `crypto.createHmac` / `timingSafeEqual` — per-provider adapter |
| Idempotency | Postgres unique `(provider, external_event_id)` |
| Tracing | Same OTEL span pattern as `notifications/worker.ts` |

**We do not use Svix, Outpost, or Hookdeck as products.** This domain is 100% noname. See **[`WEBHOOKS-PLATFORM-RFC.md`](./WEBHOOKS-PLATFORM-RFC.md)** for feature comparison and patterns borrowed from those reference implementations.

---

## v1 scope (inbound only)

Ship the smallest useful slice:

1. **`POST /api/webhooks/inbound/:provider`** — raw body, provider-specific verify
2. **`webhook_receipts`** — idempotency + audit
3. **BullMQ `webhook-inbound`** — async processing (route returns 200 fast)
4. **`eventBus.publish('webhook.received', { orgId, provider, eventType, payload })`**
5. **One adapter:** `generic-hmac` (shared secret header) + **`stripe`** (Stripe-Signature) as reference
6. **Org resolution:** metadata on payload, or lookup `connectionId` in `tenant_settings.integrations.nango`

**Defer v1.1:** outbound subscriptions, admin UI, machine auto-transition (stub subscriber logs only).

---

## End-to-end flow (inbound)

```
External provider (Stripe, Shopify, …)
  → POST https://api.example.com/api/webhooks/inbound/stripe
      Headers: Stripe-Signature (or provider-specific)
      Body: raw JSON

HTTP route (sync, <100ms)
  → adapter.verify(rawBody, headers, secret from env/Vault)
  → adapter.normalize → { externalEventId, eventType, orgId?, connectionId?, payload }
  → resolve orgId:
       a) payload.metadata.org_id (signed at connect time), OR
       b) scan tenant_settings.integrations.nango for connectionId
  → INSERT webhook_receipts (ON CONFLICT DO NOTHING → 200 if duplicate)
  → queue.add('process', { receiptId, orgId, provider, eventType, payload })

webhook-inbound worker
  → eventBus.publish('webhook.received', { orgId, provider, eventType, payload, receiptId })
  → update receipt status processed | failed

Subscribers (existing + new)
  → analytics.service.ingestServerEvent (optional)
  → machines: future transition by eventType (Phase II — log-only stub in v1)
  → agents: task resume / planner context (Phase II)
```

**Rule:** Route never calls Nango SDK, Vault, or machine engine directly — only `webhooks.service`.

---

## Nango vs direct inbound

| Source | When | Route |
|--------|------|-------|
| **Nango forward** (future) | Provider webhook registered in Nango dashboard → Nango POSTs to us | Same `/api/webhooks/inbound/:provider` or dedicated `/nango/forward` that delegates to webhooks service |
| **Direct** | Stripe Connect / platform webhook URL points at us | `/api/webhooks/inbound/stripe` |

**OAuth connect webhook stays** at `POST /api/integrations/nango/webhook` — do not move it in I-f.

Long-term ([`nango-domain.md`](../2026-07-04/nango-domain.md)): Nango may receive external events first; our **webhooks domain** still owns verify → idempotent → eventBus for anything that becomes a **business event**, whether the HTTP hit came from Nango or directly from Stripe.

---

## Proposed module layout

```
packages/server/src/domains/webhooks/
  ports.ts              InboundWebhookAdapter, WebhooksService
  schema.ts             webhook_receipts (+ outbound tables v1.1)
  adapters/
    generic-hmac.ts     X-Webhook-Signature: sha256=…
    stripe.ts           Stripe-Signature + constructEvent-style verify
  service.ts            handleInbound, resolveOrgId, enqueue
  queue.ts              WebhookInboundJobData
  worker.ts             process → eventBus
  routes/inbound.ts     POST /inbound/:provider
  events.ts             WebhookEvents.RECEIVED
  index.ts              createWebhooksDomain({ db })
```

Mount: `app.route("/api/webhooks", webhooks.routes)` in `packages/server/src/index.ts`.

---

## Postgres schema (v1)

```typescript
// webhook_receipts — inbound idempotency + audit
{
  id: uuid PK
  orgId: text NOT NULL
  provider: text NOT NULL          // "stripe" | "shopify" | …
  externalEventId: text NOT NULL   // provider's event id
  eventType: text NOT NULL         // e.g. payment_intent.succeeded
  payload: jsonb NOT NULL
  status: text NOT NULL            // received | processed | failed
  error: text | null
  createdAt, processedAt
  UNIQUE (provider, externalEventId)
}
```

**v1.1 — outbound:**

```typescript
// webhook_subscriptions — org-owned callback URLs (flags in tenant_settings or own table)
{ id, orgId, url, eventTypes[], enabled, secretRef }  // secret in Vault

// webhook_outbound_deliveries — delivery log + retries
{ id, orgId, subscriptionId, eventType, payload, status, attempts, lastError, … }
```

No raw signing secrets in Postgres — Vault path `noname/orgs/{orgId}/webhooks/{subscriptionId}` when outbound ships.

---

## Port surface

```typescript
// adapters/* implement this per provider
interface InboundWebhookAdapter {
  provider: string;
  verify(rawBody: string, headers: Record<string, string | undefined>, secret: string): boolean;
  normalize(rawBody: string): {
    externalEventId: string;
    eventType: string;
    connectionId?: string;
    orgId?: string;
    payload: Record<string, unknown>;
  };
}

interface WebhooksService {
  handleInbound(provider: string, rawBody: string, headers: Record<string, string | undefined>): Promise<{ received: boolean; duplicate?: boolean }>;
}
```

Outbound (v1.1):

```typescript
deliverOutbound(orgId: string, eventType: string, payload: Record<string, unknown>): Promise<void>;
```

---

## Edge / public access

Provider webhooks have **no JWT**. Add to `packages/workers/src/routes/public-routes.ts`:

```typescript
/^\/api\/webhooks\/inbound\/[^/]+$/
```

Server route uses **signature verification only** — same security model as `POST /api/integrations/nango/webhook` today.

Platform webhook secrets (Stripe signing secret, generic HMAC secret):

- **Dev:** `.env` `STRIPE_WEBHOOK_SECRET`, `WEBHOOK_GENERIC_SECRET`
- **Prod:** Vault platform path via `domains/secrets` (same BYOK pattern as comms/LLM)

---

## Event bus contract

Add `packages/server/src/domains/webhooks/events.ts`:

```typescript
export const WebhookEvents = {
  RECEIVED: "webhook.received",
} as const;
```

Payload:

```typescript
{
  orgId: string;
  provider: string;
  eventType: string;
  externalEventId: string;
  receiptId: string;
  payload: Record<string, unknown>;
}
```

Register in `domain-events.ts` when analytics should auto-subscribe (optional for v1).

**v1 stub subscriber** in `index.ts`:

```typescript
eventBus.subscribe(WebhookEvents.RECEIVED, async (p) => {
  console.info("[webhook]", p); // replace with machine hook in Phase II
});
```

---

## Stripe adapter (reference — stdlib only)

```typescript
// stripe.ts — no stripe SDK required for verify-only v1
const signature = headers["stripe-signature"];
// parse t=...,v1=... from header
const expected = crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expected));
// JSON.parse → event.id, event.type, event.data.object
```

Full `constructEvent` from Stripe SDK is optional later — HMAC verify is enough for v1.

---

## Generic HMAC adapter (dev / internal)

For demos and non-Stripe providers:

- Header: `X-Webhook-Signature: sha256=<hex>`
- Secret: `WEBHOOK_GENERIC_SECRET`
- Body includes `eventId`, `eventType`, optional `orgId` / `connectionId`

---

## Implementation checklist (I-f PR)

### v1 — inbound

- [ ] `BULLMQ_QUEUES.WEBHOOK_INBOUND`
- [ ] `schema.ts` + `db:push` for `webhook_receipts`
- [ ] `adapters/generic-hmac.ts`, `adapters/stripe.ts`
- [ ] `service.ts` + `worker.ts` + `routes/inbound.ts`
- [ ] Mount `/api/webhooks` in server `index.ts`
- [ ] `PUBLIC_POST_PATTERNS` for inbound route
- [ ] `WebhookEvents.RECEIVED` + stub `eventBus.subscribe`
- [ ] Tests: verify reject, idempotent duplicate, worker publishes event

### v1.1 — outbound (later)

- [ ] `webhook_subscriptions` + admin form
- [ ] Vault secret for subscription signing
- [ ] `webhook-outbound` worker with retry/backoff
- [ ] Subscribe to `MachineEvents.TRANSITION` or explicit `deliverOutbound` calls

---

## What we are NOT building in I-f

- ❌ Moving Nango OAuth connect webhook out of `integrations`
- ❌ Email / SMS (notifications)
- ❌ Per-tenant inbound hostname (`hooks.merchant.com` → us)
- ❌ Svix / Outpost / Hookdeck as runtime dependencies (reference their patterns only)
- ❌ Calling Nango or Stripe SDK from the HTTP route (adapters verify only)

---

## Order relative to other phases

| Before | I-f | After |
|--------|-----|-------|
| I-a Vault, I-c notifications, I-d OAuth connect | Inbound webhooks + eventBus | Machines react to events, Mastra tools, outbound URLs |

Agents and machines consume **`webhooks.service` / `eventBus`** — never provider SDKs in tool code ([roadmap rules](./INTEGRATIONS-VAULT-NANGO-AGENTS-ROADMAP.md#phase-i-e--agent-context-ingestion-document-before-mastra)).
