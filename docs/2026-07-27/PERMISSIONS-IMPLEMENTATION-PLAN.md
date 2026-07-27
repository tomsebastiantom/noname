# Permissions — Implementation Plan

> **Date:** 2026-07-27  
> **Status:** **Active — coding checklist**  
> **Prerequisite docs:** [`PERMISSIONS-MASTER-PLAN.md`](./PERMISSIONS-MASTER-PLAN.md) · [`PERMISSIONS-IDP-COMPARISON.md`](./PERMISSIONS-IDP-COMPARISON.md)  
> **Rule:** Ship in slices. **Platform-wide** permission defs first. **No editor UI** until Slice 4 passes validation.

---

## One-line summary

**Slice 1:** permission catalog + `ROLE_PERMISSIONS` in code (all stores). **Slice 2:** ZITADEL roles in JWT; delete Postgres `teamRoles`. **Slice 3:** API guards. **Slice 4:** session + client. **Later:** ZITADEL groups UI, per-org overrides, Postgres tuples.

---

## Scope boundaries (what this plan ships)

| In scope (v1) | Out of scope (later) |
|---------------|----------------------|
| Platform-wide permission keys + role bundles | Per-store custom permission matrix |
| ZITADEL: `admin` / `editor` / `customer` project roles | Merchant-created roles |
| Assign **user → role** per org (existing admin UI) | Real ZITADEL user groups (“Marketing team”) |
| ZITADEL **role group** field (console UI bucket only) | Postgres `relation_tuples` |
| `requirePermission()` on write/publish routes | Visual editor `?edit=true` UI |
| `GET /auth/session` → `{ roles, permissions[] }` | Per-page / tag-scoped access |

**Platform-wide** = every store uses the same `ROLE_PERMISSIONS` map in code. Stores only choose **who** gets `admin` or `editor` in ZITADEL — not **what** those roles mean.

---

## Architecture (shippable v1)

```
┌─────────────────────────────────────────────────────────────┐
│ PLATFORM (code) — same for all stores                        │
│  PERMISSIONS[]                                               │
│  ROLE_PERMISSIONS: admin | editor | customer                 │
│  expandPermissions(roles) → Set<PermissionKey>               │
│  requirePermission(key) middleware                           │
└─────────────────────────────────────────────────────────────┘
                              ▲
                   JWT role keys from ZITADEL
                              │
┌─────────────────────────────────────────────────────────────┐
│ ZITADEL (per org = store)                                    │
│  Project roles: admin, editor, customer                        │
│  Role Assignment: userId + organizationId + roleKeys[]       │
│  Merchant admin: invite user, assign role (Users admin UI)   │
└─────────────────────────────────────────────────────────────┘
```

Stores **do not** configure permission keys in v1. They **assign people** to roles via `/admin/settings/users`.

---

## Permission catalog (define in Slice 1)

Create `packages/server/src/domains/auth/permissions.ts` (and mirror types for client if needed):

| Permission key | Guards |
|----------------|--------|
| `storefront:view` | Public read (implicit for authenticated) |
| `content:draft_write` | PUT content draft |
| `content:publish` | PUT content publish |
| `layout:draft_write` | PUT layout draft |
| `layout:publish` | PUT layout publish |
| `page:draft_write` | PUT page / page_tree draft |
| `page:publish` | PUT page / page_tree publish |
| `auth:manage` | Auth config, user list, invite, role change |

**v1 role bundles (platform-wide):**

```typescript
export const ROLE_PERMISSIONS = {
  admin: [/* all keys */],
  editor: [
    "storefront:view",
    "content:draft_write",
    "layout:draft_write",
    "page:draft_write",
  ],
  customer: ["storefront:view"],
} as const;
```

Add unit tests: `expandPermissions(["editor"])` includes draft keys, excludes publish keys.

---

## Implementation slices

### Slice 1 — Permission module (no ZITADEL change) ✅

**Goal:** Pure functions; no behavior change yet.

