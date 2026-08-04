# Vault — where client secrets live (not ZITADEL, not Nango)

> **Date:** 2026-08-04  
> **Status:** Approved plan — see [`INTEGRATIONS-VAULT-NANGO-AGENTS-ROADMAP.md`](./INTEGRATIONS-VAULT-NANGO-AGENTS-ROADMAP.md) for build order.

**Related:** [`INTEGRATIONS-VAULT-NANGO-AGENTS-ROADMAP.md`](./INTEGRATIONS-VAULT-NANGO-AGENTS-ROADMAP.md) · [`PLATFORM-PALETTE-SECRETS-NOTIFICATIONS.md`](./PLATFORM-PALETTE-SECRETS-NOTIFICATIONS.md) · [`LLM-CREDENTIALS-PER-ORG.md`](../2026-08-03/LLM-CREDENTIALS-PER-ORG.md) · [`ORG-AUTH-CONFIG.md`](../2026-07-25/ORG-AUTH-CONFIG.md) · [`nango-domain.md`](../2026-07-04/nango-domain.md)

---

## One rule

**One secret, one home.** If it is already in ZITADEL or Nango, **do not copy it into Vault.**

| Store | What lives there |
|-------|------------------|
| **ZITADEL** | Human login — OAuth client id/secret for Google/GitHub/Apple **IdP**, passwords, sessions |
| **Nango** (Phase 2+) | Merchant **OAuth connections** — refresh tokens for any integration enabled in Nango |
| **Vault** | Everything else in this doc |
| **Postgres `app`** | **No raw secrets** — only flags, `connectionId`, audit, CMS, prefs |

---

## What goes in Vault

### A. Platform secrets (noname ops)

Inject at deploy; server reads once or on rotation — **never in git**.

| Secret | Vault path (example) | Consumer |
|--------|----------------------|----------|
| `DATABASE_URL` | `noname/platform/database_url` | server |
| `WORKER_SERVER_SECRET` | `noname/platform/worker_server_secret` | server, workers |
| `AGENT_TOKEN_SECRET` | `noname/platform/agent_token_secret` | server |
| `ZITADEL_MACHINE_KEY_JSON` | `noname/platform/zitadel_machine_key` | server (Management API) |
| Platform LLM fallback | `noname/platform/openai_api_key` | ai-pipeline |
| Platform LLM fallback | `noname/platform/anthropic_api_key` | ai-pipeline |
| Platform comms fallback | `noname/platform/resend_api_key` | notifications |
| `NANGO_SECRET_KEY` | `noname/platform/nango_secret_key` | server (Phase 2) |
| `NANGO_ENCRYPTION_KEY` | `noname/platform/nango_encryption_key` | Nango service (Phase 2) |
| R2 / object storage keys | `noname/platform/r2_*` | server |

### B. Merchant / org BYOK (per `orgId`)

Written once from admin (write-only UI); **never returned on GET**. Postgres holds flags only.

| Kind | Provider examples | Vault path (KV v2) |
|------|-------------------|---------------------|
| **llm** | openai, anthropic | `noname/orgs/{orgId}/llm/{provider}` |
| **comms** | resend, twilio, ses | `noname/orgs/{orgId}/comms/{provider}` |

**Payload shape (JSON at path):**

```json
{
  "apiKey": "sk-…",
  "updatedAt": "2026-08-04T…",
  "updatedBy": "zitadel-sub-…"
}
```

Optional fields per provider: `fromEmail`, `accountSid`, `region` — non-secret metadata can also live in `tenant_settings.integrations` if you prefer not to round-trip Vault for display.

### C. What does **not** go in Vault

| Item | Correct home | Why |
|------|--------------|-----|
| Google login OAuth client secret (merchant IdP) | **ZITADEL** | Identity product |
| Merchant OAuth **access + refresh tokens** | **Nango** | OAuth lifecycle (any provider) |
| `connectionId` pointer | **Postgres** `tenant_settings` | Not a secret |
| Email template bodies | **CMS documents** | Content |
| Notification prefs (opt-in, channels) | **Postgres** | Not secrets |
| Keto tuples | **Postgres `keto`** | Authorization graph |

---

## Postgres stays public-config only

`tenant_settings.integrations` (flags, no secrets):

```typescript
integrations: {
  llm?: {
    provider: 'openai' | 'anthropic';
    hasOrgKey: boolean;              // derived: Vault path exists
    allowPlatformFallback?: boolean;
  };
  comms?: {
    emailProvider?: 'resend' | 'ses';
    smsProvider?: 'twilio';
    hasOrgKey: boolean;
    fromEmail?: string;
    fromName?: string;
  };
  nango?: Record<string, { connectionId: string }>; // Phase 2 — Nango pointer only
}
```

---

## Backend domain: `domains/secrets`

Same pattern as **`domains/auth`** + `adapters/zitadel`:

```
domains/secrets/
  ports.ts           SecretStorePort
  service.ts         path helpers, resolveLLMProvider, resolveCommsProvider
  adapters/vault.ts  HashiCorp API — dev + prod
  index.ts           createSecretsDomain(deps)
```

