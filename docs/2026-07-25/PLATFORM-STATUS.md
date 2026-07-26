# Platform Status — Where We Are (2026-07-25)

> **Date:** 2026-07-25  
> **Purpose:** Short snapshot before the next build. Detail lives in linked docs — this file is the map, not the manual.  
> **Index:** [`ARCHITECTURE-MAP.md`](./ARCHITECTURE-MAP.md) · **Phases:** [`ROADMAP-PHASES.md`](./ROADMAP-PHASES.md)

---

## One-line summary

Multi-tenant storefront + admin on **json-render specs** and a **documents** CMS; **ZITADEL** owns identity; Postgres stores content, layouts, auth flags, and `{ documentId }` refs only.

---

## Build phases

```
✅ A      Login (email) + JWT
✅ B      Commerce + cart
✅ 1      CMS → edge $state → resolved spec
✅ A2     Per-org auth (Postgres + ZITADEL IdPs)
✅ C      Admin shell + CMS + auth + pages + login branding  (core done)
✅ 3      Store slug → org on edge (Host + path + KV)
📋 D      Visual editor, custom domains
```

---

## Shipped recently (this arc)

| Area | What | Doc |
|------|------|-----|
| **Document refs** | All pointers `{ documentId }`; validate on save | [`DOCUMENT-REFS.md`](./DOCUMENT-REFS.md) |
| **Resolve API** | `GET /api/documents/resolve-refs` — batch labels + asset previews | [`RESOLVE-REFS.md`](./RESOLVE-REFS.md) |
| **Admin Phase C** | Content, layouts, pages, auth settings, login branding | [`ADMIN-UI-LATER.md`](./ADMIN-UI-LATER.md) |
| **Phase 3 slug** | `yogastore.localhost` → edge KV + resolve API | [`PHASE-3-STORE-SLUG.md`](./PHASE-3-STORE-SLUG.md) |
| **Account flows** | Forgot password, sign-up, MFA login step | [`ACCOUNT-FLOWS.md`](./ACCOUNT-FLOWS.md) |
| **Domain doc sync** | `documents-domain.md` aligned with refs + resolve API | [`documents-domain.md`](../2026-07-10/documents-domain.md) |

---

## Runtime (dev)

```text
http://yogastore.localhost:5173          storefront
http://yogastore.localhost:5173/login    login (spec props + auth/config)
http://yogastore.localhost:5173/admin    admin (JWT required)
API :3000 · edge :8787 · ZITADEL :8080
pnpm seed:demo
```

| Admin route | Edits |
|-------------|--------|
| `/admin/content/:type` | CMS entries |
| `/admin/layout/:template` | Layout JSON specs |
| `/admin/pages` | URL routing |
| `/admin/settings/auth` | IdPs, password, sign-up, reset flags |
| `/admin/settings/login` | Title, logo, brand copy |

---

## Data model (mental model)

| Stored | Resolved at read |
|--------|------------------|
| `{ documentId }` in content + tenant auth icons | URLs, labels via resolve API / auth config / edge |
| Layout spec + `$state` slots | Edge merges CMS entry → resolved spec |
| Login copy in **layout spec** | Not CMS content entries |
| Passwords, MFA, users | **ZITADEL only** — server broker |

---

## APIs worth knowing

| API | Use |
|-----|-----|
| `GET /api/tenants/:slug/auth/config` | Login: providers, flags, icon URLs |
| `POST /api/tenants/:slug/auth/login` | Email login or `mfaRequired` |
| `POST …/auth/register` | Sign-up (if `allowSignUp`) |
| `POST …/auth/password-reset/*` | Forgot / confirm reset |
| `GET /api/documents/resolve-refs?ids=` | Batch ref → label/preview |
| `GET /api/edge/schema/:slug?template=` | Page spec (storefront + admin) |
| `GET /api/tenants/resolve/:slug` | Slug → org id (edge cache warm-up) |

Header: `x-org-id` on document APIs. Storefront client uses `:slug` in tenant URLs.

---

## Not done yet (next)

| Item | Why it matters | Doc |
|------|----------------|-----|
| Visual editor `?edit=true` | Click-to-edit storefront | [`VISUAL_EDITOR.md`](../2026-07-11/VISUAL_EDITOR.md) |
| Custom domains | `shop.example.com` → org | Phase D |
| Published-only refs / delete warnings | Safer CMS | [`DOCUMENT-REFS.md`](./DOCUMENT-REFS.md) § Future |
| Admin polish | `DataTable`, nav chrome | [`ADMIN-UI-LATER.md`](./ADMIN-UI-LATER.md) |

**Suggested next build:** **Visual editor** — Phase 3 slug is done.

---

## Doc layers (don’t mix)

| Layer | Doc | Question it answers |
|-------|-----|---------------------|
| **This file** | `PLATFORM-STATUS.md` | Where are we right now? |
| **Index** | `ARCHITECTURE-MAP.md` | Which doc do I open? |
| **Phases** | `ROADMAP-PHASES.md` | What order did we build in? |
| **Full CMS** | `documents-domain.md` | Content types, assets, locales |
| **Refs** | `DOCUMENT-REFS.md` + `RESOLVE-REFS.md` | Pointer shape + resolve API |
| **Login** | `LOGIN-UI.md` + `ACCOUNT-FLOWS.md` | Auth UI + broker flows |
| **Admin** | `ADMIN-UI-LATER.md` + `SPEC-DRIVEN-UI.md` | How to add admin screens |

---

## Validate quickly

```bash
pnpm seed:demo
# Login + Google icon → /login
# CMS → /admin/content
# Auth toggles → /admin/settings/auth (enable sign-up, save)
# Resolve → curl -H "x-org-id: $ORG" "localhost:3000/api/documents/resolve-refs?ids=..."
pnpm test && pnpm typecheck
```

---

*Update this file when a phase completes or the “next” list changes — keep it one screen.*
