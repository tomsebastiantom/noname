# Visual Editor — Setup & Permissions (before UI)

> **Date:** 2026-07-25  
> **Status:** Planned — **permissions + gates first**, then `?edit=true` UI  
> **Related:** [`VISUAL_EDITOR.md`](../2026-07-11/VISUAL_EDITOR.md) · [`VISUAL-EDITOR-UX.md`](./VISUAL-EDITOR-UX.md) (Google Docs–style click flow) · [`TEAM-ROLES-ZITADEL.md`](./TEAM-ROLES-ZITADEL.md) · [`PERMISSIONS-REBAC.md`](./PERMISSIONS-REBAC.md) (Zanzibar tuples + consistency) · [`ADMIN-UI-LATER.md`](./ADMIN-UI-LATER.md) · [`SECURITY-HANDOFF.md`](./SECURITY-HANDOFF.md) · [`ORG-AUTH-CONFIG.md`](./ORG-AUTH-CONFIG.md)

---

## One-line summary

The visual editor opens the **same storefront URL** with `?edit=true`, **click a component on the page** (Google Docs–style — see [`VISUAL-EDITOR-UX.md`](./VISUAL-EDITOR-UX.md)), edit props in `PropsPanel`, save/publish via the **documents API**. **ZITADEL** owns identity **and team roles** (JWT); Postgres holds store policy and documents. **Field ACL — not planned**; use document-level split. See [`FIELD-ACL.md`](../2026-08-01/FIELD-ACL.md) and [`TEAM-ROLES-ZITADEL.md`](./TEAM-ROLES-ZITADEL.md).

---

## What we are editing (not a new app)

| Surface | URL | What changes |
|---------|-----|--------------|
| **Store admin** (today) | `/admin/*` | CMS forms — content entries, layout JSON, pages, auth |
| **Visual editor** (next) | `/{page}?edit=true` | Same rendered page — click component → `PropsPanel` → save layout and/or linked content |

Both use the same pipeline:

```
page_tree URL → layout document + contentRef → edge resolved spec → Renderer + catalog
```

| Edit target | Stored as | Typical change |
|-------------|-----------|----------------|
| Component **props** on layout | `layout` document spec | Hero title, grid columns, button label |
| **Copy/media** in `$state` slots | `content` entry linked by `contentRef` | Product title, description, image ref |
| **Routing** | `page` + `page_tree` | Which URL → which layout (stays in `/admin/pages` for v1) |

Login pages (`/login`) and platform admin shells are **out of scope** for v1 visual editor — use existing admin screens.

---

## What already exists (do not rebuild)

| Piece | Location | Notes |
|-------|----------|-------|
| Identity, passwords, OAuth, MFA | **ZITADEL** | We broker; no custom password vault |
| JWT (`sub` = user id) | Login → cookie / Bearer | Used on edge + API |
| Team roles (`admin` / `editor`) | **ZITADEL** Role Assignment → JWT | **Not in Postgres** — remove legacy `teamRoles` |
| Role resolution | JWT project roles claim | `teamRoleFromJwt` (replace `teamRoleForUser` reading DB) |
| Admin-only auth routes | `auth/api.ts` | `requireTeamAdmin` — must use JWT role |
| MFA for admin | `requireMfaForAdmin` in Postgres | **Policy flag**, not a role assignment |
| Field-level CMS ACLs | — | **Skip** — split content docs/types; [`FIELD-ACL.md`](../2026-08-01/FIELD-ACL.md) |
| Editor shell | `packages/client/src/editor/` | `PropsPanel` + basic field types ✅ |
| Admin nav extract | `AdminNav`, `AdminPageHeader` | ✅ |

---

## Permission model (ZITADEL only for team RBAC)

**Decision:** Team roles and user permissions live in **ZITADEL only**. Postgres stores **store config** and **documents** (later: tuple scope). Full split: [`TEAM-ROLES-ZITADEL.md`](./TEAM-ROLES-ZITADEL.md).

### Document-level access (not field ACL)

