# RFC — Tenant provisioning (onboarding, lifecycle, console)

> **Status:** **proposal** · **Date:** 2026-11-12
> **Owner:** platform
> **Related:** [`TENANT-DIRECTORY.md`](./TENANT-DIRECTORY.md) · [`CREDENTIAL-LIFECYCLE-AUDIT.md`](./CREDENTIAL-LIFECYCLE-AUDIT.md) · [`../2026-11-07/AUDIT-SCOPE.md`](../2026-11-07/AUDIT-SCOPE.md) · [`../2026-11-07/IMPLEMENTATION-ROADMAP.md`](../2026-11-07/IMPLEMENTATION-ROADMAP.md)

---

## 1. Problem

**A tenant is currently created by accident.** There is no create-tenant operation. A tenant begins to exist when
somebody writes a document:

```
PUT /api/documents/tenant_settings/default   → one row in documents
```

Nothing else follows. Everything a tenant needs is a separate manual act:

| Step | Today | Hooked to anything? |
|---|---|---|
| tenant row exists | seed script or a `tenant_settings` PUT | no |
| appears in the inventory | `tenant_directory` backfill | **not wired to a route** |
| has an eval credential | `pnpm init:tenant-eval --org …` | no |
| credential is audited | nothing | — |
| has a release pointer | first promotion creates it | implicit |
| has a domain/slug | the same document field | no uniqueness beyond the document index |

Consequences, all observed in this repository:

- a typo'd org id was reported `eligible` by a wave until the directory existed;
- a tenant eval credential can exist with **no audit row**, and reconciliation cannot see it because it only compares
  the platform project;
- “delete/offboard a tenant” has no definition at all — status `offboarding` exists, nothing implements it;
- onboarding requires a human to remember three commands in the right order.

## 2. Goals

1. **One operation** creates a tenant completely: identity, inventory row, eval credential, audit rows.
2. **Idempotent and resumable**: re-running must not duplicate, and a half-finished tenant must be repairable.
3. **Observable**: a tenant has an explicit lifecycle status, and provisioning progress is queryable.
4. **Auditable**: every state change names the actor, including credential creation.
5. **Safe to reverse**: a failed or abandoned provisioning leaves no half-tenant that a wave could target.

### Non-goals (this RFC)

- Billing, plans and metering beyond storing `plan` as a label.
- Self-service signup. Onboarding is operator-driven first; self-service is a later surface that calls the same API.
- Per-tenant dedicated infrastructure (no "tenant gets its own database").
- Data deletion/GDPR erasure mechanics (a separate, legal-driven RFC).

## 3. Target model

### 3.1 Lifecycle

`tenant_directory.status` already exists with `active | suspended | offboarding`. This RFC adds provisioning as a
**phase**, not a new status value, so eligibility keeps one field:

```
            provision        ready
  (none) ─────────────▶ provisioning ────────▶ active ─────▶ suspended
                              │                   │              │
                              │ fail              │ offboard     │ resume
                              ▼                   ▼              ▼
                        provisioning_failed   offboarding ──▶ deleted
```

Stored as two columns rather than one:

| Column | Values | Meaning |
|---|---|---|
| `status` | `active｜suspended｜offboarding｜deleted` | what a wave may do |
| `provisioning_state` | `pending｜in_progress｜ready｜failed` | how far creation got |

Why two: “active but provisioning failed” is a real, visible state (identity exists, credential does not), and
collapsing it into one field would let a wave treat a half-built tenant as promotable. Eligibility requires
`status=active` **and** `provisioning_state=ready`.

### 3.2 The provisioning record

New table `tenant_provisioning`:

| Column | Purpose |
|---|---|
| `org_id` PK | the tenant |
| `idempotency_key` unique | one row per requested creation; a retry reuses it |
| `state` | `pending｜in_progress｜ready｜failed` |
| `steps` (jsonb) | per-step result: `{ directory, identity, eval_account, seed, domain }` each `pending/done/failed` + error |
| `requested_by` | operator actor id |
| `attempts` | count, for backoff |
| `last_error` | last failure message |
| timestamps | created/updated/finished |

