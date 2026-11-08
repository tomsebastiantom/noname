# Control-plane implementation — the first three steps, architecture-checked

> **Status:** proposed implementation plan · **Date:** 2026-11-07 (America/Toronto)
> **Scope:** the minimum before a platform operator may write anything:
> **① audit/attribution → ② D17 boundary → ③ token audit.**
> **Purpose:** show exactly where each change lands, and prove it does not violate an existing architecture rule.
> **Rule:** attribution before privilege → boundary before action → access changes audited.

---

## 1. Architecture constraints this must respect

| # | Constraint (source) | What it forbids |
|---|---|---|
| C1 | **Org isolation** — edge `x-org-id` + HMAC, every request one org (`shared/org.ts`) | client-supplied org; cross-org reads outside a platform-permission route |
| C2 | **Roles live in ZITADEL**, JWT is the runtime source (`TEAM-ROLES-ZITADEL.md`) | a Postgres `user→role` table, even as cache |
| C3 | **Machine tokens** are `nsv.` with `orgId`, permissions and expiry (`service-token.ts`); guards reject org mismatch (`guards.ts`) | a token that is not org-bound, or permission escalation |
| C4 | **Evidence is append-only**, written through the service port; no browser write route | writing audit rows as business records, or exposing writes |
| C5 | **Schema changes are additive** (D16); destructive DDL is blocked | dropping/renaming anything in these steps |
| C6 | **Tenant roles must not gain platform permissions** (`admin: ALL_PERMISSIONS` trap) | adding `releases:platform_*` to `ALL_PERMISSIONS` |
| C7 | **Fail closed** when platform config is absent | defaulting to “allow” |
| C8 | **Logging must never block a request** | synchronous ClickHouse/HTTP logging in the request path |
| C9 | **No wildcard cross-tenant operation** | `orgIds: ["*"]`, implicit “all tenants” |
| C10 | **Attribution before privilege** | enabling a write path before audit exists |

## 2. Step ① — request id + audit phase A

### Where

| Change | File |
|---|---|
| `x-request-id` middleware (accept upstream, else UUID; echo; span attribute) | `packages/server/src/shared/request-id.ts` (new), registered in `bootstrap.ts` **before** `orgMiddleware` |
| Release promote/rollback/switch write **audit** events instead of `data.actor` | `domains/release/pointer-service.ts`, `domains/release/environment-service.ts` |
| Tenant audit permission | `packages/auth/src/permissions.ts` (`AUDIT_READ`), route options in `bootstrap.ts` |
| Audit query already exists | `domains/evidence/routes.ts` → `GET /api/evidence/audit` |

### What the audit row looks like

```ts
await evidence.audit({
  orgId,                                 // tenant affected
  action: "platform.release.tenant_promoted",
  actorType: "service",                 // user | service | system
  actorId: "release-operator",
  subjectType: "tenant.storefront",
  subjectId: orgId,
  reason: waveId,
  metadata: { from: "r_16", to: "r_17", requestId, traceId, dryRun: false },
  correlationId: waveId,
  idempotencyKey: `${waveId}:${orgId}:${to}`,
});
```

- `orgId` comes from the edge, never from the body (C1).
- The row is org-scoped, so the tenant sees **its own** moves only (C1, C4).
- `AUDIT_READ` is a **tenant** permission: grant it to `admin` only (not a platform permission).

### Why the audit event lives in the Evidence kernel (and not the release domain)

This is deliberate, not “because the table already exists”.

| Option | Why not |
|---|---|
| **Release-owned audit table** | every domain would reinvent actor/subject/append-only/retention; the tenant view becomes a union of N tables; cross-domain queries (who touched this tenant?) become joins across domains |
| **Event bus only** | asynchronous and lossy; an event that was not consumed is not an audit record; no tenant-visible query |
| **External SIEM only** | not transactional, not tenant-scoped, not readable by the product; fine as an export, not as the source of truth |
| **Evidence kernel** | one append-only store with actor/subject/action/reason, tenant scoping, query route, retention and (later) integrity — shared by all domains |

Dependency direction stays clean:

```
domains/release ──► evidence port (audit)
domains/release ──► release tables (release, pointer, environment)
domains/evidence ──► nothing from release
```

The release domain owns **release state**; the Evidence kernel owns **the record that the action happened**. The
release-specific detail (`from`, `to`, `waveId`, `dryRun`) lives in `metadata`, not in Evidence columns, so the
kernel stays generic.

**Caveat — audit must not be fire-and-forget.** Phase A may write the audit row immediately after the pointer
write (visible failure, reconciliation possible), but the correct end state is **same-transaction or outbox**:
a promotion that cannot be audited should not be considered complete. That is recorded as a phase-A limitation,
with the outbox as the follow-up when the write path opens.