**`domains/integrations`** owns admin routes (LLM/comms BYOK, Nango connect) and calls `secrets.service` — see roadmap.

Other domains (**ai-pipeline**, **notifications**, **agent/mastra**) import **secrets service only** — never the Vault SDK.

---

## noname server: `SecretStorePort`

Domains never import Vault SDK directly — one port, two backends:

```typescript
// Conceptual — packages/server/src/domains/secrets/ports.ts

interface SecretStorePort {
  putOrgSecret(input: {
    orgId: string;
    kind: 'llm' | 'comms';
    provider: string;
    payload: Record<string, string>;
    updatedBy: string;
  }): Promise<void>;

  getOrgSecret(input: {
    orgId: string;
    kind: 'llm' | 'comms';
    provider: string;
  }): Promise<Record<string, string> | null>;

  hasOrgSecret(orgId: string, kind: string, provider: string): Promise<boolean>;

  // Platform secrets — boot or cached
  getPlatformSecret(name: string): Promise<string | null>;
}
```

| Environment | Adapter |
|-------------|---------|
| **Local dev** | **`VaultSecretStore`** → compose `vault:8200` + dev root token |
| **Staging / prod** | **`VaultSecretStore`** — AppRole or K8s SA auth |

Server env:

```env
VAULT_ADDR=http://localhost:8200   # dev: http://vault:8200 from other containers
VAULT_TOKEN=…                      # dev root only — never in prod apps
VAULT_MOUNT=secret
VAULT_PATH_PREFIX=noname
```

Resolvers unchanged:

- `resolveLLMProvider(orgId)` → Vault BYOK → platform path → mock
- `resolveCommsProvider(orgId, channel)` → Vault BYOK → platform path → deny

---

## Vault infrastructure (does not use app Postgres)

Vault uses **its own storage backend** — not database `app`, `zitadel`, or `nango`.

| Deployment | Storage | Notes |
|------------|---------|--------|
| **Local dev** | **`hashicorp/vault` in docker-compose** (`:8200`, dev mode) | Same code path as prod |
| **Production** | Integrated Storage HA or **HCP Vault** | Backups + unseal/runbook |

Mount: **`secret/`** (KV v2) engine, prefix **`noname/`**.

**Do not** `CREATE DATABASE vault` on shared Postgres unless you deliberately choose a Postgres storage backend (not the default recommendation).

---

## Admin UX (same as auth BYOK pattern)

1. Merchant opens **LLM settings** or **Comms settings** in noname admin.
2. Paste API key → `PUT /api/.../integrations/llm` (or comms).
3. Server validates permission (Keto) → **`SecretStorePort.putOrgSecret`** → Vault.
4. `GET` returns `{ hasOrgKey: true, provider: 'openai' }` — **never** the key.
5. Audit: `document_ops`-style row or dedicated `secret_ops` (orgId, kind, action, actor — no secret value).

---

## Auth to Vault (server only)

| Actor | Vault auth |
|-------|------------|
| **noname server** | AppRole or Kubernetes auth — read/write `noname/orgs/*` and `noname/platform/*` |
| **Nango container** | Read only `noname/platform/nango_encryption_key` if injected via sidecar/env at start |
| **Browser / merchant** | **Never** talks to Vault |

ZITADEL proves **who the human is**; Keto proves **they may write org secrets**; Vault holds **the bytes**.

---

## Phase plan

| Phase | Work |
|-------|------|
| **I-a** | Vault in compose + `domains/secrets` + `VaultSecretStore` |
| **I-b** | `domains/integrations` admin BYOK routes → Vault |
| **I-c** | `domains/notifications` → `resolveCommsProvider` |
| **I-d** | Nango compose + `integrations/adapters/nango` |
| **II** | Mastra agents — LLM via secrets, external APIs via Nango |

Full checklist: [`INTEGRATIONS-VAULT-NANGO-AGENTS-ROADMAP.md`](./INTEGRATIONS-VAULT-NANGO-AGENTS-ROADMAP.md).

**Do not** implement `org_secrets` Postgres table — Vault is the only BYOK store.

---

## FAQ

**Is Vault required for local dev?**  
Yes — run **`vault` in docker-compose** so dev matches prod. Same `VaultSecretStore` adapter.

**LLM in Nango instead of Vault?**  
Optional later for OpenAI-only BYOK; default remains **Vault** for LLM + comms so one merchant vault story.

**Per-user API keys in Vault?**  
No for v1. Paths are **`orgs/{orgId}/…`**. Per-user notification prefs stay in Postgres.

**Compliance story?**  
Vault audit log + noname usage tables (`llm_usage`, `comms_deliveries`) + Keto on admin writes.

---

## Quick reference diagram

```
Merchant admin
    → noname server (JWT + Keto)
        → Vault: noname/orgs/{orgId}/llm|comms/{provider}
        → Postgres: tenant_settings flags only

Login OAuth (Google for sign-in)
    → ZITADEL IdP credentials

Merchant OAuth (any external API via Nango)
    → Nango DB (encrypted) + connectionId in Postgres

Platform ops keys
    → Vault: noname/platform/*
```
