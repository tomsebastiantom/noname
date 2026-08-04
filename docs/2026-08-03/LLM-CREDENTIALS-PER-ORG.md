# LLM credentials per org — reuse audit (no code)

> **Date:** 2026-08-03 (updated 2026-08-04)  
> **Question:** Can we reuse existing credential storage (Nango, login/IdP, etc.) for per-org LLM API keys (BYOK + platform fallback)?  
> **Answer:** Reuse the **auth credential pattern**, not Nango or CMS. Store keys in **HashiCorp Vault** via **`domains/secrets`** (not Postgres).

> **Decision (2026-08-04):** Option A (`org_secrets` Postgres table) is **superseded**. Use Vault paths `noname/orgs/{orgId}/llm/{provider}`. Build order: [`INTEGRATIONS-VAULT-NANGO-AGENTS-ROADMAP.md`](../2026-08-04/INTEGRATIONS-VAULT-NANGO-AGENTS-ROADMAP.md).

**Related:** [`ORG-AUTH-CONFIG.md`](../2026-07-25/ORG-AUTH-CONFIG.md) · [`nango-domain.md`](../2026-07-04/nango-domain.md) · [`AGENT-PHASE-2-MASTRA-SPEC.md`](../2026-08-03/AGENT-PHASE-2-MASTRA-SPEC.md) · [`VAULT-CLIENT-SECRETS.md`](../2026-08-04/VAULT-CLIENT-SECRETS.md) · [`INTEGRATIONS-VAULT-NANGO-AGENTS-ROADMAP.md`](../2026-08-04/INTEGRATIONS-VAULT-NANGO-AGENTS-ROADMAP.md)

---

## Target behavior

| Case | Who pays OpenAI/Anthropic | Where key comes from |
|------|---------------------------|----------------------|
| Merchant BYOK | Merchant | Per-org secret (server-only) |
| No merchant key | Platform | `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` in env |
| Neither | — | Mock provider (dev) |

Same idea as login: **org can bring credentials OR rely on platform setup** — never expose secrets to the browser.

---

## What exists in the repo today

### 1. Login / OAuth credentials ✅ (best pattern to copy)

| Piece | Where | Secrets? |
|-------|--------|----------|
| OAuth client id/secret | **ZITADEL** per org (Management API `upsertZitadelIdp`) | ✅ stored in IdP, not Postgres |
| Which providers enabled | `tenant_settings.auth` in Postgres | ❌ no secrets — `providers`, `idpIds`, flags only |
| Admin save | `PUT /api/auth/:orgId/config` | Credentials in body once; never returned on GET |
| Runtime | Broker reads config + ZITADEL | Client sees public config only |

**Reuse:** write-only admin field, server-only secret store, public config document for flags.

**Do not reuse ZITADEL itself for LLM keys** — it is an identity provider for humans, not a generic secret vault for merchant API keys.

---

### 2. Nango ❌ (not available; wrong fit for LLM BYOK)

| Piece | Status |
|-------|--------|
| Postgres DB `nango` | ✅ created by `scripts/compose/init-dbs.sh` |
| Docker service | ❌ not in current `docker-compose.yml` |
| Integration scripts | ❌ none |
| Server wiring | ❌ none (`nango-domain.md`: Phase 2+) |
| Purpose | OAuth + sync for **external SaaS** (Stripe, QuickBooks, email, …) |

**Why not Nango for OpenAI/Anthropic keys:**

1. **Not running** — would add Phase 2+ infra before LLM BYOK works.
2. **Wrong credential type** — Nango excels at OAuth refresh tokens and integration actions; LLM keys are **static API keys** (no OAuth dance).
3. **Wrong product boundary** — Nango is for **commerce/integration** side effects in XState machines, not the ai-pipeline/agent LLM path.
4. **Extra moving parts** — second DB, secret key, connection API — for something a single encrypted column or small table solves.

**When Nango *does* belong:** merchant connects Stripe, Shopify, QuickBooks — keep LLM credentials separate.

---

### 3. `tenant_settings.integrations` 🟡 (partial reuse)

Today (`TenantIntegrations`):

