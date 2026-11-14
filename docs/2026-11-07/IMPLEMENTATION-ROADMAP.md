# Implementation roadmap — what to build next, in order

> **Status:** proposed order · **Date:** 2026-11-07 (America/Toronto)
> **Basis:** code-verified state after D1/D2/D4/D7/D8/D14/D15/D16/E27. Design docs: platform operator,
> audit, access logs, tenant eligibility.
> **Rule:** attribution before privilege; eligibility before waves; dry-run before writes; one org before many.

---

## 0. Decisions to make first (no code)

| Decision | Recommended | Why it blocks work |
|---|---|---|
| **D17** platform operator | **B** — platform org + `platform_operator` role + service account, private-key JWT | determines guard/provisioning |
| **D6 / B7** visual rubric | **Drop** | closes the eval catalogue without a model dependency |
| **D9** gate `unverified` policy | **B** — human ack, block contract/data | wave eligibility needs a defined verdict |
| **D5 / E20** checkout | **C** — contract test; provider smoke in staging | removes the last “blocked” ambiguity |

Nothing else starts until these four are written down; each is a paragraph, not a build.

## 1. Request-id + audit phase A (release actions → audit events)

**What**

- `x-request-id` middleware (accept upstream, else UUID, echo response, span attribute);
- release promote/rollback/switch write `evidence_audit_events` with structured `actorType`/`actorId`;
- tenant `AUDIT_READ` permission and tenant-scoped audit view;
- audit rows carry `requestId` + `traceId`.

**Why first:** every later platform action must be attributable **before** the privileged identity exists. This also
fixes the current gap where release actions put the actor inside `data` and cannot be queried by actor.

**Acceptance:** tenant sees own promotion with actor/from/to/requestId; other org’s rows absent; audit joins to a
request log line by `requestId`.

## 2. D17 phase 0/1 — authorization boundary, dry-run only

**What**

- `RELEASES_PLATFORM_READ/WRITE`, excluded from `TENANT_PERMISSIONS` (tenant admin must not inherit);
- `PLATFORM_ORG_ID` (unset → platform routes 503);
- `requirePlatformOperator` guard;
- platform org, `platform_operator` role, service account, private key;
- `POST /rollout` with **dry-run only** (no writes), explicit org list, cap.

**Why:** defines who may act across tenants and fails closed. No write path until the audit from step 1 exists.

**Acceptance:** tenant admin → 403; wrong-org token → 403; env unset → 503; dry-run writes nothing.

## 3. Audit phase B — token issuance/revocation

**Status (2026-11-14):** ✅ **credential lifecycle + platform token issuance.** A token minted for the platform org
records `platform.token.issued` with a **hash** of the token and its lifetime — never the credential. Token *revocation*
is ZITADEL deactivation and is recorded as `platform.credential.revoked`. Remaining gap: per-session revoke is not
something we control, so there is no "token revoked" row for a user logout. Earlier note:
`platform.credential.*` rows with the operator as actor, plus a reconciliation that reports drift between
ZITADEL's live platform grants and the recorded stream. See
[`CREDENTIAL-LIFECYCLE-AUDIT.md`](../2026-11-12/CREDENTIAL-LIFECYCLE-AUDIT.md).

**What:** record token mint/revoke (actor, service id, org, permissions, expiry) as audit events; token id is a
hash, never the secret.

**Why:** auditors sample access changes first; a privileged token with no issuance record is a finding.

**Acceptance:** mint → one audit row; revoke → one audit row; no secret stored.

## 4. Tenant catalog + lifecycle status

**What:** list tenants (slug, org, status, plan, region, created), status model
`active | suspended | offboarding`, exclusions (legal hold, maintenance, opt-out), platform-org marker.

**Why:** waves cannot safely answer “which tenants” without it; today `tenant_settings` is fetched per org with no
inventory and no status.

**Acceptance:** `GET /api/platform/tenants?status=active` returns the inventory; a suspended tenant cannot be
selected; platform org is never a target.

## 5. Per-tenant gate verdict lookup

**What:** query “verdict for release X + tenant Y” from the eval decision records (and `checksVersion`), with
`pass | block | unverified | missing`.

**Why:** the wave must skip a tenant whose verdict is `block`, and require an ack for `unverified`. Without this,
a wave can promote a tenant that failed its own checks.

