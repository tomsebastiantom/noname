# Ory Keto + Zanzibar Permissions — Setup & Implementation Plan

> **Date:** 2026-08-03  
> **Status:** **Active — infra added; app integration Phase B**  
> **Related:** [`IDENTITY-AGENTS-MASTER-PLAN.md`](./IDENTITY-AGENTS-MASTER-PLAN.md) · [`PERMISSIONS-MASTER-PLAN.md`](../2026-07-27/PERMISSIONS-MASTER-PLAN.md) · [`PERMISSIONS-REBAC.md`](../2026-07-25/PERMISSIONS-REBAC.md)

---

## Decision summary

| Layer | System | Role |
|-------|--------|------|
| **Identity** | ZITADEL | Login, org, JWT roles (`admin` / `editor`) |
| **Platform actions** | `@noname/auth` | `content:draft_write`, `layout:publish`, … |
| **Resource scope** | **Ory Keto** | Zanzibar tuples — who may touch which document/tag/collection |
| **CMS data** | Postgres DB `app` | Content, layouts, pages — not permission tuples |

> **Decision (2026-08-03):** **Ory Keto only** for document scope — same Postgres server, DB `keto`. No SpiceDB, no OpenFGA service.

---

## Postgres layout (one server)

```
Postgres :5432
├── app       ← Drizzle / CMS
├── zitadel   ← identity (OIDC only from app — no SQL)
├── nango     ← integrations (optional)
└── keto      ← Keto migrations + tuple storage
```

Keto DSN (local):

```
postgres://noname:noname_dev@localhost:5432/keto?sslmode=disable
```

---

## Local infra (docker-compose)

Services added:

| Service | Purpose |
|---------|---------|
| `postgres-init-dbs` | Creates `keto` DB if missing (existing volumes) |
| `keto-migrate` | Runs `keto migrate up` → Keto tables in DB `keto` |
| `keto` | Read `:4466`, Write `:4467`, Metrics `:4468` |

Config lives under **`config/keto/`** — same folder as [`config/zitadel-steps.yaml`](../../config/zitadel-steps.yaml). Compose **runs** services; `config/` holds **what they load**.

| File | Role |
|------|------|
| [`config/zitadel-steps.yaml`](../../config/zitadel-steps.yaml) | ZITADEL first-instance bootstrap (reference; compose still uses env today) |
| [`config/keto/keto.yml`](../../config/keto/keto.yml) | Keto server — ports, DSN default, path to OPL |
| [`config/keto/namespaces.ts`](../../config/keto/namespaces.ts) | Zanzibar permission model (required) |

| Path | Purpose |
|------|---------|
| [`config/keto/keto.yml`](../../config/keto/keto.yml) | Keto server config |
| [`config/keto/namespaces.ts`](../../config/keto/namespaces.ts) | OPL model: `User`, `Agent`, `Store`, `Document`, `Tag`, `Collection` |

### Start

```bash
podman compose up -d
```

Verify:

```bash
podman compose ps
curl -sf localhost:4466/health/ready && echo "keto ok"
```

Env (add to `.env` when wiring server):

```
KETO_READ_URL=localhost:4466
KETO_WRITE_URL=localhost:4467
KETO_GRPC_INSECURE=true              # local dev only — omit in production (use TLS)
```

---

## Where checks run (edge vs backend)

| Layer | Where | What it checks | Keto? |
|-------|--------|----------------|-------|
| **1. Identity** | Edge worker | JWT valid? `canDraft()` for `?edit=true`? | ❌ |
| **2. Platform permission** | **API server** | `content:draft_write`, `layout:publish`, … | ❌ |
| **3. Document scope** | **API server** | Keto `Check(user, edit, Document:id)` | ✅ Phase B |

**Keto checks happen in the backend (server), not on the edge worker.**

Why:

- Edge validates **who** is logged in and coarse **editor role** (same as today for `?edit=true`).
- Backend has the **document UUID** from the route/body and calls Keto over **internal gRPC**.
- Keto write API (`:4467`) stays **cluster-internal only** — never public like the storefront edge.

```
Browser → Edge (JWT + canDraft) → HMAC → API server
                                              ├─ requirePermission()   ← ZITADEL JWT
                                              └─ AuthorizationPort     ← Keto (always)
```

### What `KETO_GRPC_INSECURE` means

**Not** “allow insecure CMS access.” It only means: API server → Keto gRPC uses **plaintext on localhost** (no TLS on the hop between your server and Keto).

| Environment | Setting |
|-------------|---------|
| **Local dev** | `KETO_GRPC_INSECURE=true` — Keto has no TLS in compose |
| **Production** | **Unset** — TLS or mTLS on internal network; Keto not on public internet |

