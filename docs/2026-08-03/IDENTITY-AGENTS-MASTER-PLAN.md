# Identity, Agents & Open Auth — Master Plan

> **Date:** 2026-08-03  
> **Status:** **Active — canonical plan for IdP choice, agents, delegation, scoped access**  
> **Related:** [`PERMISSIONS-MASTER-PLAN.md`](../2026-07-27/PERMISSIONS-MASTER-PLAN.md) · [`PERMISSIONS-IDP-COMPARISON.md`](../2026-07-27/PERMISSIONS-IDP-COMPARISON.md) · [`TEAM-ROLES-ZITADEL.md`](../2026-07-25/TEAM-ROLES-ZITADEL.md) · [`agent-domain.md`](../2026-07-04/agent-domain.md) · [`FIELD-ACL.md`](../2026-08-01/FIELD-ACL.md) · [`VISUAL-EDITOR-COLLAB-CRDT.md`](../2026-08-01/VISUAL-EDITOR-COLLAB-CRDT.md) · [`KETO-ZANZIBAR-SETUP.md`](./KETO-ZANZIBAR-SETUP.md) · [`KETO-IMPLEMENTATION-CHECKLIST.md`](./KETO-IMPLEMENTATION-CHECKLIST.md)

---

## One-line summary

**Humans** log in via an **OIDC IdP** (ZITADEL today). **Platform permissions** live in app code. **Document scope** (later) uses Zanzibar tuples. **Agents** are first-class **actors** with delegated, narrower scope — Nostr-*inspired* (keys, attribution, delegation), but **not** Nostr relays. Prefer **open-source, self-hostable** IdP that supports orgs, machine users, and OAuth clients; migrate only when requirements outgrow current setup.

---

## Product vision (embedding + agents)

Merchants and their teams need:

| Need | Actor |
|------|--------|
| Edit storefront / CMS themselves | **Human** (`admin` / `editor`) |
| Run an **agent** that drafts, analyzes, proposes changes | **Agent** (scoped service identity) |
| **Approve** before anything goes live | **Human** (human-in-the-loop — already in agent domain) |
| Embed editor or agent UI in admin / iframe | **Token** scoped to org + actor + surface |
| (Later) Restrict team to marketing vs products | **Human** + **tuple scope** (Phase B) |

This is **not** the same as live Google Docs collab ([`VISUAL-EDITOR-COLLAB-CRDT.md`](../2026-08-01/VISUAL-EDITOR-COLLAB-CRDT.md)). Design **actors + delegation first**, CRDT last.

---

## What [Nostr](https://github.com/nostr-protocol/nostr) teaches us (and what we skip)

| Nostr idea | Useful for us? | Our mapping |
|------------|----------------|-------------|
| Identity = **cryptographic key** | Partially | Human: OIDC `sub`. Agent: **machine client id** or dedicated key pair for signing actions |
| **Signed events** (tamper-proof) | ✅ | Audit log: every write records `actorId`, `actorType`, optional signature / task id |
| **Delegation** (key A acts for key B) | ✅ | Agent token ⊆ creator permissions; tuples `agent:{id}#editor` capped by `user:{sub}` |
| Relays (anyone hosts notes) | ❌ for core CMS | We use Postgres + API; optional **publish** to nostr later as integration, not core |
| No central admin | ❌ | Multi-tenant stores need org admin, roles, MFA policy |

**Principle:** borrow **key-based actors + delegation + attribution**; keep **central org IdP + documents API** for merchant CMS.

---

## Full permission stack (four layers)

```
Layer 1 — Platform permissions (DONE)
  @noname/auth: PERMISSIONS + ROLE_PERMISSIONS
  requirePermission() on API; canDraft() on ?edit=true

Layer 2 — Document scope (Phase B)
  Tags, content types, collections
  Ory Keto on same Postgres (DB `keto`) + AuthorizationPort
  See PERMISSIONS-MASTER-PLAN § Zanzibar

Layer 3 — Actors & delegation (Phase A′ — design now, build next)
  human | agent | machine
  Agent ⊆ creator permissions
  Embedded tokens ≠ full admin JWT

Layer 4 — Live multi-editor (Phase C — defer)
  CRDT / Automerge — only when simultaneous human edit is required
```

