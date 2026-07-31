# Team Roles & Permissions — ZITADEL first, Postgres only for gaps

> **Date:** 2026-07-25  
> **Status:** **Decided** — **no team roles or user permissions in Postgres**  
> **Related:** [`VISUAL-EDITOR-PLAN.md`](./VISUAL-EDITOR-PLAN.md) · [`PERMISSIONS-REBAC.md`](./PERMISSIONS-REBAC.md) (Zanzibar-style doc ACL + op log) · [`AUTH-IDENTITY.md`](./AUTH-IDENTITY.md) · [`ORG-AUTH-CONFIG.md`](./ORG-AUTH-CONFIG.md)

---

## Rule (non-negotiable)

```
Team roles + user permissions  →  ZITADEL only
Postgres                       →  only what ZITADEL cannot do
```

| | ZITADEL | Postgres |
|--|---------|----------|
| Who is on the team | ✅ | ❌ |
| User → `admin` / `editor` / `customer` | ✅ Role Assignment | ❌ **never** `teamRoles` |
| Roles in JWT | ✅ | ❌ |
| Invite / change role | ✅ API | ❌ |
| Which CMS **field** editors may write | ❌ (no concept) | ✅ content-type schema |
| Google on/off, MFA policy flag | ❌ (store config) | ✅ `tenant_settings.auth` |
| Layouts, content, pages | ❌ | ✅ documents |

**Do not** store `{ userId: role }` in Postgres — not even as cache, mirror, or bootstrap. Read team role from **JWT** (ZITADEL project roles) on every guarded request.

---

## Canonical role strings

Same literals in ZITADEL project role keys and in app enforcement:

| String | Meaning |
|--------|---------|
| `"admin"` | Publish, team invite, auth settings, full CMS |
| `"editor"` | Draft + visual editor; no publish (v1) |
| `"customer"` | Shopper; no team surfaces |
| *(none)* | Anonymous visitor |

Defined once on platform project (`noname-platform` / `noname-dev`). Assigned per store via Role Assignment: `organizationId` + `userId` + `roleKeys`.

---

## ZITADEL owns (all team RBAC)

| Item | How |
|------|-----|
| Users, passwords, MFA, OAuth | ZITADEL org member |
| Team membership | Role Assignment |
| Effective role at runtime | JWT claim `urn:zitadel:iam:org:project:{projectId}:roles` |
| Invite user + role | `CreateAuthorization` with `roleKeys: ["editor"]` |
| Change role | `UpdateAuthorization` |
| List team + roles | `ListAuthorizations` + user list APIs |
| Edge `?edit=true` gate | Parse roles from JWT |
| API `requireTeamAdmin` / `requireTeamMember` | Resolve from JWT `sub` + project roles claim |

