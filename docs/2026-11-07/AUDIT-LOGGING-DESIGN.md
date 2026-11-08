# Audit logging for platform roles and tenant-visible history

> **Status:** proposed design · **Date:** 2026-11-07 (America/Toronto)
> **Why:** D17 introduces an identity that acts **across tenants**. That is exactly the class of action a SOC 2
> auditor asks about: who had privileged access, what did they change, who approved it, and can the tenant see it?
> **Related:** [`PLATFORM-OPERATOR-DESIGN.md`](./PLATFORM-OPERATOR-DESIGN.md) · [`RELEASE-D1-DESIGN.md`](./RELEASE-D1-DESIGN.md) · [`PENDING-DECISIONS.md`](./PENDING-DECISIONS.md) D17

---

## 1. Compliance framing (what the auditor will ask)

| Control | Question | What must exist |
|---|---|---|
| **SOC 2 CC6.1** — logical access | who can act on which scope, and was it granted deliberately? | platform roles/tokens with scope, grant/revoke history |
| **SOC 2 CC6.3** — role changes | who changed access, when, and was it authorized? | audit of role/token grants and revocations |
| **SOC 2 CC7.2 / CC7.3** — monitoring | can you detect and investigate anomalous privileged actions? | structured audit stream, retention, queryable export |
| **SOC 2 CC7.4** — incidents | can you reconstruct what happened? | immutable records with actor, target, before/after, correlation |
| **ISO 27001 A.12.4** — logging | event logs, protection, retention | append-only store, tamper evidence, retention policy |
| **Tenant trust** | “who changed my storefront and why?” | tenant-scoped audit visible to the tenant admin |

Two audiences, not one:

1. **Tenant audit** — “what happened to my tenant”. Org-scoped, visible to that tenant.
2. **Platform audit** — “what did the operator do across tenants”. Cross-org, restricted to platform auditors.

## 2. Current state (verified in code, 2026-11-07)

| Piece | Reality | Gap |
|---|---|---|
| `evidence_records` | append-only business facts; org-scoped; `integrityHash` column exists | hash is **never computed**; no actor columns (release code puts `actor` inside `data`) |
| `evidence_activities` | actorType/actorId, input/output record ids | not used for release actions |
| `evidence_audit_events` | **the right primitive**: `action`, `actorType`, `actorId`, `subjectType`, `subjectId`, `reason`, `metadata` | release promote/rollback/switch currently write **records**, not audit events |
| Release actions | `platform.release.tenant_promoted` (org = tenant), `platform.release.switched` (org = org), actor inside `data` | not queryable by actor; tenant sees it as a business record, not an audit entry |
| `/api/evidence/records` | org-scoped; permission map covers commerce only | release audit types have **no permission mapping**; no cross-org view |
| `/api/evidence/audit` | org-scoped audit query | no tenant permission policy; no platform-wide endpoint |
| Role grants | ZITADEL is the source of truth | the app does not record grant/revoke events |
| Operator tokens (D17) | not implemented | no issuance/revocation audit |
| Integrity | no hash chain | a DBA can edit rows without detection |
| Export / SIEM | none | no evidence pack for an auditor |

**Net:** the storage primitives are good; the gaps are **structure (actor), audience (tenant vs platform), coverage
(role/token changes), integrity, and export**.

## 3. What must be logged

| Event | Actor | Target | Fields |
|---|---|---|---|
| Platform operator token issued | the human/script that minted it | token id (hash), scope | `actorType`, `actorId`, `exp`, `permissions`, `reason` |
| Token revoked / expired | operator or system | token id | reason, time |
| Platform role granted/revoked | admin | user, role, org | grantor, grantee, before/after |
| Wave started | operator | release, org list | `waveId`, `releaseId`, `orgIds`, `dryRun` |
| Per-org promotion | operator | org + release | from, to, releaseId, waveId, result |
| Rollback | operator | org/environment | from, to, reason |
| Environment switch | operator | environment | from, to, releaseId |
| Access denied on a platform route | principal | route | reason, requested scope (security signal) |
| Release gate decision | service | release/tenant | verdict, checksVersion, unverified count |

Every entry answers: **who** (actor type + id), **what** (action + before/after), **where** (org/tenant/environment),
**when** (occurred + recorded), **why** (reason/approval), **correlation** (wave/run id).

## 4. Design

### 4.1 Use `evidence_audit_events` for privileged actions

```ts
audit.append({
  orgId,                       // tenant affected, or platform org for platform-scope events
  action: "platform.release.tenant_promoted",
  actorType: "service",        // user | service | system
  actorId: "release-operator",
  subjectType: "tenant.storefront",
  subjectId: orgId,
  reason: "wave 2026-11-07-a",
  metadata: { from: "r_16", to: "r_17", releaseId: "r_17", waveId, result: "promoted" },
  correlationId: waveId,
});
```

