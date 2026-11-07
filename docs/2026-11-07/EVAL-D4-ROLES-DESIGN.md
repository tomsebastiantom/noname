# D4 — Who runs eval, and whose roles are checked

> **Status:** proposal · **Date:** 2026-11-07 (America/Toronto)
> **Question this answers:** should eval authenticate as an admin, a service token, or something else — and
> which roles should the permission check evaluate?
> **Related:** [`PENDING-DECISIONS.md`](./PENDING-DECISIONS.md) D4 · [`EVAL-SERVICE-IMPLEMENTATION-PLAN.md`](./EVAL-SERVICE-IMPLEMENTATION-PLAN.md) E8 · [`VERIFICATION-LOG.md`](./VERIFICATION-LOG.md)

---

## 1. The confusion in one sentence

There are **three identities** in an eval run, and today two of them are conflated:

| Identity | What it proves | Today |
|---|---|---|
| **Transport** | the request came through the edge for org X | `x-org-id` + HMAC (`x-auth-hmac`) |
| **Caller** | which principal is asking (and what it may read) | service token `nsv.…` — *but also* `x-user-id = admin@…` |
| **Subject** | whose permissions are being checked | **missing** — `M2` checks the capability declaration, not tenant roles |

The bug in the current wiring is that the CLI and the worker send `x-user-id` set to the **admin email**
([`cli/src/commands/eval.ts`](../../packages/cli/src/commands/eval.ts), [`domains/eval/job.ts`](../../packages/server/src/domains/eval/job.ts)).
The caller is already a service token; the admin header is a leftover that makes the run *look* like a human
admin and invites the wrong conclusion (“admin passed, so it works”).

## 2. Proposal

```
transport (edge HMAC)      x-org-id: <org>
                           x-user-id: eval-worker        ← service identity, not a human
                           x-role:    service            ← not "admin"
                           x-auth-hmac: <edge signature>

caller (service token)     Authorization: Bearer nsv.<…>   serviceId=eval-worker, org=<org>,
                                                           permissions=[machines:read, …], exp=10 min

subject (tenant roles)     read by the server from ZITADEL via its own management credentials
```

Rules:

1. **The runner is a service token, never an admin session.** Eval must work unattended (CI, cron, queue worker,
   agent tool) with no human JWT available.
2. **`x-user-id` is the service id, not a person.** Set it to `eval-worker` and `x-role` to `service`. The HMAC is
   still required by `orgMiddleware` ([`org.ts:62-68`](../../packages/server/src/shared/org.ts#L62-L68)); it is a
   transport attestation, not a login.
3. **The service token is read-only and org-scoped.** `MACHINES_READ` (plus any read permission a route truly
   needs), short TTL, one service id. It never carries `MACHINES_DEFINE`, `RELEASES_WRITE`, or an admin scope.
4. **The server, not eval, talks to ZITADEL.** Role data is fetched by the server’s auth adapter
   (`listProjectAuthorizations`) using the server’s credentials. Eval never receives ZITADEL admin credentials;
   it only calls `/api/eval/context`.
5. **The subject is tenant roles, not the caller.** The token proves “eval may read”; the role list answers
   “can the tenant’s people use this action?”. They must never be the same input.

## 3. Why a service token and not an admin

| Reason | Consequence if we use an admin |
|---|---|
| **Least privilege** | An admin JWT can write everything; a bug in eval becomes a write risk. The machine is read-only |
| **Unattended operation** | No human session exists in a cron/CI/agent run; an admin token would have to be minted from a person’s credentials |
| **Auditability** | Evidence/logs should say `eval-worker`, not “Tom did it”. A machine actor makes “who ran this?” answerable ([`service-token.ts`](../../packages/server/src/shared/service-token.ts)) |
| **Per-org scope** | The token carries `orgId`; an admin session is broader |
| **Expiry/rotation** | `exp` is part of the signed claims; a leaked token dies quickly |
| **The admin trap** | `ROLE_PERMISSIONS.admin = ALL_PERMISSIONS`, so using admin *as the subject* would always pass. Keeping the caller machine-scoped makes the separation explicit |

What the service token is **not** for: it is not a ZITADEL admin credential and it is not a way to bypass the
permission check. It authorises *reading eval context*; the role check compares against tenant roles.

## 4. What `M2` should evaluate (semantics)

Two phases; the first cannot block, the second can.

### Phase 1 — advisory (warn)

- `/api/eval/context` returns `roles` for the org.
- `expandPermissionsFromKeys(roles)` → permissions.
- For each capability-backed action:
  - permission held by a **non-admin** role → pass
  - held **only by admin** → **warn**: “admin-only: `cancelOrder` needs `orders:write`; no staff role grants it”
  - roles unavailable → **skip** (never pass)

No new roles, no catalog change, no migration. It turns an invisible risk into a visible warning.

### Phase 2 — explicit audience (error)

The action contract declares who the action is for:

```ts
cancelOrder: {
  capability: "commerce.order.cancel",
  permission: "orders:write",
  audience: ["editor", "admin"],
}
```

`M2` fails when none of the declared roles holds the permission. This is honest because a human declared the
intent; eval is no longer guessing.

### What we do **not** do

- **Never evaluate the union of all roles** — admin is in every org, so it always passes.
- **Never create or grant roles** to make a check green. Eval reports; a human changes IAM.
- **Never borrow the admin’s token** as the subject.
- **Never treat “admin can do it” as “the page works”.**

## 5. Code path (what changes, and why)

| File | Today | Change |
|---|---|---|
| `packages/server/src/domains/eval/api.ts` | context returns capabilities + extensions | add `roles` (role keys) for the org |
| `packages/server/src/domains/auth/adapters/zitadel/authorizations.ts` | `listProjectAuthorizations`, `teamRoleAssignments` exist | call for the org; map to role keys |
| `packages/auth/src/permissions.ts` | `expandPermissionsFromKeys` exists | reuse to expand roles |
| `packages/eval/src/checks/actions.ts` | `M2.permissions` checks declaration/wiring | add `M2.roles` (warn phase 1; error when `audience` is declared) |
| `packages/cli/src/commands/eval.ts`, `domains/eval/job.ts` | `x-user-id = admin@…` | `x-user-id = eval-worker`, `x-role = service` |
| `packages/server/src/domains/eval/index.ts` | composition | pass a role reader into the eval domain |

**No migration.** Phase 1 is read-only with a short in-memory cache. A projection table
(`org_role_assignments`) would be D4 option B and a separate decision.

## 6. Verification plan

| Check | Expected |
|---|---|
| Token scope | `nsv.` with `machines:read`; calling `/api/eval/context` succeeds; a write route returns 403 |
| No admin identity | Request headers show `x-user-id: eval-worker`, `x-role: service`; logs/Evidence name the service, not a person |
| Roles in context | context response contains the org’s role keys |
| `M2` pass | permission held by a non-admin role → pass |
| `M2` warn | permission held only by admin → warn, does not block |
| `M2` skip | roles unavailable → skip, never pass |
| Phase 2 | contract with `audience: ["editor"]` and no editor role holding the permission → fail |
| No mutation | eval makes no ZITADEL write call (grep + token permissions) |

## 7. Open choice for the product owner

Phase 1 needs one decision: **is “admin-only” a warning or a failure for you?** The proposal is warning, because
a one-person shop is a legitimate setup. Phase 2 (explicit audience) is where it becomes a failure, and that
requires the catalog contract change.

Until that choice is made, the safe implementation is: **service-token runner + roles in context + advisory
`M2.roles`**. It removes the admin-identity confusion immediately and adds no false blocks.
