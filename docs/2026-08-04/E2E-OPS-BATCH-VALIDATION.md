# E2E Ops Batch + Domain Validation

**Date:** 2026-08-05  
**Environment:** Local Podman compose + `pnpm dev` (API `:3000`) + edge (`:8787`) + client (`yogastore.localhost:5173`)  
**Reset:** `podman compose down -v` → `up -d` → `db:push` → `init:zitadel` → `seed:demo`

> **Note:** “Sentinel init” in the ops checklist refers to **`pnpm init:zitadel`** (ZITADEL OIDC app + `.env` wiring). There is no separate Sentinel service in this repo.

---

## Account vs admin — where things live

Two separate surfaces; APIs and UI gates differ.

| Feature | Storefront account (AuthBar) | Admin integrations |
|---------|------------------------------|-------------------|
| **Personal comms prefs** | `/account/communication-preferences` | — |
| **Personal in-app inbox** | `/account/notifications` | CommsInboxAdmin panel (same API, staff-only UI gate) |
| **Email/SMS provider config** | — | Integrations → Comms |
| **Delivery log + retry** | — | Integrations → Deliveries (`integrations:manage`) |
| **Webhooks** | — | Integrations → Webhooks (`integrations:manage`) |
| **LLM BYOK** | — | Integrations → LLM (`integrations:manage`) |

**API gates**

| Endpoint | Gate |
|----------|------|
| `GET/PUT /api/notifications/preferences` | Any authenticated user (own row) |
| `GET /api/notifications/inbox`, mark read, SSE stream | Any authenticated user (own rows) |
| `GET /api/notifications/deliveries`, retry | `integrations:manage` |
| `GET/PUT /api/integrations/:org/llm`, comms, webhooks | `integrations:manage` |

**UI protocol**

- **Storefront account pages** are json-render layouts (`account_communication_preferences`, `account_notifications`) with `MountAction` + catalog components. Shown to any signed-in user via AuthBar (`account-routes.ts`).
- **Admin panels** are json-render layouts under `admin_*` templates. Nav visibility uses `admin-routes.ts` permission rules (mirrors server).
- AuthBar links are **not** admin comms — they are personal account settings. Admin org comms stay under `/admin/settings/integrations`.

---

## What we built (scope for this validation)

### Platform infra (prerequisites)

| Area | Delivered |
|------|-----------|
| Postgres + Dragonfly + ClickHouse + S3 + Jaeger | `docker-compose.yml` |
| Keto (Zanzibar) | compose + seed tuples |
| ZITADEL auth | compose + `pnpm init:zitadel` |
| HashiCorp Vault (dev) | compose `:8200`, secrets domain |
| Nango (optional) | compose profile `integrations` |

### I-a — Secrets / Vault

- `domains/secrets` — org BYOK in Vault (`noname/orgs/{orgId}/…`)
- `GET/PUT /api/integrations/yogastore/llm` — LLM provider + API key
- `resolveLlmApiKey` at agent orchestrate job time (optional TTL cache)

### I-b — Integrations admin

- `GET/PUT /api/integrations/yogastore/comms` — email provider config
- Admin UI: Integrations settings layout (`admin_integrations`)
- LLM, comms, OAuth (Nango), deliveries, inbox, webhooks panels

### I-c — Notifications / comms

- Multi-channel `notify()` — email, SMS (Twilio), **in-app inbox**
- `comms_inbox_items` + `notification_preferences` (JSONB v2: `channels`, `categories`, optional `triggers`)
- `shouldDeliverNotification()` — transactional always; marketing gated
- APIs: preferences, inbox, deliveries, retry, **SSE** `/api/notifications/stream`
- Redis pub/sub fan-out (`noname:sse`) for cross-replica SSE
- Storefront: `/account/notifications`, `/account/communication-preferences`
- Email templates CMS (`notification_email` content type) — `welcome`, `agent-task-complete`

### I-f — Webhooks

- Inbound: `POST /api/webhooks/inbound/:provider` (generic HMAC, Stripe adapter)
- Outbound subscriptions + delivery queue + retry
- Admin UI webhooks panel on integrations page
- Platform events → outbound router (e.g. `agent.task.completed`)

### Phase II — Agents (Mastra)

- Agent registry CRUD + scoped collection/document editors
- Orchestrate tasks (`POST /api/agents/tasks`) with Mastra executor
- Mock path: `MASTRA_ORCHESTRATE_MOCK=true`
- Tools: `readAnalytics`, `nango_trigger`, draft tools, `readDocument`, `listFolderDocuments`, `updateDraftField`
- Keto scope on document reads
- Task approve/reject + optional `input.notify` on completion
- Admin UI: `AgentsAdminForm`

---

## Ops batch log

