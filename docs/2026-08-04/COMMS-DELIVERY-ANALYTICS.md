# Comms delivery analytics vs product analytics

**Status:** **v2 shipped (2026-08-06)** — Resend webhook ingest + delivery log engagement timeline. SMS/other providers: future adapters.

## Two different systems

| | **Product analytics** (built) | **Comms delivery analytics** (deferred) |
|--|-------------------------------|-------------------------------------------|
| Question | What did users do on the storefront? | Did the email/SMS actually deliver, open, click, bounce? |
| Examples | `page_view`, `add_to_cart`, funnel | delivered, opened, clicked, bounced, complained |
| Storage | ClickHouse (`analytics` domain) | Would extend `comms_deliveries` + webhook ingest |
| UI | Admin → Analytics | Would be Integrations → Delivery log enrichment |
| Agent tool | `readAnalytics` | Not built |

In-app inbox (`comms_inbox_items`) is a **third** surface: persisted notifications for the signed-in user, not provider telemetry.

Do not merge these into one pipeline. Product events are high-volume behavioral data; comms telemetry is low-volume, provider-sourced, and PII-adjacent.

---

## What v2 ships (2026-08-06)

- **Schema:** `comms_delivery_events` — linked to `comms_deliveries` via `deliveryId`
- **Ingest:** `POST /api/notifications/webhooks/resend` — Svix signature via `RESEND_WEBHOOK_SECRET`
- **API:** `GET /api/notifications/deliveries?includeEvents=true` — event timeline per row
- **UI:** Admin → Integrations → Email & delivery — **Engagement** column (`delivered → opened → clicked`)
- **Still separate** from product analytics (ClickHouse)

## What v1 ships instead

- **Delivery log** (`comms_deliveries`): enqueue → sent/failed, retry, provider message id. Operational, not marketing analytics.
- **In-app inbox**: row per notification + SSE push. Read/unread state only.
- **No** open/click tracking pixels, no SNS/SES event webhooks, no Resend analytics sync.

---

## OSS / SaaS patterns (study only — we build in-house)

### Email providers (telemetry source)

| Tool | What they expose | Pattern |
|------|------------------|---------|
| [Resend](https://resend.com/docs/dashboard/webhooks/introduction) | Webhooks: delivered, opened, clicked, bounced | HTTPS POST to your endpoint |
| [SendGrid](https://docs.sendgrid.com/for-developers/tracking-events/event) | Event Webhook (JSON array) | Same |
| [Postmark](https://postmarkapp.com/developer/webhooks/open-tracking) | Open / bounce / delivery webhooks | Same |
| [Amazon SES](https://docs.aws.amazon.com/ses/latest/dg/monitor-sending-activity.html) | SNS → Lambda/HTTP for bounces, complaints, deliveries | AWS-native |

**In-house v2 pattern:** Inbound webhook route (like existing `webhooks` domain) per provider → normalize to `comms_delivery_events` table → join on `providerMessageId`.

### Notification platforms (inbox + multi-channel)

| Tool | Relevant pattern | Takeaway for noname |
|------|------------------|---------------------|
| [Novu](https://novu.co) | Workflows, feeds, provider abstraction | We already have triggers + channels in tenant_settings |
| [Knock](https://knock.app) | Cross-channel orchestration + in-app feed | Similar to our `notify()` + inbox |
| [Courier](https://www.courier.com) | Unified send + tracking | Delivery log + future event webhooks |
| [Noti](https://github.com/tomsebastiantom/noti) | Go service, Ristretto cache, multi-channel | Cache pattern → [SECRETS-RESOLVER-CACHE.md](./SECRETS-RESOLVER-CACHE.md); not a drop-in |

None of these are dependencies. They validate that **orchestration** (our comms service) and **telemetry** (provider webhooks) stay separate layers.

---

## Recommended in-house v2 scope

When comms delivery analytics is prioritized:

1. **Schema:** `comms_delivery_events(id, deliveryId, eventType, occurredAt, rawPayload jsonb)`
2. **Ingest:** Provider-specific normalizers under `domains/notifications/adapters/*/webhooks.ts`
3. **UI:** Extend delivery log rows with event timeline (delivered → opened → clicked)
4. **Privacy:** Opt-out of open tracking per org; no tracking pixels on transactional-only triggers
5. **Agents:** Optional read-only tool `readCommsDeliveries` — not `readAnalytics`

Skip for v2 unless needed: cohort reports, A/B subject lines, marketing attribution (use product analytics + UTM on links instead).

---

## Explicit non-goals

- Replacing ClickHouse for product funnels
- Real-time open rates on the in-app inbox (in-app has no “open” concept — use `readAt`)
- Third-party comms analytics SaaS as a runtime dependency
