# Platform operator identity — prerequisite for promotion waves

> **Status:** proposed design / decision input · **Date:** 2026-11-07 (America/Toronto)
> **Problem:** D1 can move one tenant at a time. A **wave** moves many orgs in one operation, which requires an
> identity that is allowed to act **across orgs**. Today no such identity exists.
> **Related:** [`PENDING-DECISIONS.md`](./PENDING-DECISIONS.md) D17 · [`RELEASE-D1-DESIGN.md`](./RELEASE-D1-DESIGN.md) · [`RELEASE-D15-DESIGN.md`](./RELEASE-D15-DESIGN.md)

---

## 1. Why the current model cannot do waves

The authorization model is **org-scoped by construction**:

| Layer | Current rule |
|---|---|
| Edge → API | `x-org-id` + HMAC; every request belongs to one org |
| Human | permissions expanded from ZITADEL roles **for that org**; `admin` holds all permissions in its own org |
| Machine | `nsv.` token carries `orgId`; guards reject when `claims.orgId !== x-org-id` (`guards.ts`) |
| Release API | `denyUnless(RELEASES_WRITE)` — true for **every org admin** |

So a wave endpoint that accepts `{ orgIds: [...] }` and authorizes with `RELEASES_WRITE` would let **any tenant
admin promote releases for every other tenant**. That is a cross-tenant escalation, not a missing feature.

## 1a. Current auth state, verified against code (2026-11-07)

D17 is **design only** — no platform permission, guard, env var or wave endpoint exists yet.

| Layer | Current reality | Consequence for waves |
|---|---|---|
| Edge → API | `x-org-id` + HMAC (`orgMiddleware`) | every request is bound to one org |
| Human | ZITADEL roles expanded to permissions for the request org; `admin` = all permissions in **its own** org | a tenant admin cannot be distinguished from a platform admin by permission alone |
| Machine | `nsv.` token carries `orgId`; guards reject when `claims.orgId !== x-org-id` (`guards.ts`) | a machine token is single-org |
| Roles | `PLATFORM_ROLES` are tenant roles; `admin: ALL_PERMISSIONS` | adding a platform permission naively would give it to every tenant admin |
| Docs | `ACCESS-AND-ROLES.md`, `ROLES-AND-SCOPE-v2.md` define org-scoped roles only; there is no instance-level admin concept in the app | the concept must be introduced, not extended |

**The subtle trap:** `ROLE_PERMISSIONS.admin = ALL_PERMISSIONS`, where `ALL_PERMISSIONS = Object.values(PERMISSIONS)`.
If `releases:platform_write` is added to `PERMISSIONS`, **every tenant admin receives it**. The guard's
`org === PLATFORM_ORG_ID` check would still deny them, but correctness must not depend on that alone. The
implementation must keep platform-only permissions **out of role expansion**:

```ts
const PLATFORM_ONLY = new Set([PERMISSIONS.RELEASES_PLATFORM_WRITE]);
const TENANT_PERMISSIONS = Object.values(PERMISSIONS).filter((p) => !PLATFORM_ONLY.has(p));
// admin: TENANT_PERMISSIONS — never ALL_PERMISSIONS
```

Only a service token (minted by an operator with the signing secret) carries `releases:platform_write`. That
makes the boundary explicit at the permission layer, not just at the org check.

## 2. Requirements

1. A principal that is explicitly **not** a tenant admin: platform scope only.
2. Works for **machines** first (operator CLI / automation) and **humans** later (console).
3. Least privilege: platform-operator permission is separate from tenant `releases:write`.
4. Fail closed: if the platform org is not configured, platform routes are unavailable — never “allow all”.
5. Auditable per move (the pointer service already writes one Evidence row per org promotion).
6. Rotatable credentials, short TTL, no shared tenant secret.

## 2a. Role lifecycle — where roles are created, assigned, and used

“Roles” exist at three layers. Confusing them is why this feels circular.

| Layer | Where it lives | Created by | Example |
|---|---|---|---|
| **Role definition** | ZITADEL project roles (`roleKey`) | `scripts/init/zitadel-oidc.ts` → `AddProjectRole` (idempotent) | `admin`, `editor`, `customer` |
| **Role meaning** | code map `ROLE_PERMISSIONS` in `packages/auth/src/permissions.ts` | developers, deployed | `admin` → all tenant permissions |
| **Role assignment** | ZITADEL authorization (user + org + roleKeys) | ZITADEL console/API, admin action | user A gets `admin` in org Y |
| **Effective role at request time** | JWT claim `urn:zitadel:iam:org:project:<projectId>:roles` | ZITADEL on login | `{ admin: { orgY: "Yoga" } }` |
| **Permission check** | `rolesFromTokenPayload` → `expandPermissionsFromKeys` → `denyUnless` | server, per request | `releases:write` present |