`steps` is the important part: it makes a partial run **resumable and explainable** (“directory done, eval account
failed: 403”) instead of a 500 and a shrug.

### 3.3 Who does the work

```
POST /api/platform/tenants                     (platform operator)
   → creates tenant_provisioning row (pending), returns 202 + id

worker                                          (existing @noname/workers queue)
   → step 1 directory row      (status=active, provisioning_state=in_progress)
   → step 2 ZITADEL org        (only if the tenant needs its own org)
   → step 3 eval account + key (tenant org, eval_reader)
   → step 4 audit rows         (platform.credential.created/granted, tenant scope)
   → step 5 optional seed      (layouts, catalog, demo content)
   → state=ready, provisioning_state=ready

GET /api/platform/tenants/:id/provisioning      → steps + state (poll or SSE)
```

Synchronous is tempting and wrong: step 2 and 3 call an external IdP, step 5 writes documents. A request thread
holding that open is how you get duplicate tenants on retry.

## 4. Decisions this RFC proposes

| # | Decision | Recommendation | Why |
|---|---|---|---|
| P1 | Async job vs synchronous | **async + polled status** | external IdP calls; retries must not duplicate |
| P2 | Own ZITADEL org per tenant, or one shared org? | **one org per tenant** | org is the isolation boundary we already rely on (`x-org-id`), and ZITADEL grants are org-scoped |
| P3 | Credential audit row scope for tenant eval accounts | **tenant org** | the change is to *that tenant's* access; the tenant should see it in its own audit |
| P4 | Slug uniqueness | **DB unique index (already exists on documents)** + directory unique | two sources of truth otherwise |
| P5 | Compensation on failure | **mark `failed`, keep what succeeded, allow resume** | deleting an IdP org is more dangerous than a stalled record |
| P6 | Platform console vs CLI | **both over one API**; CLI is a thin client | scripts today are CLI; the UI must not invent a second path |

### P2 — org per tenant, with no exceptions

A ZITADEL org per tenant is the right boundary, and **the demo tenant is not an exception**. Splitting the three
classes of org is the invariant this RFC adopts:

| Org | Holds | Must never hold |
|---|---|---|
| **instance / admin** | human admins, the backend machine key used by provisioning | tenant data, tenant users |
| **platform** | `release-operator`, `eval-runner`, `provisioner` | tenant data, tenant users |
| **tenant** (one per tenant, `yogastore` included) | that tenant's users, its `eval-runner-<org>`, its data | admins from another tenant, platform service accounts |

Two corrections to the earlier draft of this section:

1. **It is a project *grant*, not a per-tenant project role.** One shared project holds the roles; a tenant org needs
   a **project grant** of it (then role assignment inside the tenant org). Creating a project per tenant would give
   the appearance of isolation with none of the enforcement.
2. **The demo org is migrated, not grandfathered.** Its data is reproducible (`pnpm seed:demo:full`), so the correct
   move is to provision `yogastore` as a real tenant and re-seed — see §8. Keeping it in the admin org preserves the
   exact conflation this RFC exists to remove: the tenant that holds seeded content would still share an org with the
   identity that administers the instance.

Consequence: **every tenant, including the demo one, is created by the same operation** — which makes the demo tenant
the first acceptance test of the provisioning path rather than a special case outside it.

## 5. UI surface

Two distinct surfaces must not be confused:

### 5.1 Platform console (operator)

| Screen | Content | Actions |
|---|---|---|
| Tenant list | slug, status, provisioning state, plan, release, verdict, last activity | create |
| Create tenant | slug, name, plan/region, “run seed” checkbox | submit → 202 → progress |
| Provisioning detail | step list with status/errors, attempts | retry failed step, cancel |
| Tenant detail | pointer (current/previous), release history, verdict, audit trail link | promote, rollback, suspend, offboard |
| Credentials | service accounts + roles + last key rotation | rotate key, disable |

