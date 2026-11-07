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

## 2. Requirements

1. A principal that is explicitly **not** a tenant admin: platform scope only.
2. Works for **machines** first (operator CLI / automation) and **humans** later (console).
3. Least privilege: platform-operator permission is separate from tenant `releases:write`.
4. Fail closed: if the platform org is not configured, platform routes are unavailable — never “allow all”.
5. Auditable per move (the pointer service already writes one Evidence row per org promotion).
6. Rotatable credentials, short TTL, no shared tenant secret.

## 3. Options

| Option | How it works | Pros | Cons |
|---|---|---|---|
| **A. Platform service token** | Mint `nsv.` token with `orgId = PLATFORM_ORG_ID` and `releases:platform_write`; operator CLI sends it; guard checks permission **and** org | Smallest; reuses `service-token.ts`, `MachineActor`, existing audit; no ZITADEL project changes; short TTL | No human SSO/UI; token handling is operational |
| **B. Platform org + role** | A dedicated ZITADEL org with project role `platform_operator`; humans log in there; permission expanded from that role; guard checks org **and** role | Human path, console-ready, ZITADEL-managed | Needs a new project role, init script migration, and the role key must not be grantable in tenant orgs; more moving parts |
| **C. Env allowlist** | `PLATFORM_OPERATOR_USER_IDS` / emails in env; guard compares | No new concepts | No rotation, no audit trail of who was allowed, easy to leak, not scalable |
| **D. Separate control-plane service** | Its own OIDC auth and API | Strong isolation | New deployable + auth surface for an operation that is a few hundred rows |

**Example (A).**

```
PLATFORM_ORG_ID=4000… (platform org, not a storefront tenant)
token = nsv.… { serviceId: "release-operator", orgId: PLATFORM_ORG_ID,
                permissions: ["releases:platform_write"], exp: +15m }

POST /api/releases/r_17/rollout
  { orgIds: ["org_a", "org_b"], dryRun: true }
→ guard: machine? permission present? token org == PLATFORM_ORG_ID? → yes
→ dry-run plan: 2 promotable, 0 blocked
```

## 4. Recommendation

**A now, B later.** The machine path unblocks waves without inventing a second auth system; B becomes worthwhile
when a human console for releases exists.

Guard shape:

```ts
requirePlatformOperator(c):
  actor = requireAuthenticatedActor(c)
  actor.permissions includes RELEASES_PLATFORM_WRITE
  AND actor.orgId (machine) / getOrgId(c) (human) === PLATFORM_ORG_ID
  else 403 (or 503 when PLATFORM_ORG_ID is unset — fail closed)
```

Why not `RELEASES_WRITE` + org check only: a tenant admin’s token is bound to its own org, so the org check would
already fail — but tying the capability to a **distinct permission** keeps the intent explicit and lets the
platform org hold only platform permissions.

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

## 6. Implementation plan

| Step | Change | Test |
|---|---|---|
| 1 | `PERMISSIONS.RELEASES_PLATFORM_WRITE = "releases:platform_write"` | permission typecheck |
| 2 | `PLATFORM_ORG_ID` env (`.env.example`, docs); operator mint script uses it | mint fails without env |
| 3 | `requirePlatformOperator(c)` in the release domain | tenant admin token → 403; wrong-org machine → 403; unset env → 503 |
| 4 | `POST /api/releases/:id/rollout` with `dryRun`, cap, per-org result | dry-run writes nothing; partial failure continues; non-ready 409 |
| 5 | `scripts/promote-wave.ts` (or `noname release wave`) using the token | e2e against two orgs |
| 6 | Evidence: per-org pointer rows + one wave summary | query Evidence |
| 7 | Docs + verification log | — |

**Not in this block:** human login to a platform org (B), a release console, queue-backed waves for >100 orgs.

## 7. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Platform token leakage | short TTL (≤15 min), separate secret, mint via script not committed, revoke by rotating `SERVICE_TOKEN_SECRET` |
| `PLATFORM_ORG_ID` spoofing | env is deploy-time; token org must equal it; no client-supplied value |
| Blast radius of a wave | dry-run default in CLI, explicit org list, batch cap, per-org audit |
| Tenant admin minting a platform token | mint script is an operator tool with the signing secret; same trust boundary as `WORKER_SERVER_SECRET` today |
| Human path later diverges | B reuses the same guard; only role expansion changes |

## 8. Acceptance

1. A tenant admin token calling the wave endpoint gets **403**.
2. A machine token with `releases:platform_write` but the wrong org gets **403**.
3. With `PLATFORM_ORG_ID` unset, the endpoint returns **503** (fail closed).
4. A valid platform token gets a **dry-run** plan with no pointer writes.
5. A real wave promotes the listed orgs, reports partial failures, and writes one Evidence row per org.
6. No endpoint accepts an implicit “all orgs”.

Until step 1–4 exist, **promotion waves stay deferred**; the single-tenant pointer (D1) remains the supported
operation.