Same pattern as `REQUIRE_EDGE_HMAC=false` for local dev — convenience flag, not a product security model.

---

## Zanzibar tuple conventions

Format (logical — Keto API uses namespace + object + relation + subject):

```
Document:{uuid}#editors@User:{zitadel_sub}
Tag:marketing#editors@User:{sub}
Collection:marketing#editors@User:{sub}
Document:{uuid}#parents@Collection:marketing
Store:{org_id}#editors@User:{sub}
Agent:{uuid}#owners@User:{creator_sub}
```

**Check flow (every guarded write):**

```
1. Platform: hasPermission(actor, content:draft_write | layout:draft_write)?
2. Keto:     Check(actor, edit, Document:{id})?   ← AuthorizationPort
3. Both yes → allow save
```

v1 today: step 1 only (store-wide editor). Phase B enables step 2 for scoped access.

---

## DDD — AuthorizationPort

Documents domain must not import Keto directly.

```typescript
interface AuthorizationPort {
  check(input: {
    subject: { type: "User" | "Agent"; id: string };
    permission: "view" | "edit";
    namespace: "Document" | "Tag" | "Collection" | "Store";
    objectId: string;
  }): Promise<boolean>;

  grant(tuple: RelationTuple): Promise<void>;
  revoke(tuple: RelationTuple): Promise<void>;
}
```

Implementations:

| Phase | Adapter |
|-------|---------|
| B0 (legacy) | ~~AllowAllInOrgAdapter~~ removed — Keto always |
| B1 | `KetoAuthorizationAdapter` — REST read/write APIs |
| Later | Optimize Keto adapter (batch checks, caching) if needed |

---

## Implementation steps (ordered)

### Done in this change ✅

- [x] Postgres DB `keto` in `scripts/compose/init-dbs.sh` + `scripts/compose/ensure-extra-dbs.sh`
- [x] `keto-migrate` + `keto` in `docker-compose.yml`
- [x] OPL namespaces in `config/keto/namespaces.ts`
- [x] This doc

### Phase A′ — Actors (before scoped checks matter)

| # | Task |
|---|------|
| A′.1 | `ACTORS.md` — human / agent / machine in auth context |
| A′.2 | Agent registration API + bind to `user:sub` |
| A′.3 | Short-lived agent tokens (`nag.*`) | ✅ shipped |
| A′.4 | Delegation ⊆ creator on agent create |
| A′.5 | Audit fields on writes |

### Phase B — Keto integration

| # | Task | Owner |
|---|------|-------|
| B1 | Add `@ory/keto-client` (or gRPC) to server package | server |
| B2 | Define `AuthorizationPort` + `KetoAuthorizationAdapter` | server/domains/auth or documents |
| B3 | Keto adapter always wired (no disable flag) | server |
| B4 | On document save/publish: `Check(edit, Document:id)` after platform permission | documents domain |
| B5 | Tags on content/layout rows in `app` DB | documents schema |
| B6 | Admin UI: assign user/agent to tag or document → Keto write API | client admin |
| B7 | Seed demo tuples for yogastore marketing scope | seed script |
| B8 | Integration tests: grant → check allow; revoke → check deny | server tests |

### Phase B — Optional roles split

| # | Task |
|---|------|
| B9 | ZITADEL roles `content_editor` / `layout_editor` if needed |
| B10 | `Store:{org}#editors` bootstrap tuple on org seed |

### Later (not Phase B)

| # | Task |
|---|------|
| C1 | Live collab / CRDT — [`VISUAL-EDITOR-COLLAB-CRDT.md`](../2026-08-01/VISUAL-EDITOR-COLLAB-CRDT.md) |
| C2 | Keto performance tuning at scale (batch Check, list filters) |
| C3 | K8s/Vela Helm chart for Keto (production) |

---

## K8s / Vela (production sketch)

```yaml
# Same pattern as ZITADEL: external Postgres, stateless Keto pods
keto:
  image: oryd/keto:v25.4.0
  env:
    DSN: postgres://...@managed-pg:5432/keto?sslmode=verify-full
  ports:
    read: 4466   # cluster-internal only
    write: 4467  # cluster-internal only — not public
```

- Write API **never** on public internet
- App server calls Keto over internal network
- Run `keto migrate` as init job on deploy

---

## Quick reference

```
NOW     Keto infra local + OPL model defined
NEXT    Phase A′ agents
THEN    AuthorizationPort + Keto adapter + tags + admin scope UI
NEVER   field ACL / Keto on public internet
```

---

*ZITADEL = who. @noname/auth = what actions. Keto = which documents. Same Postgres server, DB `keto`.*