**Postgres never stores user→role.** That is a decided rule (`TEAM-ROLES-ZITADEL.md`): role assignment is
ZITADEL-only; the JWT is the runtime source.

### Example — a tenant admin today

1. `init:zitadel` created the project roles (`admin`, …) once.
2. An admin assigned `admin` to `tom@yoga` in org *Yoga*.
3. Tom logs in through ZITADEL; the JWT carries `admin` for project `noname-dev`.
4. The API expands `admin` to tenant permissions, including `releases:write`.
5. `POST /api/releases/:id/promote` passes `denyUnless(RELEASES_WRITE)` — for **Yoga only**, because the token and
   edge org are Yoga.

### Example — the platform operator (B)

1. `init:zitadel` creates the dedicated platform org, the `platform_operator` project role, and a service account;
   the public key is registered in ZITADEL, the private key goes to the operator’s secret manager.
2. The operator CLI signs a short JWT assertion with that private key and exchanges it at the ZITADEL token
   endpoint for an access token (`aud`, `jti`, 15 min).
3. The API verifies the token through the existing JWKS path, checks `PLATFORM_ORG_ID`, and checks that
   `platform_operator` grants `releases:platform_*`.
4. A human operator later logs into the same platform org; the same role and guard apply.

There is **no `nsv.` platform token**. `nsv.` remains the eval service credential.

### Where audit attaches

- Role/service-account **creation, assignment, key rotation** happens in ZITADEL — mirror its admin audit.
- A **promotion** is an app action — audit phase A (structured `evidence.audit`).

## 3. Chosen: B — platform org + service account (private-key JWT)

A dedicated ZITADEL **platform org** with a project role `platform_operator`, assigned to a **service account**
that authenticates with **private-key JWT** (RFC 7523). The service account receives a short-lived access token
with `aud`/`jti`; the API verifies it through the existing JWKS path and checks the platform org + permission.

**Rejected (not implemented):**

- **Rejected: a custom `nsv.` platform credential** — a shared minting secret can mint any permission, with no
  revocation; `nsv.` stays scoped to the eval service.
- **C. env allowlist** — no rotation, no auditable provisioning.
- **D. separate control-plane service** — a new deployable/auth surface for a few hundred rows.

**Example.**

```
PLATFORM_ORG_ID=4000… (dedicated platform org, never a storefront tenant)
service account: release-operator
role:            platform_operator → releases:platform_read, releases:platform_write
key:             private key in the secret manager (public key registered in ZITADEL)

operator CLI → signs JWT assertion → ZITADEL token endpoint → access token (15 min, aud)

POST /api/releases/r_17/rollout
  { orgIds: ["org_a", "org_b"], dryRun: true }
→ guard: JWKS valid? org == PLATFORM_ORG_ID? role grants permission? → yes
→ dry-run plan: 2 promotable, 0 blocked
```

## 3a. Prior art — how established projects model platform operators

