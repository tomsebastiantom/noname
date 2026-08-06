# RFC — Platform communications: architecture review & roadmap

> **Status:** **Implemented v1** (2026-08-05) — email + SMS + in-app inbox + prefs v2 + delivery admin; open: **I-c.6c**, comms delivery analytics  
> **Date:** 2026-08-05 (updated)  
> **Related:** [`PLATFORM-PALETTE-SECRETS-NOTIFICATIONS.md`](./PLATFORM-PALETTE-SECRETS-NOTIFICATIONS.md) · [`EMAIL-TEMPLATES-REACT-EMAIL.md`](./EMAIL-TEMPLATES-REACT-EMAIL.md) · [`INTEGRATIONS-VAULT-NANGO-AGENTS-ROADMAP.md`](./INTEGRATIONS-VAULT-NANGO-AGENTS-ROADMAP.md) · [`IN-APP-INBOX-SSE.md`](./IN-APP-INBOX-SSE.md) · [`BUILD-MASTER-INDEX.md`](../2026-08-05/BUILD-MASTER-INDEX.md)

---

## Decision (fixed)

**We build communications 100% in noname** — `domains/notifications` on Postgres, BullMQ, Vault, CMS templates, and `eventBus`.

**Novu, Noti, Knock, etc. are reference only.** We study their repos for features and patterns. We do **not** run them as required infrastructure.

**Analogue in cloud land:** AWS SES + SNS (+ Pinpoint workflows), Azure Communication Services, Twilio SendGrid — but **merchant BYOK**, **CMS-owned templates**, and **tight `orgId` + Keto** are noname-specific.

---

## Executive summary

| Question | Answer |
|----------|--------|
| **Is the current implementation architecturally sound?** | **Yes** — domain ports, async workers, Vault BYOK, CMS render-at-enqueue, multi-channel `notify()`. |
| **Is it production-grade at scale today?** | **Partial** — v1 shipped (email/SMS/in-app, idempotency, retries, delivery UI, SSE inbox). Needs marketing compliance (I-c.6c) and comms delivery analytics before merchant self-serve at scale. |
| **Is it maintainable?** | **Yes** — `notify()` fan-out, channel adapters, preferences v2 evaluator. |
| **What’s next?** | **I-c.6c** (List-Unsubscribe), comms delivery analytics, optional stream ticket for SSE. See [`BUILD-MASTER-INDEX.md`](../2026-08-05/BUILD-MASTER-INDEX.md). |

**Honest label:** **v1 communications platform shipped** — not Novu-parity workflows/marketing automation yet.

---

## What we have today (code inventory)

```
domains/notifications/
  ports.ts              NotificationsService + channel adapters
  service.ts            notify(), enqueueEmail/SMS, preferences, inbox, broadcast SSE
  email-template.ts     CMS notification_email → @json-render/react-email
  schema.ts             comms_deliveries, comms_inbox_items, notification_preferences
  queue.ts              email-outbound + sms BullMQ
  worker.ts             Resend + Twilio + OTEL spans
  adapters/             resend, twilio, postgres
  routes/               preferences, inbox, deliveries, stream (SSE)
  api.ts                REST + SSE (see IN-APP-INBOX-SSE.md)
```

**Wired callers today:**

| Caller | Usage |
|--------|--------|
| Agent worker `onTaskCompleted` | Optional `input.notify` → multi-channel `notify()` |
| Machines | `transition` params.notify / `notify()` routing (I-c.1) |
| Admin integrations | Delivery log, inbox panel, comms BYOK |
| Storefront account | `/account/communication-preferences`, `/account/notifications` + SSE |

**Integrations admin:** comms BYOK (Resend/Twilio → Vault), collapsible integrations page.

**CMS:** `notification_email` content type, json-render **spec**, admin preview.

---

## Architecture assessment

### What scales well

