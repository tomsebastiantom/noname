# Platform palette — secrets, notifications, and tenant setup

> **Date:** 2026-08-04  
> **Status:** Approved plan (no implementation in this doc)  
> **Scope:** Which open-source / self-hosted services belong in the stack, where secrets live, how **platform communications** fit **inside noname**, and what merchants configure per org vs per user.

**Related:** [`INTEGRATIONS-VAULT-NANGO-AGENTS-ROADMAP.md`](./INTEGRATIONS-VAULT-NANGO-AGENTS-ROADMAP.md) · [`COMMUNICATIONS-PLATFORM-RFC.md`](./COMMUNICATIONS-PLATFORM-RFC.md) · [`VAULT-CLIENT-SECRETS.md`](./VAULT-CLIENT-SECRETS.md) · [`LLM-CREDENTIALS-PER-ORG.md`](../2026-08-03/LLM-CREDENTIALS-PER-ORG.md) · [`ORG-AUTH-CONFIG.md`](../2026-07-25/ORG-AUTH-CONFIG.md) · [`nango-domain.md`](../2026-07-04/nango-domain.md)

---

## Summary

| Layer | Service | Secrets? | Phase |
|-------|---------|----------|-------|
| Human login | **ZITADEL** | OAuth client secrets in IdP | 0 ✅ |
| Authorization | **Ory Keto** | None (relations only) | 0 ✅ |
| Product + CMS + agents | **noname** (`@noname/server`) | Platform + BYOK via **Vault** | 0 → 1 |
| **Platform communications** | **`domains/notifications`** in noname | Comms BYOK in **Vault** | 1 |
| LLM BYOK | **ai-pipeline** in noname | LLM keys in **Vault** | 1 |
| Merchant OAuth (external SaaS) | **Nango** | Tokens in Nango Postgres | 2+ |
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
| **`domains/notifications`** | **Platform communications** — email, SMS, in-app; delivery log | `resolveCommsProvider` → Vault | Comms settings in integrations admin |
| **`notification_preferences`** | Per-user channel prefs | No secrets | User settings |
| **`email-outbound` queue** | Async send (rendered payload) | — | Worker uses CMS + secrets resolver |
| **ai-pipeline / agents** | One **consumer** of communications (among many) | `resolveLLMProvider` → Vault | LLM settings in integrations admin |

### Phase 1d / 2 — infrastructure services

| Component | Role | Secrets | When |
|-----------|------|---------|------|
| **HashiCorp Vault** | BYOK + platform keys | Own storage (compose `:8200` dev; HA prod) | **I-a** — before integrations admin |
| **Nango** | OAuth + proxy/MCP for integrations enabled in Nango | `NANGO_ENCRYPTION_KEY` from Vault; tokens in `nango` DB | **I-d** — before Mastra tools need OAuth |
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
  // nango?: Record<string, { connectionId: string }>  // pointer to Nango only
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

## Platform communications (not AI-only)

**`domains/notifications` is the platform communication layer** — the same role AWS SES/SNS, Azure Communication Services, or Twilio SendGrid play in other stacks, but **inside noname** with merchant BYOK and our CMS template system.

It is **not** an “AI email feature.” Any part of the platform may send:

| Caller | Example |
|--------|---------|
| **XState / machines** | Order confirmed → templated email; shipment update → SMS |
| **Agent worker** | Task complete → optional notify (one consumer) |
| **Admin / server routes** | Invite user, password reset, merchant alert |
| **Webhooks domain** (I-f) | Ops alert when a destination auto-disables |
| **Storefront / API** (future) | Contact form, marketing campaign with consent |
| **Cron / background jobs** | Digest, billing reminder |

**Merchants configure once per org:**

- Provider credentials (Resend, SES, Twilio, …) → **Vault** via integrations admin
- From address / sender identity → `tenant_settings.integrations.comms`
- Message copy → CMS **`notification_email`** templates (json-render spec)

**End users configure per user:** channel preferences (`notification_preferences`) — who wants email vs push, marketing opt-in, etc.

**Separate concerns (do not merge):**

