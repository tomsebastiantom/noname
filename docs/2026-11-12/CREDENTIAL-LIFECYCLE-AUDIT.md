# Credential lifecycle audit — phase B (step 3)

> **Status:** **implemented and verified 2026-11-12** · **Scope:** roadmap step 3 / audit phase B. Records how the
> platform's own actors came to hold authority, and reports drift between ZITADEL and our audit stream.
> **Related:** [`../2026-11-07/AUDIT-LOGGING-DESIGN.md`](../2026-11-07/AUDIT-LOGGING-DESIGN.md) ·
> [`PLATFORM-AUDIT.md`](./PLATFORM-AUDIT.md)

---

## 1. The gap, stated concretely

Every audit row we had answered *“an actor did something to a tenant”*. None answered *“how did that actor come to be
allowed to do it”*.

A wave is attributed to a service account. Before this block, nothing in our stream recorded that the account existed,
that `platform_operator` was granted to it, that a key was minted, or that it was later disabled. An incident
question — *“who could have moved 40 tenants last Tuesday?”* — could only be answered from ZITADEL's own audit log.

## 2. What was built

### Action family

```
platform.credential.created
platform.credential.granted
platform.credential.revoked
platform.credential.key_added
platform.credential.key_removed
platform.credential.deactivated
```

Subject type is always `platform.service_account`, so `subjectType=platform.service_account` selects the whole
lifecycle. `org_id` is `PLATFORM_ORG_ID`: a credential is platform-scoped, never a tenant's business.

### Two surfaces

| Route | Purpose |
|---|---|
| `POST /api/platform/credentials/events` | record one transition; actor is the **operator who made the change**, not the credential |
| `GET /api/platform/credentials/reconcile` | compare ZITADEL's live grants for the platform project with what the stream recorded |

### Reconciliation is the honest half

This is **not** a mirror of ZITADEL's event feed. It compares two sets — live grants from
`ListAuthorizations(platformOrg, platformProject)` versus `granted` rows not later `revoked` — and reports:

```
unrecorded  in the IdP, never recorded   → a console change, or provisioning that forgot to emit
stale       recorded, gone from the IdP   → a revocation nobody wrote down
clean       both directions agree
```

`clean` requires **both** lists empty. Drift is never assumed benign.

**Key material is never stored** — `keyId` only, and a test asserts the row cannot contain a private key.

## 3. Verification

Unit — `platform-credentials/service.test.ts` (7 tests): the row is platform-scoped with the operator as actor;
metadata carries `role`/`projectId`; no key material; fails closed without `PLATFORM_ORG_ID`; a later `revoked` removes
an earlier `granted`; reconcile is clean when the sets match; a console grant is `unrecorded`; a missing revocation is
`stale`.

Live, platform service-account token:

```
before  GET /credentials/reconcile
        live=2 recorded=0 clean=false
        unrecorded: [eval-runner → eval_operator, release-operator → platform_operator]

emit    POST /credentials/events  ×2   → 200, 200

after   GET /credentials/reconcile
        live=2 recorded=2 clean=true

audit   GET /platform/audit?action=platform.credential.granted → count=2
replay  POST /credentials/events (same account+role)          → 200, still 2 rows (idempotent)
```

The “before” result is the point: the two service accounts **did** hold platform-wide authority and our stream had
nothing on them. Reconciliation found it on the first run.

## 4. Limits — stated plainly

- **Provisioning does not emit automatically yet.** `init:platform-accounts` and `init:tenant-eval` still write
  directly to ZITADEL. Until they also POST here, a fresh provisioning run shows up as `unrecorded`. The mitigation is
  that reconciliation *says so* instead of hiding it.
- **Grants only.** The reconciler compares role grants. Account creation, key rotation and deactivation are recorded
  when emitted, but not yet reconciled against the IdP (that needs the machine-user and key lists).
- **No ZITADEL event feed.** A true mirror (B2) would ingest ZITADEL's audit events so console changes are recorded
  rather than merely detected. `POST /events` is the seam where that would land.
- **No backfill.** Rows exist from now on; earlier grants have no history.

## 5. Next

The natural follow-ups, in value order:

1. have the provisioning scripts emit (they already hold a freshly minted service-account key, so they can mint a
   token and POST);
2. extend reconciliation to accounts and keys, not just grants;
3. replace reconciliation with ZITADEL event ingestion if console-level coverage becomes a requirement.