### What does **not** go into Evidence

Your reading is correct: Evidence/records are for **business facts**, not for release state. The design keeps
that boundary:

| Data | Where it lives | Why |
|---|---|---|
| release row, artifacts, digests, state | **release tables** (`releases`, `release_artifacts`) | release domain owns state |
| tenant pointer, previous pointer | **release tables** (`tenant_release_pointers`) | state, not history |
| environment active/previous | **release tables** (`release_environments`) | selector state |
| build logs, bundle bytes | **not stored here** (R2 / build system) | not a record |
| **who promoted / rolled back / switched** | **`evidence_audit_events`** | access action, tenant-scoped |
| eval gate decision | `evidence_records` (already) | business/decision fact |
| order, payment, receipt | `evidence_records` (already) | business facts |

The audit row contains only **references** — `releaseId`, `from`, `to`, `waveId` — never release artifacts,
digests, or configuration. The release tables remain the single source of truth for what a release *is*.

**Today vs after step ①.**

```
TODAY (the thing being removed):
  evidence_records
    type = platform.release.tenant_promoted
    data = { from, to, actor, releaseId }        ← release info stored as a business fact

AFTER:
  tenant_release_pointers
    org_id → release_id, previous_release_id     ← the state (release tables)

  evidence_audit_events
    action = platform.release.tenant_promoted
    subject = tenant.storefront / org
    metadata = { from, to, releaseId, requestId } ← reference only, no release payload
```

So the objection is correct for **today’s code**: it writes a record with release fields. That record is the
legacy duplication this slice removes. It is not the target model.

**Who owns what.** Release tables are platform-owned and org-scoped (`org_id` on every row). The tenant does not
own a table; it owns the pointer row that selects its release, and the catalog projection that reads it. A platform
operator creates/moves releases across orgs; a tenant admin can only see and move its own.

**Records vs audit in the same kernel.** The Evidence domain was designed with both (`EvidenceRecord` for facts,
`EvidenceAudit` for access — see `AUDITABLE-RECORDS-GENERIC-PATTERNS.md`). Using its audit table does not turn
release state into Evidence; it records that an actor touched a release. If you later decide the kernel must hold
**only** business facts, moving audit to a separate store is a separate architecture decision — not required for
this slice, and it would not change the release-domain boundary.

### Why this is the first step

The current code writes `platform.release.tenant_promoted` as a **record** with `data.actor`. That is business
evidence, not an access audit: it cannot be queried by actor, and it mixes the two planes. Step ① fixes that
before any new privilege exists (C10).

### Acceptance

- tenant sees own promotion with actor/from/to/requestId; another org’s rows are absent;
- the audit row and its access-log line share `requestId` once access logs exist;
- no schema change (C5).

## 3. Step ② — D17 phase 0/1 (boundary, dry-run only)

### Where

| Change | File |
|---|---|
| Permission keys `RELEASES_PLATFORM_READ/WRITE` | `packages/auth/src/permissions.ts` |
| **Exclude** them from tenant role expansion (`TENANT_PERMISSIONS`, admin = tenant only) | same file |
| `PLATFORM_ORG_ID` config | `.env.example`, docs |
| Guard `requirePlatformOperator` | `packages/server/src/domains/release/platform-guard.ts` (new) |
| Operator token mint | `scripts/mint-platform-token.ts` (new), uses `signServiceToken` |
| Dry-run endpoint | `domains/release/api.ts` → `POST /api/releases/:id/rollout` with `dryRun` forced |

### Guard shape

```ts
const actor = await requireAuthenticatedActor(c);        // existing guards
if (actor instanceof Response) return actor;
if (!actorHasPermission(actor, PERMISSIONS.RELEASES_PLATFORM_WRITE)) return 403;
if (actor.type !== "machine") return 403;                // phase 1: token only
if (actor.orgId !== platformOrgId()) return 403;
if (!platformOrgId()) return 503;                        // fail closed (C7)
```

- The guard reuses the existing machine-token verification (C3).
- No new role assignment, no Postgres mapping (C2).
- The permission is **platform-only**, excluded from `ALL_PERMISSIONS` for tenant roles (C6).
- Phase 1 route performs **no writes**; it returns an eligibility plan (C10).

### Token

```
nsv.<payload>.<hmac>
payload: { serviceId: "release-operator", orgId: PLATFORM_ORG_ID,
           permissions: ["releases:platform_read","releases:platform_write"], exp }
```

The mint script prints the token; the secret never leaves the operator environment. Optionally add `jti` to the
claims for per-token audit/revocation — additive and backward compatible.

### Acceptance

