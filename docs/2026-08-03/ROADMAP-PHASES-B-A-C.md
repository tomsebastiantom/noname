# Roadmap phases B, A′ & C — approval brief

> **Date:** 2026-08-03  
> **Status:** **For review — not implementation yet**  
> **Read this first**, then drill into linked docs if you want detail.  
> **Related:** [`ACCESS-AND-ROLES.md`](./ACCESS-AND-ROLES.md) · [`KETO-ZANZIBAR-ROADMAP.md`](./KETO-ZANZIBAR-ROADMAP.md) · [`IDENTITY-AGENTS-MASTER-PLAN.md`](./IDENTITY-AGENTS-MASTER-PLAN.md) · [`VISUAL-EDITOR-COLLAB-CRDT.md`](../2026-08-01/VISUAL-EDITOR-COLLAB-CRDT.md)

---

## One paragraph

We split authorization into **four layers** and ship them in order: platform permissions (done), **Keto document scope** (mostly done), **agents as delegated actors** (scaffolded, not production-ready), **live CRDT collab** (explicitly deferred). We borrow **ideas** from Nostr (signed attribution, delegation) but **do not** build on Nostr relays or decentralized identity. Postgres + ZITADEL + Keto stay the core.

---

## The four layers (do not merge)

```
Layer 1 — Platform permissions     ✅ DONE
  ZITADEL role → @noname/auth → requirePermission() on API

Layer 2 — Document scope (Keto)    🟡 TAGS TODAY → **FOLDERS PLANNED** (see FOLDERS-SCOPE-PLAN.md)
  Team / Folder / Document tuples → AuthorizationPort → Check on write/publish

Layer 3 — Actors & agents (A′)     🟡 SCAFFOLD — needs actor model + scoped tokens
  human | agent | machine; agent ⊆ creator; human approves publish

Layer 4 — Live collab (CRDT)       ⏸ DEFER — only when simultaneous multi-editor is required
  Automerge / presence — after scope + agents stable
```

**Smallest access unit:** one **document** (content entry, layout, page doc) — **not** per-field ACL.

---

## What we have in code today

| Area | Shipped | Where |
|------|---------|--------|
| Platform roles & permissions | ✅ | `packages/auth`, `admin-routes.ts`, API `denyUnless()` |
| Keto in compose + OPL model | ✅ | `docker-compose.yml`, `config/keto/` |
| `AuthorizationPort` + Keto adapter | ✅ | `packages/server/src/domains/auth/` |
| Document write/publish + Keto check | ✅ | `document-write-guard.ts` on content, layout, pages |
| Tags on documents (Postgres) | ✅ | `documents.tags[]` |
| Scope admin (tags, teams, bindings) | ✅ | `ScopeAdminForm`, scope API |
| Direct doc share (editor + publisher) | ✅ | `DocumentShareField`, Keto `Document#editors|publishers` |
| Admin page permission UX | ✅ | `useAdminRouteAccess` on all settings + CMS panels |
| Agent task queue (approve/reject) | 🟡 | `packages/server/src/domains/agent/` — gated on `agent:manage` only |
| Agent scoped document access | ❌ | No `agent:{id}` subject in JWT / Check yet |
| Collections (folder scope) | ❌ | OPL stub only |
| CRDT / live presence | ❌ | Solo edit + 409 on conflict only |
| Nostr relay / nip events | ❌ | **Not planned for core** |

---

## Phase B — Keto scoped document access

### Goal

Answer: *“May **this user** edit or publish **this document**?”* — after platform permission passes.

### Done (B0–B1)

- Keto always on for document writes (content, layout, pages)
- Tags + team bindings + scope admin UI
- Per-document editor and publisher share UI
- Seed demo: marketing-scoped editor, publisher user, access manager

### Remaining (approve before building)

| ID | Work | Owner | Why |
|----|------|-------|-----|
| **B-F1** | **Flat folders** — replace tags; `collection_id` + Collection Keto checks | Backend + client | ~1 week — see [`FOLDERS-SCOPE-PLAN.md`](./FOLDERS-SCOPE-PLAN.md) |
| **B-F2** | **Folder tree** — `parent_id`, nested admin, inherit access | Backend + client | +3–5 days after F1 |
| **B-F3** | **CMS sidebar by folder** | Client | +3–5 days, optional polish |
| **B3** | **List perf** — batch Keto Check on doc lists | Backend | When lists slow at scale |
| **B4** | **Prod Keto** — K8s/Vela, internal-only, migrate job | Infra | Required before multi-tenant prod |
| **B5** | **Agent tuples on folders/docs** | Backend (with A′) | `Agent:{id}#editor @ Collection:marketing` |

