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
| **Document refs** | All pointers `{ documentId }`; validate on save; 400 on bad refs | [`DOCUMENT-REFS.md`](./DOCUMENT-REFS.md) |
| **Ref backrefs + delete warnings** | `GET /ref-backrefs`; admin delete confirm | [`DOCUMENT-REFS.md`](./DOCUMENT-REFS.md) |
| **Resolve API** | `GET /api/documents/resolve-refs` — batch labels + asset previews | [`RESOLVE-REFS.md`](./RESOLVE-REFS.md) |
| **Admin Phase C** | Content, layouts, pages, auth settings, login branding | [`ADMIN-UI-LATER.md`](./ADMIN-UI-LATER.md) |
| **Admin polish** | DataTable lists, settings nav, delete-ref warnings | [`ADMIN-UI-LATER.md`](./ADMIN-UI-LATER.md) |
| **Phase 3 slug** | `yogastore.localhost` → edge KV + resolve API (slug-only) | [`PHASE-3-STORE-SLUG.md`](./PHASE-3-STORE-SLUG.md) |
| **Account flows** | Forgot password, sign-up, MFA login + TOTP enrollment | [`ACCOUNT-FLOWS.md`](./ACCOUNT-FLOWS.md) |
| **Auth security hardening** | MFA policy, team admin, JWT guards, persistence fixes | [`SECURITY-HANDOFF.md`](./SECURITY-HANDOFF.md) |
| **Tenant MF remotes** | Proven in dev, code reverted — docs only | [`TENANT-MF-REIMPL.md`](./TENANT-MF-REIMPL.md) |
| **Tenant MF Git source** | Planned | [`TENANT-MF-GIT.md`](./TENANT-MF-GIT.md) |
| **Domain doc sync** | `documents-domain.md` aligned with refs + resolve API | [`documents-domain.md`](../2026-07-10/documents-domain.md) |
| **Validation errors** | `ValidationError` → HTTP 400 (not 500) | `packages/server/src/shared/error-handler.ts` |

---

## Runtime (dev)

```text
http://yogastore.localhost:5173          storefront
http://yogastore.localhost:5173/login    login (spec props + auth/config)
http://yogastore.localhost:5173/admin    admin (JWT required)
http://yogastore.localhost:5173/account/security   MFA enrollment (JWT required)
API :3000 · edge :8787 · ZITADEL :8080
pnpm seed:demo
```

| Admin route | Edits |
|-------------|--------|
| `/admin/content/:type` | CMS entries |
| `/admin/layout/:template` | Layout JSON specs |
| `/admin/pages` | URL routing |
| `/admin/settings/auth` | IdPs, password, sign-up, reset flags, MFA policy |
| `/admin/settings/users` | Team list, invite, roles |
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
| `POST …/auth/mfa/totp/register` | Start TOTP enrollment (JWT) |
| `POST …/auth/mfa/totp/confirm` | Confirm TOTP enrollment |
| `GET /api/documents/resolve-refs?ids=` | Batch ref → label/preview |
| `GET /api/documents/ref-backrefs?documentId=` | Inbound refs before delete |
| `GET /api/edge/schema/:slug?template=` | Page spec (storefront + admin) |
| `GET /api/tenants/:slug/auth/session` | MFA policy + enrollment status (JWT) |
| `GET /api/tenants/:slug/auth/users` | List org team (JWT) |
| `POST …/auth/users/invite` | Invite by email + role |
| `PUT …/auth/users/:userId/role` | Assign admin/editor |

Header: `x-org-id` on document APIs. Storefront client uses `:slug` in tenant URLs.

---

## Not done yet (next)

| Item | Why it matters | Doc |
|------|----------------|-----|
| Visual editor `?edit=true` | Click-to-edit — **start:** [`VISUAL-EDITOR-IMPLEMENTATION-ORDER.md`](./VISUAL-EDITOR-IMPLEMENTATION-ORDER.md) | [`VISUAL_EDITOR.md`](../2026-07-11/VISUAL_EDITOR.md) |
| Custom domains | `shop.example.com` → org | Phase D |
| Published-only refs | Stricter ref validation on publish | [`DOCUMENT-REFS.md`](./DOCUMENT-REFS.md) § Future |

**Suggested next build:** **Visual editor** — admin polish and MFA enrollment are done.

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
| **Security** | `SECURITY-HANDOFF.md` | Auth hardening issues, fixes, test checklist |
| **Admin** | `ADMIN-UI-LATER.md` + `SPEC-DRIVEN-UI.md` | How to add admin screens |

---

## Validate quickly

```bash
pnpm seed:demo
# Login + Google icon → /login
# CMS + delete warnings → /admin/content/:type
# Auth toggles → /admin/settings/auth
# MFA enroll → /account/security
# Resolve → curl -H "x-org-id: $ORG" "localhost:3000/api/documents/resolve-refs?ids=..."
# Backrefs → curl -H "x-org-id: $ORG" "localhost:3000/api/documents/ref-backrefs?documentId=..."
pnpm test && pnpm typecheck
```

---

*Update this file when a phase completes or the “next” list changes — keep it one screen.*
