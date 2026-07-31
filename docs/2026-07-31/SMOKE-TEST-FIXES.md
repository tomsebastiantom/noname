# Smoke test fixes — 2026-07-31

Issues from [`LOCAL-SMOKE-TEST.md`](./LOCAL-SMOKE-TEST.md), root cause and fix per item.

---

## 1. Content admin — empty type list (fixed)

**Symptom:** `/admin/content` shows “No content types yet” while API has types.

**Root cause:** Edge resolved tenant org **JWT-first**. ZITADEL `orgId` on the token often ≠ demo tenant org (`383698238353506312`). Slug-in-path routes (`/api/auth/yogastore/config`) worked; slug-less routes (`/api/documents/content-types`) got wrong/empty org → empty list.

**Fix:**
1. `packages/workers/src/routes/resolve-proxy-org.ts` — path → Host → JWT order (tested in `resolve-proxy-org.test.ts`).
2. `packages/client/rspack.config.mjs` — `changeOrigin: false` on `/api` proxy.

**Ops:** Restart edge (`pnpm --filter @noname/workers dev`) after changing proxy code — wrangler does not always hot-reload route logic.

**Hardening:** `ContentEntryTypeList` now shows `loadError` when load fails (was silent empty table).

---

## 2. Client build — workspace TS parse errors (fixed)

**Symptom:** Rspack failed on `@noname/auth`, `shared`, `documents` source.

**Root cause:** SWC `include` only covered `client/src` and `extensions/` — workspace packages imported as raw `.ts`.

**Fix:** Added `../auth/src`, `../shared/src`, `../documents/src` to SWC include in `rspack.config.mjs`.

---

## 3. API startup — DATABASE_URL missing (doc + env)

**Symptom:** `pnpm dev` throws “DATABASE_URL is required”.

**Root cause:** `dotenv/config` loads cwd `.env`; `DATABASE_URL` lives in **root** `.env`, not `packages/server/.env` (R2-only).

**Fix:** Start API with `set -a && source .env && export REQUIRE_EDGE_HMAC=false && set +a && pnpm dev`. Added `REQUIRE_EDGE_HMAC=false` to root `.env.example`.

---

## 4. Seed — auth_provider entry validation (fixed)

**Symptom:** `pnpm seed:demo` exits on `POST /api/documents/auth_provider` — OAuth fields “required”.

**Root cause:** DB had stale `auth_provider` content type schema with OAuth fields marked `required: true`. Builtin rows (google/github/apple) only send name, provider_key, enabled, icon — credentials go through auth settings API.

**Fix:** `ensureAuthProviderContentType()` syncs full canonical schema when OAuth fields are incorrectly required or icon field missing.

---

## 5. Team admin route — not a bug

**Symptom:** `/admin/users` shows dashboard overview.

**Root cause:** Team list is at **`/admin/settings/users`** (`platform-routes.ts` → `admin_users` template). `/admin/users` falls through to `admin_home`. Seed nav links are correct.

**Action:** Smoke test doc updated; no code change.

---

## Re-verify after fixes

```bash
podman compose up -d
set -a && source .env && export REQUIRE_EDGE_HMAC=false && set +a
pnpm dev                                    # :3000
pnpm --filter @noname/workers dev           # :8787
pnpm --filter @noname/client dev            # :5173 — restart after rspack change
pnpm seed:demo
```

Open `http://yogastore.localhost:5173/admin/content` — should list `page`, `auth_provider`, etc.

---

## 6. Authenticated API — 302 to ZITADEL login (fixed)

**Symptom:** `/api/documents/content-types` (and other authed proxy routes) return **302** → empty admin panels, “Failed to fetch” in devtools. Happens after Podman restart while ZITADEL is still starting, or whenever JWKS cannot load.

**Root cause:** Edge JWT validation loads JWKS from `/.well-known/jwks.json`. ZITADEL serves keys at **`/oauth/v2/keys`** (see OpenID `jwks_uri`). Wrong URL → no keys → `tryParseJwt` fails → `validateJwt` redirects to login.

**Fix:** `packages/workers/src/jwks-cache.ts` — resolve JWKS URL via `/.well-known/openid-configuration` `jwks_uri` (with fallback). Tests in `jwks-cache.test.ts`.

**Ops:** Wait for `noname-zitadel-1` healthy before testing authed routes; restart edge after JWKS change.