### What we are **avoiding** (simplicity)

| Skip | Reason |
|------|--------|
| Second authz product (SpiceDB, OpenFGA service) | Keto on same Postgres is the only ReBAC engine |
| Keto on Cloudflare edge | Document id + tags live in API; edge has no full context |
| Field-level ACL | Document/content-type is enough; see `FIELD-ACL.md` |
| Tags **and** folders for access | One model: folders only (Phase F1 removes tags) |
| Syncing doc parent chain into Keto on every save | Postgres `collection_id` is SoT; Keto checks folder + direct doc shares |
| Publishing gated only by Keto | Publish still needs platform `*:publish` **and** doc access |

### Who does what (Phase B)

| Role | Responsibility |
|------|----------------|
| **Backend** | `AuthorizationPort`, route guards, collection OPL, batch Check |
| **Client** | Scope admin extensions (collections UI when B2 starts) |
| **Infra** | Keto deploy, health, TLS, DB `keto` lifecycle |
| **Product** | Approve B2 vs B3 priority (folders vs performance) |

**Gate to start B-F1:** approve [`FOLDERS-SCOPE-PLAN.md`](./FOLDERS-SCOPE-PLAN.md) — folders replace tags.

---

## Folders — three phases (simple)

Full detail: [`FOLDERS-SCOPE-PLAN.md`](./FOLDERS-SCOPE-PLAN.md)

| Phase | What merchant sees | Effort |
|-------|-------------------|--------|
| **F1 Flat folders** | “Marketing” folder dropdown instead of tags | ~1 week |
| **F2 Tree** | `Marketing / Summer / Banners` — access inherits | +3–5 days |
| **F3 Sidebar** | Browse content by folder in CMS nav | +3–5 days, optional |

---

## Phase A′ — Agents & actor model

### Goal

Answer: *“May **this agent** draft on behalf of a human, without ever gaining more than the creator?”*

### Nostr: what we take vs what we skip

| Nostr idea | Our choice |
|------------|------------|
| Cryptographic identity | **Partial** — humans: OIDC `sub`. Agents: machine user / agent JWT with `agent:{uuid}` |
| Signed events / attribution | **Yes** — audit writes with `actorType`, `actorId`, `onBehalfOf`, `taskId` |
| Delegation (A acts for B) | **Yes** — `effective_agent ⊆ creator` for permissions and doc scope |
| Public relays hosting notes | **No** — CMS stays Postgres + API |
| Decentralized login | **No** — ZITADEL org per store, MFA, admin break-glass |

**We are not “going Nostr mode.”** Optional **Phase D** might *publish* public storefront events to relays for marketing — that never replaces login, drafts, or permissions.

### In repo today

```
POST /api/agents/tasks          → create task (agent:manage only)
PUT  /api/agents/tasks/:id/approve | reject
Worker queue + tracing propagation
```

**Missing for production agents:**

| ID | Work | Owner |
|----|------|-------|
| **A′.1** | Actor claim in auth context (`human` \| `agent` \| `machine`) | Backend |
| **A′.2** | Agent registration API (name, owner `user:{sub}`, allowed tools) | Backend |
| **A′.3** | Short-lived agent token (embed / API — not full admin refresh) | Backend + client |
| **A′.4** | Enforce delegation ⊆ creator on create | Backend |
| **A′.5** | Keto subject `Agent:{id}` on Check for agent writes | Backend (needs B doc checks) |
| **A′.6** | ZITADEL machine user / PAT verification | Backend + infra |
| **A′.7** | Admin UI: create agent, view tasks, approve | Client |
| **A′.8** | Audit fields on content/layout/agent writes | Backend |

### What we are **avoiding**

| Skip | Reason |
|------|--------|
| Agent auto-publish | Human always approves; publish uses human JWT |
| Agent with `auth:manage` or cross-org | Violates delegation rule |
| Building agents before document Check works for non-admin users | Scope must be real first |
| Nostr as identity or storage | Operational complexity; merchants need central admin |

### Who does what (Phase A′)

| Role | Responsibility |
|------|----------------|
| **Backend** | Actor model, agent CRUD, token mint, Keto agent subjects, audit |
| **Client** | Agent admin panel, embed token flow (iframe) |
| **Infra / IdP** | ZITADEL machine users — verify R6/R7 in master plan |
| **Product** | Define first agent use case (e.g. “draft hero copy for tagged docs”) |

