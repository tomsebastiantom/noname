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

## 2a. Where audit is stored — and why not ClickHouse

The name “Evidence” makes this confusing. The kernel has **three** tables with different jobs:

| Table | Job | Business fact? |
|---|---|---|
| `evidence_records` | what happened (order, payment, gate decision) | **yes** |
| `evidence_activities` | who/what caused that fact (provider, service, user) | provenance of a fact |
| `evidence_audit_events` | who exercised **authority** (role, token, release move) | **no — access/control plane** |

`evidence_audit_events` was designed as the **audit primitive** (see `AUDITABLE-RECORDS-GENERIC-PATTERNS.md`),
not as a business-fact table: it has no commerce/release columns, only actor/action/subject/metadata. The name of
the domain is “Evidence”; the table is the audit member of that kernel.

If your architectural rule is **“Evidence = business facts only”**, the clean move is a **separate Postgres audit
table/domain**, not ClickHouse:

| Option | Store | Verdict |
|---|---|---|
| **A. keep `evidence_audit_events`** | Postgres, same kernel | valid; lowest risk; naming is the only wart |
| **B. extract `audit_events` into a new `audit` domain** | Postgres, separate table/domain | cleanest if strict separation is a rule; requires moving writers/route |
| **C. ClickHouse** | analytics store | **wrong for the source of truth** |

Why not ClickHouse for authoritative audit:

- audit must be written **in the same transaction** as the state change (pointer/role); ClickHouse is a separate
  system, so a successful move could be unaudited (or vice versa);
- TTL is a retention tool, not an immutability guarantee; audit needs 7 years and tamper evidence;
- a tenant audit query would depend on the analytics pipeline being up;
- ClickHouse is the right home for **access logs** (`http_access_logs`, 90 days), and a valid **export target**
  for audit, not the system of record.

**Recommendation:** use Postgres. Choose **A** now for the first slice; choose **B** if strict separation is a
standing rule, in which case the extraction is one migration + one domain + route alias — not a ClickHouse move.

### What the original design actually decided

The earlier design is explicit, and it is **not** “business facts only”:

- the abstraction was renamed from “generic business record” to a **“provenance and evidence kernel”** that answers
  *what happened, to which subject, who or what caused it, which records were used/produced*;
- **`EvidenceAudit` is defined as “a security/compliance action about the records system”** with
  `actorId`, `subjectType/Id`, `reason`, `occurredAt`, `correlationId`;
- candidate consumers explicitly included **“architecture decisions and deployments”** and
  **“deployments and incidents”**.

Source: [`AUDITABLE-RECORDS-GENERIC-PATTERNS.md`](../2026-09-12/AUDITABLE-RECORDS-GENERIC-PATTERNS.md) and
[`AUDITABLE-RECORDS-DESIGN-START.md`](../2026-09-12/AUDITABLE-RECORDS-DESIGN-START.md).

The nuance: that document is marked *“research starting point — not yet an implementation decision”*, while the
schema was implemented (`2af6d8a feat(server): add evidence provenance domain`). So the **storage decision was
made** (tables exist, including audit), but the **usage decision was never completed** — commerce writes
records + activities, release writes records, and **nothing writes audit**.

**Conclusion:** using `evidence_audit_events` for release access is consistent with the original design. If the
rule is now “business facts only”, that is a **new decision to narrow the kernel**, not a correction of a
violation — and it means extracting an `audit` domain, not moving audit to ClickHouse.

## 3. What must be logged

**Who owns a row:** the audit row belongs to the **tenant whose state was touched**, not to the actor or the tool.
Platform-global actions use `PLATFORM_ORG_ID`. The full scope matrix (pages, definitions, releases, orders,
selector) is in [`AUDIT-SCOPE.md`](./AUDIT-SCOPE.md).

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

### 4.7 Evidence vs audit vs access log — three planes, not one

These are different records with different owners, volume and retention. None is a substitute for another.

