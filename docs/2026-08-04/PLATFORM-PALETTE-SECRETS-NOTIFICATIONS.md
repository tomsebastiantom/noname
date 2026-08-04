# Platform palette — secrets, notifications, and tenant setup

> **Date:** 2026-08-04  
> **Status:** Approved plan (no implementation in this doc)  
> **Scope:** Which open-source / self-hosted services belong in the stack, where secrets live, how notifications fit **inside noname**, and what merchants configure per org vs per user.

**Related:** [`INTEGRATIONS-VAULT-NANGO-AGENTS-ROADMAP.md`](./INTEGRATIONS-VAULT-NANGO-AGENTS-ROADMAP.md) · [`VAULT-CLIENT-SECRETS.md`](./VAULT-CLIENT-SECRETS.md) · [`LLM-CREDENTIALS-PER-ORG.md`](../2026-08-03/LLM-CREDENTIALS-PER-ORG.md) · [`ORG-AUTH-CONFIG.md`](../2026-07-25/ORG-AUTH-CONFIG.md) · [`nango-domain.md`](../2026-07-04/nango-domain.md) · [`INFRASTRUCTURE_NEEDS.md`](../2026-07-04/INFRASTRUCTURE_NEEDS.md) · [`AGENT-OWNERSHIP-AND-REVIEW.md`](../2026-08-03/AGENT-OWNERSHIP-AND-REVIEW.md)

---

## Summary

| Layer | Service | Secrets? | Phase |
|-------|---------|----------|-------|
| Human login | **ZITADEL** | OAuth client secrets in IdP | 0 ✅ |
| Authorization | **Ory Keto** | None (relations only) | 0 ✅ |
| Product + CMS + agents | **noname** (`@noname/server`) | Platform + BYOK via **Vault** | 0 → 1 |
| Notifications | **`domains/notifications`** in noname | Comms BYOK in **Vault** | 1 |
| LLM BYOK | **ai-pipeline** in noname | LLM keys in **Vault** | 1 |
| Commerce OAuth (Stripe, Shopify) | **Nango** (deferred) | Tokens in Nango Postgres | 2+ |
| **All other client / platform secrets** | **HashiCorp Vault** | See [`VAULT-CLIENT-SECRETS.md`](./VAULT-CLIENT-SECRETS.md) | 1b prod |
| Separate Noti / Go send service | **Not used for v1** | — | optional later |

**Core rules**

1. **One secret, one home** — never duplicate the same key in Vault, Nango, ZITADEL, or CMS.
2. **Org owns provider creds** — LLM and comms API keys are **per store (orgId)**, not per staff user.
3. **User owns notification prefs** — who gets email/push, opt-in/out, is **per user** within an org.
4. **Templates in CMS** — noname documents; not a separate Noti template store.
5. **Integrations before Mastra** — Vault + Nango + admin BYOK before Phase 2 agent loop ([roadmap](./INTEGRATIONS-VAULT-NANGO-AGENTS-ROADMAP.md)).

---

## Platform palette (what to use where)

### Always in the stack

| Component | Role | Auth model | Merchant / tenant setup |
|-----------|------|------------|-------------------------|
| **ZITADEL** | Login, orgs, users, JWT | OIDC; machine key for Management API | Admin **Auth settings**: enable Google/GitHub/Apple, password; IdP creds saved to ZITADEL per org. See [`ORG-AUTH-CONFIG.md`](../2026-07-25/ORG-AUTH-CONFIG.md). |
| **Ory Keto** | Fine-grained permissions (folders, agents, analytics) | Relations from server after JWT | Scope admin: folder bindings, agent folder access. Roles from ZITADEL → Keto tuples. |
| **Postgres (`app`)** | CMS, settings, audit, agents, notification prefs | Server-only DB access | Seeded via `pnpm seed:demo`; **no raw secrets** — flags + `connectionId` only. |
| **Cloudflare Workers** | Edge JWT, proxy to API | `@cfworker/jwt` + HMAC to server | Platform ops: `ZITADEL_*`, `WORKER_SERVER_SECRET`. Not merchant-facing. |
| **noname server** | System of record, domains, queues | Session JWT + Keto checks | All admin UIs under `/admin/*` per org subdomain. |