| Task | File / area | Status |
|------|-------------|--------|
| Add `permissions.ts` — keys, `ROLE_PERMISSIONS`, `expandPermissions`, `hasPermission` | `packages/server/src/domains/auth/` | ✅ |
| Add `roles-from-jwt.ts` — parse ZITADEL project roles claim | same | ✅ |
| Tests | `permissions.test.ts`, `roles-from-jwt.test.ts` | ✅ |

**Ship criteria:** `pnpm test` green; nothing wired to routes yet. **Done 2026-07-27.**

---

### Slice 2 — ZITADEL roles + remove Postgres `teamRoles`

**Goal:** Role source of truth = ZITADEL JWT only.

| Task | Detail |
|------|--------|
| **2a** | Extend `init:zitadel` — ensure project roles `admin`, `editor`, `customer`; OIDC app asserts roles in token |
| **2b** | `seed:demo` — grant seed user `admin` via ZITADEL CreateAuthorization (not Postgres) |
| **2c** | Replace `teamRoleForUser` / `isTeamAdmin` with `rolesFromJwt` + `hasPermission(..., "auth:manage")` |
| **2d** | `auth/service.ts` — role update → ZITADEL API only; stop writing `teamRoles` |
| **2e** | Remove `teamRoles` from `auth-config.ts`, `ports.ts`, normalize/merge paths, tests |
| **2f** | Update `UsersAdminForm` / team-users if session shape changes |

**ZITADEL console (manual once):**

- Project → Roles → create keys `admin`, `editor`, `customer`
- Optional: set Role **Group** = `Team` (UI bucket when assigning — not user groups)
- Project → General → enable roles in token (Assert Roles on Authentication)
- Role Assignment for demo user

**Ship criteria:** User list shows role from ZITADEL; Postgres `tenant_settings.auth` has no `teamRoles` after save.

---

### Slice 3 — API guards (documents + auth)

**Goal:** Every mutation checks permissions.

| Route pattern | Permission |
|---------------|------------|
| PUT content/layout draft | `content:draft_write` / `layout:draft_write` |
| PUT publish | `content:publish` / `layout:publish` |
| PUT page draft / publish | `page:draft_write` / `page:publish` |
| PUT auth config, users, invite, role | `auth:manage` |

| Task | File |
|------|------|
| `requirePermission(c, orgId, key)` helper | `auth/api.ts` or `auth/guards.ts` |
| Wire documents routes | `packages/server/src/domains/documents/api.ts` |
| Pass expanded permissions into field ACL checks | `documents/service.ts` (when field rules exist) |
| Replace `requireTeamAdmin` with `auth:manage` | `auth/api.ts` |

**Ship criteria:** editor JWT → draft 200, publish 403; admin → publish 200.

---

### Slice 4 — Session, client, edge

**Goal:** UI knows permissions; edge blocks edit mode without role.

| Task | Detail |
|------|--------|
| **4a** | `GET /auth/session` → `{ roles: string[], permissions: string[], teamRole?: string }` (legacy `teamRole` optional for client transition) |
| **4b** | Client: store `permissions[]` from session; hide Publish if missing `*:publish` |
| **4c** | Client: MFA gate on `?edit=true` when policy on (same as `/admin`) |
| **4d** | Edge `packages/workers/src/auth.ts` — parse roles claim; set `role` from JWT roles not hardcoded `customer` |
| **4e** | Edge: reject or strip `?edit=true` without `layout:draft_write` equivalent (editor/admin role) |
| **4f** | Session cache: re-expand on session fetch; document deploy invalidates in-memory map automatically |

**Ship criteria:** Manual checklist in [`PERMISSIONS-MASTER-PLAN.md`](./PERMISSIONS-MASTER-PLAN.md) § Validate.

---

### Slice 5 — Field ACL migration (optional same release)

| Task | Detail |
|------|--------|
| Migrate content-type `permissions.write: ["admin"]` → permission keys | Seed + schema docs |
| Enforce in `ContentDocumentService` using `hasPermission` | documents service |

Can ship after Slice 3 if field rules are not blocking.