Docs: [Retrieve user roles](https://zitadel.com/docs/guides/integrate/retrieve-user-roles) · [Create Role Assignment](https://zitadel.com/docs/reference/api/authorization/zitadel.authorization.v2.AuthorizationService.CreateAuthorization)

```
Platform project "noname-platform"
  Roles: admin | editor | customer
  Per store (ZITADEL org):
    Alice → admin
    Bob   → editor
```

---

## Postgres owns (ZITADEL cannot do these)

### 1. Store config — not permissions

Path: `tenant_settings.data.auth`

| Field | Why not ZITADEL |
|-------|-----------------|
| `providers`, `idpIds` | Per-store login **configuration** |
| `allowPassword`, `allowSignUp`, `allowPasswordReset` | Merchant product flags |
| `requireMfaForAdmin` | Org **policy** (enforce TOTP before admin surfaces) |
| `providerLabels`, `providerIconAssets` | Login UI config |

**Not in this object:** ~~`teamRoles`~~ — remove from schema and code.

### 2. Field ACL rules — app domain ZITADEL has no model for

Path: `content_type.schema.fields[].permissions`

```jsonc
{
  "key": "price",
  "permissions": {
    "read":  ["admin", "editor", "customer"],
    "write": ["admin"]
  }
}
```

This is **not** storing who has a role — it is **which role keys may touch this field**. ZITADEL cannot express “field `price` on content type `product`”. Only our documents domain can.

Runtime:

```
role = from JWT (ZITADEL)
allowed = field.permissions.write.includes(role)   // Postgres rule
```

### 3. Business data (unchanged)

`content`, `layout`, `page`, `page_tree`, `asset`, catalog manifest, flags — no user roles.

---

## ❌ Remove from Postgres (code + docs)

| Path | Action |
|------|--------|
| `tenant_settings.data.auth.teamRoles` | Delete from `TenantAuthConfig`, `normalizeAuthConfig`, invite/role services |
| `teamRoleForUser(auth, userId)` reading Postgres | Replace with `teamRoleFromJwt(payload)` |
| Bootstrap “empty teamRoles → everyone admin” | Replace: seed grants ZITADEL `admin`; or ORG_OWNER fallback |
| Dual-write during migration | **No** — ZITADEL only from next implementation |

Current code still writes `teamRoles` — **legacy**; next auth work removes it.

---

## Who can do what

| Action | Check |
|--------|--------|
| View storefront | Public or any JWT |
| `/admin`, `?edit=true` | JWT roles include `editor` or `admin` |
| Publish | JWT role `admin` |
| Auth settings, invite | JWT role `admin` |
| Write CMS field | JWT role ∈ `field.permissions.write` (Postgres schema) |
| Edit specific document | `Check(user, editor, document:id)` — [`PERMISSIONS-REBAC.md`](./PERMISSIONS-REBAC.md) |
| MFA required for admin UI | `requireMfaForAdmin` (Postgres policy) + ZITADEL TOTP state |

---

## JWT → app role (target helper)

```typescript
function teamRoleFromJwt(payload: Record<string, unknown>): "admin" | "editor" | null {
  const rolesClaim = payload["urn:zitadel:iam:org:project:noname-platform:roles"];
  if (rolesClaim && typeof rolesClaim === "object" && "admin" in rolesClaim) return "admin";
  if (rolesClaim && typeof rolesClaim === "object" && "editor" in rolesClaim) return "editor";
  return null;
}
```

Edge HMAC: use resolved `admin` | `editor` | `customer` in `x-role`, not a stale Postgres copy.

---

## Implementation order

1. **`init:zitadel`** — create project roles `admin`, `editor`, `customer`; OIDC app emits roles in token  
2. **Invite / role APIs** — ZITADEL `CreateAuthorization` / `UpdateAuthorization` only  
3. **Remove `teamRoles`** from Postgres read/write paths  
4. **`teamRoleFromJwt`** in server + worker  
5. **`GET /api/auth/:slug/session`** — `teamRole` from JWT (or re-fetch from ZITADEL if claim missing)  
6. **Documents API** — guards use JWT role; pass role into service for field ACLs  
7. **`seed:demo`** — grant seed user `admin` in ZITADEL  

Visual editor Phase 0 ([`VISUAL-EDITOR-PLAN.md`](./VISUAL-EDITOR-PLAN.md)) should use **JWT roles**, not Postgres `teamRoles`.

---

## What we are not building

- Postgres user-role table or JSON map  
- Custom auth vault  
- Copying ZITADEL roles into DB for “speed”  
- Platform RBAC outside ZITADEL org + project grants  

---

## Legacy note (today’s code)

Until removed, `packages/server/src/domains/auth/service.ts` still mirrors roles to `teamRoles`. [`SECURITY-HANDOFF.md`](./SECURITY-HANDOFF.md) describes that behavior — **do not extend it**; delete on next auth pass.

---

## References

- [`AUTH-IDENTITY.md`](./AUTH-IDENTITY.md) — org id, JWT, HMAC  
- [`VISUAL-EDITOR-UX.md`](./VISUAL-EDITOR-UX.md) — Docs-like edit mode + role visibility  
- [ZITADEL — Authorization concepts](https://zitadel.com/docs/concepts/authorization)

---

*Postgres = store config + field rules + documents. ZITADEL = identity + every team role and permission assignment.*