The create screen must never imply instant success: it returns immediately and shows steps completing.

### 5.2 Tenant admin (customer)

The customer sees only their own tenant: current release, audit history (`AUDIT_READ`), members and roles. It must
**not** show platform concepts (other tenants, waves, the directory). The only shared piece is the audit event shape.

### 5.3 What the UI must not do

- It must not call ZITADEL directly; every action goes through the API so it is guarded, idempotent and audited.
- It must not create a tenant through a document write (`tenant_settings`), which is the accident this RFC removes.
  The document write becomes a **step** of provisioning, not a public entry point.

## 6. Prior art — what we take from each

| System | Model | What we take |
|---|---|---|
| **ZITADEL** | `POST /v2/organizations` creates an org *and* its first admin, defaulting that user to `ORG_OWNER`; requires `org.create` ([docs](https://zitadel.com/docs/reference/api/org/zitadel.org.v2.OrganizationService.AddOrganization)) | creation is one API call with a required permission; the org is the isolation unit |
| **Keycloak** | Organizations with domains, members and invitations inside a realm; realms are the heavy-weight boundary ([server admin guide](https://www.keycloak.org/docs/latest/server_admin/index.html)) | organizations are a first-class, listable object with domains and membership — not a side effect of a config write |
| **Stripe Connect** | account creation returns immediately; onboarding progress is `requirements.currently_due`, re-checkable at any time | **do not model provisioning as a success/failure event — model it as a list of outstanding requirements** |
| **Grafana / Supabase / Vercel (teams)** | create org/project/team → async provisioning with a status; the console polls | 202 + status endpoint is the norm for anything touching identity or infrastructure |

The Stripe model is the one to copy for §3.2: our `steps` object *is* `requirements`, and “failed” becomes “these
steps are not done yet”.

## 7. Implementation phases

| Phase | Ships | Acceptance (observed) |
|---|---|---|
| **1. Record** | `tenant_provisioning` table + `POST /api/platform/tenants` writing a `pending` row and returning 202, `GET …/provisioning` | create returns 202; row visible; re-POST with the same idempotency key returns the same id |
| **2. Directory + org step** | step 1 directory row (`provisioning_state=in_progress`); step 2 ZITADEL org + **project grant** | tenant appears in `GET /api/platform/tenants` as `in_progress` and is **not** wave-eligible; the new org has the project granted |
| **3. Eval credential step** | step 3 creates `eval-runner-<org>` + key + `eval_reader` assignment **inside the tenant org** | key file exists; credential row in the **tenant's** audit stream; a user of tenant A signing in at tenant B's host is **refused**; `init:tenant-eval` becomes a wrapper |
| **4. Resume + retry** | `POST …/provisioning/retry` re-runs only failed steps | killing the worker mid-run leaves `failed`; retry completes without duplicate accounts or a second org |
| **5. Console** | platform tenant list + create + provisioning detail | an operator creates a tenant from the UI and watches steps finish |
| **6. Offboarding** | `POST …/offboard` → revoke credentials, mark `offboarding` | a wave skips it; credentials disabled in ZITADEL; audit rows for the revocations |

Phases 1–4 are backend; 5 is the console. Do not start 5 before 4 — a UI over a non-resumable operation teaches
operators to retry blindly.

**Phase 2 also runs the demo cutover** (§8), because `yogastore` must be created by this path. If the cutover cannot
run, the phase is not done — the “demo is special” exception is exactly what this RFC removes.

## 8. Data migration

**No grandfathering.** The demo tenant is cut over like any other, because its data is reproducible and because
leaving it in the admin org would preserve the org conflation this RFC removes.

### 8.1 Demo cutover (`yogastore`)

Why re-provision instead of rewriting `org_id` everywhere: the org id appears in four places that must agree —
`.env`, the `tenant_settings` documents, every `org_id`-keyed table, and object keys in R2
(`tenants/<org>/releases/…`). An in-place rewrite is a multi-table transaction plus an object-store rekey, against
data we can recreate in one command. Rewriting it would be more risk for less certainty.

| Step | Command / action | Must be true afterwards |
|---|---|---|
| 1 | provision `yogastore` through the new operation (phase 2) | new org id; directory row `ready`; project grant present |
| 2 | `pnpm seed:demo:full` against the new org | layouts, product, order evidence exist under the **new** org |
| 3 | update `.env`: `ZITADEL_DEMO_ORG_ID`; move the eval key to `zitadel_keys/tenants/<newOrg>/` | API boots; `GET /api/tenants/resolve/yogastore` returns the new org |
| 4 | delete the old org's rows (`documents`, `evidence_*`, `releases`, `tenant_*`) **or** keep them archived under the old id and never serve them | no row is served for the retired org id |
| 5 | deactivate the old ZITADEL org | its accounts cannot authenticate |
| 6 | browser + eval check | storefront, admin, editor render; `noname eval --tenant yogastore` passes |

Rollback: keep the old org id and its rows untouched until step 6 passes; reverting `.env` restores the previous
state exactly, since nothing was rewritten in place.

### 8.2 Other existing tenants

- Backfill `tenant_provisioning` as `ready` with `steps.directory=done` and `steps.eval_account=unknown` — no row is
  better than a lie.
- Any tenant whose credentials cannot be attributed retroactively stays `unknown`, and reconciliation reports it.

## 9. Risks

| Risk | Mitigation |
|---|---|
| A half-provisioned tenant looks promotable | eligibility requires `provisioning_state=ready` |
| IdP org creation succeeds, DB write fails | step order: DB row first, then IdP; resume re-runs the failed step only |
| Two operators create the same slug | unique index + idempotency key; second request joins the first |
| Worker dies mid-step | steps are recorded before/after each call, so the state says what ran |
| Console becomes a second control plane | console has no direct IdP access; every action is an API call |
| Credential rows land in the wrong org | P3 decision: tenant scope, asserted by test |

## 10. Open questions

1. ~~Org discovery at login~~ — **resolved, and already implemented.** Verified in code:

   ```
   POST /api/auth/:orgId/login
     → resolveRouteOrgId(tenantSettings, param)   ← slug or org id from the URL
     → oidcScope(orgId) → "urn:zitadel:iam:org:id:{orgId}"
   ```

   The org comes from the **tenant identity in the route**, not from an environment variable, and the scope is
   explicit. ZITADEL documents that scope as enforcing membership of that organization
   ([Scopes](https://zitadel.com/docs/apis/openidoauth/scopes)), so a user of another tenant is refused rather than
   silently signed into the wrong one.

   Consequence: **domain discovery stays disabled.** It is only the right tool for one shared login page serving many
   tenants — not our shape, where the tenant is already in the URL. `ZITADEL_DEMO_ORG_ID` remains a **seed/tooling**
   value; it is not part of the login path.

   Phase-3 acceptance therefore sharpens to: *signing in at tenant A's host with tenant B's user is refused.*
2. **Who owns the tenant’s first human admin?** Invitation flow vs created admin (ZITADEL creates `ORG_OWNER` by
   default) — this is a product decision about onboarding UX.
3. **Is seeding part of provisioning or a separate demo step?** Recommendation: a flag on the request (`seed: true`),
   never implicit, because it writes content that tenant-visible checks then verify.
4. **Delete vs offboard.** This RFC defines offboard only; hard delete needs a retention decision.
5. **Does the platform console live in the existing client app** (same SPA, different routes) **or its own app?**
   Recommendation: same app today (shared auth, one deploy), split only if the operator surface grows past a few
   screens.

## 11. What changes in existing docs once this is implemented

- `TENANT-DIRECTORY.md`: status gains `provisioning_state`; backfill becomes provisioning's step 1.
- `CREDENTIAL-LIFECYCLE-AUDIT.md`: tenant-scoped credential rows (P3) close the “reconciliation cannot see tenant
  accounts” limit.
- `IMPLEMENTATION-ROADMAP.md`: the “tenant catalog backfill” ops item is replaced by this operation.
