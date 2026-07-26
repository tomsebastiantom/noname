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

## Pieces to build (when we implement)

### 1. Store slug in DB

**Option A (preferred):** add `slug` to `tenant_settings.data` (or top-level field if we split it out).

```json
{
  "slug": "yogastore",
  "defaultLocale": "en-US",
  "locales": ["en-US"]
}
```

**Option B:** small lookup table `store_hosts (hostname, org_id)` for custom domains later — can defer until Phase 4.

**Constraints:**

- Slug: lowercase, `[a-z0-9-]`, unique per platform
- Reserved: `www`, `api`, `admin`, `localhost`, etc.

**API:** optional public route for edge cache warm-up, e.g. `GET /api/edge/resolve?host=yogastore.localhost` → `{ orgId }` — or edge calls existing tenant settings internally via HMAC/service path.

### 2. Seed

Update `scripts/seed-demo.ts`:

- Set `slug: "yogastore"` in demo `tenant_settings`
- Log dev URL: `http://yogastore.localhost:5173`

### 3. Edge lookup

In `packages/workers/src/routes/proxy.ts` (or a small `resolveHost.ts`):

1. Parse `Host` → store slug (first label: `yogastore.localhost:5173` → `yogastore`)
2. Resolve slug → `org_id` (Workers KV cache keyed by slug, miss → API lookup)
3. Use resolved `org_id` for HMAC when JWT/path/header do not already provide it
4. Reject unknown host with 404

**Resolution order (proposed):**

```
JWT org claim  →  URL path org segment  →  Host → slug lookup (Phase 3)
```

Public GET routes today embed org in path (`/api/edge/schema/:orgId`). Phase 3 can either:

- Keep path segment as org id (client fetches slug→org once), or
- Change to slug in path and let edge rewrite to org id upstream — **decide at implementation time**

### 4. Client

In `packages/client/src/main.tsx`:

- Replace `orgIdFromHostname` with **`slugFromHostname`** (same parsing, different meaning)
- Either:
  - Call edge with slug in paths and let edge resolve, or
  - One-time resolve slug → org id for API paths (simpler short-term)

Remove requirement that subdomain be numeric. Plain `localhost:5173` still shows setup error unless we add a default store.

### 5. Dev URL

```bash
# after seed
open http://yogastore.localhost:5173
```

No `/etc/hosts` change needed — `*.localhost` resolves in modern browsers.

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
- [x] Server: `GET /api/tenants/resolve/:slug` + `resolveSiteIdToOrgId` on edge/tenant/auth paths
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
