# Audit — Fixed Items (2026-07-31 batch)

> **Archived from:** [`CODEBASE-AUDIT-CLEANUP.md`](../../2026-07-30/CODEBASE-AUDIT-CLEANUP.md), [`DOMAIN-CLEANUP-AUDIT.md`](../../2026-07-31/DOMAIN-CLEANUP-AUDIT.md)  
> **Prior fixes:** [`CODEBASE-AUDIT-FIXED.md`](../2026-07-30/CODEBASE-AUDIT-FIXED.md)

---

## Documents domain

| Item | Area | Done |
|---|---|---|
| Split `helpers.ts` → `content-write`, `content-type-validation`, `layout-helpers`, `assets/enrich`, `tenant-defaults` | Server | ✅ 2026-07-31 |
| `shared/locale.ts` — `pickLocalizedValue`, `labelFromContentData`, `resolveTenantLocales` | Server | ✅ 2026-07-31 |
| `assets/url.ts` + client `lib/asset-url.ts` (storageKey parity) | Server / Client | ✅ 2026-07-31 |
| `document-guards.ts` — asset, layout, content entry guards | Server | ✅ 2026-07-31 |
| `shared/document-status.ts` — `isPublished()` (pages, layouts, auth-provider) | Server | ✅ 2026-07-31 |
| `prepareContentWrite()` — shared create/update pipeline | Server | ✅ 2026-07-31 |
| `routing-page.ts` — `toRoutingPageView()` | Server | ✅ 2026-07-31 |
| `/resolve-refs` uses `parseRefIdsParam()` | Server | ✅ 2026-07-31 |
| `defaultTenantSettings()` uses `DEFAULT_TENANT_AUTH` | Server | ✅ 2026-07-31 |
| Client `documentIdFromFieldValue` in `content-entries.ts` | Client | ✅ 2026-07-31 |
| Remove dead `normalizeDocumentRef` | Server | ✅ 2026-07-31 |
| `@noname/documents-shared` | — | ✅ Deferred (documented in [`SHARED-PACKAGES.md`](../../2026-07-31/SHARED-PACKAGES.md)) |
| Client `entryLabel` / `/resolve-refs` parity | Client | ⏸ Deferred — use API when label drift bites |

---

## Other domains (flags, agent, edge, analytics, auth, machines)

| Item | Area | Done |
|---|---|---|
| Flags: `evaluation.ts`, `flag-validation.ts`, `flag-guards.ts`, `shared/flag-status.ts`, `FeatureFlag.fromDTO()` | Server | ✅ 2026-07-31 |
| Agent: `task-guards.ts`, `task-lifecycle.ts`, worker → entity + `flushEvents` | Server | ✅ 2026-07-31 |
| Edge: `flags-map.ts` — `evaluationsToFlagMap()` | Server | ✅ 2026-07-31 |
| Analytics: `query-filters.ts` — `dateRangeFromQuery()` | Server | ✅ 2026-07-31 |
| Auth: `zitadel/issuer.ts`, `resolveRouteOrgId()`, `assertPasswordResetEnabled()` | Server | ✅ 2026-07-31 |
| Machines: `GET /definitions` → `engine.listDefinitions()` | Server | ✅ 2026-07-31 |
| Dead `notFound` branches in flags/agent APIs | Server | ✅ 2026-07-31 |

---

## Pre-production cleanup & quality

| Item | Area | Done |
|---|---|---|
| Remove deprecated/legacy shims (`login.ts`, `catalog.ts`, `registry.ts`, ref aliases, etc.) | Server / Client | ✅ 2026-07-31 |
| SonarQube S3358 — nested ternary extractions | Server / Client | ✅ 2026-07-31 |
| Test split/rename (`content.service.test`, `assets.service.test`) | Server | ✅ 2026-07-31 |
| [`SHARED-PACKAGES.md`](../../2026-07-31/SHARED-PACKAGES.md) — when to add domain shared packages | Docs | ✅ 2026-07-31 |

---

## Docs archive moves (same period)

| Item | Done |
|---|---|
| `docs/2026-05-23/*` → `docs/archive/2026-05-23/` | ✅ 2026-07-30 |
| Product docs → `docs/product/` | ✅ 2026-07-31 |
| Audit doc slimmed to open-only + fixed archive | ✅ 2026-07-31 |