> **Updated 2026-08-03:** Do not build per-field PropsPanel ACL. Restrict sensitive CMS data by **separate content types/entries** + layout references. Granular team scope later via tags + Zanzibar tuples.

### Roles (v1)

| Role | Assigned how | Storefront | `/admin` | `?edit=true` | Auth / team settings |
|------|----------------|------------|----------|--------------|------------------------|
| **visitor** | — (anonymous) | Read | — | — | — |
| **customer** | JWT, no team role grant | Read | — | — | — |
| **editor** | ZITADEL Role Assignment `editor` | Read | CMS (draft) | ✅ Edit props / content | — |
| **admin** | ZITADEL Role Assignment `admin` | Read | Full admin | ✅ Edit + publish | ✅ Auth, users, MFA policy |

Effective role = JWT project roles claim → **`admin` | `editor` | null**. Legacy Postgres `teamRoles` must be **removed**, not mirrored.

### Org policies (Postgres — not permissions)

| Flag | Effect |
|------|--------|
| `requireMfaForAdmin` | Block admin/edit surfaces until TOTP enrolled |

**Extend for editor:** same MFA gate on `?edit=true` when policy is on.

---

## Who can edit what (matrix)

| Action | admin | editor | customer / visitor |
|--------|-------|--------|---------------------|
| View published storefront | ✅ | ✅ | ✅ |
| `?edit=true` enter edit mode | ✅ | ✅ | ❌ |
| Edit layout props (visual panel) | ✅ | ✅ | ❌ |
| Save layout **draft** | ✅ | ✅ | ❌ |
| **Publish** layout | ✅ | ⚠️ v1: admin only (simplest) | ❌ |
| Edit content entry fields (allowed by schema) | ✅ | ✅ (per field permissions) | ❌ |
| Publish content | ✅ | ⚠️ v1: admin only or per-type | ❌ |
| `/admin/settings/auth`, team invite | ✅ | ❌ | ❌ |
| Delete document with refs | ✅ | ❌ (v1) | ❌ |

Start strict: **editors draft, admins publish**. Relax per content-type later.

---

## Gaps to close before editor UI

From [`SECURITY-HANDOFF.md`](./SECURITY-HANDOFF.md) — still open:

| # | Gap | Fix (before `?edit=true`) |
|---|-----|---------------------------|
| 1 | Document writes ignore team role | Resolve role from **JWT** (ZITADEL); pass into `ContentDocumentService` |
| 2 | Guards use legacy Postgres `teamRoles` | Switch to `teamRoleFromJwt`; **delete** `teamRoles` from tenant_settings |
| 3 | No server distinction editor vs admin on CMS | `requireTeamMember` / `requireTeamAdmin` from JWT role |
| 4 | MFA only on client `/admin/*` | Same check for edit mode; optional server middleware on write routes |
| 5 | Edge does not gate `?edit=true` | Worker: parse ZITADEL project roles from JWT |
| 6 | Direct `:3000` API in dev | Accept for seeds; edge is enforcement boundary in prod |
| 7 | Component `edit` metadata | Add `edit.fields` to catalog incrementally |

**Do not ship** click-to-edit until **JWT roles + document guards + edge gate** are done.

---

## Setup steps (build order)

**Canonical numbered order (OpenFGA → ZITADEL → … → Automerge → Hocuspocus):** [`VISUAL-EDITOR-IMPLEMENTATION-ORDER.md`](./VISUAL-EDITOR-IMPLEMENTATION-ORDER.md)

### Phase 0 — Permissions (ZITADEL roles + remove Postgres `teamRoles`)

1. **`init:zitadel`** — project roles + token claims  
2. **Invite / role APIs** — ZITADEL Role Assignment only; stop writing `teamRoles`  
3. **`teamRoleFromJwt`** — server + worker + `GET /api/auth/:slug/session`  
4. **Documents API** — guards using platform permission keys (field ACL not planned)  
5. **Edge** — `?edit=true` requires JWT with `editor` or `admin`  
6. **Client** — edit-mode gate from session `teamRole`  
7. **Delete** `teamRoles` from schema, migrations, seed

