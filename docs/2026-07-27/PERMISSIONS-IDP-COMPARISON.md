# Permissions — IdP Comparison (ZITADEL vs others)

> **Date:** 2026-07-27  
> **Status:** Reference — why we expand roles in the backend  
> **Related:** [`PERMISSIONS-MASTER-PLAN.md`](./PERMISSIONS-MASTER-PLAN.md) · [`TEAM-ROLES-ZITADEL.md`](../2026-07-25/TEAM-ROLES-ZITADEL.md)

---

## One-line summary

**ZITADEL sends role keys only — we expand `editor` → permissions in the backend.** Auth0, Keycloak, and Logto can store role→permission in the IdP and embed permissions in tokens, but that still requires **new tokens** when permissions change, and rarely lets **each merchant store** customize the matrix. **We manage the permission map ourselves** — with caching — and that is normal for multi-tenant SaaS.

---

## Comparison table

| System | Stores permission entities? | Role → permission map | Permissions in JWT? | Per-org (store) role assignment | Merchant customizes permission matrix? |
|--------|----------------------------|------------------------|---------------------|--------------------------------|----------------------------------------|
| **ZITADEL** (ours) | ❌ | **App code** (or Postgres later) | **Roles only** | ✅ Role Assignment API | ❌ — platform defines |
| **Auth0** | ✅ RBAC permissions | Auth0 dashboard / API | ✅ Optional (RBAC enabled) | ✅ [Organizations](https://auth0.com/docs/manage-users/organizations) | ❌ — platform defines in Auth0 |
| **Keycloak** | ✅ AuthZ Services | Resources, scopes, policies | ✅ RPT (Requesting Party Token) | ✅ Per realm / client | ❌ — operator configures realm |
| **Logto** | ✅ Org template | Console / Management API | ✅ Org token scopes | ✅ Org roles per user | ❌ — [one template for all orgs](https://docs.logto.io/authorization/organization-template) |
| **Ory Keto** | ReBAC tuples | Graph relationships | Via `Check()` API | Model-dependent | Model-dependent |
| **OpenFGA / SpiceDB** | ✅ Fine-grained tuples | Namespace config | Via `Check()` API | Per store tuples in DB | Resource scope, not merchant RBAC UI |
| **AWS Cognito** | ❌ | App-side | Groups only | Limited | ❌ |

**Official ZITADEL position** ([GitHub #9768](https://github.com/zitadel/zitadel/discussions/9768)):

> *“Zitadel only provides RBAC and no permission handling. You will get the role … e.g. admin, and you will have to map to the permissions e.g. read:reports in your own application.”*

---

## What “IdP manages permissions” actually means

When Auth0 / Logto / Keycloak “store permissions,” **the platform operator** (you) defines:

```
editor → [content:draft_write, layout:draft_write]
admin  → [all permissions]
```

in the IdP console or API — **once for all tenants** (Logto org template) or per Auth0 tenant.

| Question | Answer |
|----------|--------|
| Can yogastore merchant edit what `editor` includes? | **No** — not in Auth0/Logto/ZITADEL either |
| Can merchant assign Bob to `editor`? | **Yes** — role assignment per org |
| Where for per-store custom editor bundle? | **Your Postgres** (later) — any IdP |

ZITADEL **role groups** in console = UI bucket to assign multiple **role keys** at once — not user teams with custom permission lists ([ZITADEL roles docs](https://zitadel.com/docs/guides/manage/console/roles)).

---

## Token refresh when permissions change

Changing who can do what has **two different triggers**:

### A. User’s **role** changed (Bob: editor → admin)

| System | What happens |
|--------|----------------|
| All IdPs | JWT still says old role until **refresh / re-login** |
| ZITADEL | New Role Assignment → new token on next login/refresh |
| Our app | `GET /auth/session` should re-read JWT; invalidate session cache for Bob |

**Every system** needs a new token (or refresh) when **role assignment** changes.

### B. **Permission definition** changed (`editor` gains `content:publish`)

| System | What happens |
|--------|----------------|
| **Auth0 / Logto / Keycloak** (permissions **in** token) | User keeps old permissions in JWT until **token expires / refresh / re-login**. IdP does not push updates to outstanding tokens automatically. [Logto](https://docs.logto.io/authorization/organization-template): template changes apply globally; **cached tokens may need clearing**. |
| **ZITADEL + backend map** (our model) | JWT still says `editor` — **same role key**. App loads **current** `ROLE_PERMISSIONS` on each request or from **session cache** you control. **Deploy new map → invalidate cache → users pick up new permissions without ZITADEL token change.** |

```
IdP permissions IN token:
  change matrix in Auth0 → wait for token TTL / force re-login

ZITADEL + backend expand:
  change ROLE_PERMISSIONS in deploy → invalidate session cache → done
  (JWT unchanged if role unchanged)
```

### Our caching strategy (v1)

```
Login:
  JWT roles → expandPermissions(roles) → session.permissions[]

Each request (pick one):
  A) Re-expand from JWT roles + in-memory map (cheap)
  B) Cache (userId, orgId) → permissions; TTL 5–15 min
  C) Invalidate cache on: role change webhook, deploy, admin "refresh session"

Role change in ZITADEL:
  → must refresh JWT (re-login or token refresh)

Permission map deploy only:
  → invalidate app cache; same JWT OK
```

---

## ZITADEL vs IdP-managed permissions — tradeoffs

| | IdP stores permissions (Auth0/Logto) | ZITADEL + backend (ours) |
|--|-------------------------------------|---------------------------|
| **Who builds permission map** | Platform in IdP | Platform in code / Postgres |
| **JWT size** | Larger (scope list) | Smaller (role keys) |
| **Update permission defs** | IdP update + **wait for new tokens** | Deploy + **cache invalidate** (no IdP change) |
| **Update user role** | New token (both) | New token (both) |
| **Per-org custom editor bundle** | Hard in IdP | Postgres override (later) |
| **Scoped docs inside store** | Not IdP — OpenFGA/Postgres | Postgres tuples (later) |
| **Operational burden** | IdP config + app | **We manage map + cache** |

**Conclusion:** IdP-managed permissions **automate token contents** but do **not** remove backend enforcement — and permission **definition** updates still need token lifecycle handling. With ZITADEL we **manage the expand step ourselves**; that is extra code but **more control** and faster permission-map rollouts without forcing re-login.

---

## Why we stay on ZITADEL + backend expand

1. **Already integrated** — login, MFA, orgs, Role Assignment API  
2. **ZITADEL cannot** store permission entities today  
3. **Same pattern as Auth0’s app-side mapping** — common in production  
4. **Permission deploy** without new IdP tokens (cache invalidate)  
5. **Per-org overrides** land in Postgres, not IdP migration  
6. **Fine-grained store scope** = Postgres tuples (OpenFGA-shaped), not IdP  

Switching to Auth0/Logto for “permissions in token” is optional later; it does **not** solve merchant-custom matrices or in-store tag/collection scope.

---

## External references

| Topic | Link |
|-------|------|
| ZITADEL — no permission handling | [GitHub #9768](https://github.com/zitadel/zitadel/discussions/9768) |
| ZITADEL roles + role assignments | [Roles guide](https://zitadel.com/docs/guides/manage/console/roles) |
| ZITADEL user groups (limited) | [Help: user groups](https://help.zitadel.com/understanding-how-user-groups-work-in-zitadel) |
| Auth0 RBAC | [Auth0 RBAC docs](https://auth0.com/docs/manage-users/access-control/rbac) |
| Auth0 multi-tenant | [Authorization model blog](https://auth0.com/blog/how-to-choose-the-right-authorization-model-for-your-multi-tenant-saas-application/) |
| Keycloak Authorization Services | [AuthZ guide](https://www.keycloak.org/docs/latest/authorization_services/index.html) |
| Logto org template | [Organization template](https://docs.logto.io/authorization/organization-template) |
| ZITADEL + external FGA | [ZITADEL FGA blog](https://zitadel.com/blog/fine-grained-authorization) |
| Our tuple design (later) | [`PERMISSIONS-REBAC.md`](../2026-07-25/PERMISSIONS-REBAC.md) |

---

## Decision (locked)

```
ZITADEL     → identity + role keys in JWT (admin | editor | customer)
Backend     → ROLE_PERMISSIONS expand + requirePermission() guards
Session     → cache permissions[]; invalidate on role change or deploy
Postgres    → field rules now; tuples later (not IdP)
NOT v1      → switching IdP for permission-in-token; merchant permission UI
```

---

*Companion to [`PERMISSIONS-MASTER-PLAN.md`](./PERMISSIONS-MASTER-PLAN.md). Update when IdP choice or cache strategy changes.*
