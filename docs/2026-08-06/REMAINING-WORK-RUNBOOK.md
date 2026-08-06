# Remaining work runbook

> **Date:** 2026-08-06  
> **Status:** Canonical checklist for open work after validation + polish (2026-08-05).  
> **Status board:** [`MASTER-STATUS.md`](./MASTER-STATUS.md) · **Backlog:** [`BUILD-MASTER-INDEX.md`](./BUILD-MASTER-INDEX.md)  
> **Rule:** When you ship something, update the **source doc first**, then tick here.

---

## Snapshot — what’s done

| Area | Status |
|------|--------|
| E2E ops/API/UI | **60/60 PASS** |
| Validation V1, V2–V3, V5 | **PASS** |
| Polish C1, C3, U1–U4, welcome invite email | **Shipped** |
| Agent Keto scope (tools + registry grants) | **Shipped** |
| Editor smoke (drag, duplicate, publish, exit) | **PASS** |
| Layout 409 If-Match | **Tested** (`layouts.service.test.ts`) |
| Unit tests | **316 passing** |

**Only validation gate still open:** **V4** live LLM orchestrate (needs Vault LLM key).

---

## Priority order (what to do next)

```
1. V4   Live LLM orchestrate          ← blocked on Vault key + mock off
2. A3   ZITADEL machine user / PAT    ← this doc § A3 (verify + sign-off)
3. K2   Prod Keto deploy              ← infra (K8s/Vela)
4. K1   Batch Keto Check              ← when doc lists slow
5. C2   Comms delivery analytics      ← deferred v2 unless product asks
6. LATER CRDT, mobile push, bot SSR
```

---

## A3 — ZITADEL machine user / PAT (R6 / R7)

**Source:** [`IDENTITY-AGENTS-MASTER-PLAN.md`](../2026-08-03/IDENTITY-AGENTS-MASTER-PLAN.md) R6–R7, A′.6  
**Goal:** Prove ZITADEL can support agent scale **or** document why platform-issued tokens are the v1 path.

### What we already have (do not rebuild)

| Credential | Purpose | Where |
|------------|---------|--------|
| **`noname-backend-sa`** machine user | Management API (roles, IdP, user invite) | `zitadel_keys/noname-backend-sa.json` · `ZITADEL_MACHINE_KEY_*` |
| **`login-client.pat`** | Session API (embedded login broker) | `zitadel_keys/login-client.pat` · `ZITADEL_LOGIN_CLIENT_PAT` |
| **Platform agent JWT** (`nag.*`) | Short-lived agent API auth | `AGENT_TOKEN_SECRET` · `mintAgentToken` / `verifyAgentToken` |
| **Human OIDC JWT** | Staff/customer login | `pnpm init:zitadel` → SPA app + project roles |

Agents **today** authenticate with **platform HMAC tokens** minted by `POST /api/agents/registry/:id/token` — not ZITADEL OAuth clients per agent. Keto scope uses subject `Agent:{slug}`.

### Decision (recommended v1)

| Approach | Use when | Status |
|----------|----------|--------|
| **Platform `nag.*` token** (current) | Dev + first prod; delegation ⊆ creator; 1h TTL | **Shipped** |
| **ZITADEL machine user per agent** | Compliance requires IdP-native M2M audit per agent | **Not built** — verify only |
| **ZITADEL OAuth client per agent** (R7) | Fine-grained OIDC scopes per agent at IdP | **Not built** — optional |

**Default:** Sign off A3 with **platform tokens + existing backend machine user** unless a concrete gap appears in the checklist below.

---

### A3 checklist — verification (run in dev)

#### R6 — Machine users / service accounts

- [ ] **R6.1** `pnpm init:zitadel` completes — writes `ZITADEL_CLIENT_ID`, `ZITADEL_DEMO_ORG_ID`, machine key, login PAT
- [ ] **R6.2** Backend Management API works — e.g. invite user at `/admin/settings/users` (uses `getManagementToken()`)
- [ ] **R6.3** Embedded login works — `POST /api/auth/yogastore/login` (uses login PAT)
- [ ] **R6.4** Document: `noname-backend-sa` is **platform** M2M, not per-agent — acceptable for R6 platform ops
- [ ] **R6.5** (Optional spike) Create a **test machine user** in ZITADEL console/API for one registered agent; confirm JWT `sub` usable as Keto subject — only if pursuing IdP-native agent identity

**Commands:**

```bash
podman compose up -d
pnpm init:zitadel
pnpm db:push && pnpm seed:demo
pnpm dev   # API + edge + client

# R6.2 — management path (invite or list users via admin UI)
# R6.3 — login as admin@zitadel.localhost / NonameAdmin1!
```

#### R7 — OAuth client per agent (optional)

- [ ] **R7.1** Read ZITADEL docs for **project application + service user PAT** vs **JWT profile** for M2M
- [ ] **R7.2** Decide: **skip R7 for v1** (platform `nag.*` sufficient) **or** spike one OAuth app bound to agent registry row
- [ ] **R7.3** If spike: agent task worker accepts either `nag.*` or ZITADEL M2M JWT — document in [`LLM-CREDENTIALS-PER-ORG.md`](../2026-08-03/LLM-CREDENTIALS-PER-ORG.md)

#### A3 sign-off criteria

