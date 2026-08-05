# RFC — Webhook platform research (Svix, Hookdeck → noname)

> **Status:** Reference + shipped implementation (2026-08-05)  
> **Date:** 2026-08-05 (updated)  
> **Related:** [`WEBHOOKS-DOMAIN-SPEC.md`](./WEBHOOKS-DOMAIN-SPEC.md) · [`INTEGRATIONS-VAULT-NANGO-AGENTS-ROADMAP.md`](./INTEGRATIONS-VAULT-NANGO-AGENTS-ROADMAP.md) · [`BUILD-MASTER-INDEX.md`](../2026-08-05/BUILD-MASTER-INDEX.md)

---

## Decision (fixed)

**We build webhooks 100% in noname** — `domains/webhooks` on Postgres, BullMQ, Vault, and `eventBus`.

**Svix and Hookdeck are reference only.** We read their repos and docs to learn features, data models, and operational patterns. We do **not** run Svix, Outpost, Hookdeck SaaS, or ship vendor adapters.

**What we may adopt from the ecosystem (specs, not servers):**

- [Standard Webhooks](https://www.standardwebhooks.com/) — outbound signing headers (stdlib HMAC verify for merchants).
- Vocabulary from [Event Destinations](https://eventdestinations.org/) — “subscription”, “delivery attempt” — in our docs.

Everything else is **our code**, shaped for multi-tenant noname (`orgId`, Keto, machines, agents).

---

## Purpose

This RFC is **research for our own implementation**, not a vendor selection doc.

As the platform grows, we study mature OSS implementations, extract **features and patterns**, and implement them on our stack.

**Goals:**

1. Compare **Svix**, **Hookdeck** (multiple products), and **dev tools** feature-by-feature — so we know what “good” looks like.
2. Document **implementation patterns** from their repos we will borrow in noname.
3. Map features to **noname domains** (`webhooks`, `integrations`, `notifications`, `machines`, `eventBus`).
4. Propose a **phased capability roadmap** — all implemented in `domains/webhooks`.

**Non-goals:** Deploy Svix/Outpost/Hookdeck. Replace Nango OAuth connect path. Merge webhooks into notifications.

---

## Product landscape (reference implementations)

These projects are **not** in our stack. We study them to see what “production-grade webhooks” usually includes.

| Product | Vendor | OSS repo | Primary job |
|---------|--------|----------|-------------|
| **Svix server** | Svix | [svix/svix-webhooks](https://github.com/svix/svix-webhooks) (Rust, MIT) | **Outbound** — you send webhooks to customer URLs |
| **Hookdeck Event Gateway** | Hookdeck | SaaS-first; skills/docs public | **Inbound** — receive, buffer, filter, route, replay |
| **Hookdeck Outpost** | Hookdeck | [hookdeck/outpost](https://github.com/hookdeck/outpost) (Go, Apache 2.0) | **Outbound** — event destinations (HTTP + queues) |
| **Standard Webhooks** | Svix + ecosystem | [standardwebhooks.com](https://www.standardwebhooks.com/) | **Signing spec** (headers, verify) — not a server |
| **Event Destinations** | Hookdeck-led spec | [eventdestinations.org](https://eventdestinations.org/) | **Outbound model** (topics, destinations, types) |
| **Webhook.site / ngrok / smee** | Various | — | **Dev only** — inspect payloads, tunnel localhost |

**Hookdeck alone is two different systems:** Event Gateway (inbound proxy) vs Outpost (outbound to customers). Svix also has **Svix Ingest** (hosted inbound) on SaaS — OSS server is mainly **dispatch**.

**Already in noname (keep separate):**

| Path | Owner |
|------|--------|
| OAuth connect complete | `integrations` → `POST /api/integrations/nango/webhook` |
| Email to users | `notifications` |
| Provider business events + merchant callbacks | **`domains/webhooks`** ✅ shipped (inbound + outbound) |

---

## Feature matrix

Legend: ✅ strong · ⚠️ partial · ❌ not focus · 🔧 we must own · 📦 SaaS-only

### Inbound (provider → platform)

| Feature | Svix (OSS / SaaS) | Hookdeck Event Gateway | noname today | noname target |
|---------|-------------------|------------------------|--------------|---------------|
| Public ingest URL | 📦 Ingest SaaS | ✅ Source URL | ✅ `POST /api/webhooks/inbound/:provider` | Same |
| Signature verify | ✅ SDK + Standard Webhooks | ✅ Per-source | ✅ Nango OAuth + generic HMAC | Per-provider adapters |
| Idempotency key | ✅ `event_id` on messages | ✅ Dedupe rules | ✅ `webhook_receipts` | Same |
| Persist all payloads | ✅ Postgres | ✅ Event store | ✅ Receipt rows | Optional retention policy |
| Fast 200 + async process | ✅ Queue | ✅ Queue | ✅ BullMQ `webhook-inbound` | Same |
| Filter / drop noise | ⚠️ event types | ✅ JSON filters on connections | ❌ | Phase 2 — rules on ingest |
| Transform payload | 📦 SaaS | ✅ Connection rules | ❌ | Optional — machines normalize |
| Fan-out to multiple handlers | ⚠️ | ✅ Source → many connections | 🔧 | **`eventBus`** subscribers |
| Replay / bulk retry | 📦 | ✅ Dashboard + API | ❌ | Admin replay v2 |
| Spike protection | 📦 | ✅ Buffer queue | ⚠️ BullMQ depth | Same + rate limits |
| Org / tenant resolution | App metadata | Source metadata | 🔧 `connectionId` map | **`resolveOrgId`** in service |
| Dev tunnel / inspect | CLI | ✅ + local dev | ❌ | Webhook.site locally only |

### Outbound (platform → customer URL)

| Feature | Svix OSS | Hookdeck Outpost | noname target |
|---------|----------|------------------|---------------|
| Subscription / endpoint model | ✅ App → Endpoints | ✅ Tenant → Destinations | **`webhook_subscriptions`** |
| Event types filter | ✅ per endpoint | ✅ topics + filters | `eventTypes[]` on subscription |
| Signed deliveries | ✅ Standard Webhooks | ✅ + configurable | Vault secret + Standard Webhooks headers |
| Retry + backoff | ✅ Message attempts | ✅ `MAX_RETRY_LIMIT`, schedule | BullMQ attempts + config |
| Delivery attempt log | ✅ MessageAttempt | ✅ Per delivery | **`webhook_outbound_deliveries`** |
| Manual retry | ✅ | ✅ API + portal | Admin + API v2 |
| Disable bad endpoint | ✅ | ✅ Auto-disable threshold | Auto-disable after N failures |
| Customer self-service portal | ✅ App Portal | ✅ JWT portal | Admin → Settings → Webhooks v2 |
| Multi-destination types | HTTP native; Bridge for queues | ✅ SQS, Kafka, S3, … | HTTP v1; queue adapters if merchants ask |
| SSRF protection | ✅ `whitelist_subnets` | ✅ | Block private IPs by default |
| FIFO / ordering | ✅ channels (SaaS depth) | ⚠️ | Only if commerce needs it |
| Fan-out one event → many URLs | ✅ all endpoints on app | ✅ topic subscribers | Per org, all matching subscriptions |

### Cross-cutting

| Feature | Svix | Hookdeck | noname fit |
|---------|------|----------|------------|
| Multi-tenant | Application per user/org | Tenant isolation | **`orgId`** everywhere |
| Operational / meta webhooks | ✅ “Svix watches Svix” | ✅ Operator events | Platform alerts on failed destinations |
| OpenTelemetry | ✅ | ✅ | Already on server workers |
| Postgres + Redis queue | ✅ | ✅ Postgres + Redis + MQ | ✅ Postgres + Dragonfly/BullMQ |
| SDKs (send/verify) | Many languages | Go/TS/Python + MCP | TS verify helpers for merchants (docs) |

---

## Data models — side by side

Understanding their nouns helps us name **ours** without copying trademarks.

### Svix ([API docs](https://api.svix.com/docs))

```
Application     ≈  one customer / org integration surface
  └── Endpoint  ≈  HTTPS URL + secret + event type filter + disabled flag
Message         ≈  one logical event (eventType, eventId, payload)
  └── MessageAttempt  ≈  each POST try to an endpoint (success/fail, retry schedule)
EventType       ≈  catalog of allowed event names
```

**Patterns worth borrowing:**

- **`eventId` idempotency** on publish — duplicate publishes dedupe.
- **`filtered_endpoints`** — at send time, skip disabled endpoints and filter by `event_type` ([`message_app.rs`](https://github.com/svix/svix-webhooks/blob/main/server/svix-server/src/core/message_app.rs)).
- **Endpoint secret rotation** — `old_signing_keys` for zero-downtime rotate.
- **Manual vs automatic attempts** — `MessageAttemptTriggerType::Manual` for admin replay.
- **SSRF guard** — block private IPs unless `whitelist_subnets`.
- **Operational webhooks** — internal events (`endpoint.disabled`) to your own handler.

### Hookdeck Outpost ([concepts](https://hookdeck.com/docs/outpost/concepts))

```
Tenant          ≈  merchant org
  └── Destination  ≈  webhook URL | SQS | Kafka | … + topic subscriptions + filters
Topic           ≈  event category (fan-out key)
Event           ≈  published with id (at-least-once; consumers dedupe on id)
Delivery        ≈  per destination attempt + retry state
Portal JWT      ≈  short-lived token for customer self-service UI
```

**Patterns worth borrowing:**

- **Topic-based publish** — `webhooks.service.publish(orgId, topic, payload)` fan-out to subscriptions.
- **Configurable retry schedule** — env `RETRY_SCHEDULE` comma-separated seconds.
- **Auto-disable destination** after failure threshold — protect merchant URL and our queue.
- **At-least-once + explicit event id** — document for integrators.
- **Event Destinations spec** — vocabulary for docs (“destination” not “Svix endpoint”).

### Hookdeck Event Gateway (inbound)

```
Source          ≈  public URL providers hit
Connection      ≈  source → destination + rules
Destination     ≈  your server URL (or queue)
Rules           ≈  filter | transform | delay | dedupe | retry
```

**Patterns worth borrowing:**

- **Connection rules pipeline** — ordered filter → transform (we may keep transform in domain logic).
- **Ignored vs discarded requests** — metrics when everything filtered out.
- **Bulk replay** — re-drive failed deliveries after outage.
- **Issues / alerts** — Slack when failure rate spikes (ops, not merchant UI v1).

### noname (proposed — stable port)

```
integrations.nango.webhook     OAuth connect only (unchanged)
webhook_receipts               Inbound idempotency + audit
webhook_subscriptions          Outbound URL + eventTypes + enabled
webhook_outbound_deliveries    Attempt log
WebhooksService port           Single entry for agents/machines/admin
eventBus webhook.received      Internal fan-out after inbound process
```

---

## Implementation patterns to borrow (from repos)

### 1. Inbound: acknowledge fast, process async

**Svix / Hookdeck / our notifications worker** all agree:

```
HTTP handler → validate → persist idempotency key → enqueue → return 2xx
Worker       → resolve org → eventBus / side effects
```

**noname:** Same as [`WEBHOOKS-DOMAIN-SPEC.md`](./WEBHOOKS-DOMAIN-SPEC.md) — mirror `email-outbound` worker shape.

### 2. Outbound: attempt entity separate from message

Svix stores **Message** once, many **Attempts**. We should not overwrite delivery state on the subscription row.

```typescript
// Pattern: one outbound job → many attempt rows
subscription → enqueue delivery → for each attempt: POST, log status, schedule retry
```

### 3. Signing: Standard Webhooks headers

Borrow the **spec**, not Svix server:

```
webhook-id:        unique per delivery (idempotency for receiver)
webhook-timestamp: replay attack window
webhook-signature: v1,<base64 hmac>
```

Merchant docs can say “compatible with Standard Webhooks verify libraries.”

### 4. Endpoint health

From Outpost + Svix:

- Track `first_failure_at`, consecutive failures.
- After threshold → `disabled: true`, stop burning retries.
- Emit **`webhook.destination.disabled`** on eventBus → admin notification.

### 5. Caching hot paths

Svix **`MessageApp`** caches app+endpoints in Redis before dispatch ([source](https://github.com/svix/svix-webhooks/blob/main/server/svix-server/src/core/message_app.rs)). We can cache **`webhook_subscriptions` per orgId** in Redis with TTL when outbound volume grows.

### 6. Filtered fan-out

Svix filters endpoints by `event_types`, `channels`, `disabled`. Outpost filters by topic + destination filter.

**noname:**

```typescript
deliverOutbound(orgId, eventType, payload) {
  const subs = await listEnabledSubscriptions(orgId)
    .filter(s => s.eventTypes.includes(eventType) || s.eventTypes.includes('*'));
  for (const sub of subs) queueOutbound(sub, payload);
}
```

### 7. Nango as optional inbound front door

From [`nango-domain.md`](../2026-07-04/nango-domain.md): provider → Nango → us. Our **webhooks service** still normalizes to `webhook_receipts` + `eventBus` whether HTTP came from Nango forward or direct Stripe.

---

## What noname owns (all of it)

The full webhook platform lives in our codebase:

| Concern | Implementation |
|---------|----------------|
| **Inbound ingest + verify** | `domains/webhooks` routes + per-provider adapters |
| **Outbound dispatch + retries** | BullMQ workers + `webhook_outbound_deliveries` |
| **`orgId` resolution** | `tenant_settings`, Keto, `integrations.nango` map |
| **`eventBus` → machines / agents / analytics** | Platform event types and subscribers |
| **Event type catalog** | `order.paid`, `agent.task.completed`, `machine.transition` |
| **Auth model** | ZITADEL + edge HMAC |
| **Signing secrets** | Vault BYOK per subscription |
| **Admin + merchant UI** | Existing client admin shell |

**Port pattern (like secrets/notifications):** one `WebhooksService` interface, **one** Postgres + BullMQ implementation — swappable for tests/mocks, not for third-party servers.

```typescript
interface WebhooksService { ... }
// production: WebhooksServiceImpl (Postgres + BullMQ + Vault)
```

---

## Phased capability roadmap (noname)

Ordered by value / dependency — **not** “never do portal.”

| Phase | Capability | Inspired by | Stack |
|-------|------------|-------------|-------|
| **I-f.1** | Inbound route + verify + receipts + worker + `webhook.received` | Hookdeck ingest + Svix verify | Postgres, BullMQ, eventBus |
| **I-f.2** | Outbound subscriptions + signed POST + attempts table | Svix Endpoint + MessageAttempt | Vault, BullMQ |
| **I-f.3** | Admin: list deliveries, manual retry, disable endpoint | Svix portal / Outpost portal | Existing admin shell |
| **I-f.4** | Topic publish API + fan-out | Outpost topics | `webhooks.service.publish` |
| **I-f.5** | Inbound filters (drop noise per provider) | Hookdeck connection filters | Optional rules JSON |
| **I-f.6** | Merchant self-service portal (JWT) | Outpost portal | Client panel |
| **I-f.7** | Auto-disable + ops alerts | Outpost operator events | eventBus + notifications email |
| **Later** | Queue destinations (SQS/Kafka) | Outpost pattern | Our adapters if merchants require |

All phases are **built in noname**. Svix/Hookdeck columns in the matrices above are **“what they do well”** — inspiration for our design, not integration targets.

---

## Open questions

1. **Retention:** How long keep inbound `payload` jsonb (GDPR / cost)?
2. **Per-org vs platform signing secret** for outbound — Vault path convention?
3. **Nango forward** for inbound — one route or provider-specific?
4. **Machine transitions** triggered by inbound events — which `eventType` → which machine event name?
5. **Standard Webhooks** — commit to full header set for outbound v1?

---

## References

| Resource | URL |
|----------|-----|
| Svix OSS README | https://github.com/svix/svix-webhooks |
| Svix API model (Application, Endpoint, Message) | https://api.svix.com/docs |
| Svix message dispatch (filtered endpoints) | https://github.com/svix/svix-webhooks/blob/main/server/svix-server/src/core/message_app.rs |
| Standard Webhooks | https://www.standardwebhooks.com/ |
| Hookdeck Outpost repo | https://github.com/hookdeck/outpost |
| Outpost concepts | https://hookdeck.com/docs/outpost/concepts |
| Outpost event delivery / retries | https://hookdeck.com/docs/outpost/features/event-delivery |
| Event Destinations spec | https://eventdestinations.org/ |
| Hookdeck Event Gateway | https://hookdeck.com/event-gateway |
| Hookdeck connections & filters | https://hookdeck.com/docs/connections |
| noname webhook domain spec | [`WEBHOOKS-DOMAIN-SPEC.md`](./WEBHOOKS-DOMAIN-SPEC.md) |
| noname Nango flow | [`nango-domain.md`](../2026-07-04/nango-domain.md) |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-08-05 | Initial RFC — feature matrix, patterns, phased roadmap |
| 2026-08-05 | Clarified: 100% noname build; Svix/Hookdeck reference-only |