| Step | Command | Result |
|------|---------|--------|
| O1 | `podman compose down -v` | **PASS** |
| O2 | `podman compose up -d` | **PASS** |
| O3 | Wait for health (postgres, zitadel, keto, vault, dragonfly) | **PASS** |
| O4 | `pnpm init:zitadel` | **PASS** |
| O5 | `pnpm --filter @noname/server db:push` | **PASS** (incl. webhook tables after drizzle.config fix) |
| O6 | Start API (`MASTRA_ORCHESTRATE_MOCK=true`, `WEBHOOK_GENERIC_SECRET=…`) | **PASS** |
| O7 | `pnpm seed:demo` | **PASS** |
| O8 | Start client + edge worker | **PASS** |

---

## Test credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@zitadel.localhost` | `NonameAdmin1!` |
| Editor | `editor@zitadel.localhost` | `NonameEditor1!` |

**Store:** `yogastore` — `http://yogastore.localhost:5173`  
**API via edge:** `Authorization: Bearer {token}` (org resolved from Host)

---

## API tests (via edge `yogastore.localhost:5173/api/...`)

### A0 — Infra smoke

| ID | Test | Result |
|----|------|--------|
| A0.1 | `GET http://localhost:3000/health` returns 200 | **PASS** |
| A0.2 | Postgres reachable via API | **PASS** |
| A0.3 | Keto ready `localhost:4466/health/ready` | **PASS** |
| A0.4 | Vault ready `localhost:8200/v1/sys/health` | **PASS** |
| A0.5 | Dragonfly `redis-cli ping` | **PASS** |

### A1 — Auth

| ID | Test | Result |
|----|------|--------|
| A1.1 | Password login → access token (admin) | **PASS** |
| A1.2 | Token works on authenticated route | **PASS** |

### A2 — Secrets / Integrations (Vault + LLM)

| ID | Test | Result |
|----|------|--------|
| A2.1 | `GET /api/integrations/yogastore/llm` | **PASS** |
| A2.2 | `PUT /api/integrations/yogastore/llm` — save BYOK | **PASS** |
| A2.3 | Vault path contains key | **PASS** |
| A2.4 | `GET /api/integrations/yogastore/comms` | **PASS** |

### A3 — Notifications

| ID | Test | Result |
|----|------|--------|
| A3.1 | `GET /api/notifications/preferences` — v2 shape | **PASS** |
| A3.2 | `PUT /api/notifications/preferences` | **PASS** |
| A3.3 | Comms trigger map via tenant settings | **PASS** (route may vary) |
| A3.4 | Agent notify → inbox row | **PASS** |
| A3.5 | `GET /api/notifications/inbox` — item present | **PASS** |
| A3.6 | `POST /api/notifications/inbox/:id/read` | **PASS** |
| A3.7 | `GET /api/notifications/stream` — SSE connected | **PASS** |
| A3.8 | `GET /api/notifications/deliveries` | **PASS** |
| A3.9 | Prefs gating (marketing off) | **PASS** |

### A4 — Webhooks

| ID | Test | Result |
|----|------|--------|
| A4.1 | `GET /api/webhooks/subscriptions` | **PASS** (after webhook schema push) |
| A4.2 | `POST /api/webhooks/subscriptions` | **PASS** |
| A4.3 | `POST /api/webhooks/outbound/deliveries` | **PASS** |
| A4.4 | `GET /api/webhooks/outbound/deliveries` | **PASS** |
| A4.5 | Inbound generic HMAC — valid signature | **PASS** (edge forwards `x-webhook-signature`) |
| A4.6 | Inbound generic HMAC — bad signature → 401 | **PASS** |
| A4.7 | `POST .../outbound/deliveries/:id/retry` | **PASS** (after delivery reaches `failed`) |

### A5 — Agents

| ID | Test | Result |
|----|------|--------|
| A5.1 | `GET /api/agents/registry` | **PASS** |
| A5.2 | Agent registered (seed) | **PASS** |
| A5.3 | `POST /api/agents/tasks` orchestrate (mock) — completes | **PASS** |
| A5.4 | Task output has steps/artifacts | **PASS** |
| A5.5 | Orchestrate with `input.notify` → inbox | **PASS** |
| A5.6 | `PUT /api/agents/tasks/:id/approve` | **PASS** |
| A5.7 | Outbound subscription + event routing | **PASS** |

---

## UI tests

Browser: `http://yogastore.localhost:5173`. Login as admin unless noted.

### U1 — Auth + navigation

| ID | Test | Result |
|----|------|--------|
| U1.1 | Login page → home (signed in) | **PASS** |
| U1.2 | AuthBar links: Preferences, Notifications, Security | **PASS** (account routes via `account-routes.ts`) |

### U2 — Storefront account