| Plane | Question it answers | Written by | Retention | Visible to |
|---|---|---|---|---|
| **Decision** | what did the gate decide, and why? | gate | per release policy | tenant + platform |
| **Evidence** | what is true / what happened to this entity? (order, release, payment) | domains | long, append-only | tenant (own org) |
| **Audit** | who exercised which authority, on what scope? | privileged commands | **7 years** | tenant (own actions) + platform |
| **Access log** | which request hit which route, with what result? | edge / HTTP middleware | 30–90 days | operators only |

Consequences:

- Do **not** pour access logs into Evidence: volume and PII make the audit kernel unusable.
- Do **not** use Evidence as an access log: it records business facts, not every request.
- A gate **decision** is a decision record (Evidence), not an audit of who called the gate; both may exist with the
  same correlation id.
- A tenant sees its **audit** and its Evidence, never raw access logs or another tenant’s stream.

**Joining the planes.** The only reliable join keys are identifiers we generate once and propagate:

```
requestId      x-request-id (accept upstream, else generate)  → access log + audit metadata + Evidence correlation
traceId        OpenTelemetry span                             → access log + audit metadata
actorId        authenticated principal                        → audit + access log
orgId          edge header                                    → all planes
correlationId  domain workflow (waveId, runId, orderRef)      → audit + Evidence
```

**Current gap:** OTel spans exist (`org-tracing.ts`) but there is **no request-id middleware**, audit rows carry no
`traceId`, and release actions do not write audit events at all. So today an order/release can only be joined to
access logs by timestamp and org, which is not evidence-grade.

**Required:** a request-id middleware (generate UUID when absent, echo in response, attach to the span), include
`requestId`/`traceId` in audit `metadata`, and ensure edge/API access logs use the same id. That is phase A.

**Where the access log itself lives** — not Evidence, not audit, not Jaeger: see
[`ACCESS-LOG-STORAGE.md`](./ACCESS-LOG-STORAGE.md) (ClickHouse now, object-storage archive later).



| Phase | Change | Test |
|---|---|---|
| **A** | request-id middleware + `traceId`/`requestId` in audit metadata; release promote/rollback/switch write `evidence_audit_events` with structured actor; `AUDIT_READ` for tenant admins; tenant filter test | tenant sees own move; other org’s audit is absent; audit row joins to access log by requestId |
| **B** | ZITADEL service-account lifecycle (creation, role grant, key rotation, disable) mirrored into the audit stream; app actions audited | account create/grant/disable visible in ZITADEL audit; app actions show the service-account actor |
| **C** | `GET /api/platform/audit` with `PLATFORM_AUDIT_READ`, pagination + NDJSON export | tenant admin → 403; service-account token → rows across orgs |
| **D** | integrity hash chain + verification job + retention registration | edit a row by SQL → verification fails |
| **E** | ZITADEL role-change mirror | grant/revoke appears in tenant audit |

Phases A–C are required before D17 waves; D–E are the SOC evidence pack.

## 6. Acceptance

1. A tenant admin sees its own release promotions with **actor, from, to, time, waveId**.
2. The same admin cannot see another tenant’s audit rows or the platform stream.
3. A service-account token can query across orgs and export NDJSON.
4. Tenant admin gets **403** on the platform audit endpoint.
5. Issuing/revoking an operator token writes one audit row each.
6. A direct `UPDATE` to an evidence row is detected by the integrity check.
7. A role grant/revoke is visible in the tenant audit (phase E).
8. `AUDIT_READ` and `PLATFORM_AUDIT_READ` are excluded from tenant role expansion (same rule as D17).
9. An audit row and its access-log line share a `requestId`; the same row carries the active `traceId`.

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

**Ordering:** this audit stream is the **prerequisite** for D17; access logs are not. Request/access logging
(ClickHouse, requestId, dashboards) is a separate later block for CC7.2 monitoring — see
[`ACCESS-LOG-STORAGE.md`](./ACCESS-LOG-STORAGE.md). Do not build access-log infrastructure to answer “who edited
an admin”; that is what this design answers.

Without A–C, D17 would create a privileged identity whose actions are not attributable in a tenant-visible way —
which is precisely the finding an auditor would write.