| Pattern | Why it works |
|---------|----------------|
| **Enqueue fast, send async** | HTTP callers don’t wait on Resend latency; same as analytics/webhooks target. |
| **Render at enqueue, dumb worker** | Queue job carries final `subject` + `html`; worker only resolves creds + POST. |
| **Vault BYOK per org** | No secrets in Postgres; platform fallback for dev. |
| **CMS templates in documents** | Merchants edit copy without deploys — **differentiator vs Novu’s separate template store**. |
| **`EmailSenderPort`** | Adding SES/SendGrid is an adapter swap, not service rewrite. |
| **OTEL on worker** | Fits existing tracing story. |
| **Horizontal workers** | More `email-outbound` worker processes scale with BullMQ + Redis. |

### Gaps that limit scale / ops (remaining)

| Gap | Risk | Status |
|-----|------|--------|
| **Marketing compliance footer** | CAN-SPAM / List-Unsubscribe | **Shipped** — I-c.6c (2026-08-05) |
| **Comms delivery analytics** | Opens/clicks/bounces invisible to merchants | **Deferred v2** — [`COMMS-DELIVERY-ANALYTICS.md`](./COMMS-DELIVERY-ANALYTICS.md) |
| **Single global queue** | One noisy tenant can delay others | Open — per-org rate limits later |
| **Large HTML in Redis jobs** | Fine at low volume; object storage at scale | Open |
| **Mobile push** | No FCM/APNs adapter | Deferred — same `notify()` pattern |
| **Stream ticket for SSE** | Raw JWT in query string | **Shipped** — C3 (2026-08-05) |

### Resolved in v1 (was gap in initial RFC draft)

| Was gap | Shipped |
|---------|---------|
| No idempotency | ✅ `idempotencyKey` on deliveries |
| No retry/backoff | ✅ delivery retry API + worker policy |
| Resend-only | ✅ Twilio SMS adapter |
| No delivery admin UI | ✅ Integrations deliveries table + retry |
| Narrow preferences | ✅ Preferences v2 (channels × categories) |
| No in-app / SMS | ✅ `comms_inbox_items`, Twilio, SSE live refresh |
| Only one caller | ✅ Machines + agent + account surfaces |

### Maintainability verdict

**Good bones.** The layout mirrors `integrations`, `secrets`, and planned `webhooks`:

```
ports → service → adapters (provider, storage) → worker → routes
```

**Before adding channels**, introduce a thin **`CommsChannelPort`** (email | sms | push | in_app) so `service.ts` doesn’t accumulate channel switches. Email stays first implementation.

**Rename over time (docs + types, not urgent):** treat **`notifications`** as the module name but **`CommunicationsService`** as the product name in docs — already reflected in palette doc.

---

## OSS & cloud reference landscape

We do **not** adopt these products. We compare features and steal patterns.

