# Permissions Master Plan

> **Date:** 2026-07-27 (updated after architecture brainstorm)  
> **Status:** **Active — canonical permission model; start here**  
> **Rule:** **Permissions before editor UI.** One guard pipeline for admin, API, and `?edit=true`.  
> **Supersedes:** role-assignment parts of [`TEAM-ROLES-ZITADEL.md`](../2026-07-25/TEAM-ROLES-ZITADEL.md) — that doc’s “no teamRoles in Postgres” still holds; this doc defines **granular permissions + where each layer lives**.  
> **Related:** [`PERMISSIONS-REBAC.md`](../2026-07-25/PERMISSIONS-REBAC.md) · [`PERMISSIONS-IDP-COMPARISON.md`](./PERMISSIONS-IDP-COMPARISON.md) · [`PERMISSIONS-IMPLEMENTATION-PLAN.md`](./PERMISSIONS-IMPLEMENTATION-PLAN.md) · [`VISUAL-EDITOR-PLAN.md`](../2026-07-25/VISUAL-EDITOR-PLAN.md) · [`VISUAL-EDITOR-IMPLEMENTATION-ORDER.md`](../2026-07-25/VISUAL-EDITOR-IMPLEMENTATION-ORDER.md)

---

## One-line summary

**Permissions** (platform) = what APIs/actions you can perform, scoped by resource type (`content`, `layout`, `page`). **Roles** (platform defaults) = bundles of permissions. **ZITADEL** (per org) = users, groups, and who gets which role. **Postgres** = rules only (field ACLs, auth policy) — **not** who has which role. **Tuples** (later, [Zanzibar-shaped](#zanzibar-pattern--examples)) = which **part of the store** someone can touch — one doc, a tag/collection branch, or a content type — on top of permissions.

---

## Three layers — do not mix

| Layer | What it answers | Where it lives |
|-------|-----------------|----------------|
| **1. Permissions** | What can they **do**? Which **APIs**? Which **doc types**? | Platform code (catalog of permission keys + enforcement) |
| **2. Roles** | Which permissions are bundled together? | Platform defaults; **assigned** in ZITADEL |
| **3. Tuples** (later) | Which **resources** in the store — one doc, tag branch, collection, content type? | Postgres `relation_tuples` (Zanzibar format) |

```
Permissions ≠ tuples.

Permissions  →  "Can Bob call content:publish?" / "Can Bob edit layout docs at all?"
Tuples       →  "Which content/layout in this store?" — one UUID, a tag, a folder, all products, …
```

**v1:** permissions + ZITADEL role → **all** content + layout in the org (no tuple table).  
**Later:** tuples narrow access **within** the store (marketing tag only, one landing page, product content type only). See [Zanzibar examples](#zanzibar-pattern--examples).

Example:

| ZITADEL role | Permissions | Can touch |
|--------------|-------------|-----------|
| `editor` (v1) | `content:draft_write`, `layout:draft_write` | Content + layout drafts |
| `admin` | all content + layout + page + `auth:manage` | Content, layout, pages, settings |
| `content_editor` (later) | `content:*` only | **Content docs only** — not layout |

---

## What lives where (decided)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  PLATFORM (app code)                                                     │
│  • Permission keys: content:draft_write, layout:publish, auth:manage, …  │
│  • Role → permission map (default bundles)                               │
│  • Guards on routes: requirePermission("layout:publish")               │
└─────────────────────────────────────────────────────────────────────────┘
                                    ▲
                         JWT roles from ZITADEL
                                    │
┌─────────────────────────────────────────────────────────────────────────┐
│  ZITADEL (per org = store)                                               │
│  • Users, login, MFA, OAuth                                              │
│  • Groups (later) — "Content team", "Store admins"                       │
│  • Role Assignment: Alice → admin, Bob → editor                          │
│  • JWT carries role keys for this org                                      │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                         extra rules on resources
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  POSTGRES (rules — NOT people)                                           │
│  • Field ACLs: which permission keys may write field `price`             │
│  • tenant_settings.auth: MFA policy, IdP flags (config, not RBAC)         │
│  • relation_tuples (later): per-document share                           │
│  • document_ops (later): edit audit log                                  │
└─────────────────────────────────────────────────────────────────────────┘
```

| Question | System | Never |
|----------|--------|-------|
| Who is logged in? | ZITADEL JWT `sub` | — |
| Which org (store)? | ZITADEL org / edge resolve | — |
| Who has role `editor`? | ZITADEL Role Assignment | Postgres `teamRoles` JSON |
| What does `content:publish` mean? | Platform permission catalog | ZITADEL |
| Can they edit field `price`? | Postgres field rule + user’s permissions | ZITADEL |
| Share layout `home` with Bob only? | Postgres tuple (later) | Permission key alone |
| Marketing group → blog content only? | Tuple on `tag:blog` or `collection:marketing` (later) | v1 org-wide editor |

---

## Zanzibar pattern + examples

We follow **[Google Zanzibar](https://www.usenix.org/system/files/atc19-pang.pdf)** tuple shape and relation names so later ReBAC stays familiar. **v1 stays simple** — permissions replace store-wide tuples; add the tuple table when scoped access inside a store is needed.

### Tuple format (our convention)

```
⟨namespace⟩:⟨object_id⟩#⟨relation⟩@⟨subject⟩
```

| Part | Examples |
|------|----------|
| `namespace` | `store`, `document`, `content_type`, `tag`, `collection` |
| `object_id` | org id, document UUID, `product`, `blog`, `marketing` |
| `relation` | `owner`, `editor`, `viewer`, `parent` |
| `subject` | `user:{jwt_sub}` or userset `store:{org}#editor` |

**Postgres primary key (later):** `(org_id, namespace, object_id, relation, subject)`.

### Relation inheritance (in app code — like Zanzibar namespace config)

```
store:    owner → admin → editor → viewer
document: owner → editor → viewer
          parent → inherit editor/viewer from linked collection or tag
```

### Example 1 — v1 today (no tuple rows)

Bob has ZITADEL role `editor` → permissions include `content:draft_write`, `layout:draft_write`.

```
ZITADEL:  user:bob → role editor (org yogastore)
Platform: editor → [ content:draft_write, layout:draft_write, … ]
Check:    PUT /documents/content/:id  → has content:draft_write? ✅
          PUT /documents/layout/:id/publish → has layout:publish? ❌ 403
```

No tuple table. Bob can draft **any** content + layout in yogastore.

### Example 2 — later: one document share (Google Docs “Share file”)

Alice (admin) shares one layout with freelancer Bob without making him store-wide editor:

```
tag:blog#editor@user:bob                                    ← not this; single doc:
document:7c9e-home-layout#editor@user:bob
```

Check before save:

```
1. hasPermission(bob, layout:draft_write)?  ← from role or explicit grant
2. Check(bob, editor, document:7c9e-home-layout)?  ← tuple hit
3. both → allow
```

### Example 3 — later: tag / spec group (branch inside store)

Merchant tags content and layouts. Marketing group edits **only** `marketing` tagged items:

**Document metadata (Postgres on content/layout rows):**

```jsonc
{ "id": "prod-uuid", "type": "content", "tags": ["products"] }
{ "id": "about-layout", "type": "layout", "tags": ["marketing", "landing"] }
```

**Tuples:**

```
collection:marketing#editor@user:carol
document:about-layout#parent@collection:marketing
tag:marketing#editor@group:marketing-team          ← optional userset via ZITADEL group id
```

**Check for Carol saving about-layout:**

```
1. hasPermission(carol, layout:draft_write)? ✅ (content_editor or editor role)
2. Check(carol, editor, document:about-layout)?
     → direct tuple OR parent collection:marketing → ✅
3. allow
```

**Check for Carol saving a product content entry (`tags: ["products"]`):**

```
Check(carol, editor, document:prod-uuid) → ❌ (not in marketing collection)
```

Access limited **inside yogastore** — not a different org.

### Example 4 — later: content type scope (all products, no blog)

```
content_type:product#editor@user:dave
```

Dave has `content:draft_write` from role **and** tuple scope → only `content` documents where `contentType === "product"`.

### Example 5 — field rule (Postgres — not a tuple)

Sensitive field on product content type:

```jsonc
{ "key": "price", "permissions": { "write": ["content:publish"] } }
```

Even if Dave can edit product content, price needs publish-level permission unless admin.

### v1 vs later — what we implement

| Pattern | v1 | Later (Zanzibar tuples + tags) |
|---------|-----|--------------------------------|
| Store-wide editor | ZITADEL role + permissions | Same; optional `store:{org}#editor@user:` tuple |
| Doc type split (content vs layout) | Permission keys | Same + optional `content_type:` tuples |
| One doc share | ❌ | `document:{uuid}#editor@user:` |
| Tag / collection branch | ❌ | `tag:` / `collection:` + `parent` on documents |
| ZITADEL groups → scoped access | ❌ | Group id as subject or userset |
| OpenFGA / SpiceDB service | Design in Playground only | When in-app `Check()` grows |

Design tuples in [OpenFGA Playground](https://play.fga.dev) first; copy relation names into Postgres schema when Phase 1 ships. Full op-log detail: [`PERMISSIONS-REBAC.md`](../2026-07-25/PERMISSIONS-REBAC.md).

### Combined Check (later — target pseudocode)

```typescript
async function canEditDocument(userId: string, orgId: string, doc: DocumentRef): Promise<boolean> {
  const perms = expandPermissions(rolesFromJwt(/* … */));

  // 1. Action layer — can they draft this doc type at all?
  const draftKey = doc.type === "content" ? "content:draft_write" : "layout:draft_write";
  if (!perms.has(draftKey)) return false;

  // 2. v1 stop here — org-wide access
  if (!TUPLES_ENABLED) return true;

  // 3. Resource layer — tuple scope inside store
  if (await checkTuple(userId, "editor", `document:${doc.id}`)) return true;
  if (doc.tags?.some((t) => checkTuple(userId, "editor", `tag:${t}`))) return true;
  if (doc.contentType && (await checkTuple(userId, "editor", `content_type:${doc.contentType}`)))
    return true;
  if (await checkTuple(userId, "editor", `store:${orgId}`)) return true;

  return false;
}
```

---

## Granular permission keys (platform catalog)

Permissions are **atoms** — not one vague `publish`. Design keys now; enforce strictly in Phase 0.

| Permission key | Allows | Doc / API scope |
|----------------|--------|-----------------|
| `storefront:view` | Read published site | Public / customer |
| `content:draft_write` | Save content draft | `content` documents |
| `content:publish` | Publish content | `content` documents |
| `layout:draft_write` | Save layout draft | `layout` documents |
| `layout:publish` | Publish layout | `layout` documents |
| `page:draft_write` | Edit page / page_tree draft | `page`, `page_tree` |
| `page:publish` | Publish routing | `page`, `page_tree` |
| `auth:manage` | Auth config, invites | Auth API |
| `team:invite` | Invite users (may merge into `auth:manage`) | Auth API |

Visual editor (`?edit=true`) checks the same keys: editing layout props → `layout:draft_write`; publish bar → `layout:publish` or `content:publish` depending on save target.

---

## Default roles → permission bundles (v1)

Platform defines **fixed role keys** on the ZITADEL project. Merchants **assign** roles; they do not invent permission names in v1.

| ZITADEL role | Permissions (v1 bundle) | Typical user |
|--------------|-------------------------|--------------|
| `admin` | All keys above | Store owner |
| `editor` | `storefront:view`, `content:draft_write`, `layout:draft_write`, `page:draft_write` — **no publish** | Content/layout freelancer |
| `customer` | `storefront:view` | Shopper |

**v1 simplification:** one `editor` role can draft **both** content and layout. Split into `content_editor` / `layout_editor` when a store asks for it ([Later § split roles](#later-not-v1)).

Implementation: JWT role keys → expand via `ROLE_PERMISSIONS` map in app code → `hasPermission(user, "layout:publish")`.

---

## Postgres field rules (not user assignment)

Content-type fields reference **permission keys**, not user ids:

```jsonc
{
  "key": "price",
  "permissions": { "write": ["content:admin"] }   // or require admin role’s full bundle
}
{
  "key": "description",
  "permissions": { "write": ["content:draft_write"] }
}
```

Runtime:

```
userPermissions = expandRoles(jwtRoles)
allowed = field.permissions.write.every(p => userPermissions.includes(p))
```

Migrate legacy `permissions.write: ["admin", "editor"]` role strings → permission keys during Phase 0.

---

## Request flow

```
1. Validate JWT (ZITADEL) → userId, orgId, roleKeys[]
2. Expand roleKeys → Set<permissionKey>  (platform map)
3. Route guard: requirePermission("content:publish")
4. Optional: field guard from Postgres schema
5. Optional (later): tuple Check for document:id
6. Allow or 403
```

**One pipeline** for `/admin/content`, `/admin/layout`, `?edit=true`, documents API, future AI publish approval.

---

## ZITADEL vs other IdPs — we manage permission expand

ZITADEL sends **role keys only** (`editor`, `admin`) — not permission keys. **We expand roles → permissions in the backend.** Auth0, Keycloak, and Logto can store role→permission in the IdP and put permissions in tokens, but:

- **Permission updates still need new tokens** (or wait for TTL) when permissions live **in** the JWT  
- **Merchants rarely customize** the permission matrix in any IdP — platform defines once  
- **In-store scope** (tags, collections) = Postgres tuples / OpenFGA — not IdP  

**Advantage of our model:** change `ROLE_PERMISSIONS` in a deploy → invalidate session cache → users get new permissions **without** a ZITADEL token refresh (same role key in JWT). Role **assignment** changes in ZITADEL still require re-login / token refresh — same as all IdPs.

| Change | New ZITADEL token needed? | What we do |
|--------|---------------------------|------------|
| Bob `editor` → `admin` | ✅ Yes | ZITADEL Role Assignment + session refresh |
| Platform adds `page:publish` to `editor` bundle | ❌ No (v1 backend map) | Deploy + invalidate permission cache |
| Per-org editor override (later) | ❌ No | Postgres org config + cache invalidate |

Full comparison table, token lifecycle, and external links: **[`PERMISSIONS-IDP-COMPARISON.md`](./PERMISSIONS-IDP-COMPARISON.md)**.

```
Session cache (v1):
  login → JWT roles → expandPermissions() → session.permissions[]
  guards → requirePermission("layout:publish")
  invalidate cache on: deploy (map change), role change, optional TTL
```

---

## Why permissions before editor

| If editor first | If permissions first |
|-----------------|------------------------|
| Per-screen auth hacks | `requirePermission()` on every write |
| Publish leaks to editors | `layout:publish` → 403 for editor role |
| Admin vs storefront diverge | Same keys everywhere |

Read-only admin preview (JSON → `<Renderer>`) is OK before Phase 0. **Any save/publish** waits for guards.

---

## ✅ Decided for v1 (build now)

| Item | Decision |
|------|----------|
| Permission model | Granular keys in platform code; roles bundle permissions |
| Who has which role | **ZITADEL** Role Assignment per org — delete Postgres `teamRoles` |
| Which doc types | From permissions (`content:*` vs `layout:*`) — no tuples needed |
| Default roles | `admin`, `editor`, `customer` on ZITADEL project |
| Publish rule | Editors draft; **admin** (or role with `*:publish` keys) publishes |
| Field ACLs | Postgres schema; reference permission keys |
| Groups in ZITADEL | Optional v1 — direct user → role assignment is enough to start |
| Tuples | **Not v1** |
| Per-page editable roles | **Not v1** — maybe never; use tuples or tags if needed |
| Custom merchant roles | **Not v1** |
| `content_editor` vs `layout_editor` split | **Not v1** — single `editor` with both draft permissions |
| User/group storage in Postgres | **No** — ZITADEL only for assignments |
| SpiceDB / OpenFGA server | **Not v1** — design tuples in Playground only |

### Phase 0 implementation checklist

| Step | Work |
|------|------|
| **0a** | Define `PERMISSIONS` + `ROLE_PERMISSIONS` constants in server |
| **0b** | `init:zitadel` — roles `admin`, `editor`, `customer`; token emits role claim |
| **0c** | Invite / role APIs → ZITADEL Authorization only; remove `teamRoles` writes |
| **0d** | `rolesFromJwt()` + `expandPermissions(roles)` + `requirePermission(key)` |
| **0e** | `GET /auth/session` → `{ roles, permissions[] }`; cache expand; invalidate on deploy / role change | [`PERMISSIONS-IDP-COMPARISON.md`](./PERMISSIONS-IDP-COMPARISON.md) |
| **0f** | Documents API: save draft → `*:draft_write`; publish → `*:publish`; auth → `auth:manage` |
| **0g** | Edge: gate `?edit=true` if missing `layout:draft_write` (or editor role) |
| **0h** | Client: hide Publish unless `permissions` includes publish keys; MFA gate |
| **0i** | Delete `teamRoles` from `auth-config`, service, ports, tests |
| **0j** | `seed:demo` — grant seed user ZITADEL `admin` |

**Legacy code to remove:** `teamRoleForUser`, `tenant_settings.auth.teamRoles`, bootstrap “empty teamRoles → everyone admin” (replace with seeded ZITADEL admin).

---

## 🔮 Later (explicitly not v1)

| Item | When / why |
|------|------------|
| **`content_editor` / `layout_editor` roles** | Store wants editor who touches content only, not layout |
| **ZITADEL groups UI** | "Content team", "Store admins" — assign role to group |
| **Merchant-custom roles** | Duplicate platform role, tweak permission bundle (Postgres config or ZITADEL project roles added by platform) |
| **Tags on content + layout** | Merchant labels docs (`marketing`, `products`); tuples or Check filter by tag |
| **Collection / spec groups** | Zanzibar `collection:marketing#editor@group`; `document#parent@collection` inheritance |
| **Per-page / branch access inside store** | Marketing group → tag `blog` + layouts tagged `marketing` only — **not** whole store |
| **`relation_tuples` table** | Zanzibar-shaped rows; `document`, `tag`, `collection`, `content_type`, `store` namespaces |
| **OpenFGA Playground → export model** | Design doc; optional OpenFGA/SpiceDB service when tuple Check() grows |
| **`document_ops` + `If-Match` version** | Audit log + conflict handling before live collab |
| **Visual editor UI** | After Phase 0 — [`VISUAL-EDITOR-IMPLEMENTATION-ORDER.md`](../2026-07-25/VISUAL-EDITOR-IMPLEMENTATION-ORDER.md) |
| **Automerge / Hocuspocus** | Live collab on spec / rich text |
| **Permission registry table in Postgres** | Only if merchants need to see/edit permission docs in admin UI |

### Split roles (later example)

```
content_editor  →  content:draft_write, content:publish
layout_editor   →  layout:draft_write, layout:publish
admin           →  all
```

ZITADEL gets extra project role keys; platform map grows; no change to permission atom design.

### Scoped access inside a store (later — tags + groups + tuples)

**Not v1.** When a merchant needs “Marketing team edits blog + landing layouts only”:

```
ZITADEL
  group:marketing-team  →  members: carol, dave
  role: content_editor  →  assigned to group (or per user)

Platform permissions
  content_editor → content:draft_write, layout:draft_write (actions only)

Postgres document tags
  content:blog-post-1        tags: [marketing, blog]
  layout:about-landing       tags: [marketing, landing]

Postgres relation_tuples
  collection:marketing#editor@group:marketing-team
  document:about-landing#parent@collection:marketing
  tag:blog#editor@group:marketing-team
```

Carol can draft **tagged** content/layout in scope; cannot edit product catalog entries. Same org, narrower resource graph — classic Zanzibar **userset + parent** pattern.

Prefer **tags + collection tuples** over per-page role inventing. Single-doc share remains `document:{uuid}#editor@user:{sub}`.

---

## Role × action matrix (v1)

| Action | Permission required | admin | editor | customer |
|--------|---------------------|-------|--------|----------|
| View storefront | `storefront:view` | ✅ | ✅ | ✅ |
| `/admin`, `?edit=true` | any draft_write | ✅ | ✅ | ❌ |
| Save content draft | `content:draft_write` | ✅ | ✅ | ❌ |
| Save layout draft | `layout:draft_write` | ✅ | ✅ | ❌ |
| Publish content | `content:publish` | ✅ | ❌ | ❌ |
| Publish layout | `layout:publish` | ✅ | ❌ | ❌ |
| Auth / invite | `auth:manage` | ✅ | ❌ | ❌ |
| Write field `price` | field rule + permission | ✅ | ❌* | ❌ |

\*Unless field rule allows `content:draft_write` and editor has it.

---

## Current code vs target

| Area | Today | Target |
|------|-------|--------|
| Authorization | Coarse `teamRoles` JSON in Postgres | ZITADEL roles → platform permission expansion |
| Guards | `requireTeamAdmin` reads Postgres | `requirePermission("auth:manage")` etc. |
| Documents API | No permission checks on write/publish | Per-route permission keys |
| Field ACLs | Role strings `admin`/`editor` | Permission keys |
| Edge `?edit=true` | Ungated | Permission or role check |
| Client | No permission list in session | `session.permissions[]` drives Publish visibility |

---

## Validate before editor UI

```bash
pnpm seed:demo && pnpm test && pnpm typecheck
```

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 1 | editor | PUT content draft | **200** |
| 2 | editor | PUT content publish | **403** |
| 3 | editor | PUT layout publish | **403** |
| 4 | admin | PUT layout publish | **200** |
| 5 | no JWT | `?edit=true` at edge | login / **403** |
| 6 | editor | `?edit=true` | **200** |
| 7 | editor | PUT `/auth/config` | **403** |
| 8 | editor | write `price` field (admin-only rule) | **403** |

---

## Doc map

| Topic | Doc | Note |
|-------|-----|------|
| **This file** | Canonical model | Overrides July 25 role-only framing |
| **IdP comparison** | [`PERMISSIONS-IDP-COMPARISON.md`](./PERMISSIONS-IDP-COMPARISON.md) | ZITADEL vs Auth0/Keycloak/Logto; token refresh |
| Tuple design (later) | [`PERMISSIONS-REBAC.md`](../2026-07-25/PERMISSIONS-REBAC.md) | Phase 1+ |
| OSS references | [`PERMISSIONS-OSS-REFERENCES.md`](../2026-07-25/PERMISSIONS-OSS-REFERENCES.md) | |
| Editor gates + UX | [`VISUAL-EDITOR-PLAN.md`](../2026-07-25/VISUAL-EDITOR-PLAN.md) | After Phase 0 |
| Build order 0→10 | [`VISUAL-EDITOR-IMPLEMENTATION-ORDER.md`](../2026-07-25/VISUAL-EDITOR-IMPLEMENTATION-ORDER.md) | Update step 0 to permission keys |
| Legacy ZITADEL note | [`TEAM-ROLES-ZITADEL.md`](../2026-07-25/TEAM-ROLES-ZITADEL.md) | Still valid: no Postgres user→role |
| Security manual tests | [`SECURITY-HANDOFF.md`](../2026-07-25/SECURITY-HANDOFF.md) | |

---

## Quick reference

```
v1 NOW
  Platform permission keys + ROLE_PERMISSIONS map
  ZITADEL: users + role assignment (admin | editor | customer)
  Postgres: field rules + auth policy flags only
  Guards on every write/publish API + ?edit=true
  Session cache permissions[]; invalidate on deploy / role change
  Delete teamRoles JSON

v1 NOT
  Tuples, per-page roles, custom roles, groups UI, collab, editor UI

LATER (Zanzibar-shaped — design in OpenFGA Playground first)
  content_editor / layout_editor split
  ZITADEL groups → tuple subjects
  Tags on content + layout documents
  collection: / tag: / content_type: tuples + parent inheritance
  document:{uuid} share (one file)
  Scoped access inside store (marketing branch — not whole org)
  document_ops, visual editor, optional OpenFGA/SpiceDB service
```

---

*Updated 2026-07-27 — Zanzibar examples + [`PERMISSIONS-IDP-COMPARISON.md`](./PERMISSIONS-IDP-COMPARISON.md) (IdP comparison, token refresh).*