### Phase 1 — Editor UI (after Phase 0)

| Step | Work | Depends on |
|------|------|------------|
| 1 | `useEditState` — dirty spec, load/save/publish mutations | Documents API guards ✅ |
| 2 | `withEditing` + `overlay.tsx` — click/hover chrome | PropsPanel ✅ |
| 3 | Wire `?edit=true` lazy `import("./editor")` in `main.tsx` | Phase 0 client gate |
| 4 | `save-bar.tsx` — Save draft / Publish / Discard | Publish = admin |
| 5 | `edit` metadata on core + commerce components | Catalog |
| 6 | E2E: editor login as editor → draft OK, publish 403; admin → publish OK | — |

### Phase 2 — Polish (later)

- Published-only ref validation on publish
- Undo stack
- Rich field types (image-picker, product-picker)
- Per-content-type “editor can publish” flag

---

## Runtime flow (edit mode)

```
GET /about?edit=true
  → Edge: resolve slug, JWT, teamRole ∈ {admin, editor}
  → Edge: schema same as visitor (+ optional edit flag in response)
  → Client: lazy-load editor chunk
  → EditRenderer wraps catalog components
  → Click → PropsPanel
  → Save draft → PUT layout/content (requireTeamMember)
  → Publish → POST publish (requireTeamAdmin)
```

Normal visitors never download the editor chunk (`import()` split).

---

## What we are **not** doing

- Separate admin package or GrapesJS canvas (see [`VISUAL_EDITOR.md`](../2026-07-11/VISUAL_EDITOR.md))
- Platform-wide RBAC outside ZITADEL org + project grants
- Custom session store or password database
- Tenant MF / custom component publish (deferred — [`TENANT-MF-REIMPL.md`](./TENANT-MF-REIMPL.md))

---

## Validate permissions (before editor UI)

```bash
pnpm seed:demo
# Login as admin@zitadel.localhost → assign editor role to test user in /admin/settings/users

# Editor JWT — save layout draft → 200
# Editor JWT — publish layout → 403
# Admin JWT — publish → 200
# No JWT — GET /?edit=true at edge → redirect login or 403
# requireMfaForAdmin true, no TOTP — ?edit=true → redirect /account/security
pnpm test && pnpm typecheck
```

---

## Doc map

| Question | Doc |
|----------|-----|
| Click-to-edit UX, PropsPanel, save flow | [`VISUAL_EDITOR.md`](../2026-07-11/VISUAL_EDITOR.md) · [`VISUAL-EDITOR-UX.md`](./VISUAL-EDITOR-UX.md) |
| Zanzibar doc ACL + edit log + consistency | [`PERMISSIONS-REBAC.md`](./PERMISSIONS-REBAC.md) |
| Spec schema, merge, partial segment storage | [`SPEC-STORAGE-MERGE.md`](./SPEC-STORAGE-MERGE.md) |
| OSS libraries (OpenFGA, SpiceDB, Automerge, Yjs) | [`PERMISSIONS-OSS-REFERENCES.md`](./PERMISSIONS-OSS-REFERENCES.md) |
| **Practical build order (0→10)** | [`VISUAL-EDITOR-IMPLEMENTATION-ORDER.md`](./VISUAL-EDITOR-IMPLEMENTATION-ORDER.md) |
| ZITADEL team roles | [`TEAM-ROLES-ZITADEL.md`](./TEAM-ROLES-ZITADEL.md) |
| Admin CMS today | [`ADMIN-UI-LATER.md`](./ADMIN-UI-LATER.md) |
| ZITADEL + auth config | [`ORG-AUTH-CONFIG.md`](./ORG-AUTH-CONFIG.md) |
| Security bugs / open gaps | [`SECURITY-HANDOFF.md`](./SECURITY-HANDOFF.md) |
| Field permissions schema | [`documents-domain.md`](../2026-07-10/documents-domain.md) § Content Permissions |

---

*Update when Phase 0 permission code lands or the role matrix changes.*
