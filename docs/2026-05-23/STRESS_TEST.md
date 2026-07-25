# Architecture Stress Test

## Can Our System Build Auth? Rate Limiting? Scheduling? Complex Backend?

**Yes — our JSON-based architecture (json-render + XState + Nango + Content API) can build ANY backend system, including the hardest ones: auth, rate limiting, scheduling, multi-step verification flows.**

If our platform can build auth (the most complex backend in any application), it can build any commerce workflow. This document captures the stress test findings.

---

## The Test: Build Auth Entirely On Our Platform (No External Auth Provider)

If a third-party developer wants to build auth using only our stack — no ZITADEL or other OIDC provider — here's how every auth feature maps to our architecture:

| Auth feature | Our component | How |
|-------------|---------------|-----|
| **Signup form** | json-render + $bindState | Form component bound to user fields in StateStore |
| **Signup flow** | XState machine: email_submitted → verified → active | States with timers (24h verification expiry), guards, actions |
| **Email verification** | Nango + XState fter delay | Nango sends email. XState waits 24h or until verified. |
| **Password hashing** | Catalog handler | crypt.hash() in guard function |
| **Login** | json-render form + XState machine | Form submits → XState authenticates → creates session |
| **JWT sessions** | Content API + handler | jsonwebtoken.sign() in action handler. Session stored in JSONB. |
| **OAuth (Google)** | json-render + Nango | Nango handles OAuth redirect + code exchange. XState orchestrates flow. |
| **MFA (TOTP)** | Catalog handler | otplib.generate() / otplib.verify() in guard |
| **Password reset** | XState machine + Nango | email_requested → token_validated → password_updated. Nango sends email. |
| **Roles/permissions** | Content type + guard | user.role == ""admin"" — checked by guard handler |
| **Rate limiting** | Cloudflare Worker middleware | Edge layer. Not in our catalog yet — needs custom handler. |
| **Analytics** | Our events table | Every auth transition logged: signup funnel, failed logins, MFA setups |

**Verdict**: Our platform CAN build auth. The architecture handles multi-step flows, async verification, OAuth, MFA, JWT, roles. Everything fits within json-render + XState + Nango + content API + catalog handlers.

---

## The Test: Rate Limiting

Rate limiting is a crucial infrastructure concern that doesn't naturally fit into our JSON catalog pattern. It lives at the edge (Cloudflare Worker), not in the state machine or content API.

| Capability | Built into our platform? | How |
|-----------|-------------------------|-----|
| **Per-IP rate limiting** | 🟡 Edge middleware | Cloudflare Worker — checks IP against Workers KV counter |
| **Per-user rate limiting** | 🟡 Edge middleware | Cloudflare Worker — reads JWT, checks user's request count |
| **Per-endpoint rate limiting** | 🟡 Edge middleware | Cloudflare Worker — matches path patterns |
| **Rate limit headers** | 🟡 Edge middleware | X-RateLimit-Remaining, X-RateLimit-Reset |
| **Rate limit analytics** | 🟡 Our events table | Log blocked requests to analytics |
| **Custom rate limit rules** | 🟡 Catalog handler | User-defined guard function that checks rate limit before executing |

**Verdict**: Rate limiting is handled at the edge (Cloudflare Workers), not in our core catalog. We provide middleware for it. Custom rate limit rules can be defined as catalog guard functions.

---

## What Our Architecture CAN Build (Full Stack)

| System | Can our platform build it? | Complexity |
|--------|---------------------------|------------|
| **Auth** (signup, login, OAuth, MFA, roles) | ✅ Yes | High — tested above |
| **Rate limiting** | 🟡 Edge (Cloudflare) + optional catalog guard | Medium |
| **Email + notifications** | ✅ Nango (send) + XState (when to send) | Low |
| **Scheduling** (cron, time-based) | ✅ XState fter delays + BullMQ scheduled jobs | Medium |
| **File upload + processing** | ✅ Nango (upload) + catalog handler (process) | Medium |
| **Search** | ✅ Typesense + content API sync | Medium |
| **Payment processing** | ✅ Stripe via catalog handler + XState invoke | Medium |
| **Inventory management** | ✅ XState machine + relational DB (ACID) | High |
| **Analytics pipeline** | ✅ ClickHouse (columnar, time-series, 100x faster than Postgres for event queries) | Built from day one. No migration needed. |
| **Multi-tenant data isolation** | ✅ Content API (storeId on every record) | Low |
| **Webhook handler** | ✅ Nango webhook → XState machine | Medium |
| **API rate limiting** | 🟡 Edge + optional guard | Medium |

---

## Missing Things (Add Later)

| Missing | Priority | Why not now |
|---------|----------|-------------|
| **Rate limiting middleware** | Phase 1 | Cloudflare Workers + KV handle basic rate limiting. Custom rules via catalog guards in Phase 2. |
| **Advanced analytics dashboards** | Phase 2 | Our events table captures everything. Real-time dashboards are UI work. |
| **Distributed tracing** | Phase 2 | OpenTelemetry + Jaeger or SigNoz. Not needed at Phase 0 scale. |
| **User-deployed durable workflows** (Temporal/Restate) | Phase 3 | XState handles our core flows. Optional for advanced user cases later. |
| **Plugin marketplace** | Phase 3 | Need plugin system first (Phase 2). Marketplace comes after. |
| **Custom AI model training** | Phase 4 | Fine-tuned per-store layout models. Expensive — only for enterprise. |
| **White-label / multi-brand** | Phase 4 | Enterprise feature. Needs SSO, RBAC, custom domains, audit logs. |

---

## The One-Line Takeaway

**Our architecture can build ANYTHING — including auth, the hardest backend. If it can build auth, it can build any commerce flow. Rate limiting and edge infrastructure are handled at the Cloudflare layer, not in our catalog. Everything else fits within json-render + XState + Nango + content API + catalog handlers.**