**Document unit:** smallest access control = **content entry / type**, not field ([`FIELD-ACL.md`](../2026-08-01/FIELD-ACL.md)).

---

## Actor model (Layer 3)

### Actor types

| Type | Identity source | Typical permissions |
|------|-----------------|---------------------|
| **human** | OIDC JWT `sub` | ZITADEL role → expanded platform permissions |
| **agent** | Machine user / OAuth client / agent JWT | Subset of creator; draft-only; scoped docs |
| **machine** | Service account (`MACHINES_DEFINE`) | XState flows, webhooks — no CMS by default |

### Agent lifecycle (target)

```
1. Human (admin or permitted editor) creates agent
   → name, description, allowed tools, max scope

2. IdP or platform issues agent credential
   → client_id + secret OR short-lived agent JWT
   → subject: agent:{uuid}, owner: user:{sub}

3. Agent runs task (embedded UI or API)
   → POST /api/agents/tasks (existing domain)
   → Writes draft only; Check() on target documents

4. Human approves / rejects
   → PUT .../approve | reject (existing routes)
   → Publish uses human JWT + layout:publish / content:publish

5. Audit
   → document_ops (later): { actorType, actorId, onBehalfOf, taskId, timestamp }
```

### Delegation rule (non-negotiable)

```
effective_agent_permissions ⊆ creator_permissions
effective_agent_document_scope ⊆ creator_document_scope
```

Agent never gains `auth:manage`, publish, or cross-org access unless explicitly granted to **human** first.

### Tuple subjects (Phase B + agents)

```
user:alice-sub#owner @ agent:landing-helper
agent:landing-helper#editor @ tag:marketing
document:home#editor @ user:alice-sub
```

---

## Requirements checklist (any IdP must satisfy)

Use this to score ZITADEL vs alternatives.

| # | Requirement | ZITADEL today | Notes |
|---|-------------|---------------|-------|
| R1 | Multi-tenant **org** = store | ✅ | One ZITADEL org per merchant |
| R2 | OIDC + PKCE for SPA login | ✅ | Embedded login |
| R3 | **Project roles** in JWT (`admin`, `editor`, `customer`) | ✅ | App expands to permissions |
| R4 | Role Assignment API (invite, change role) | ✅ | `/admin/settings/users` |
| R5 | MFA, social IdPs | ✅ | |
| R6 | **Machine users / service accounts** for agents | ⚠️ verify | Needed for Layer 3 |
| R7 | OAuth clients per agent (optional) | ⚠️ verify | Fine-grained agent tokens |
| R8 | Self-host, open source | ✅ | Apache 2.0, compose |
| R9 | No Postgres mirror of `teamRoles` | ✅ | JWT only |
| R10 | Embeddable token exchange (iframe) | 🔲 design | May be app-layer, not IdP |

---

## Open-source IdP alternatives (when to consider migration)

Platform **permissions stay in app code** regardless of IdP ([`PERMISSIONS-IDP-COMPARISON.md`](../2026-07-27/PERMISSIONS-IDP-COMPARISON.md)). IdP owns **users + orgs + role keys in JWT**.