---

## What merchants do in v1 (ZITADEL + admin UI)

```
1. Store owner (admin) opens /admin/settings/users
2. Invites Bob → ZITADEL creates user
3. Assigns role: editor (ZITADEL Role Assignment API)
4. Bob logs in → JWT has editor → app expands to draft permissions
5. Bob saves content ✅  Bob publishes ❌ 403
```

**Not in v1:** merchant creates “Marketing group” with custom permission set. They pick **admin** or **editor** from platform defaults.

**ZITADEL role groups** (Administration bucket in console) = assign multiple **role keys** quickly when creating roles — not a substitute for user teams.

---

## Later slices (after v1 validates)

| Slice | Work |
|-------|------|
| **L1** | OpenFGA Playground model → Postgres `relation_tuples` + `Check()` |
| **L2** | Tags on content/layout + collection scoping |
| **L3** | Split roles: `content_editor`, `layout_editor` (new ZITADEL project roles) |
| **L4** | Per-org `ROLE_PERMISSIONS` override table (Postgres) — if merchant needs custom editor bundle |
| **L5** | ZITADEL user metadata `team=marketing` or wait for native groups |
| **L6** | Visual editor UI (`?edit=true`) — [`VISUAL-EDITOR-IMPLEMENTATION-ORDER.md`](../2026-07-25/VISUAL-EDITOR-IMPLEMENTATION-ORDER.md) |

---

## File touch list (v1)

| Area | Files |
|------|-------|
| Permission core | `packages/server/src/domains/auth/permissions.ts` (new) |
| JWT roles | `packages/server/src/domains/auth/roles-from-jwt.ts` (new) |
| Guards | `packages/server/src/domains/auth/guards.ts` (new) or extend `api.ts` |
| Remove legacy | `auth-config.ts`, `auth/service.ts`, `documents/ports.ts` |
| Documents API | `packages/server/src/domains/documents/api.ts` |
| Session | `auth/api.ts` GET session |
| Client | `auth/team-users.ts`, `UsersAdminForm.tsx`, `main.tsx` |
| Edge | `packages/workers/src/auth.ts`, `renderer.ts` if edit gate |
| Seed / init | `scripts/init-zitadel-oidc.ts`, `scripts/seed-demo.ts` |
| Tests | `permissions.test.ts`, update `account-flows.test.ts`, API integration tests |

---

## Validate before editor UI

```bash
pnpm init:zitadel   # once per env
pnpm seed:demo
pnpm test && pnpm typecheck
```

| # | Test | Expected |
|---|------|----------|
| 1 | editor → content draft | 200 |
| 2 | editor → content publish | 403 |
| 3 | admin → layout publish | 200 |
| 4 | editor → PUT auth/config | 403 |
| 5 | no JWT → `?edit=true` at edge | login / 403 |
| 6 | session returns `permissions[]` | includes draft keys for editor |

---

## Order summary (ship sequence)

```
Slice 1  permissions.ts + tests           ← start here (no infra)
Slice 2  ZITADEL roles + delete teamRoles
Slice 3  documents + auth API guards
Slice 4  session + client + edge
         ─── permissions v1 DONE ───
Later    tuples, tags, groups, editor UI
```

---

## Doc map

| Doc | Purpose |
|-----|---------|
| [`PERMISSIONS-MASTER-PLAN.md`](./PERMISSIONS-MASTER-PLAN.md) | Model, Zanzibar examples, v1 vs later |
| [`PERMISSIONS-IDP-COMPARISON.md`](./PERMISSIONS-IDP-COMPARISON.md) | Why ZITADEL + backend expand |
| [`TEAM-ROLES-ZITADEL.md`](../2026-07-25/TEAM-ROLES-ZITADEL.md) | ZITADEL API links (legacy “no teamRoles” still valid) |
| [`SECURITY-HANDOFF.md`](../2026-07-25/SECURITY-HANDOFF.md) | Manual auth test patterns |

---

*Update slice status as each ships. Do not start visual editor until Slice 4 validation passes.*
