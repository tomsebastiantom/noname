# Local smoke test — post-refactor

Infra: `podman compose up -d`. Apps on host (three terminals). Fixes: [`SMOKE-TEST-FIXES.md`](./SMOKE-TEST-FIXES.md).

## Start (every session)

```bash
podman compose up -d
set -a && source .env && export REQUIRE_EDGE_HMAC=false && set +a
pnpm --filter @noname/server db:push    # fresh DB only
pnpm dev                                # :3000 — needs root .env DATABASE_URL
pnpm --filter @noname/workers dev       # :8787 — restart after proxy.ts changes
pnpm --filter @noname/client dev        # :5173 — restart after rspack.config.mjs changes
pnpm seed:demo                          # idempotent
```

**URL:** `http://yogastore.localhost:5173`  
**Login:** `admin@zitadel.localhost` / `NonameAdmin1!`

---

## Results (2026-07-31)

| Phase | Status | Notes |
|-------|--------|-------|
| 1 Automated | PASS | fix, typecheck, 164 tests (incl. proxy org resolution) |
| 2 Public UI | PASS | home + login from spec |
| 3 Auth | PASS | email login, Sign out |
| 4 Admin UI | PASS* | auth settings ✅; content types ✅ after edge restart; team `/admin/settings/users` |
| 5 API / seed | PASS | seed completes; 2 content types in DB |

\*Restart **edge + client** after pulling proxy/rspack fixes.

---

## Phase 1 — Automated

| # | Command | Pass |
|---|---------|------|
| 1.1 | `pnpm fix` | exit 0 |
| 1.2 | `pnpm typecheck` | exit 0 |
| 1.3 | `pnpm test` | all pass |
| 1.4 | `podman compose ps` | postgres, zitadel, dragonfly up |
| 1.5 | `curl -sf localhost:8080/.well-known/openid-configuration` | JSON |
| 1.6 | `curl -sf localhost:3000/health` | 2xx |
| 1.7 | `curl -sf localhost:8787/api/edge/schema/yogastore?template=home&segment=default` | layout JSON |

---

## Phase 2 — Public UI

| # | URL | Pass |
|---|-----|------|
| 2.1 | `/` | spec content (Welcome, flags, CTA) |
| 2.2 | network `/api/edge/schema` | 200 |
| 2.3 | `/login` | LoginForm from spec |
| 2.4 | `/api/tenants/yogastore/catalog` | 200 |

---

## Phase 3 — Auth

| # | Action | Pass |
|---|--------|------|
| 3.1 | `/login` → demo credentials | redirect, token stored |
| 3.2 | session | Sign out / Bearer on API |

---

## Phase 4 — Admin UI (logged in)

| # | Panel | Route |
|---|-------|-------|
| 4.1 | Auth settings | `/admin/settings/auth` |
| 4.2 | Content types | `/admin/content` |
| 4.3 | Layout editor | `/admin/layout` |
| 4.4 | Login appearance | `/admin/settings/login` |
| 4.5 | Team users | `/admin/settings/users` |
| 4.6 | Feature flags | `/admin/settings/flags` |
| 4.7 | Pages / routing | `/admin/pages` |

Draft panels: load → edit → save → reload persists (auth settings, content, layout).

---

## Phase 5 — API (authenticated)

| # | Endpoint | Pass |
|---|----------|------|
| 5.1 | `GET /api/documents/content-types` | lists `page`, `auth_provider` |
| 5.2 | `GET /api/documents/layout` | layout entries |
| 5.3 | `GET /api/flags` | flag list |
| 5.4 | save auth config via UI | persisted on reload |