| IdP | License | Self-host | Orgs / multi-tenant | Machine / M2M | Why consider |
|-----|---------|-----------|---------------------|---------------|--------------|
| **[ZITADEL](https://zitadel.com)** (current) | Apache 2.0 | ✅ compose | ✅ org = store | Machine users | Already integrated; roles-only JWT matches our model |
| **[Keycloak](https://www.keycloak.org/)** | Apache 2.0 | ✅ | Realms / clients | Service accounts | Mature; heavier ops; AuthZ services optional |
| **[Logto](https://logto.io/)** | MPL 2.0 | ✅ | Org template | M2M apps | OSS-friendly; org roles in token |
| **[Ory](https://www.ory.sh/)** (Kratos + Hydra) | Apache 2.0 | ✅ | Custom | OAuth2 clients | Modular; more assembly required |
| **[SuperTokens](https://supertokens.com/)** | Apache 2.0 | ✅ | Paid multi-tenancy patterns | API keys | Simpler; less enterprise RBAC |
| **[Authentik](https://goauthentik.io/)** | MIT | ✅ | Flows + providers | Service accounts | IdP proxy pattern |

**Ory Keto** is **not** an IdP replacement — it sits beside ZITADEL for **document scope** (Layer 2). **Decision (2026-08-03):** **Keto only** on same Postgres (DB `keto`). No SpiceDB. Setup: [`KETO-ZANZIBAR-SETUP.md`](./KETO-ZANZIBAR-SETUP.md) · Roadmap: [`KETO-ZANZIBAR-ROADMAP.md`](./KETO-ZANZIBAR-ROADMAP.md).

### Decision: stay on ZITADEL vs migrate

| Stay on ZITADEL when… | Consider migration when… |
|------------------------|---------------------------|
| Machine users + Role API meet agent needs | IdP licensing/hosting blocks embedding at scale |
| Team knows current init/seed flow | Need built-in org token scopes you won't build app-side |
| No merchant demand for custom IdP branding | Compliance requires different OSS stack |

**Default:** **stay on ZITADEL** until Layer 3 agent POC proves a concrete gap (document gap in R6–R7).

---

## Open-source posture (platform-wide)

| Component | Current | Target openness |
|-----------|---------|-----------------|
| IdP | ZITADEL (OSS) | Keep OSS/self-host; abstract `resolveAuthContextFromToken` if swap later |
| Permissions | `@noname/auth` in repo | ✅ already open |
| Documents | Postgres + Drizzle | ✅ |
| Scoped access | **Ory Keto** (same Postgres server, DB `keto`) — **only** resource-scope engine |
| Agents | `packages/server/domains/agent` | ✅ in monorepo |
| Queue | BullMQ + Dragonfly | OSS |
| Edge | Workers | ✅ |

**Do not** fork permission logic into IdP — keeps IdP swappable.

---

## Implementation phases

### Phase 0 — Today ✅

- ZITADEL roles → JWT → `ROLE_PERMISSIONS` → API guards
- Visual editor v1 + edge `renderAs: editor`
- Agent domain routes + `AGENT_MANAGE` + approve/reject flow (scaffolding → harden)

### Phase A′ — Actors & agents (next design + slice)

| Task | Deliverable |
|------|-------------|
| A′.1 | `ACTORS.md` schema: human / agent / machine in JWT claims or HMAC |
| A′.2 | Agent registration API: create agent, bind to `user:sub` |
| A′.3 | Agent token mint (short-lived) for embedded runs |
| A′.4 | Enforce delegation ⊆ creator on agent create |
| A′.5 | Audit fields on agent task + content/layout write |
| A′.6 | Verify ZITADEL machine user / PAT for agents (or document alternative) |

### Phase B — Scoped access (humans + agents)

| Task | Deliverable |
|------|-------------|
| B1 | Optional `content_editor` / `layout_editor` roles |
| B2 | Tags on content/layout documents |
| B3 | Deploy **Ory Keto** (K8s/Vela); DSN → same Postgres **server**, database `keto` (like ZITADEL → `zitadel`) |
| B4 | `AuthorizationPort` + Keto adapter: `Check(actor, resource, relation)` on read/write |
| B5 | Admin UI: assign scope to user **or agent** (writes Keto relationship tuples) |
| B6 | Keto scale tuning if ListObjects / batch Check slow at volume |

**Keto notes:** standalone — does **not** require Ory Hydra/Kratos; works with ZITADEL JWT `sub` as subject. Documents domain calls the port only; Keto stores tuples, not CMS rows. Design relation names in [OpenFGA Playground](https://play.fga.dev) first; keep Zanzibar tuple shape for portability.

### Phase C — Live collab (defer)

- `document_ops`, Automerge, presence — [`VISUAL-EDITOR-COLLAB-CRDT.md`](../2026-08-01/VISUAL-EDITOR-COLLAB-CRDT.md)

### Phase D — Optional Nostr bridge (defer)

- Publish public storefront events to relays (marketing, not auth)
- **Not** replacement for login or CMS storage

---

## Embedding model

```
Embedded admin / editor iframe
  → parent passes store slug + session OR one-time code
  → edge validates human JWT OR agent token
  → schema / draft APIs use same Check() as full admin
  → agent token: draft only, no publish, narrow doc scope
```

Security:

- Never embed full admin refresh token in third-party origin
- Prefer **PKCE login in popup** or **short-lived embed token** tied to actor + origin allowlist

---

## Doc map

| Question | Read |
|----------|------|
| **This file** | IdP choice, agents, Nostr-inspired delegation, phases |
| Platform permissions | [`PERMISSIONS-MASTER-PLAN.md`](../2026-07-27/PERMISSIONS-MASTER-PLAN.md) |
| IdP comparison | [`PERMISSIONS-IDP-COMPARISON.md`](../2026-07-27/PERMISSIONS-IDP-COMPARISON.md) |
| ZITADEL roles only | [`TEAM-ROLES-ZITADEL.md`](../2026-07-25/TEAM-ROLES-ZITADEL.md) |
| Agent tasks API | [`agent-domain.md`](../2026-07-04/agent-domain.md) |
| Document unit (no field ACL) | [`FIELD-ACL.md`](../2026-08-01/FIELD-ACL.md) |
| **Keto roadmap (what next)** | [`KETO-ZANZIBAR-ROADMAP.md`](./KETO-ZANZIBAR-ROADMAP.md) |
| Tuple / ReBAC + Keto infra | [`KETO-ZANZIBAR-SETUP.md`](./KETO-ZANZIBAR-SETUP.md) |
| Tuple design (legacy) | [`PERMISSIONS-REBAC.md`](../2026-07-25/PERMISSIONS-REBAC.md) |
| Live collab (later) | [`VISUAL-EDITOR-COLLAB-CRDT.md`](../2026-08-01/VISUAL-EDITOR-COLLAB-CRDT.md) |
| Editor smoke / v1 status | [`VISUAL-EDITOR-GAP-ANALYSIS.md`](../2026-08-01/VISUAL-EDITOR-GAP-ANALYSIS.md) |

---

## Quick reference

```
NOW     ZITADEL + platform permissions + editor v1 + agent approve queue
NEXT    Layer 3 actors (human + agent delegation, embed tokens)
THEN    Layer 2 tuples (scope docs for users AND agents)
LATER   Layer 4 CRDT (live multi-human edit)
MAYBE   Nostr publish bridge (not auth core)

IdP:     stay ZITADEL unless R6–R7 fail agent POC
Authz:   app code for actions; Ory Keto for resource scope (same Postgres)
Unit:    document / content type — not field
Keto:    same Postgres server, DB keto — only Zanzibar engine
```

---

## Resource authorization — final decision (2026-08-03)

| Choice | Decision |
|--------|----------|
| **Resource scope** | **Ory Keto only** — same Postgres server, DB `keto` |
| **Not using** | SpiceDB, OpenFGA service, field ACL, in-app `relation_tuples` duplicate |
| **Identity** | ZITADEL unchanged — Keto receives subject strings (`user:{sub}`, `agent:{id}`) |
| **DDD** | `AuthorizationPort` in documents/auth domain; Keto is an adapter |
| **Deploy** | Keto pods in K8s/Vela; Postgres stays managed / cluster-external |

Postgres does not “manage” permissions — it stores Keto’s tables. The API still orchestrates every save: platform permission → Keto `Check()` → write document.

---

*Design actors and delegation before CRDT. ZITADEL for identity; Keto for all document scope — final.*