### Phase 1 — build inside noname

| Component | Role | Secrets | Tenant setup |
|-----------|------|---------|----------------|
| **`domains/secrets`** | Vault adapter + resolvers | Read/write **`noname/orgs/{orgId}/…`** | — (infra) |
| **`domains/integrations`** | Admin BYOK + Nango connect | Calls secrets; stores `connectionId` | Admin LLM / Comms / Connect screens |
| **`domains/notifications`** | Send email/SMS/push; delivery log | `resolveCommsProvider` → Vault | Comms settings in integrations admin |
| **`notification_preferences`** | Per-user channel prefs | No secrets | User settings |
| **`email-outbound` queue** | Render template → send | — | Worker uses CMS + secrets resolver |
| **ai-pipeline / agents** | LLM calls | `resolveLLMProvider` → Vault | LLM settings in integrations admin |

### Phase 1d / 2 — infrastructure services

| Component | Role | Secrets | When |
|-----------|------|---------|------|
| **HashiCorp Vault** | BYOK + platform keys | Own storage (compose `:8200` dev; HA prod) | **I-a** — before integrations admin |
| **Nango** | Stripe, Shopify, Gmail OAuth + proxy/MCP | `NANGO_ENCRYPTION_KEY` from Vault; tokens in `nango` DB | **I-d** — before Mastra tools need OAuth |
| **Noti / Go send service** | Not used | — | optional later |

### Explicitly not used for secrets

| Thing | Why |
|-------|-----|
| **CMS content fields** | Public/marketing data; never API keys |
| **ZITADEL** (for LLM/comms) | Identity for humans, not merchant API vault |
| **Nango** (for LLM/comms/Twilio send) | Wrong abstraction; deferred anyway |
| **Noti as second vault (v1)** | Same job as **Vault** + notifications domain |

---

## Unified credential model (Vault KV v2)

Paths under mount `secret/` (prefix `noname/`):

```
noname/orgs/{orgId}/llm/{provider}      → { apiKey, updatedAt, updatedBy }
noname/orgs/{orgId}/comms/{provider}    → { apiKey, … }
noname/platform/openai_api_key          → platform fallback
noname/platform/nango_encryption_key    → Nango service
```

**No `org_secrets` Postgres table.**

**Public config** (Postgres `tenant_settings.integrations`):

```typescript
integrations: {
  llm?: {
    provider: 'openai' | 'anthropic';
    hasOrgKey: boolean;       // derived
    allowPlatformFallback?: boolean;
  };
  comms?: {
    emailProvider?: 'resend' | 'ses';
    smsProvider?: 'twilio';
    hasOrgKey: boolean;
    fromEmail?: string;
    fromName?: string;
  };
  // Phase 2+: stripe?: { connectionId: string }  // pointer to Nango only
}
```

### Resolvers (platform chooses which key)

| Call site | Function | Fallback |
|-----------|----------|----------|
| ai-pipeline, agents | `resolveLLMProvider(orgId)` | `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` |
| notifications send | `resolveCommsProvider(orgId, channel)` | `RESEND_API_KEY` / platform Twilio |
| Nango proxy (Phase 2) | `connectionId` from settings | N/A — no raw token in noname |

### Usage / audit logs

| Log | Purpose |
|-----|---------|
| `llm_usage` | Tokens, model, orgId, taskId — billing & compliance |
| `comms_deliveries` | channel, orgId, userId?, status, provider id — support & compliance |
| `document_ops` / agent audit | Already shipped for CMS and agent writes |

---

## Notifications inside noname (not a separate Noti service for v1)

### Why inline

- Templates already live in **CMS / documents**.
- **Permissions** already live in ZITADEL + Keto.
- **Org creds** in **Vault** via **`domains/secrets`** — one BYOK pattern, one admin UX (`domains/integrations`).
- Transactional volume does not require a Go sidecar yet.

### Architecture