| System | Delivers to | Direction |
|--------|-------------|-----------|
| **Communications** (`notifications`) | People (email, SMS, in-app) | Platform → user |
| **Webhooks** (`webhooks`, I-f) | Merchant systems (HTTP URLs) | Platform ↔ integrations |
| **OAuth connect** (`integrations`) | Save `connectionId` after connect | Provider → platform (auth only) |

Agents and Mastra **use** communications like any other domain — via `notifications.service.enqueueTemplatedEmail` / `enqueueEmail`, never by calling Resend/Twilio directly.

---

## Notifications inside noname (not a separate Noti service for v1)

### Why inline

- Templates already live in **CMS / documents**.
- **Permissions** already live in ZITADEL + Keto.
- **Org creds** in **Vault** via **`domains/secrets`** — one BYOK pattern, one admin UX (`domains/integrations`).
- Transactional volume does not require a Go sidecar yet.

### Architecture

**Email templates are required.** They are org-owned CMS documents — not a separate template SaaS, not optional worker logic.

```
Trigger (machine / agent / admin route / webhook ops / future storefront)
    → notifications.enqueueTemplatedEmail({ orgId, templateId, to, variables, userId? })
    → notifications.service:
        load published template from documents domain
        render subject + html (variable substitution)
        respect notification_preferences when userId set
        insert comms_deliveries (queued)
        enqueue email-outbound { subject, html, … }
    → worker: resolveCommsProvider(orgId) → Resend/Twilio send
    → update comms_deliveries (sent | failed)
```

**Alternative (same pipeline):** any caller may use `enqueueEmail` with **already-rendered** `subject` + `html` (dynamic one-offs, LLM-generated body, etc.). Use **templates** for merchant-editable transactional mail; use **raw html** when copy is computed at send time.

Worker **does not** load CMS — render happens in **service at enqueue** so the queue stays dumb transport.

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

### NotificationPort (current + template path)

```typescript
// domains/notifications/ports.ts — platform surface (any caller)
enqueueEmail(orgId, { to, subject, html, text?, userId? });           // raw body
enqueueTemplatedEmail(orgId, { to, templateId, variables, userId? }); // CMS template
```

v1 send adapter: inline Resend/Twilio via Vault.  
Templates: **documents** CMS content type — edited in admin content UI, not integrations screen.

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

### 4. Integrations — comms + email templates (noname, Phase 1)

- [ ] **Comms settings**: email provider, from-address, optional BYOK (→ **Vault**).
- [ ] **Email templates (required)**: CMS content type `notification_email`; seed welcome, order confirm, agent-task-complete (examples — not AI-specific)
- [x] **`enqueueTemplatedEmail`** wired in notifications service (load + render from documents).
- [ ] Platform fallback `RESEND_API_KEY` for dev tenants without BYOK.

### 5. User notification preferences

- [ ] Defaults for new members (e.g. agent task email on for owners).
- [ ] User can opt out of non-transactional categories.

### 6. Phase I-d+ (when enabled)

- [x] **Nango**: connect any integration via admin UI; store `connectionId` only in `tenant_settings.integrations.nango`.
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
              │ Nango      │── OAuth for any enabled integration
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
No for v1. **Platform communications** live in `domains/notifications` — same tier as documents, machines, or webhooks. Not a sidecar for agents.

**Where do email templates live?**  
CMS `notification_email` entries — **same document model** as `page` / `auth_provider` (Admin → Content, draft, publish). **Target:** json-render **spec** field + `@json-render/react-email` render — **no html fallback**. See [`EMAIL-TEMPLATES-REACT-EMAIL.md`](./EMAIL-TEMPLATES-REACT-EMAIL.md).

**Can one Vault store rule them all?**  
Platform + merchant BYOK (LLM/comms) → **Vault**. Merchant OAuth (any Nango integration) → **Nango DB**. Postgres holds flags and `connectionId` only — one secret, one home.

**Per user per store for notifications?**  
**Preferences and delivery targets** — per user. **Provider credentials** — per org (store).

**Does this replace updating `LLM-CREDENTIALS-PER-ORG.md`?**  
That doc remains the LLM-focused deep dive. This doc is the **whole-palette** map including comms and notifications.