```typescript
googleAnalyticsId?, facebookPixelId?, hotjarId?, tiktokPixelId?
// + index signature for other string ids
```

These are **public tracking IDs**, not secrets. Safe in Postgres jsonb on the tenant document.

**Reuse for LLM:**

```typescript
integrations: {
  llm?: {
    provider: "openai" | "anthropic";
    model?: string;
    keySource: "platform" | "org";  // derived, not secret
    hasOrgKey?: boolean;            // derived on read — never the key itself
  }
}
```

**Do not put `openaiApiKey` in this jsonb** — same rule as OAuth secrets not in CMS content.

---

### 4. CMS / content types ❌

Auth provider CMS rows **explicitly reject** OAuth credentials on built-in rows; secrets go through auth config API only (`auth-provider/content.ts`).

LLM keys must **not** live in content entries or layout specs.

---

### 5. Platform env (today’s LLM path) ✅

`packages/server/src/domains/ai-pipeline/providers.ts`:

- Reads `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` globally
- No `orgId` — all tenants share one platform key or mock

This stays as **fallback** after per-org resolution.

---

### 6. Agent tokens (different thing) ⚠️

`AGENT_TOKEN_SECRET` + HMAC agent JWT — platform-scoped delegation tokens for **your** agents, not merchant OpenAI keys. Do not conflate.

---

## Recommended design (reuse auth pattern, not Nango)

```
┌─────────────────────────────────────────────────────────────┐
│ Admin UI — Settings → Integrations → LLM                     │
│   provider, model preference, [password field: API key]      │
└───────────────────────────┬─────────────────────────────────┘
                            │ PUT (key write-only)
┌───────────────────────────▼─────────────────────────────────┐
│ HashiCorp Vault — `noname/orgs/{orgId}/llm/{provider}`       │
│   { apiKey, updatedAt, updatedBy } — server-only via adapter │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│ tenant_settings.integrations.llm — flags only (no secrets)   │
│   provider, model, keySource: platform | org                   │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│ ai-pipeline resolveProvider(orgId)                           │
│   1. org secret if present                                   │
│   2. else platform env key                                   │
│   3. else mock                                               │
│   → record row in llm_usage (org_id, tokens, model, task_id) │
└─────────────────────────────────────────────────────────────┘
```

### Parallels to login

| Login | LLM |
|-------|-----|
| ZITADEL stores OAuth secret | **Vault** stores API key |
| `tenant_settings.auth.idpIds` | `tenant_settings.integrations.llm` flags |
| `PUT /auth/:orgId/config` | `PUT /tenant_settings/default` or `PUT /integrations/llm` |
| `GET /auth/:orgId/config` (no secrets) | GET returns `hasOrgKey: true` only |

---

## Token usage (separate from credentials)

Credentials ≠ usage. Even with BYOK, log every call for quotas and support:

| Store | Purpose |
|-------|---------|
| `llm_usage` append table | Per call: org_id, model, input/output tokens, task_id, source |
| `agent_tasks.tokens` | Keep as **task total** summary |

`ai_generations` table exists in schema but is **never written** — prefer renaming/extending to `llm_usage` when implementing (see Phase 2 spec).

---

## Option A vs Option B (credential store)

> **2026-08-04:** **Option A is superseded.** Use **Vault** (see [`VAULT-CLIENT-SECRETS.md`](../2026-08-04/VAULT-CLIENT-SECRETS.md)). Option B below remains valid only if you already centralize *all* external creds in Nango — we do **not** use Nango for LLM BYOK in the approved plan.

Two approaches were considered. Pick based on whether you deploy Nango anyway.

### Option A — ~~`org_secrets` in noname Postgres~~ (superseded)

~~Small table + `LLM_SECRETS_KEY` in server env~~ — **replaced by Vault KV paths** under `domains/secrets`. Do not implement this table.

### Option B — Nango as credential store (not chosen for LLM)