**Gate to start A′.2:** POC proves ZITADEL machine user or app-issued JWT is acceptable (see `IDENTITY-AGENTS-MASTER-PLAN.md` R6–R7).

**Order vs B:** Can parallel after `AuthorizationPort` exists (today). Agent tuples (B5) land with A′.5.

---

## Phase C — Live collab (CRDT)

### Goal

Answer: *“Two humans editing the **same draft at the same time** without save conflicts.”*

### Not the goal

- Undo in one tab → **shipped** (client history)
- Two people saving at different times → **shipped** (`If-Match` + 409)
- Agent + human sequential workflow → **A′**, not CRDT

### When to build (all must be true)

1. **Product** — merchants expect Google Docs–style presence (not “refresh to see their changes”).
2. **Scope** — Phase B stable; editors cannot leak docs via collab session.
3. **Spike** — Automerge (layout JSON) or Yjs (rich text) proven on one field type.

### What we would build (later)

| Piece | Notes |
|-------|--------|
| `document_ops` log | Optional audit / replay path |
| Op stream or CRDT sync channel | WebSocket or SSE; org-scoped |
| Presence (cursors, selections) | UI only after sync works |
| Automerge for layout spec | JSON tree CRDT |
| Yjs only if long-form rich text is simultaneous | TipTap/Hocuspocus — **only if asked** |

### What we are **avoiding**

| Skip | Reason |
|------|--------|
| CRDT before scope + agents | Hard to reason about permissions in merged state |
| CRDT for solo merchants | 409-on-save is enough for years |
| Field-level CRDT everywhere | Start with one surface (layout **or** one rich-text field) |

### Who does what (Phase C)

| Role | Responsibility |
|------|----------------|
| **Product** | Confirm simultaneous multi-editor is a requirement |
| **Client** | Editor sync, presence UI |
| **Backend** | Op persistence, auth on sync room, conflict policy |
| **Infra** | WebSocket scaling if needed |

**Gate:** explicit product sign-off — **do not start** until A′ + B are stable for target merchants.

---

## Recommended order (after your approval)

```
NOW     ✅ Layer 1 + most of Layer 2 (this sprint’s auth/observability work)

NEXT    B-F1 Flat folders (replace tags) — then B4 prod Keto before real tenants
        OR A′.1–A′.4 if agent POC is the business bet (after F1)

THEN    B5 + A′.5 — agent tuples on same Keto graph as humans

LATER   Phase C — only with product gate

MAYBE   Phase D — Nostr *publish* bridge (marketing events, not auth)
```

---

## Decisions for you to confirm

Please reply **approve / defer / change** on each:

| # | Decision | Default if approved |
|---|----------|---------------------|
| 1 | **Keto only** for document scope (no SpiceDB/OpenFGA) | Keep current architecture |
| 2 | **Document unit** — no field ACL | Keep |
| 3 | **Agents ⊆ creator** — no agent publish, no admin | Keep |
| 4 | **Not Nostr mode** — relays optional marketing bridge only | Keep |
| 5 | **Folders replace tags** — F1 flat → F2 tree → F3 sidebar (optional) | See FOLDERS-SCOPE-PLAN.md |
| 6 | **Phase C deferred** until explicit product ask | Keep defer |
| 7 | **Stay on ZITADEL** until agent POC fails R6/R7 | Keep |

---

## Doc map (detail)

| Topic | Document |
|-------|----------|
| Folders replace tags (F1–F3) | [`FOLDERS-SCOPE-PLAN.md`](./FOLDERS-SCOPE-PLAN.md) |
| Roles, teams, share (tags → folders) | [`ACCESS-AND-ROLES.md`](./ACCESS-AND-ROLES.md) |
| Keto tasks & status | [`KETO-ZANZIBAR-ROADMAP.md`](./KETO-ZANZIBAR-ROADMAP.md) |
| IdP, agents, Nostr table | [`IDENTITY-AGENTS-MASTER-PLAN.md`](./IDENTITY-AGENTS-MASTER-PLAN.md) |
| Keto infra | [`KETO-ZANZIBAR-SETUP.md`](./KETO-ZANZIBAR-SETUP.md) |
| CRDT deferral | [`VISUAL-EDITOR-COLLAB-CRDT.md`](../2026-08-01/VISUAL-EDITOR-COLLAB-CRDT.md) |
| Observability (separate track) | [`OBSERVABILITY-AND-TRACES.md`](./OBSERVABILITY-AND-TRACES.md) |

---

*This file is the approval brief. Implementation starts only after you confirm the decision table above.*