- tenant admin token → **403** (permission absent **and** org mismatch);
- platform token wrong org → **403**;
- `PLATFORM_ORG_ID` unset → **503**;
- dry-run writes no pointer row and no Evidence record;
- `ROLE_PERMISSIONS.admin` does not contain the platform permission (unit test).

## 4. Step ③ — token issuance/revocation audit

### Where

| Change | File |
|---|---|
| Audit on mint | `scripts/mint-platform-token.ts` → `evidence.audit({ action: "platform.operator.token_issued", … })` |
| Audit on revoke | `scripts/revoke-platform-token.ts` (new) or documented secret rotation |
| Token identity | add optional `jti` to `ServiceTokenClaims` (additive) |

### What is audited

```ts
{
  orgId: platformOrgId,
  action: "platform.operator.token_issued",
  actorType: "user",              // the human running the script
  actorId: operatorId,
  subjectType: "platform.operator_token",
  subjectId: tokenHash,           // sha256 of the token, never the token
  metadata: { serviceId, permissions, exp, requestId? },
}
```

- Storing only the hash means the audit log cannot be used to replay the credential.
- `jti` makes revocation-by-id possible later; v1 revocation is **rotate the signing secret** (all tokens),
  documented and audited.
- No new table is required for this step; `evidence_audit_events` already has actor/subject/action/reason.

### Acceptance

- mint → exactly one audit row, no secret in it;
- revoke/rotation → one audit row;
- the audit row is not tenant-visible (platform stream only), because `orgId = PLATFORM_ORG_ID`.

## 5. Compliance matrix

| Constraint | Step ① | Step ② | Step ③ |
|---|---|---|---|
| C1 org isolation | audit org from edge | guard requires platform org | token audit org = platform org |
| C2 roles in ZITADEL | no role storage | no ZITADEL role created (A) | no role storage |
| C3 machine token | — | reuses `nsv.` + org check | same |
| C4 append-only Evidence | uses `evidence.audit` | no Evidence writes (dry-run) | uses `evidence.audit` |
| C5 additive schema | none | none | none (optional `jti` is token format, not DB) |
| C6 platform permission exclusion | — | **required** | — |
| C7 fail closed | — | 503 when env unset | — |
| C8 logging non-blocking | requestId only | — | script only |
| C9 no wildcard | — | explicit `orgIds` | — |
| C10 attribution first | **this step** | after ① | after ② |

**No migrations in steps ①–③.** The only auth change is additive permission keys with an explicit exclusion; the
only token change is an optional claim.

## 6. Explicitly forbidden in these steps

- a Postgres table of user→role (violates C2);
- `releases:platform_write` granted through `admin: ALL_PERMISSIONS` (C6);
- reading `orgId` from the body (C1);
- writing platform actions as `evidence_records` (C4 — use `audit`);
- enabling the write path before audit exists (C10);
- wildcard org lists (C9);
- `UPDATE`/`DELETE` routes on audit tables (C4).

## 7. Test plan

| Level | Test |
|---|---|
| unit | `TENANT_PERMISSIONS` excludes platform keys; `ROLE_PERMISSIONS.admin` has no platform key |
| unit | guard: tenant admin 403; wrong-org machine 403; unset env 503; valid token 200 |
| unit | audit event has actorType/actorId/requestId; tenant query filters org |
| route | dry-run returns plan and writes nothing (SPY store) |
| route | audit endpoint: tenant sees own, not other org |
| script | mint writes one audit row; token hash differs from token |
| regression | existing release promote still works for tenant admin (own org) |

## 8. Rollout and backout

| Step | Enable | Backout |
|---|---|---|
| ① requestId | always on, harmless | remove middleware |
| ① audit | release actions write audit rows | stop writing; existing rows remain |
| ② permission/guard | env unset by default → routes 503 | unset env; revoke token |
| ② dry-run | route exists but no writes | remove route |
| ③ token audit | script only | stop using script |

No data migration, no tenant-visible change, no route removed. The first tenant-visible feature is the audit view
(step ①), which is read-only.

## 9. What remains after these three steps

Tenant catalog → per-tenant verdict → wave (dry-run → one org → batch) → platform audit query/export → access
logs → UI. Those are capability steps; the **safety minimum** is the three above.

## 10. Open questions

1. `AUDIT_READ` for `access_manager` too, or admin only? (Recommendation: admin only in v1.)
2. Token `jti` now or when per-token revocation is needed? (Recommendation: add it now; it is additive.)
3. Does the mint script write audit directly through `EvidenceService` (same DB credentials), or does the
   platform operator call an API? (Recommendation: script writes through the service; it already holds the signing
   secret, so it is the same trust boundary.)