```
Trigger (XState / agent / admin)
    → enqueue email-outbound { orgId, templateId, userId?, to, variables }
    → TS worker: load template from documents, render HTML/subject
    → resolveCommsProvider(orgId, 'email')
    → Resend/Twilio SDK send
    → insert comms_deliveries
    → optional in-app notification row for userId
```

### Split: org vs user

| Concern | Scope | Storage |
|---------|--------|---------|
| Resend/Twilio API key | **Org** | **Vault** `…/comms/{provider}` |
| Email templates | **Org** | CMS documents |
| From name / from address | **Org** | `tenant_settings.integrations.comms` |
| Recipient address | **User** or transactional context | job payload |
| Push device token | **User + device** | `user_devices` (future) |
| “Notify me when agent completes” | **User** | `notification_preferences(userId, orgId)` |
| Marketing opt-in | **User** | `notification_preferences` + consent timestamp |
| Who can edit comms settings | **User permission** | Keto e.g. `tenant:manage` or `comms:manage` |

**Staff users share the org’s sending credentials.** They do not each get their own Resend key unless you add a rare BYOK-per-user product later (not v1).

### NotificationPort (swap later without rewrite)

```typescript
// domains/notifications/ports.ts — conceptual
send(input: {
  orgId: string;
  channel: 'email' | 'sms' | 'push';
  to: string;
  subject?: string;
  body: string;
  templateId?: string;
  userId?: string;
}): Promise<DeliveryResult>;
```

v1 adapter: inline Resend/Twilio.  
Future adapter: HTTP to extracted Go service — same interface.

---

## Auth per component (who proves what)

| Component | Who authenticates | How noname talks to it |
|-----------|-------------------|-------------------------|
| **Browser → edge** | End user JWT (ZITADEL) | OIDC login, cookie/session |
| **Edge → server** | HMAC + forwarded JWT claims | `WORKER_SERVER_SECRET` |
| **Server → ZITADEL Management** | Machine key | `ZITADEL_MACHINE_KEY_*` |
| **Server → Keto** | Network / internal | Read/write tuples after JWT identity known |
| **Server → Postgres** | DB credentials | `DATABASE_URL` |
| **Server → Vault** | AppRole / dev token | `domains/secrets` adapter |
| **Server → Resend/Twilio** | Org or platform key | From Vault via `resolveCommsProvider` |
| **Server → OpenAI** | Org or platform key | From Vault via `resolveLLMProvider` |
| **Nango (Phase 2)** | `NANGO_SECRET_KEY` | Server-only; browser gets connect session token only |
| **Vault (optional)** | AppRole / K8s SA | Server reads platform secrets at boot |

Merchants never receive platform machine keys or other orgs’ secrets.

---

## Manual tenant setup checklist (per new store / org)

Use this when onboarding a merchant org (demo or prod).

### 1. Identity (ZITADEL)

- [ ] Org exists in ZITADEL (or created via platform provisioning).
- [ ] Subdomain / slug mapped in tenant catalog.
- [ ] Admin user invited; roles assigned (owner, editor, …).
- [ ] **Auth settings** (optional): Google/GitHub/Apple IdP configured in admin → secrets in ZITADEL, flags in `tenant_settings.auth`.

### 2. Authorization (Keto)

- [ ] Default role tuples for org members.
- [ ] Folder scope bindings if using collection-scoped content.
- [ ] Agent folder grants if using agents.

### 3. Integrations — LLM (noname, Phase 1)

- [ ] **LLM settings**: provider choice, optional BYOK paste (→ **Vault** via `domains/integrations`), or platform fallback allowed.
- [ ] Confirm `hasOrgKey` / `allowPlatformFallback` flags on read.

### 4. Integrations — comms (noname, Phase 1)

- [ ] **Comms settings**: email provider, from-address, optional BYOK (→ **Vault**).
- [ ] Seed or create notification templates in CMS.
- [ ] Platform fallback `RESEND_API_KEY` for dev tenants without BYOK.

### 5. User notification preferences

- [ ] Defaults for new members (e.g. agent task email on for owners).
- [ ] User can opt out of non-transactional categories.