| Project | Repo / product | Stack hint | What they do well |
|---------|----------------|------------|-------------------|
| **Novu** | [novuhq/novu](https://github.com/novuhq/novu) | NestJS, MongoDB, BullMQ, Redis | Workflows, multi-channel, Inbox UI, 60+ providers, digests, tenant variants |
| **Noti** | [tomsebastiantom/noti](https://github.com/tomsebastiantom/noti) | Go, DDD, Vault | Multi-tenant creds, per-tenant prefs, template mgmt, cron digests |
| **nest-notification** | [bymaxone/nest-notification](https://github.com/bymaxone/nest-notification) | NestJS, Redis | Provider-agnostic ports, OTP + email, tenant anti-spoofing |
| **bcgov common-notify** | [bcgov/common-notify](https://github.com/bcgov/common-notify) | Multi-tenant gov stack | Tenant registration, service catalog, admin UI for templates |
| **AWS** | SES + SNS + Pinpoint | Managed | Raw send + topic fan-out + campaign/workflow (Pinpoint) |
| **Azure** | Communication Services | Managed | Email, SMS, chat, voice; connection strings / RBAC |
| **Enbbox** | [enbbox.com](https://enbbox.com) (OSS) | Rust, ClickHouse | Unified API, workflow builder, MCP for agents |

**Novu architecture pattern (borrow):**

```
POST /trigger { workflowId, subscriberId, payload }
  → validate + idempotency
  → BullMQ job
  → worker: workflow engine (conditions, delays, digest)
  → per-step provider adapter (email, sms, push, in-app)
  → delivery log per attempt
```

**Our simplification:** CMS templates replace Novu’s template editor; **`eventBus` + machines** replace heavy workflow UI for v1; Vault replaces Noti’s credential vault (already shipped).

---

## Feature matrix

Legend: ✅ shipped · ⚠️ partial · ❌ missing · 🔧 noname-specific value

### Core platform

| Feature | Novu | Noti | noname today | Priority |
|---------|------|------|--------------|----------|
| Multi-tenant `orgId` | ✅ | ✅ | ✅ | — |
| BYOK provider creds | ✅ | ✅ Vault | ✅ Vault | — |
| Async queue send | ✅ BullMQ | ✅ | ✅ BullMQ | — |
| Delivery audit log | ✅ | ✅ | ⚠️ table only, no UI/API | **Must** |
| Idempotency key | ✅ | ⚠️ | ❌ | **Must** |
| Retry + backoff | ✅ | ✅ | ⚠️ implicit BullMQ | **Must** |
| Admin resend / cancel | ✅ | ✅ | ❌ | Should |
| Rate limit per org | ✅ | ⚠️ | ❌ | Should |
| OTEL / metrics | ✅ | ⚠️ | ⚠️ worker span only | Should |

### Channels

| Feature | Novu | noname today | Priority |
|---------|------|--------------|----------|
| Email | ✅ 20+ providers | ⚠️ Resend only | **Must** — add SES |
| SMS | ✅ 37 providers | ❌ | **Must** for OTP/alerts |
| Push (FCM/APNS) | ✅ | ❌ | Later (mobile app) |
| In-app / inbox | ✅ `<Inbox />` | ❌ | **Must** for admin UX |
| Slack / Teams | ✅ chat providers | ❌ | Later (Nango + comms?) |

### Templates & content

| Feature | Novu | noname today | Priority |
|---------|------|--------------|----------|
| Merchant-editable templates | ✅ dashboard | ✅ **CMS spec** | — (strength) |
| Version / draft / publish | ✅ | ✅ documents | — |
| Locale variants | ✅ | ⚠️ locale param on load | Should |
| Variable validation | ⚠️ | ❌ | Should |

### Routing & workflows

| Feature | Novu | noname today | Priority |
|---------|------|--------------|----------|
| Trigger name (`order.shipped`) | ✅ workflow | ❌ callers pass `templateId` | **Must** |
| Multi-channel one trigger | ✅ | ❌ | Should |
| Conditions / branching | ✅ | ❌ | Later |
| Digest / batch | ✅ | ❌ | Later |
| Delay / schedule | ✅ | ❌ | Later |

### User control

| Feature | Novu | noname today | Priority |
|---------|------|--------------|----------|
| Per-user preferences | ✅ embeddable | ⚠️ 2 email flags | **Must** expand |
| Per-category opt-out | ✅ | ⚠️ marketing + agent | Should |
| Unsubscribe / compliance | ✅ | ❌ | **Must** for marketing |
| Subscriber / recipient model | ✅ | ❌ (raw `to` string) | Should |

### Callers (platform integration)

| Caller | noname today | Priority |
|--------|--------------|----------|
| XState / machines | ❌ | **Must** |
| Admin server routes | ❌ | **Must** |
| Agent worker | ✅ optional notify | — |
| Webhooks ops alerts | ❌ | Should |
| Storefront / API | ❌ | Later |

---

## Must-have vs should-have vs later

### Must-have (before calling it “platform communications”)

1. **`notify(orgId, trigger, { to, variables, userId?, idempotencyKey? })`** — maps trigger → CMS template(s) + channels (config in Postgres, not hardcoded).
2. **Idempotency** — unique `(orgId, idempotencyKey)` on `comms_deliveries` or separate `comms_outbox`.
3. **Retries** — BullMQ `attempts` + exponential backoff; terminal `failed` with error stored.
4. **Second email provider** — AWS SES adapter (many merchants already on SES).
5. **SMS adapter** — Twilio (Vault creds already anticipated in palette).
6. **Delivery log API + admin UI** — list/filter by org, status, date; manual retry.
7. **Wire machines** — machine action `sendNotification` → `notifications.service`.
8. **Expand preferences** — categories aligned with template `category` (transactional always on; marketing opt-in).
9. **Marketing compliance** — List-Unsubscribe header + preference link in template footer.

### Should-have (high merchant value)

10. **In-app notification feed** — `comms_inbox` table + SSE (reuse `sse-manager`) + admin bell UI.
11. **`eventBus`** — `comms.enqueued`, `comms.sent`, `comms.failed` for analytics and ops.
12. **Per-org rate limits** — token bucket in Redis.
13. **Locale fallback chain** — `en-US` → org default → template default.
14. **Keto** — `comms:send` for server routes that enqueue on behalf of merchants.
15. **Template variable schema** — validate `$state` keys at enqueue time.

### Later (Novu-parity, not v1 platform)

16. Visual workflow builder (machines + triggers may suffice).
17. Digest engine (batch “5 updates into one email”).
18. Push notifications (when mobile app ships).
19. Chat providers (Slack/Teams via Nango + comms adapter).
20. Click/open analytics (provider webhooks → separate from business webhooks domain or sub-type).

---

## Patterns to borrow → noname implementation

### 1. Trigger, not templateId (Novu workflow id)

```typescript
// Target API — callers use business events
await communications.notify(orgId, {
  trigger: "order.shipped",
  to: customer.email,
  userId: customer.id,
  variables: { orderId, trackingUrl },
  idempotencyKey: `order.shipped:${orderId}`,
});

// Internal: comms_triggers table or tenant_settings.comms.triggers
//   order.shipped → { templateId: "order-shipped", channels: ["email"] }
```

Machines, agents, and admin routes all use **`trigger`**; template mapping is merchant-configurable.

### 2. Delivery as first-class entity (already started)

Keep **`comms_deliveries`** as source of truth. Add:

- `idempotencyKey`, `trigger`, `templateId`, `attemptCount`
- index on `(orgId, createdAt)`, `(status)`

Worker updates attempts; don’t overwrite subscription-style rows (same lesson as webhooks RFC).

### 3. Provider adapter registry (Novu providers folder)

```typescript
// adapters/email/resend.ts, adapters/email/ses.ts
// adapters/sms/twilio.ts
interface EmailSenderPort { send(credentials, input): Promise<{ messageId }> }
interface SmsSenderPort { send(credentials, input): Promise<{ messageId }> }
```

`resolveCommsCredentials(orgId, channel)` already fits Vault paths.

### 4. In-app inbox (Novu Inbox, simplified)

```typescript
comms_inbox_items(orgId, userId, title, body, readAt, trigger, metadata jsonb)
```

Publish via existing SSE to admin client; storefront inbox later.

### 5. Preferences by category (Noti + Novu)

Replace agent-centric booleans with:

```typescript
preferences: {
  channels: { email: boolean; sms: boolean; in_app: boolean };
  categories: { transactional: true; marketing: false; operational: true };
}
```

Transactional **always sends** (legal/order email); marketing respects opt-in.

### 6. Separate comms from webhooks

| | Communications | Webhooks |
|--|----------------|----------|
| Audience | People | Systems |
| Example | “Your order shipped” email | POST merchant ERP URL |
| Provider | Resend, Twilio | HMAC HTTP |

Ops alert on failed **webhook destination** → email via **communications** (I-f.7 + I-c).

---

## Proposed data model additions

```typescript
// tenant_settings.comms — trigger routing (flags only)
comms?: {
  triggers?: Record<string, { templateId: string; channels: ("email"|"sms"|"in_app")[] }>;
};

// comms_deliveries — extend existing
idempotencyKey?: string;
trigger?: string;
templateId?: string;
attemptCount: number;

// comms_inbox_items (I-c.4)
id, orgId, userId, title, body, trigger, metadata, readAt, createdAt
```

Secrets unchanged: `noname/orgs/{orgId}/comms/{provider}`.

---

## Phased roadmap (noname build)

All phases are **our code** — reference products inform design only.

| Phase | Capability | Inspired by | Stack |
|-------|------------|-------------|-------|
| **I-c.0** | Email enqueue + CMS spec + Resend worker | — | ✅ **Shipped** |
| **I-c.1** | Wire machines + admin invite/alert routes | — | Postgres, service port |
| **I-c.2** | Idempotency + retries + SES adapter | Novu delivery log | BullMQ config, adapters |
| **I-c.3** | `notify(trigger)` routing + delivery admin API/UI | Novu workflows (simplified) | tenant_settings + admin |
| **I-c.4** | In-app inbox + SSE | Novu Inbox | Postgres + sse-manager |
| **I-c.5** | Twilio SMS + OTP path | nest-notification | Vault, adapters |
| **I-c.6** | Preferences v2 + unsubscribe | Novu preferences | API + client settings |
| **I-c.7** | `eventBus` + rate limits | Noti / Novu | Redis, eventBus |
| **Later** | Digest, push, chat | Novu | When product needs |

**Parallel track:** **I-f webhooks** (provider events → machines) does not block I-c.2–I-c.3 but **machine → customer email** needs I-c.1 + trigger routing.

---

## Recommended build order (next 4–6 weeks of focus)

```
1. I-c.2  Harden email (idempotency, retries, SES, delivery list API)
2. I-c.1  Wire machines + 2–3 admin triggers (welcome, order-*)
3. I-f.1  Inbound webhooks (Stripe → eventBus → machine)
4. I-c.3  notify(trigger) + admin delivery UI
5. I-c.4  In-app inbox for admin users
6. Phase II Mastra (tools call same communications port)
```

---

## Comparison to “basic implementation” (updated 2026-08-05)

Initial RFC draft described **v0.1 email-only**. **v1 is shipped:**

| Capability | Initial RFC | Now |
|------------|-------------|-----|
| Delivery visibility | ❌ | ✅ Admin deliveries + retry |
| SMS / in-app | ❌ | ✅ Twilio + inbox + SSE |
| Idempotency / retries | ❌ | ✅ |
| Multi-channel prefs | ❌ | ✅ Preferences v2 |
| Machine + agent callers | ❌ | ✅ `notify()` / transition notify |

**Still not merchant-facing product polish:**

- Comms delivery analytics (opens/clicks) — [`COMMS-DELIVERY-ANALYTICS.md`](./COMMS-DELIVERY-ANALYTICS.md)
- Marketing compliance footer — **I-c.6c**
- Novu-style visual workflow builder — **not planned**

---

## Open questions

1. **Trigger catalog** — platform-owned list vs merchant-defined trigger names?
2. **Transactional override** — can merchants disable order confirmation email? (Usually no.)
3. **Rendered body retention** — store HTML in Postgres for compliance or provider-only?
4. **In-app vs email** — same `notify()` fan-out ✅ (channels array on trigger config)
5. **ZITADEL emails** — password reset stays IdP; document boundary clearly (already in email-templates FAQ).

---

## References

| Resource | URL |
|----------|-----|
| Novu OSS | https://github.com/novuhq/novu |
| Novu architecture (BullMQ workers) | https://dev.to/elie222/inside-the-open-source-novu-notification-engine-311g |
| Noti | https://github.com/tomsebastiantom/noti |
| nest-notification | https://github.com/bymaxone/nest-notification |
| bcgov common-notify | https://github.com/bcgov/common-notify |
| AWS SES | https://aws.amazon.com/ses/ |
| Azure Communication Services | https://azure.microsoft.com/products/communication-services |
| noname palette | [`PLATFORM-PALETTE-SECRETS-NOTIFICATIONS.md`](./PLATFORM-PALETTE-SECRETS-NOTIFICATIONS.md) |
| Email templates | [`EMAIL-TEMPLATES-REACT-EMAIL.md`](./EMAIL-TEMPLATES-REACT-EMAIL.md) |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-08-05 | Sync with shipped v1 — multi-channel, inbox SSE, delivery admin; gaps table split resolved vs remaining |
| 2026-08-05 | Initial RFC — architecture review, OSS matrix, phased roadmap |