Release actions move from `appendRecord` to `appendAudit` (or write both: audit for access, record for business
facts). The audit row is what the tenant sees; the record remains the business artifact.

### 4.2 Tenant view

```
GET /api/evidence/audit?subjectType=tenant.storefront
Authorization: tenant admin (new AUDIT_READ permission)
```
- hard-filtered to `orgId` from the edge (no client-supplied org);
- actor shown as id + type, not email (privacy);
- no rows from other tenants, ever;
- release moves appear with `from`, `to`, `waveId`, `actor`.

### 4.3 Platform view

```
GET /api/platform/audit?actor=&action=&orgId=&from=&to=&cursor=
Authorization: platform auditor (PLATFORM_AUDIT_READ, platform-only)
```
- cross-org, read-only, paginated;
- export as NDJSON for SIEM/WORM;
- `PLATFORM_AUDIT_READ` is platform-only: **not** in `TENANT_PERMISSIONS`, same exclusion as D17’s write permission.

### 4.4 Role changes

Tenant roles stay in ZITADEL. Two legitimate sources:

| Approach | How | Use |
|---|---|---|
| **Mirror ZITADEL audit** | read ZITADEL’s admin event API and append an audit event for role grant/revoke | authoritative for tenant roles |
| **App-managed platform role** | if D17 B adds a platform role, the app calls ZITADEL and writes the audit event in the same flow | platform role only |

A role change is not complete until its audit row is written; a failed audit write fails the operation.

### 4.5 Tamper evidence

- compute `integrityHash = sha256(canonical(record) + prevHash)` per org stream;
- store `prevHash` in metadata or a companion column;
- DB role for the app: `INSERT` only on evidence tables (no `UPDATE`/`DELETE` grants);
- daily digest exported to WORM/object-lock storage;
- verification job recomputes the chain and alerts on mismatch.

### 4.6 Retention and privacy

| Stream | Retention | Rationale |
|---|---|---|
| Tenant audit | 2 years | support + contractual |
| Platform audit | **7 years** | SOC 2 evidence window |
| Business evidence | existing decision retention | separate from access audit |

Minimize: actor IDs, not emails; IP only if required (hash it); never secrets, tokens, or full payloads.

## 5. Implementation plan

| Phase | Change | Test |
|---|---|---|
| **A** | release promote/rollback/switch write `evidence_audit_events` with structured actor; `AUDIT_READ` for tenant admins; tenant filter test | tenant sees own move; other org’s audit is absent |
| **B** | operator token issuance/revocation audit (+ token table/hash); mint script records it | issuing a token produces one audit row; revoke produces one |
| **C** | `GET /api/platform/audit` with `PLATFORM_AUDIT_READ`, pagination + NDJSON export | tenant admin → 403; platform token → rows across orgs |
| **D** | integrity hash chain + verification job + retention registration | edit a row by SQL → verification fails |
| **E** | ZITADEL role-change mirror | grant/revoke appears in tenant audit |

Phases A–C are required before D17 waves; D–E are the SOC evidence pack.

## 6. Acceptance

1. A tenant admin sees its own release promotions with **actor, from, to, time, waveId**.
2. The same admin cannot see another tenant’s audit rows or the platform stream.
3. A platform token can query across orgs and export NDJSON.
4. Tenant admin gets **403** on the platform audit endpoint.
5. Issuing/revoking an operator token writes one audit row each.
6. A direct `UPDATE` to an evidence row is detected by the integrity check.
7. A role grant/revoke is visible in the tenant audit (phase E).
8. `AUDIT_READ` and `PLATFORM_AUDIT_READ` are excluded from tenant role expansion (same rule as D17).

## 7. What this does **not** solve

- It does not replace ZITADEL’s own audit log; it records **application** actions and mirrors role changes.
- It does not log every read (too noisy and not required for CC6); privileged **writes** are the target.
- It does not make the database physically immutable; the hash chain + restricted role + WORM export are the
  controls.
- It does not decide legal retention; the table above is the proposed policy.

## 8. Recommendation

1. **Phase A now**, before the first wave endpoint: structured actor + tenant-visible audit.
2. **Phase B** with D17 phase 0/1: token lifecycle is access, and access changes are the first thing an auditor
   samples.
3. **Phase C** before enabling writes for more than one org.
4. **D–E** as the evidence pack before any external audit.

Without A–C, D17 would create a privileged identity whose actions are not attributable in a tenant-visible way —
which is precisely the finding an auditor would write.