- [ ] **A3.1** R6.1–R6.4 pass in dev
- [ ] **A3.2** Written decision recorded (this doc + [`IDENTITY-AGENTS-MASTER-PLAN.md`](../2026-08-03/IDENTITY-AGENTS-MASTER-PLAN.md) R6/R7 rows updated)
- [ ] **A3.3** If staying on platform tokens: add prod note — rotate `AGENT_TOKEN_SECRET` via Vault (`noname/platform/agent_token_secret` per [`VAULT-CLIENT-SECRETS.md`](../2026-08-04/VAULT-CLIENT-SECRETS.md))
- [ ] **A3.4** Update [`BUILD-MASTER-INDEX.md`](./BUILD-MASTER-INDEX.md) A3 row → **Signed off** or **Spike needed**

---

## V4 — Live LLM orchestrate

**Blocked on:** Vault LLM key + `MASTRA_ORCHESTRATE_MOCK=false` in running API.

```bash
# 1. Admin → Integrations → LLM — save provider + API key
# 2. packages/server/.env
MASTRA_ORCHESTRATE_MOCK=false
# 3. Restart API
# 4. Agents admin → orchestrate job — expect ≥3 tools, model ≠ mock-orchestrate
```

- [ ] **V4.1** Vault LLM key present for yogastore org
- [ ] **V4.2** One completed task with ≥3 tools in one job
- [ ] **V4.3** Tick [`AGENT-PHASE-2-MASTRA-SPEC.md`](../2026-08-03/AGENT-PHASE-2-MASTRA-SPEC.md) §7 live criterion
- [ ] **V4.4** Update [`E2E-OPS-BATCH-VALIDATION.md`](../2026-08-04/E2E-OPS-BATCH-VALIDATION.md) validation batch

---

## THEN — scale & production gates

### K2 / B4 — Prod Keto

- [ ] K8s/Vela deploy Keto read/write (internal-only, TLS)
- [ ] Migrate job for OPL + tuples
- [ ] Runbook: [`KETO-ZANZIBAR-SETUP.md`](../2026-08-03/KETO-ZANZIBAR-SETUP.md)

### K1 / B3 — Batch Keto Check

- [ ] Profile list endpoints when folders grow
- [ ] Implement batch `Check()` if N+1 latency unacceptable

### I5 — New org provisioning

- [ ] Automate ZITADEL org + Keto tuples + seed checklist
- [ ] [`PLATFORM-PALETTE-SECRETS-NOTIFICATIONS.md`](../2026-08-04/PLATFORM-PALETTE-SECRETS-NOTIFICATIONS.md)

---

## LATER — explicit product gates

| ID | Work | Gate |
|----|------|------|
| **C2** | Comms delivery analytics (opens/clicks) | Product asks — [`COMMS-DELIVERY-ANALYTICS.md`](../2026-08-04/COMMS-DELIVERY-ANALYTICS.md) |
| **C4** | Mobile push FCM/APNs | Same `notify()` pattern |
| **E3** | Live CRDT collab | [`E3-LIVE-CRDT-COLLAB-IMPLEMENTATION.md`](../2026-08-06/E3-LIVE-CRDT-COLLAB-IMPLEMENTATION.md) |
| **O1–O2** | Replay pre-login stitch + admin filter by user | [`ANALYTICS-REPLAY-PENDING.md`](../2026-07-27/ANALYTICS-REPLAY-PENDING.md) |
| **I1–I2** | Bot SSR + R2 client deploy | [`STOREFRONT-PROD-I1-I2-RUNBOOK.md`](./STOREFRONT-PROD-I1-I2-RUNBOOK.md) |

---

## Optional polish (low priority)

- [ ] Editor layer **reparent** drag (Stack/Grid inside zone)
- [ ] Two-tab **409 UI** smoke (API test exists)
- [ ] **U5** Client architecture audit guardrails
- [ ] **U6** Zod at public HTTP boundaries
- [ ] **P3** Edge schema auth for admin panel specs ([`ADMIN-SOFT-NAV-HANDOFF.md`](../2026-08-03/ADMIN-SOFT-NAV-HANDOFF.md))
- [ ] Optional MFA re-gate after session refetch

---

## Secrets reference (dev)

| Secret | Env / file | Never in client |
|--------|------------|-----------------|
| Backend machine key | `zitadel_keys/noname-backend-sa.json` | ✅ server only |
| Login PAT | `zitadel_keys/login-client.pat` | ✅ server only |
| Agent token HMAC | `AGENT_TOKEN_SECRET` | ✅ server only |
| Vault LLM keys | `noname/orgs/{orgId}/llm` | ✅ server only |

---

## Doc index (source of truth per track)

| Track | Doc |
|-------|-----|
| Master backlog | [`BUILD-MASTER-INDEX.md`](./BUILD-MASTER-INDEX.md) |
| Identity + agents | [`IDENTITY-AGENTS-MASTER-PLAN.md`](../2026-08-03/IDENTITY-AGENTS-MASTER-PLAN.md) |
| Agent ownership | [`AGENT-OWNERSHIP-AND-REVIEW.md`](../2026-08-03/AGENT-OWNERSHIP-AND-REVIEW.md) |
| Keto phases | [`ROADMAP-PHASES-B-A-C.md`](../2026-08-03/ROADMAP-PHASES-B-A-C.md) |
| E2E validation | [`E2E-OPS-BATCH-VALIDATION.md`](../2026-08-04/E2E-OPS-BATCH-VALIDATION.md) |
| Embedded login + PAT | [`EMBEDDED-LOGIN.md`](../2026-07-25/EMBEDDED-LOGIN.md) |
| Init ZITADEL | `pnpm init:zitadel` → [`scripts/init/zitadel-oidc.ts`](../../scripts/init/zitadel-oidc.ts) |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-08-06 | Created runbook — A3 R6/R7 verification, full remaining backlog |
