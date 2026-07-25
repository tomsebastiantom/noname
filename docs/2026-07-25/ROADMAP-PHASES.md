# Product Roadmap — Phased Build & Validate

> **Date:** 2026-07-25  
> **Status:** Active  
> **Related:** [`LOGIN-UI-PLAN.md`](./LOGIN-UI-PLAN.md), [`LOGIN-UI-MODERN-PLAN.md`](./LOGIN-UI-MODERN-PLAN.md), [`ORG-AUTH-CONFIG.md`](./ORG-AUTH-CONFIG.md), [`ADMIN-UI-LATER.md`](./ADMIN-UI-LATER.md), [`EXTENSIONS.md`](./EXTENSIONS.md), [`AUTH-IDENTITY.md`](./AUTH-IDENTITY.md)

---

## Principle

**Validate after each phase** — do not build full merchant ecommerce + admin before testing. Each phase has a clear “done when” so we know the platform works before adding scope.

```
Phase A  Login UI           → validate JWT E2E
Phase B  Commerce loop      → validate extension + machines
Phase C  Admin (minimal)    → validate merchant manage without seeds
Phase D  Scale & polish     → slug, domains, editor, 2nd extension
```

---

## Phase A — Login UI (current)

**Goal:** Sign-in on **our** page. ZITADEL = IdP only (no hosted login redirect as primary path).

| Task | Status |
|------|--------|
| `LoginForm` in core catalog | ✅ |
| `actions.login` / `actions.logout` | ✅ |
| `/login` route → `login` layout spec | ✅ |
| Edge `?template=login` on schema route | ✅ |
| Seed `login` layout document | ✅ |
| Replace AuthBar redirect with link to `/login` | ✅ |
| Tailwind + shadcn polish | ✅ basic — see [`LOGIN-UI-MODERN-PLAN.md`](./LOGIN-UI-MODERN-PLAN.md) for Clerk/Google phases |
| ZITADEL password grant enabled on SPA app | N/A — ZITADEL does not support ROPC; uses Session API via `/api/tenants/:orgId/auth/login` |
| `pnpm init:zitadel` creates login client PAT + `IAM_LOGIN_CLIENT` | ✅ |

**Validate when done:**

1. Open `{orgId}.localhost:5173/login`
2. Submit credentials → token stored
3. Redirect to `/` → API calls include `Authorization: Bearer`
4. Edge accepts JWT → HMAC → API

**Doc:** [`LOGIN-UI-PLAN.md`](./LOGIN-UI-PLAN.md) · Modern polish + Google: [`LOGIN-UI-MODERN-PLAN.md`](./LOGIN-UI-MODERN-PLAN.md)

---

## Phase B — Minimal commerce validation

**Goal:** Prove extensions + state machines — not a full store product.

| Task | Status |
|------|--------|
| Wire `addToCart` → generic machines API | ✅ |
| Cart machine definition (JSON) | ✅ |
| `pnpm seed:demo:commerce` + `extensions: ["commerce"]` | ✅ seed exists |
| One flow: product card → add to cart → see state | ✅ |

**Validate when done:**

1. Enable commerce extension in manifest
2. ProductCard renders from spec
3. Add to cart sends machine event (not `/api/commerce/*`)
4. Cart state readable (API or UI feedback)

**Do not build yet:** checkout, Stripe, product CRUD admin, inventory.

---

## Phase C — Admin UI (minimal)

**Goal:** Merchant can manage content without re-running seed scripts.

| Task | Status |
|------|--------|
| `AdminShell` + `/admin` route | 📋 |
| JWT + role gate on admin | 📋 |
| One screen: layout list or publish | 📋 |
| Visual editor (`?edit=true`) | Later |
| Full CRUD (products, flags, settings) | Incremental |

**Validate when done:**

1. Sign in → open `/admin`
2. See published layouts or publish a draft
3. Storefront reflects change without `pnpm seed:demo`

**Doc:** [`ADMIN-UI-LATER.md`](./ADMIN-UI-LATER.md)

---

## Phase D — Broader validation

| Item | Doc |
|------|-----|
| Store slug (`yogastore.localhost`) | [`PHASE-3-STORE-SLUG.md`](./PHASE-3-STORE-SLUG.md) |
| Custom domains | AUTH-IDENTITY Phase 4 |
| Tenant MF remotes | [`MODULE_FEDERATION.md`](../2026-07-11/MODULE_FEDERATION.md) |
| Second extension (booking) | [`EXTENSIONS.md`](./EXTENSIONS.md) |
| ZITADEL Login V2 / production auth | [`AUTH-IDENTITY.md`](./AUTH-IDENTITY.md) |

---

## What we already shipped (foundation)

| Piece | Status |
|-------|--------|
| Core platform catalog (vertical-agnostic) | ✅ |
| `@noname/extensions` + manifest `extensions` | ✅ |
| Edge JWT + HMAC | ✅ |
| Generic machines engine | ✅ |
| Documents / layouts | ✅ |
| Dev PKCE redirect (temporary) | ✅ → replaced in Phase A |

---

## Order summary

| # | Phase | Build | Validate |
|---|-------|-------|----------|
| **A** | Login | LoginForm, `/login`, token flow | ✅ shadcn + JWT access tokens |
| **B** | Commerce | Cart machine + extension wiring | Add to cart E2E — **in progress** |
| **C** | Admin | Shell + one manage screen | Publish without seed |
| **D** | Polish | Slug, editor, 2nd extension | Multi-use-case platform |

---

## References

- [`LOGIN-UI-PLAN.md`](./LOGIN-UI-PLAN.md) — Phase A detail
- [`ORG-AUTH-CONFIG.md`](./ORG-AUTH-CONFIG.md) — per-org auth settings (Clerk-like), ZITADEL + spec + admin
- [`EXTENSIONS.md`](./EXTENSIONS.md) — naming + extension architecture
- [`CLIENT-CATALOG-LAYERS.md`](./CLIENT-CATALOG-LAYERS.md) — core vs extension vs remote