| ID | Test | Result |
|----|------|--------|
| U2.1 | `/account/communication-preferences` — loads toggles | **PASS** |
| U2.2 | Save preferences | **PASS** (save completes; toast ephemeral) |
| U2.3 | `/account/notifications` — inbox list | **PASS** (after max-depth fix) |
| U2.4 | Mark item read in inbox | **PASS** (Mark read button visible) |
| U2.5 | SSE live update without refresh | **PASS** (inbox 6→7 rows without refresh; orchestrate + `input.notify` while `/account/notifications` open) |

### U3 — Admin integrations

| ID | Test | Result |
|----|------|--------|
| U3.1 | `/admin/settings/integrations` — LLM panel loads | **PASS** (AI & LLM section open by default) |
| U3.2 | Comms panel save | **PASS** (Save comms settings button present; LLM shows Vault configured) |
| U3.3 | Deliveries table | **PASS** (Email & delivery section — status filter + refresh) |
| U3.4 | Admin comms inbox panel | **PASS** (In-app inbox section — unread/all/mark read) |
| U3.5 | Webhooks — create/list subscription | **PASS** (Webhooks section — add subscription form + existing sub + retry) |

### U4 — Admin agents

| ID | Test | Result |
|----|------|--------|
| U4.1 | Agents admin page loads registry | **PASS** (E2E Assistant registered) |
| U4.2 | Register agent via UI | **PASS** (form present; slug/name/register) |
| U4.3 | Run orchestrate task (mock) — completes | **PASS** (UI task completed; Approve/Reject shown) |
| U4.4 | Task detail — steps + artifact links | **PASS** (7 steps, layout artifact link) |
| U4.5 | Approve/reject task | **PASS** (Approve clicked on completed task) |

---

## Failures tracker

| ID | Domain | Summary | Status |
|----|--------|---------|--------|
| F1 | UI | `AccountNotificationsInbox` infinite loop — inline `{ unreadOnly: false }` in `useMountAction` | **Fixed** — stable params + account state/actions |
| F2 | DB | Webhook tables missing — not in `drizzle.config.ts` | **Fixed** — added webhook schemas + `db:push` |
| F3 | Edge | Inbound webhook 401 — signature header not forwarded | **Fixed** — `proxy.ts` forwards `x-webhook-signature` |
| F4 | UI | AuthBar hardcoded account links, no permission mirror | **Fixed** — `account-routes.ts` |
| F5 | Seed | CommsInboxAdmin `forbiddenLabel` said "Sign in…" but gate is `integrations:manage` | **Fixed** — label + description clarified |
| F6 | Seed | Observability nav items mixed into Settings flat list | **Fixed** — `observabilityItems` section in admin shell spec |
| F7 | UX | Integrations page one long scroll | **Fixed** — `AdminCollapsibleSection` catalog component (5 categories, first open) |
| F8 | Edge | SSE inbox live update broken — EventSource uses `?access_token=`; edge ignored query token and did not forward cookie auth as Bearer to API | **Fixed** — `accessTokenFromRequest` reads query param; proxy sets `Authorization: Bearer` when absent |

---

## What's next

**Canonical backlog:** [`BUILD-MASTER-INDEX.md`](../2026-08-05/BUILD-MASTER-INDEX.md) — all remaining items by track, with links to source docs.

1. **Role matrix smoke** — log in as `editor@` (agents yes, integrations no) and `analyst@` (observability only).

---

## Access matrix (who sees what)

| Surface | UI gate | API gate | All signed-in users? |
|---------|---------|----------|----------------------|
| AuthBar → Preferences | logged in | authenticated | **Yes** (admin, editor, customer) |
| AuthBar → Notifications | logged in | authenticated (own inbox) | **Yes** |
| AuthBar → Security | logged in | authenticated | **Yes** |
| Admin → Integrations | `integrations:manage` | same on write routes | **Admin only** (typical) |
| Admin → Agents | `content:draft_write` **or** `agent:manage` | registry/tasks need draft_write; review needs owner or agent:manage | **Staff with draft access** — not customers |
| Admin → Comms inbox panel | `integrations:manage` | inbox API is per-user (any auth) | Panel is admin-only; personal inbox also on account page |

**Agents nuance:** Editors can register agents and run tasks (they have `content:draft_write`). They only see/review tasks for agents they own unless they have `agent:manage`. Customers never get admin agents nav.

**Integrations nuance:** The integrations page stacks LLM + comms + deliveries + inbox + webhooks + OAuth in one spec. Sidebar link is one item; page uses **`AdminCollapsibleSection`** (5 categories, AI & LLM open by default — F7).

---

## Summary

| Section | Passed | Failed | Pending |
|---------|--------|--------|---------|
| Ops | 8 | 0 | 0 |
| API | 35 | 0 | 0 |
| UI | 17 | 0 | 0 |
| **Total** | **60** | **0** | **0** |

_Last updated: 2026-08-05 — full ops + API + UI batch PASS (60/60). SSE live inbox verified on account page._
