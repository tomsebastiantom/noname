# Keto + Zanzibar — Implementation Checklist

> **Date:** 2026-08-03  
> **Canonical detail:** [`KETO-ZANZIBAR-SETUP.md`](./KETO-ZANZIBAR-SETUP.md) · [`IDENTITY-AGENTS-MASTER-PLAN.md`](./IDENTITY-AGENTS-MASTER-PLAN.md)  
> **Local infra:** `podman compose` (same as rest of repo)

Work **top to bottom**. Do not skip to app code until infra verifies.

---

## Step 1 — Postgres databases

| # | Task | Status |
|---|------|--------|
| 1.1 | DB `keto` in `scripts/compose/init-dbs.sh` (fresh volumes) | ✅ |
| 1.2 | `scripts/compose/ensure-extra-dbs.sh` for existing volumes | ✅ |
| 1.3 | `postgres-init-dbs` service in `docker-compose.yml` | ✅ |
| 1.4 | Verify: `podman compose run --rm postgres-init-dbs` exits 0 | ✅ |

---

## Step 2 — Compose: Keto services

| # | Task | Status |
|---|------|--------|
| 2.1 | `keto-migrate` — runs migrations into DB `keto` | ✅ |
| 2.2 | `keto` — read `:4466`, write `:4467` | ✅ |
| 2.3 | Mount `config/keto/keto.yml` + `namespaces.ts` | ✅ |
| 2.4 | ZITADEL waits on `postgres-init-dbs` | ✅ |
| 2.5 | Verify: `podman compose up -d` → keto healthy | ✅ |
| 2.6 | Verify: `curl -sf localhost:4466/health/ready` | ✅ |

---

## Step 3 — Keto config (OPL model)

| # | Task | Status |
|---|------|--------|
| 3.1 | `config/keto/keto.yml` — DSN, ports, namespace path | ✅ |
| 3.2 | `config/keto/namespaces.ts` — User, Agent, Store, Document, Tag, Collection | ✅ |
| 3.3 | Align tuple names with [`PERMISSIONS-MASTER-PLAN.md`](../2026-07-27/PERMISSIONS-MASTER-PLAN.md) | ✅ |
| 3.4 | Keto smoke: `curl -sf localhost:4466/health/ready` + `pnpm seed:demo` | ✅ |

---

## Step 4 — Env & docs

| # | Task | Status |
|---|------|--------|
| 4.1 | `KETO_*` vars in `.env.example` | ✅ |
| 4.2 | Update `LOCAL-SMOKE-TEST.md` with keto checks | ✅ |
| 4.3 | Link checklist from `IDENTITY-AGENTS-MASTER-PLAN.md` | 🔲 |

---

## Step 5 — Phase A′ (agents) — before scoped Keto checks

| # | Task | Status |
|---|------|--------|
| 5.1 | `ACTORS.md` schema | 🔲 |
| 5.2 | Agent registration API | 🔲 |
| 5.3 | Agent external callers | ✅ use minted `nag.*` — no embed token type |
| 5.4 | Delegation ⊆ creator | 🔲 |
| 5.5 | Audit on agent writes | 🔲 |

---

## Step 6 — Phase B (app + Keto)

| # | Task | Status |
|---|------|--------|
| 6.1 | `AuthorizationPort` interface | ✅ |
| 6.2 | `AllowAllInOrgAdapter` (tests/mocks only) | ✅ |
| 6.3 | `KetoAuthorizationAdapter` (REST read/write) | ✅ |
| 6.4 | Keto always enforced (no disable flag) | ✅ |
| 6.5 | Draft save → platform perm + Keto; publish → platform perm only (admin) | ✅ see [`ROLES-AND-SCOPE.md`](./ROLES-AND-SCOPE.md) |
| 6.6 | Tags on content/layout in `app` DB | ✅ |
| 6.7 | Admin UI: assign scope → Keto write API | ✅ |
| 6.8 | Seed demo tuples (yogastore) | ✅ (`pnpm seed:demo` grants Store#editors + doc links) |
| 6.9 | Integration tests: grant / revoke / check | 🔲 |

---

## Step 7 — Production (K8s / Vela) — later

| # | Task | Status |
|---|------|--------|
| 7.1 | Helm / Vela component for Keto | 🔲 |
| 7.2 | Internal-only read/write URLs | 🔲 |
| 7.3 | Migrate job on deploy | 🔲 |
| 7.4 | Keto scale tuning (batch checks, internal network, TLS) | 🔲 |

---

## Commands (local)

```bash
# One-time / after pull
chmod +x scripts/compose/ensure-extra-dbs.sh

# Start infra
podman compose up -d

# Keto only (if postgres already up)
podman compose up -d postgres-init-dbs keto-migrate keto

# Verify
podman compose ps
curl -sf localhost:4466/health/ready && echo "keto ok"
```

---

## Current focus

**Done:** Steps 1–4 + N4–N7 (AuthorizationPort, adapters, layout PUT).  
**Next:** Wire content/pages routes; tags + admin scope UI (N8–N10). Agents (Step 5) parallel.