### 6. Phase I-d+ (when enabled)

- [ ] **Nango**: connect Stripe/Shopify via admin UI; store `connectionId` only in `tenant_settings`.
- [ ] **Vault**: platform ops inject DB URLs, `NANGO_ENCRYPTION_KEY`, platform LLM/comms fallbacks.

---

## Open-source placement diagram

```
                    ┌─────────────────────────────────────┐
                    │  Merchant admin (noname client)      │
                    │  Auth / LLM / Comms / Scope / CMS    │
                    └──────────────────┬──────────────────┘
                                       │ HTTPS + JWT
                    ┌──────────────────▼──────────────────┐
                    │  Cloudflare Worker (edge)            │
                    └──────────────────┬──────────────────┘
                                       │ HMAC
┌──────────────┐    ┌──────────────────▼──────────────────┐    ┌─────────────┐
│ ZITADEL      │◄───│  noname server                       ├───►│ Keto        │
│ login, orgs  │    │  documents, agents, notifications,   │    │ permissions │
└──────────────┘    │  secrets, integrations, queues       │    └─────────────┘
                    └──────┬───────────────┬───────────────┘
                           │               │
              ┌────────────▼───┐   ┌───────▼────────┐
              │ Postgres (app) │   │ Redis/BullMQ   │
              │ flags, CMS     │   │ email-outbound │
              │ templates      │   │ agent-tasks    │
              └────────────────┘   └────────────────┘
                           │
              ┌────────────▼────────────┐
              │ HashiCorp Vault         │
              │ org LLM/comms BYOK      │
              │ platform keys           │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │ External APIs           │
              │ OpenAI, Resend, Twilio  │
              └─────────────────────────┘

        Phase I-d (Nango):
              ┌────────────┐
              │ Nango      │── Stripe, Shopify, Gmail OAuth
              └────────────┘
```

---

## Noti, Nango, Vault — decision recap

| Question | Answer |
|----------|--------|
| Need Noti as separate service now? | **No** — notifications domain + **Vault** in noname. |
| Can Noti ideas be reused? | **Yes** — write-only BYOK UI, send port, delivery log table. |
| Go in monorepo? | **Possible later**; not worth it for v1 transactional email. |
| Nango for Twilio/SMS? | **Wrong tool** — Nango can sync Twilio; platform **sends** via comms domain. |
| Nango when? | Phase 2 commerce OAuth — not LLM, not comms. |
| Vault for everything? | Vault for **platform + merchant BYOK** (LLM/comms); Nango keeps its own DB for OAuth tokens only. |
| Per-user API keys? | **No** for v1 — org keys + per-user **preferences**. |

---

## Implementation order (when coding)

Follow [`INTEGRATIONS-VAULT-NANGO-AGENTS-ROADMAP.md`](./INTEGRATIONS-VAULT-NANGO-AGENTS-ROADMAP.md):

1. **I-a** — Vault in compose + `domains/secrets` + `resolveLLMProvider`
2. **I-b** — `domains/integrations` admin (LLM/comms BYOK → Vault)
3. **I-c** — `domains/notifications` + `email-outbound` worker
4. **I-d** — Nango compose + OAuth connect path
5. **Phase II** — Mastra agents (after I-a–I-d)

---

## FAQ

**Do we need a separate notification product in the palette?**  
No for v1. Notifications are a **domain** in noname, like agents or documents.

**Where do email templates live?**  
CMS documents. Worker renders; does not fetch from an external template SaaS.

**Can one Vault store rule them all?**  
Platform + merchant BYOK (LLM/comms) → **Vault**. Merchant OAuth (Stripe/Gmail) → **Nango DB**. Postgres holds flags and `connectionId` only — one secret, one home.

**Per user per store for notifications?**  
**Preferences and delivery targets** — per user. **Provider credentials** — per org (store).

**Does this replace updating `LLM-CREDENTIALS-PER-ORG.md`?**  
That doc remains the LLM-focused deep dive. This doc is the **whole-palette** map including comms and notifications.