**Yes — per [Nango security docs](https://nango.dev/docs/guides/platform/security), credentials go inside Nango’s setup:**

| What Nango stores | Encrypted in Nango Postgres (`NANGO_ENCRYPTION_KEY`) |
|-------------------|-----------------------------------------------------|
| OAuth access/refresh tokens | ✅ |
| **API keys** (key-based auth) | ✅ |
| OAuth client id/secret (integration config) | ✅ |
| Connection config (scopes, etc.) | ✅ |

**OpenAI is a first-class Nango integration** — API key auth, pre-built Connect UI, proxy with retries: [OpenAI on Nango](https://nango.dev/docs/integrations/all/openai).

Flow for merchant BYOK:

```
1. noname orgId ↔ nango connectionId (store id in tenant_settings.integrations.llm)
2. Merchant pastes OpenAI key → Nango Connect / connection create (or server-side API)
3. ai-pipeline: nango.getConnection('openai', connectionId) → use credentials
   OR nango.post({ providerConfigKey: 'openai', connectionId, endpoint: '/v1/chat/completions', ... })
4. No org key / no connection → platform OPENAI_API_KEY env
```

**Mapping to your stores (org = tenant):**

| noname | Nango |
|--------|-------|
| `orgId` (ZITADEL org) | `connectionId` per org (you assign) |
| `tenant_settings.integrations.llm.connectionId` | pointer only — **not** the secret |
| Platform env keys | Nango env with no connection, or “platform” connection |

**When Option B wins:**

- You already run Nango for **Stripe, Shopify, QuickBooks** (planned Phase 2+)  
- One credential vault for **all** external APIs + LLM  
- You want Nango **Connect UI** for BYOK without building your own  
- You want **proxy** (retries, rate limits) on LLM calls  

**When Option A wins:**

- Nango not deployed yet (today: DB `nango` exists, **no service wired**)  
- You want LLM BYOK **before** commerce integrations  
- Fewer moving parts (one Postgres, one encryption key)  

**Noti vs Nango:** [Noti](https://github.com/tomsebastiantom/noti) is notification + tenant credential vault (Twilio/SES). **Nango** is closer for LLM + commerce APIs. You could use both later (Noti = notify, Nango = integrations + creds) — don’t merge into one box prematurely.

**Usage logging stays in noname** either way — `llm_usage` in app DB; Nango does not replace per-org token billing.

---

## Decision matrix

| Option | Reuse? | Verdict |
|--------|--------|---------|
| Auth config pattern (write-only + secret store) | ✅ | **Always** for UX |
| `tenant_settings.integrations` for flags + `connectionId` | ✅ | **Do this** |
| Platform env fallback | ✅ | **Keep** |
| **Vault (approved)** | ✅ | **Default** — LLM/comms BYOK + platform keys |
| **Nango connections (Option B)** | ✅ | OAuth integrations only (any Nango-enabled provider); not LLM BYOK |
| ZITADEL for LLM keys | ❌ | Wrong product |
| CMS content fields | ❌ | Forbidden |
| Noti credential vault | 🟡 | Notifications, not LLM; separate concern |
| Global env only (today) | ✅ current | Insufficient for BYOK |

---

## Implementation order (when ready — not now)

See [`INTEGRATIONS-VAULT-NANGO-AGENTS-ROADMAP.md`](../2026-08-04/INTEGRATIONS-VAULT-NANGO-AGENTS-ROADMAP.md) Phase **I-a** / **I-b**:

1. `domains/secrets` + Vault compose + `SecretStorePort`  
2. Extend `tenant_settings.integrations.llm` (types + admin UI)  
3. `resolveLLMProvider(orgId)` in ai-pipeline  
4. `llm_usage` logging on every call  
5. Optional: usage dashboard / quota per org on platform key  

**No dependency on Nango or Mastra** for LLM credentials — Vault + ai-pipeline + tenant settings first.

---

## FAQ

**Can merchants export credentials from Nango?**  
Nango is not deployed; even when it is, it is for OAuth integrations (Stripe etc.), not LLM. Merchants paste OpenAI keys in admin (BYOK) or use platform key.

**Same as “someone stores their [OAuth] credentials”?**  
Same **UX pattern** as Google OAuth in Auth settings — different **backend store** (**Vault** vs ZITADEL IdP).

**Platform token when no org key?**  
Yes — identical to dev/single-tenant today: env keys apply to all orgs without BYOK until quota/policy says otherwise.
