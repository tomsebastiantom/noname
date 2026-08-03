# Keto + Zanzibar — Simple Roadmap

> **Date:** 2026-08-03  
> **Roles & scope (read first):** [`ROLES-AND-SCOPE.md`](./ROLES-AND-SCOPE.md) · Detail: [`KETO-ZANZIBAR-SETUP.md`](./KETO-ZANZIBAR-SETUP.md) · Tasks: [`KETO-IMPLEMENTATION-CHECKLIST.md`](./KETO-IMPLEMENTATION-CHECKLIST.md)

**Final decision (2026-08-03):** **Keto only** for document scope. **No SpiceDB.** Scale = tune Keto, not swap engines.

---

## One line

**ZITADEL** = who you are · **@noname/auth** = what actions you can do · **Keto** = which documents you may touch · all checks on the **API server**, not edge.

---

## The three layers (keep this order)

```
┌─────────────────────────────────────────────────────────┐
│ Layer 1 — Identity (ZITADEL)              DONE ✅        │
│   login, org, JWT roles (admin, editor, publisher, …)   │
├─────────────────────────────────────────────────────────┤
│ Layer 2 — Platform permissions (@noname/auth)  DONE ✅   │
│   content:draft_write, layout:publish, auth:manage      │
│   enforced: edge canDraft + server requirePermission()  │
├─────────────────────────────────────────────────────────┤
│ Layer 3 — Document scope (Keto / Zanzibar)   WIRED ✅    │
│   Document / Tag / Collection tuples                    │
│   enforced: server AuthorizationPort → Keto REST (always) │
│   Keto required — start with compose                    │
└─────────────────────────────────────────────────────────┘
```

**Smallest access unit:** one **document** (content entry or layout) — not field ACL.

---

## Full-scale Zanzibar — what it looks like (simple)

| Stage | Merchant experience | Keto tuples |
|-------|---------------------|-------------|
| **Now (v1)** | Admin: all docs + publish. Editor/publisher: tag scope via Keto | `Tag#editors@Team#editors`, `Document#editors|publishers@User` — see [`ACCESS-AND-ROLES.md`](./ACCESS-AND-ROLES.md) |
| **B1 — doc share** | “Share this page with Bob” | `Document:{id}#editors@User:{sub}` |
| **B2 — tags** | Marketing team → only `marketing` tagged docs | `Tag:marketing#editors@Team:…` + Postgres `documents.tags[]` |
| **B3 — collections** | Folder-style groups inherit access | `Collection:marketing#editors` + parent chain |
| **B4 — agents** | Agent drafts scoped docs; human approves | `Agent:{id}#owners@User:{sub}` + agent on tag/doc |
| **Scale later** | Many orgs, list filtering slow | Tune Keto (batch checks, indexes, caching) — **stay on Keto** |

We do **not** need all stages on day one. Ship **B0 → B1 → B2** before collections/agents at scale.

---

## What’s done ✅

| Item | Where |
|------|--------|
| Postgres DB `keto` | `scripts/compose/init-dbs.sh`, `scripts/compose/ensure-extra-dbs.sh` |
| Keto in compose | `docker-compose.yml` — migrate + serve |
| OPL permission model | `config/keto/namespaces.ts` |
| Server config | `config/keto/keto.yml` |
| Env template | `.env.example` — `KETO_*` |
| Docs | setup + checklist |
| `AuthorizationPort` + adapters | `packages/server/src/domains/auth/` |
| Layout PUT → Keto check | `denyUnlessDocumentAccess` (always) |

Verify anytime:

```bash
podman compose up -d
curl -sf localhost:4466/health/ready && echo keto ok
```

---

## What we deliberately skip (for now)

| Skip | Why |
|------|-----|
| Extra authz service | Keto on same Postgres is the only resource-scope engine |
| Keto on edge | Document ID lives in API; backend has context |
| Field ACL | Document / content-type split instead |
| Live CRDT collab | After scope + agents stable |
| Public Keto ports | Write API internal-only in prod |

---

## Next steps (do in this order)

### Immediate — finish infra hygiene (~1 session)

| # | Task | Output | Status |
|---|------|--------|--------|
| **N1** | Keto infra smoke: `curl -sf localhost:4466/health/ready` + `pnpm seed:demo` | compose + seed | ✅ |
| **N2** | Add keto lines to `LOCAL-SMOKE-TEST.md` | curl health + REST check | ✅ |
| **N3** | Link this roadmap from `IDENTITY-AGENTS-MASTER-PLAN.md` | doc map | ✅ |

### Then — wire server (Phase B0, ~2 sessions)

| # | Task | Output | Status |
|---|------|--------|--------|
| **N4** | `AuthorizationPort` + `AllowAllInOrgAdapter` | `packages/server/src/domains/auth/authorization-port.ts` | ✅ |
| **N5** | Keto always (no disable flag) | env + factory in auth domain | ✅ |
| **N6** | `KetoAuthorizationAdapter` (REST read/write API) | `auth/adapters/keto/` | ✅ |
| **N7** | Hook one route: layout PUT → permission + `authz.check(Document:id)` | always Keto | ✅ |

**Gate:** Keto must be running. Grant tuples via admin scope UI or seed.

### Then — first real scope (Phase B1, ~2 sessions)

| # | Task | Output | Status |
|---|------|--------|--------|
| **N8** | `tags: string[]` on content/layout rows (app DB) | Drizzle column on `documents` | ✅ |
| **N9** | Seed demo: Carol editor on `Tag:marketing` only | seed script → Keto write API | ✅ |
| **N10** | Admin UI: assign user to tag scope | writes Keto tuple | ✅ |

### Parallel track — agents (Phase A′)

Can start **after N4** (same `AuthorizationPort` subject shape). See [`IDENTITY-AGENTS-MASTER-PLAN.md`](./IDENTITY-AGENTS-MASTER-PLAN.md) A′.1–A′.6.

Do **not** block Keto B0 on agents — but agent subjects (`Agent:{id}`) are already in `namespaces.ts`.

### Production (Phase 7 — when moving to K8s/Vela)

| # | Task |
|---|------|
| Keto Helm/Vela component, internal URLs only |
| `keto migrate` init job |
| Omit `KETO_GRPC_INSECURE`; TLS on internal network |
| Same Postgres server, DB `keto` |

---

## Check flow (target — backend only)

```
PUT /api/documents/layout/:id
  1. Edge:     JWT valid (already)
  2. Server:   requirePermission(LAYOUT_DRAFT_WRITE)     ← today
  3. Server:   Keto Check(user, edit, Document:id)
                 authz.check(User:{sub}, edit, Document:{id})
  4. Server:   save draft
```

Publish: **admin platform permission only** — no Keto. See [`ROLES-AND-SCOPE.md`](./ROLES-AND-SCOPE.md) § publish. Agents never publish.

---

## Decision gates (when to add complexity)

| If… | Then… |
|-----|--------|
| Single org-wide editor, no Keto yet | Grant store-wide tuples or use platform admin role |
| Merchant asks “share one doc” | Ship B1 (doc tuples) |
| Merchant asks “marketing team only” | Ship B2 (tags) |
| Agent drafts need narrow scope | A′ + agent tuples on B1/B2 |
| List “all docs user can edit” is slow | Profile Keto; batch `Check()`; optimize OPL / queries |
| Simultaneous human editing | Phase C CRDT — separate track |

---

## Quick reference

```
DONE    N8–N10: tags column, scope admin UI, Keto bindings + seed
NEXT    doc-level publisher share UI; collections
ALSO    Phase A′ agents (parallel)
NEVER   field ACL / Keto on edge / second authz product
```
