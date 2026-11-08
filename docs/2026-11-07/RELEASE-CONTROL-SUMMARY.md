# Release control plane — one-page summary

> **Date:** 2026-11-07 · **Purpose:** the essence of what we are building, what is wrong, where data lives, and
> what must be fixed before code.

---

## 1. What we are building

A **release control plane**, not a second deployment system:

| Piece | What it does | State |
|---|---|---|
| **Release record** | one id binds client bundle + server image + worker + migration set + config | done (D14) |
| **Migration policy** | expand → backfill → contract; destructive DDL blocked | done (D16) |
| **Environment selector** | preview + blue/green; active/previous per environment | done (D15) |
| **Tenant pointer** | which client bundle a tenant loads; promote/rollback | done (D1 C1) |
| **Definition pinning** | in-flight carts keep the rules they started with | done (D2) |
| **Platform operator** | identity allowed to act across tenants (waves) | **missing** (D17) |
| **Tenant catalog** | which tenants exist, status, eligibility | **missing** |
| **Audit** | who moved what, tenant-visible + platform-wide | design only |
| **Access logs** | request-level monitoring/forensics | design only |

## 2. What is wrong today

1. Release promote/rollback/switch write **business records** with `data.actor` — the wrong plane, not queryable
   by actor, and release information ends up in the business-fact table.
2. `evidence_audit_events` exists but **nothing writes to it**.
3. No **request-id**, so an action cannot be joined to a request/access log.
4. Audit write is **not atomic** with the pointer write.
5. No platform operator, no tenant catalog/status, no wave endpoint.
6. No per-tenant gate verdict lookup for wave eligibility.

## 3. Where release information lives

| Data | Table | Never in |
|---|---|---|
| release identity, artifacts, digests | `releases`, `release_artifacts` | Evidence |
| which release a tenant uses | `tenant_release_pointers` | Evidence |
| which stack an environment uses | `release_environments` | Evidence |
| **who moved it** | `evidence_audit_events` (reference: `releaseId`, `from`, `to`) | business records |
| business facts (orders, payments, gate decisions) | `evidence_records` + `evidence_activities` | release tables |

**Rule:** release **state** stays in release tables; audit records **the action**; business records record **facts**.
The tenant sees its own current release and its own audit, never another tenant’s.

## 4. Architecture invariants (must not be violated)

1. **Org isolation** — `orgId` comes from the edge, never the body.
2. **Roles live in ZITADEL**; no `user→role` table in Postgres.
3. **Machine tokens** are org-bound; the platform token’s org must equal `PLATFORM_ORG_ID`.
4. **Platform permissions are excluded** from tenant role expansion (`admin ≠ ALL_PERMISSIONS`).
5. **Fail closed** — unset `PLATFORM_ORG_ID` → 503.
6. **No wildcard** org lists; explicit list, cap, dry-run.
7. **Evidence is append-only**; audit via `evidence.audit`, not `appendRecord`.
8. **No migrations** in the first control-plane slice.
9. **Attribution before privilege** — audit exists before any cross-tenant write.
10. **No release payload in Evidence** — only references.

## 5. What must be fixed before code

| Fix | Why before code |
|---|---|
| remove release `appendRecord` → `evidence.audit` | otherwise release info stays a business fact |
| add request-id middleware | join audit ↔ access log; traceability |
| define audit atomicity (transaction or outbox) | a move that cannot be audited is not complete |
| exclude platform permission from tenant expansion | prevents tenant-admin escalation |
| decide `PLATFORM_ORG_ID` + fail-closed behavior | boundary must exist first |
| tenant catalog + status | needed before any wave, not before audit |

## 6. Order (minimum first)

```
audit A (request-id + release audit + tenant view)
  → D17 phase 0/1 (permission, guard, token, dry-run)
  → token audit
  → tenant catalog + status
  → per-tenant verdict
  → wave (dry-run → one org → batch)
  → platform audit query/export
  → access logs
  → UI
  → integrity/role-mirror
```

## 7. One line

**Release state lives in release tables; the audit stream records who acted; business facts live in records +
activities; and the first three steps make attribution and the platform boundary correct before any cross-tenant
write is enabled.**