| Project | Tenant scope | Platform scope | Lesson for us |
|---|---|---|---|
| **ZITADEL** | `ORG_OWNER` manages one organization | `IAM_OWNER` manages the whole **instance**, including all organizations; only instance admins can see across orgs ([administrators](https://zitadel.com/docs/guides/manage/console/administrators)) | platform authority is a **different level**, not a stronger tenant role |
| **Kubernetes** | `Role` + `RoleBinding` inside a namespace | `ClusterRole` + `ClusterRoleBinding` at cluster scope; `cluster-admin` is cluster-scoped ([RBAC](https://kubernetes.io/docs/reference/access-authn-authz/rbac/)) | scope is part of the grant; a namespaced admin never becomes cluster admin implicitly |
| **Cloudflare** | domain-scoped roles apply to one zone | account-scoped roles apply across the account; “Super Administrator” is account-wide ([roles](https://developers.cloudflare.com/fundamentals/manage-members/roles/)) | separate role **scopes**, explicit names per scope |
| **Keycloak** | realm roles | master-realm global roles administer realms ([server admin](https://www.keycloak.org/docs/latest/server_admin/)) | an administrative realm/scope above tenants is a normal pattern |
| **GitHub** | organization owner | enterprise owner above organizations ([roles](https://docs.github.com/en/enterprise-server@3.22/admin/managing-accounts-and-repositories/managing-roles-in-your-enterprise/identify-role-requirements)) | two-level ownership, with enterprise-level audit |
| **Azure (SaaS)** | data plane per tenant | control plane (tenant catalog + lifecycle processes); start manual/scripted, automate later; operator access is broad and must be segmented and audited ([control planes](https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/approaches/control-planes)) | build the control plane explicitly; broad operator access is the risk to manage |

**What they agree on:** platform authority is a **separate scope**, never a tenant role with a wider loop; it is
granted explicitly, audited as its own class of action, and the tenant path stays unchanged.

## 4. Recommendation

**B, machine-first.** A dedicated platform org with a `platform_operator` role and a **service account**
authenticated by **private-key JWT** (RFC 7523). It gives an audienced, revocable, IdP-issued token and reuses the
existing JWKS verification. There is **no second platform credential**: `nsv.` is eval-only and is not extended.

Guard shape:

```ts
requirePlatformOperator(c):
  actor = requireAuthenticatedActor(c)          // JWKS-verified service account token
  actor.permissions includes RELEASES_PLATFORM_WRITE
  AND getOrgId(c) === PLATFORM_ORG_ID
  else 403 (or 503 when PLATFORM_ORG_ID is unset — fail closed)
```

Why not `RELEASES_WRITE` + org check only: a tenant admin’s token is bound to its own org, so the org check would
already fail — but tying the capability to a **distinct permission** keeps the intent explicit and lets the
platform org hold only platform permissions.

## 4a. One authenticator per actor — service account for the operator

The platform has exactly one platform-operator credential: a **ZITADEL service account** in the platform org,
authenticated with **private-key JWT**. There is no second platform credential.

| Actor | Credential | Scope | Audit actor |
|---|---|---|---|
| **automation** (CLI, CI, wave job) | ZITADEL service account, private-key JWT → short-lived access token | platform org + `releases:platform_*` | `service:<service-account-id>` |
| **human** (console later) | ZITADEL login in the platform org + `platform_operator` role | platform org | `user:<id>` |
| **never** | ZITADEL `IAM_OWNER` | instance-wide IdP admin | — |

**Why a service account, not `nsv.`:** the token is audienced, revocable, and issued by the IdP; the private key
stays with the operator and the public key with ZITADEL. The custom `nsv.` token remains scoped to the existing
eval service and is **not** extended to platform waves.

**Why not `IAM_OWNER`:** it can manage the whole instance — organizations, users, IdP settings. Release waves need
one app permission over a named org list. Using the IdP superuser would violate least privilege, exceed what the
app can scope or audit, and make an app bug an instance compromise.

### How serious platforms split it

| Platform | Automation | Human |
|---|---|---|
| **AWS** | IAM **roles** with temporary credentials, assumable by services ([IAM roles](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles.html)) | IAM Identity Center / federated users |
| **Kubernetes** | **ServiceAccounts** for workloads ([docs](https://kubernetes.io/docs/concepts/security/service-accounts/)) | user identities / OIDC, bound via RBAC |
| **GitHub** | **GitHub Apps** with installation tokens ([docs](https://docs.github.com/en/apps/overview)) | user accounts, audit log records the actor |
| **Cloudflare** | **API tokens** scoped to permissions | members with account/zone roles |
| **ZITADEL** | service users | human users; `IAM_OWNER` vs `ORG_OWNER` |

### SOC 2 mapping

| Criterion | How this design satisfies it |
|---|---|
| **CC6.1** least privilege | separate platform permission, excluded from tenant roles; no IdP superuser |
| **CC6.2** provisioning | token issuance/revocation audited; ZITADEL role assignment for humans |
| **CC6.3** role changes | audit of grants/revokes; token lifecycle events |
| **CC7.2** monitoring | distinct `actorType` (`service` vs `user`), requestId/traceId |
| **CC7.3/7.4** investigation | per-org audit rows + platform stream; export |
| **Non-repudiation** | human actions use the human identity; automation actions are labelled as service, never a borrowed user token |

### Authorization is unchanged

**Authentication** differs — a service account token for automation, a login token for a human. **Authorization**
does not: both resolve to the same `PERMISSIONS` catalog and the same guards. There is no second permission
vocabulary and no second platform credential.

This mirrors how AWS separates IAM roles (workload) from IAM Identity Center users (people), and Kubernetes
separates ServiceAccounts from user identities: two authenticators, one authorization model.

### Agents, services and humans — one authorization, scoped authenticators

| Actor | Credential | Scope | Status |
|---|---|---|---|
| **human** | ZITADEL OIDC JWT | its org | existing |
| **platform operator** | ZITADEL **service account**, private-key JWT → access token | platform org + `releases:platform_*` | **chosen** |
| **eval service** | `nsv.` HMAC token | one org, `machines:read` | existing, **eval only** |
| **agent** | `nag.` HMAC token | one org, `onBehalfOf`, permissions ∩ creator | existing, converges later |

All resolve to the **same `PERMISSIONS` catalog** and the same guards. `nsv.` is not extended to platform waves and
there is no second platform credential.

**Agents** stay on `nag.` for now: it carries the delegation (`onBehalfOf`) and an explicit permission ceiling. If
agents become third-party, move to OAuth 2.0 **client credentials** (RFC 6749 §4.4) or **token exchange**
(RFC 8693) — the standard form of the same semantics.

**Audit consequence:** actor types stay distinct (`user` / `agent` / `service`), so the audit row says whether a
human, an agent, or a service acted; agent actions carry `onBehalfOf`.

### Crypto — chosen path

| Actor | Algorithm | Key | Verification |
|---|---|---|---|
| human | JWT (RS256, ZITADEL) | ZITADEL private key; public JWKS | WebCrypto + JWKS |
| **platform operator** | **private-key JWT assertion → ZITADEL access token (RS256, `aud`, `jti`, expiry)** | service-account **private key** in a secret manager; public key at ZITADEL | **JWKS (existing path)** |
| eval service (`nsv.`) | HMAC-SHA256 | `SERVICE_TOKEN_SECRET` | same secret (eval only) |
| agent (`nag.`) | HMAC-SHA256 | `AGENT_TOKEN_SECRET` | same secret (agent only) |

The platform operator uses **no custom crypto and no shared signing secret**. The private key stays with the
operator; the API verifies an IdP-issued token through the same JWKS path as a human token.

`nsv.` and `nag.` remain technical debt with a limited blast radius: `nsv.` is scoped to the eval service,
`nag.` to agents. Neither is extended to platform waves.

**Key custody:** the service-account private key lives in a secret manager, rotated on a schedule with a two-key
overlap; the eval and agent secrets remain separate so one leak cannot grant the others.

### Migration — what is ported, what is not

| Existing thing | Action |
|---|---|
| tenant roles (`admin`, `editor`, …) and assignments | **unchanged**, not ported; ZITADEL remains their source |
| `nsv.` eval service token | **unchanged**, eval only; no platform use, no migration |
| `nag.` agent tokens | **unchanged** for now; converge to OAuth2/token exchange later |
| `admin`/other project roles | **unchanged**; init must stay idempotent and must not delete them |
| new `platform_operator` role | **net-new**; created in the platform org and assigned only to the service account |
| old platform token/role, if one exists anywhere | **retire**, do not run both; there is no dual path |

**No two mechanisms for the same action.** Platform release operations have exactly one credential: the service
account. The role is added, never replacing tenant roles; nothing is backfilled into Postgres.

## 5. Wave endpoint (once the identity exists)

```
POST /api/releases/:id/rollout
  body: { orgIds: string[], dryRun?: boolean, batchSize?: number }
```

Rules:

1. Release must be `ready` and pass the D16 migration gate (already enforced by pointer promote).
2. `dryRun` performs no writes; it returns per-org eligibility.
3. `orgIds` is capped (e.g. 100); larger waves go through the queue in batches.
4. Each org is independent: a failure is recorded and the wave continues (partial success is explicit).
5. One Evidence row per org promotion (pointer service already does this); the wave itself records a summary.
6. The wave never accepts `orgIds: ["*"]` — an explicit list only; “all tenants” is a separate, reviewed action.

## 5a. Wave eligibility — what a rollout actually selects

A wave does **not** mean “any tenant”. It is an explicit list, filtered by eligibility, with a per-org result.

### Inputs

- `orgIds: string[]` — explicit, capped (e.g. 100);
- or, later, a **filter over the tenant catalog** (plan, region, created-before) that is materialised into an
  explicit list **before** review. No wildcard ever reaches the promote loop.

### Per-org criteria

| # | Criterion | If it fails |
|---|---|---|
| 1 | org exists as a tenant (`tenant_settings` document) | `skipped: unknown_tenant` |
| 2 | org is **not** `PLATFORM_ORG_ID` | request rejected (400) |
| 3 | tenant is active (not suspended/offboarding) | `skipped: inactive` — **status does not exist yet** |
| 4 | release state is `ready` | whole request 409 (release-level) |
| 5 | migration set is promotable (D16) | whole request 409 |
| 6 | pointer is not already at the target release | `skipped: already_on_release` (idempotent) |
| 7 | no policy exclusion (maintenance, legal hold, enterprise opt-out) | `skipped: excluded` — **not modelled yet** |
| 8 | optional: gate verdict for **this tenant + release** is `pass` (or acknowledged unverified) | `skipped: no_verdict` — **no per-tenant verdict lookup yet** |

### Result

```json
{
  "releaseId": "r_17",
  "dryRun": true,
  "results": [
    { "orgId": "yoga", "status": "eligible" },
    { "orgId": "cafe", "status": "skipped", "reason": "no_verdict" },
    { "orgId": "corp", "status": "skipped", "reason": "inactive" }
  ]
}
```

A real wave returns `promoted | failed | skipped` per org, and **continues** after a per-org failure. One Evidence
row per promoted org; one summary row for the wave.

### What is missing to run this correctly

| Missing piece | Why it matters |
|---|---|
| **Tenant catalog / list** | today `tenant_settings` is fetched by org; there is no list-all with status |
| **Tenant lifecycle status** | active/suspended/offboarding is not modelled, so criterion 3 cannot be checked |
| **Per-tenant gate verdict** | eval runs exist per tenant, but there is no lookup “verdict for release r_17 + org X” |
| **Exclusion/opt-out metadata** | enterprise contracts, legal hold, maintenance windows |
| **Platform-org marker** | `PLATFORM_ORG_ID` env is enough for v1, but not a catalog concept |

**Conclusion:** the wave endpoint can be built with criteria 1, 2, 4, 5, 6 now; criteria 3, 7, 8 need the
tenant catalog/status and a verdict lookup first. “All tenants” is a materialised, reviewed list — never `"*"`.

## 5b. Access scope — what the operator can and cannot do

**The token is org-bound to the platform org.** That single fact limits it:

| Route class | Behaviour with the service-account token |
|---|---|
| normal tenant route (`/api/tenants/:other/...`, documents, orders, roles) | **403** — edge/blog `x-org-id` is the tenant, token org is platform; they must match |
| platform route (`/api/releases/:id/rollout`, platform audit, tenant catalog) | allowed, because the guard checks **platform permission + platform org** and the body names explicit `orgIds` |
| arbitrary cross-tenant read | **not exposed** — there is no “read any tenant” endpoint for the operator |

So “can access all tenants” means **can perform the release operations it is given, for the orgs it names** — not
“can browse every tenant’s data”. Anything broader would be a separate, reviewed endpoint.

### Who runs it

| Runner | Credential | Use |
|---|---|---|
| **Release manager** (human operator) | service-account private key from a secret manager → short-lived ZITADEL access token | interactive wave: dry-run, review, execute |
| **CI/CD pipeline** | same service account, separate key/secret, restricted environment | scheduled/automated wave with an approval gate |
| **Console (later)** | human login in the platform org + `platform_operator` role | product UI |

The tenant admin never has this credential; the operator never borrows a tenant token.

### Workflow

```
1. build      CI creates the release record (D14)
2. verify     eval gate runs; verdict attached to the release
3. select     operator reads the tenant catalog; names orgIds
4. dry-run    POST /rollout { dryRun: true } → eligible / skipped per org
5. approve    human or pipeline approval (recorded)
6. execute    POST /rollout → per-org promote + one audit row per org
7. observe    platform audit + metrics
8. rollback   pointer/selector back; audit row
```

### Enforcement summary

- token org must equal `PLATFORM_ORG_ID`;
- permission must be `releases:platform_write`;
- org list is explicit, capped, never `"*"`;
- release must be `ready` and pass the migration gate;
- every move audited per tenant;
- token revocation = disable the service account / rotate the key.

## 6. Implementation plan

| Step | Change | Test |
|---|---|---|
| 1 | `PERMISSIONS.RELEASES_PLATFORM_WRITE = "releases:platform_write"` | permission typecheck |
| 2 | `PLATFORM_ORG_ID` env; init creates the platform org, `platform_operator` role, service account, and private key | init idempotent; role exists; no duplicate |
| 3 | `requirePlatformOperator(c)` in the release domain | tenant admin token → 403; wrong-org token → 403; unset env → 503 |
| 4 | `POST /api/releases/:id/rollout` with `dryRun`, cap, per-org result | dry-run writes nothing; partial failure continues; non-ready 409 |
| 5 | `scripts/promote-wave.ts` (or `noname release wave`) using the service-account token | e2e against two orgs |
| 6 | Audit: per-org rows + one wave summary | query audit |
| 7 | Docs + verification log | — |

**Not in this block:** human console (later), queue-backed waves for >100 orgs.

## 6a. Rollout plan — no tenant-visible change until phase 2

The whole feature is **additive**. No table changes, no tenant-route changes, no permission removed. Each phase
is independently reversible.

| Phase | Ships | Tenant-visible? | Backout |
|---|---|---|---|
| **0. Dormant** | `RELEASES_PLATFORM_*` permission keys, `PLATFORM_ONLY` exclusion, `PLATFORM_ORG_ID`, platform org + role + service account + key | No — no route uses them | unset env; disable service account |
| **1. Read-only** | `requirePlatformOperator` guard + `POST /rollout` with `dryRun` forced; returns plan, writes nothing | No — tenant admin gets 403 | unset env → 503; disable service account → 401 |
| **2. Single-org write** | real write path, explicitly limited to a test org; audit per org | Only for the named org | pointer rollback (D1) + disable service account |
| **3. Operator CLI + batch** | `promote-wave` script, batch cap, partial-failure report | Only listed orgs | disable service account; stop CLI |
| **4. Human/console (later)** | human login in the platform org with the same role + UI | No tenant change | disable role |

**Safety rules during rollout**

1. `PLATFORM_ORG_ID` must be a dedicated org that is **not** a storefront tenant; unset means platform routes are
   unavailable (`503`), never “allow all”.
2. Tenant admins must **not** receive `releases:platform_*` through `ALL_PERMISSIONS`; the permission-expansion
   test is part of phase 0/1 acceptance.
3. Phase 2 promotes exactly one org that the operator names; no wildcard, no “all tenants”.
4. Disabling the service account (or rotating its key) is the emergency stop; the pointer/selector state is
   untouched.
5. Every move is audited per org; the wave summary is audited once.

**Audit is a precondition, not a follow-up.** The tenant must be able to see who moved it, from which release, and
why; the platform stream must be queryable across orgs and exported for SOC 2. That design is in
[`AUDIT-LOGGING-DESIGN.md`](./AUDIT-LOGGING-DESIGN.md) — phases A–C ship before writes are enabled for more than
one org.

**What we will not do**

- reuse ZITADEL `IAM_OWNER` as the app operator (IdP superuser is not an app capability, and it is not in our
  token permission model);
- let the client send `PLATFORM_ORG_ID`;
- add a tenant route that performs cross-org work;
- ship the write path before the read-only path has been exercised.

## 7. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Service-account private-key leakage | private key in a secret manager, rotated with overlap, service account disabled on suspicion; no shared signing secret |
| `PLATFORM_ORG_ID` spoofing | env is deploy-time; token org must equal it; no client-supplied value |
| Blast radius of a wave | dry-run default in CLI, explicit org list, batch cap, per-org audit |
| Tenant admin obtaining the role | `platform_operator` exists only in the platform org; tenant admins cannot be assigned it; no key material in tenant space |
| Human path later diverges | the human logs into the same platform org; same role and guard |

## 8. Acceptance

1. A tenant admin token calling the wave endpoint gets **403**.
2. A service-account token for the wrong org gets **403**.
3. With `PLATFORM_ORG_ID` unset, the endpoint returns **503** (fail closed).
4. A valid service-account token gets a **dry-run** plan with no pointer writes.
5. A real wave promotes the listed orgs, reports partial failures, and writes one audit row per org.
6. No endpoint accepts an implicit “all orgs”.
7. `ROLE_PERMISSIONS.admin` does **not** include `releases:platform_write` (permission-expansion test).
8. Phase 1 (read-only) can be exercised with the write path disabled.

Until step 1–4 exist, **promotion waves stay deferred**; the single-tenant pointer (D1) remains the supported
operation.
