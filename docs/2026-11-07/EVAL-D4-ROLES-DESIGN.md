# D4 — Who runs eval, and whose roles are checked

> **Status:** adopted — **Phase 2 first** · **Date:** 2026-11-07 (America/Toronto)
> **Question this answers:** should eval authenticate as an admin, a service token, or something else — and
> which roles should the permission check evaluate?
> **Related:** [`PENDING-DECISIONS.md`](./PENDING-DECISIONS.md) D4 · [`EVAL-SERVICE-IMPLEMENTATION-PLAN.md`](./EVAL-SERVICE-IMPLEMENTATION-PLAN.md) E8 · [`VERIFICATION-LOG.md`](./VERIFICATION-LOG.md)

---

**Decision (2026-11-07): Phase 2 first.** The role check ships as an **error gated by an explicit `audience`** on
every capability-backed action. The warn-only advisory (Phase 1) is **not built**: a detector that cannot block
would let actions without an audience pass silently, which is a gate with a hole. The shared data layer —
service identity, per-role permission map, cache — is still required and is built first.

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

## 4. What `M2` evaluates — Phase 2, not advisory

Two things had to be decided; both are now settled.

### 4.1 Audience is mandatory

Every capability-backed action declares who it is for:

```ts
cancelOrder: {
  capability: "commerce.order.cancel",
  extension: "commerce",
  permission: "commerce:orders_manage",
  audience: ["admin", "editor"],
}
```

Rules:

- `audience` is **required** for every entry in `action-contracts.ts` (7 today).
- Every key must be a real `StaffRole` (`admin`, `editor`, …); free strings are rejected.
- A missing or unknown audience **fails contract validation at import** — it cannot become a runtime skip.
- Audience vocabulary is **role keys** (option A), not abstract actor classes. With 7 contracts and a fixed
  platform staff-role set this is proportionate; actor classes become worthwhile only if tenants get custom roles.

### 4.2 The context returns a role→permission map

Not a union. If the audience is `["editor"]`, the check must be able to say “editor lacks `orders_manage`” even
though admin has it:

```json
{
  "roles": {
    "admin": ["…"],
    "editor": ["content:write", "storefront:view"]
  },
  "permissions": ["…"]
}
```

### 4.3 Check semantics (error)

| Situation | Result |
|---|---|
| Role data unavailable (ZITADEL down, no project id) | **skip** — never pass |
| Tenant has **none** of the audience roles | **skip** — “not applicable: audience is admin, editor” |
| Tenant has an audience role, none of them holds the permission | **fail** — names the audience and the permission |
| At least one audience role holds the permission | **pass** |

The second row is a deliberate choice: a tenant that does not use a role is not failing, but the skip is explicit
and counts as `unverified`, not as success.

### What we do **not** do

- **Never evaluate the union of all roles** — admin is in every org, so it always passes.
- **Never create or grant roles** to make a check green. Eval reports; a human changes IAM.
- **Never borrow the admin’s token** as the subject.
- **Never treat “admin can do it” as “the page works”.**
- **Never let a missing `audience` pass** — that would reintroduce the advisory hole.

## 5. Code path (what changes, and why)

| File | Today | Change |
|---|---|---|
| `packages/catalog/src/action-contracts.ts` | 7 contracts, no audience | add mandatory `audience: StaffRole[]`; validate every key |
| `packages/server/src/domains/eval/api.ts` | context returns capabilities + extensions | add `roles: Record<role, permissions[]>` (plus a flat union for convenience) |
| `packages/server/src/domains/auth/adapters/zitadel/authorizations.ts` | `listProjectAuthorizations`, `teamRoleAssignments` exist | call for the org, paginate, map to role keys |
| `packages/auth/src/permissions.ts` | `expandPermissionsFromKeys` exists | reuse to expand each role |
| `packages/eval/src/checks/actions.ts` | `M2.permissions` checks declaration/wiring | add `M2.roles` (error; skips per §4.3) |
| `packages/cli/src/commands/eval.ts`, `domains/eval/job.ts` | `x-user-id = admin@…` | `x-user-id = eval-worker`, `x-role = service` |
| `packages/server/src/domains/eval/index.ts` | composition | pass a role reader into the eval domain |

**No migration.** This is read-only with a short in-memory cache. A projection table (`org_role_assignments`)
would be D4 option B and a separate decision.

## 6. Verification plan

| Check | Expected |
|---|---|
| Token scope | `nsv.` with `machines:read`; `/api/eval/context` succeeds; a write route returns 403 |
| No admin identity | Request headers show `x-user-id: eval-worker`, `x-role: service`; logs/Evidence name the service |
| Contract validation | an action without `audience`, or with an unknown role, fails at import |
| Role map | context contains `roles.editor` permissions, not just a union |
| `M2` pass | at least one audience role holds the permission |
| `M2` fail | tenant has an audience role, none holds the permission |
| `M2` skip — unavailable | roles unavailable → skip, never pass |
| `M2` skip — not applicable | tenant has none of the audience roles → skip, counted unverified |
| Live fixture | editor (no `orders_manage`) + `cancelOrder` → fail; admin in audience → pass |
| No mutation | eval makes no ZITADEL write call (token permissions + grep) |

## 7. What remains, and what this document is not

**Remaining implementation:** the 7 audiences, the role map, the check, the service headers, and the live
fixture above. Until those exist, this is an adopted design, not a solved issue.

**This is not a new/duplicate decision document.** D4 already exists in
[`PENDING-DECISIONS.md`](./PENDING-DECISIONS.md); this note is its design rationale and **supersedes the earlier
Phase 1-first ordering**. The release docs (`RELEASE-D1…D16`) are untouched — they solve the pointer and
promotion, not role coverage.