**Acceptance:** blocked-verdict tenant is `skipped: no_verdict/blocked`; passing tenant proceeds.

## 6. Wave: dry-run → one org → batch

**What**

- `POST /api/releases/:id/rollout` with `dryRun` (step 2) now returns eligibility per org;
- write path enabled for **one explicitly named org**;
- then operator CLI with batch cap and per-org result reporting;
- one Evidence row per promoted org + one wave summary;
- no wildcard, no implicit “all”.

**Why:** exposes the feature only after attribution, boundary, catalog, and verdict exist. Partial failure is
reported, never rolled back silently.

**Acceptance:** dry-run plan; one-org promote; batch of N with mixed results; suspended/blocked tenants skipped;
revoking the token stops everything.

## 7. Audit phase C — platform audit query + export

**What:** `GET /api/platform/audit` (actor/action/org/time filters), NDJSON export for SIEM/WORM,
`PLATFORM_AUDIT_READ` (platform-only).

**Why:** waves are cross-org; the evidence must be queryable and exportable before more than one org is touched.
Tenant audit alone cannot answer “what did the operator do across tenants”.

**Acceptance:** service-account token queries across orgs; tenant admin 403; export file produced.

## 8. Access logs (CC7.2 monitoring)

**What:** access-log middleware (route, status, latency, org, actor, requestId, traceId), ClickHouse table with
90-day TTL, async writer with drop counter, daily NDJSON export to R2/S3.

**Why after audit:** audit answers “who changed what”; access logs answer “what requests happened”. They are
monitoring/forensics, not attribution. `requestId` from step 1 is already in place.

**Acceptance:** ClickHouse down does not fail requests; rows expire; export exists.

## 9. Release admin UI

**Status (2026-11-14):** 🟡 **partially implemented.** The operator console exists
([`PLATFORM-CONSOLE.md`](../2026-11-12/PLATFORM-CONSOLE.md)): tenant list with provisioning and verdict state,
create, backfill, invite, verdict acknowledgement, and **single-tenant promote** from the Release column (verified:
`skipped (already_on_release)` rendered in the row). **Not built:** rollback and the
release history view.

**What:** tenant list, current/previous pointer, release history, promote/rollback with confirmation, audit trail
link.

**Why after the API:** the API shape must be stable; the UI is a client of the control plane, not a new one.

**Acceptance:** an operator can perform a one-tenant promotion and see the audit entry.

## 10. Audit evidence pack (D/E)

**What:** integrity hash chain + verification job; retention registration; ZITADEL role-change mirror.

**Why last:** these are evidence-grade guarantees for an external audit; they need the streams from steps 1–7 to
exist and stabilize first.

**Acceptance:** SQL edit detected; role grant appears in tenant audit; retention policy enforced.

## 11. Eval leftovers (parallel track)

| Item | Recommendation | Why |
|---|---|---|
| **B7** visual rubric | drop | non-deterministic; contrast (B6) covers the measurable part |
| **E20** checkout | contract test now; provider smoke in staging | provider half is not ours |
| **D9** unverified policy | ack + block contract/data | gate semantics |
| **D10** worker split | separate entrypoint | browser isolation from API |
| **D12** Evidence retention | bounded samples | audit volume |

These do not block the release track; they can run in parallel with steps 1–7.

## 12. Ops backlog

| Item | Why |
|---|---|
| R2 bundle retention/GC | prune removes rows, not objects |
| selector → ingress conformance check | prove the active release matches the deployed stack |
| migration-set classification at **creation** | catch destructive sets earlier than promotion |
| ~~tenant catalog backfill~~ | done 2026-11-14: `POST /api/platform/tenants/backfill` |

---

## Why this order (the short version)

1. **Attribution before privilege** — step 1 before step 2.
2. **Boundary before action** — step 2 before any wave.
3. **Access changes audited** — step 3 before tokens are used widely.
4. **Inventory before selection** — step 4 before “all tenants”.
5. **Verdict before promotion** — step 5 before write path.
6. **Dry-run before write, one before many** — step 6.
7. **Cross-org evidence before scale** — step 7.
8. **Correlation before monitoring** — requestId in step 1; access logs in step 8.
9. **API before UI** — step 9.
10. **Evidence-grade guarantees after streams stabilize** — step 10.

The first three are the minimum before a platform operator may write anything. Everything after step 3 is
incremental capability, not a prerequisite for safety.
