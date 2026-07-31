# Codebase Audit — Open Issues

> **Date:** 2026-07-30 · **Updated:** 2026-07-31  
> **Purpose:** Track unfixed audit findings only.  
> **Fixed items:** [`docs/archive/2026-07-30/CODEBASE-AUDIT-FIXED.md`](../archive/2026-07-30/CODEBASE-AUDIT-FIXED.md)  
> **Index:** [`ARCHITECTURE-MAP.md`](../2026-07-25/ARCHITECTURE-MAP.md)

Severity: 🔴 high · 🟡 medium · 🟢 low

---

## Open — fix first

| P | Severity | Issue | Where | Fix |
|---|---|---|---|---|
| 16 | 🔴 | Mutating routes in `flags`, `machines`, `tenant`, `agent` have org scope only — no `requirePermission` | `*/api.ts` in those domains | Add `denyUnless(c, PERMISSIONS.X)`; likely new keys (`flags:write`, `tenant:manage`) |
| 12 | 🔴 | SSE broadcast + domain event bus are in-process only — breaks with 2+ API replicas | `shared/sse-manager.ts`, `shared/event-bus.ts` | Back with Dragonfly pub/sub |
| 13 | 🔴 | Tenant manifest/build-status store is in-memory only — BullMQ worker vs API can't share state | `tenant/adapters/manifest-store.ts` | Postgres or Dragonfly adapter behind existing `ManifestStore` port |
| 15 | 🟡 | Catalog bundler: no timeout/memory limit; arbitrary tenant `source` compiled unsandboxed | `tenant/adapters/bundler.ts`, `tenant/worker.ts` | Build timeout, resource cap, validate/sandbox `source` before rspack |
| 17 | 🟡 | `fetchUserinfo` has no timeout — hangs permission checks | `packages/auth/src/oidc/userinfo.ts` | Port `fetchWithTimeout`; optional response size check |
| 6 | 🟡 | No shared pagination; `error()` helper barely used | `auth/api.ts`, `documents/api.ts`, `tenant/api.ts` | `shared/pagination.ts`; standardize on `shared/respond.ts::error()` |
| 9 | 🟡 | Mixed error handling — adapters/auth throw generic `Error` | Postgres adapters, `auth/api.ts`, ZITADEL adapters | Document one rule; typed errors in service layer at minimum |
| 14 | 🟡 | Five server domains untested; no CI workflow | `agent`, `ai-pipeline`, `context`, `machines`, `tenant`; no `.github/workflows/` | Tests for bundler/engine first; CI runs typecheck/lint/vitest |
| 10 | 🟢 | Product/vision docs still under `docs/2026-05-23/` | `OVERVIEW.md`, `PRODUCT.md`, etc. | Move to `docs/product/`; keep `ARCHITECTURE-MAP.md` deprecated table current |

---

## Open — client / edge / packages

| Severity | Issue | Where | Fix |
|---|---|---|---|
| 🟡 | Same form boilerplate in 9 admin components | `packages/client/src/core/components/` | `useAsyncForm()` (deferred from P5) |
| 🟡 | MF shared-dep versions hardcoded in `mf-init.ts` | `packages/client/src/` | Build-time inject from `package.json` |
| 🟡 | ClickHouse creds default to dev values in code | `analytics/adapters/clickhouse.ts` | Fail loud if env unset in non-dev |
| 🟢 | Store-slug parsing duplicated client vs worker | `auth/org.ts`, `workers/src/resolve-slug.ts` | Shared pure util (runtime-specific caches stay local) |
| 🟢 | Re-export shims with no logic | `auth/login.ts`, `catalog.ts`, `registry.ts` | Delete shims; update imports |
| 🟢 | Large god-components | `ContentEntryAdmin.tsx`, `LoginForm.tsx` | Split by view/responsibility |
| 🟢 | `browser-sdk` init uses positional args | `packages/browser-sdk/src/` | Options-object factories |
| 🟢 | `packages/cli` commands are stubs | `packages/cli/` | Implement or mark `private` |
| 🟢 | Cart add does read-modify-write (2 round-trips) | `packages/extensions/src/commerce/cart.ts` | Incremental add-to-cart API |
| 🟢 | Overlapping role-picker helpers in `@noname/auth` | `packages/auth/src/` | Single parameterized helper; fix `@deprecated` JSDoc placement |
| 🟢 | `event-bus` payloads typed `unknown` / cast `any` at subscribers | `shared/event-bus.ts` | Typed event map |

---

## Open — docs hygiene

| Severity | Issue | Fix |
|---|---|---|
| 🟡 | ~15–20% of `docs/` still stale or redundant | Archive superseded files; banners on partial supersessions (`AUTH.md`, permissions docs) |
| 🟢 | Date folders conflate creation date with freshness | Point-in-time docs stay dated; canonical docs move topic-based over time |
| 🟢 | `ARCHITECTURE-MAP.md` deprecated table incomplete vs known supersessions | Update table whenever a doc is superseded |

Detail for doc filenames and archive candidates lived in the original audit; use [`ARCHITECTURE-MAP.md`](../2026-07-25/ARCHITECTURE-MAP.md) as the live index.

---

## Optional follow-ups (low urgency)

| Issue | Where |
|---|---|
| `auth/api.ts` — repeated parse/validate/catch per route (~460 lines) | Pair with P6/P9 (`parseBody` + central error handler) |
| `documents/ports.ts` large type-only file | Split only if ports grow further; not blocking |
| `documents/api.ts` imports `auth/guards` directly | Export guards from `auth/index.ts` if boundary polish wanted |
| Document `entity.ts`/adapter omissions in architecture map | One sentence in `ARCHITECTURE-MAP.md` |
