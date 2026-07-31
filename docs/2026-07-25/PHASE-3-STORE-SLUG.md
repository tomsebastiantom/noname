# Phase 3 — Store Slug + Edge Hostname Lookup

> **Date:** 2026-07-25  
> **Status:** ✅ Implemented  
> **Depends on:** Phase 2 (PKCE login) ✅  
> **Related:** [`AUTH-IDENTITY.md`](./AUTH-IDENTITY.md), [`PLATFORM-STATUS.md`](./PLATFORM-STATUS.md)

---

## Goal

Use friendly dev URLs like **`http://yogastore.localhost:5173`** instead of the numeric ZITADEL org id in the subdomain (`http://383371762538184712.localhost:5173`).

Production shape is the same: hostname identifies the store; edge resolves it to `org_id` before proxying. Auth (JWT + HMAC) stays unchanged.

---

## Current vs target

| | Before Phase 3 | Now ✅ |
|---|----------------|--------|
| Dev URL | `{orgId}.localhost:5173` | `{slug}.localhost:5173` e.g. `yogastore.localhost:5173` |
| Client paths | Numeric org id | **Store slug** in `/api/tenants/:slug`, `/api/edge/schema/:slug` |
| Edge org resolution | JWT → path → **Host slug** → `x-org-id` | Same order; path slug resolved via KV + `GET /api/tenants/resolve/:slug` |

---

## What was built

### 1. Store slug in DB

`slug` on `tenant_settings.data` (e.g. `"yogastore"`). Uniqueness enforced on save.

**Constraints:** lowercase `[a-z0-9-]`, unique per platform; reserved names (`www`, `api`, `admin`, etc.) rejected.

**API:** `GET /api/tenants/resolve/:slug` → `{ orgId, slug }` (edge cache warm-up + client bootstrap).

### 2. Seed

`scripts/seed-demo.ts` sets `slug: "yogastore"` and logs `http://yogastore.localhost:5173`.

### 3. Edge lookup

`packages/workers/src/resolve-slug.ts` + `routes/proxy.ts`:

1. Parse `Host` → store slug (`yogastore.localhost:5173` → `yogastore`)
2. Resolve slug → `org_id` (Workers KV keyed by slug, miss → API)
3. Use resolved `org_id` for HMAC when JWT/path/header do not already provide it
4. Reject unknown host with 404

**Resolution order:**

```
JWT org claim  →  URL path slug  →  Host → slug lookup
```

Public paths use **slug** in the segment (`/api/edge/schema/yogastore`, `/api/auth/yogastore/...`, `/api/tenants/yogastore/catalog`, …). Edge and server resolve slug → org id before upstream HMAC.

### 4. Client

`packages/client/src/main.tsx` + `auth/org.ts`:

- Subdomain = store slug (`slugFromHostname`)
- All tenant/edge fetches use slug in path (no numeric org id in URLs)

Plain `localhost:5173` without subdomain still shows setup error (no default store).

### 5. Dev URL

```bash
pnpm seed:demo
open http://yogastore.localhost:5173
```

No `/etc/hosts` change — `*.localhost` resolves in modern browsers.

---

## Out of scope for Phase 3

| Item | Phase |
|------|-------|
| Custom domains (`shop.example.com`) | Phase 4 |
| Drop client `x-org-id` header | ✅ Done (edge: JWT → path; server scripts may still set `x-org-id` for direct API) |
| Wrangler in Docker / compose | Phase 4 |
| Slug change UI / admin API | Later |

---

## Auth impact

**None required.** Edge already:

- Validates JWT on protected routes
- Signs HMAC with `orgId` / `userId` / `role`

Phase 3 only changes **how `orgId` is discovered** from the incoming request (Host → slug → org id). PKCE login, token storage, and Bearer headers stay as-is.

---

## Implementation checklist

- [x] Schema: `slug` on `tenant_settings` (+ uniqueness on save)
- [x] `seed:demo` → `yogastore`
- [x] Server: `GET /api/tenants/resolve/:slug` + `resolveSiteIdToOrgId` on edge, tenant, and `/api/auth` paths
- [x] Edge: Host → slug → org id (KV cache in `resolve-slug.ts`)
- [x] Edge proxy: slug in path segments resolved to org id for HMAC upstream
- [x] Edge public routes: auth config, login, register, password-reset, MFA, OAuth start
- [x] Client: slug subdomain + slug in fetch paths (`main.tsx`, `auth/org.ts`)
- [x] Tests: `site-id.test.ts`, `resolve-slug.test.ts`
- [x] Docs: `AUTH-IDENTITY.md`, this file

---

## References

- [`AUTH-IDENTITY.md`](./AUTH-IDENTITY.md) — identity model + phase status
- [`docs/2026-07-13/AUTH.md`](../2026-07-13/AUTH.md) — JWT + edge + HMAC
- `packages/workers/src/routes/proxy.ts` — current org resolution
- `packages/client/src/main.tsx` — current subdomain → org id
