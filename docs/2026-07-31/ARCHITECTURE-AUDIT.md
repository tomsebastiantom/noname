# Architecture Audit — Code & Patterns

> **Date:** 2026-07-31  
> **Scope:** Full monorepo after standardization sprint  
> **Status:** Proofread ✅  
> **Related:** [`ARCHITECTURE-PATTERNS.md`](./ARCHITECTURE-PATTERNS.md) · [`SHARED-PACKAGES.md`](./SHARED-PACKAGES.md) · [`CLIENT-ACTIONS.md`](../2026-07-25/CLIENT-ACTIONS.md)

---

## Executive summary

The codebase is in **good shape** for a monolith at this stage. The target patterns from [`ARCHITECTURE-PATTERNS.md`](./ARCHITECTURE-PATTERNS.md) are largely implemented. Remaining issues are **P2 cleanup** (god components, `fetchWithTimeout` triplication) — not structural rot.

**Do not churn** working domains for theoretical purity. Fix what causes bugs or blocks the next feature.

---

## Package map

| Package | Role | Clean? |
|---|---|---|
| `@noname/server` | System of record — all domain logic | ✅ |
| `@noname/client` | json-render UI + admin | ✅ (client-side gaps below) |
| `@noname/workers` | Edge proxy, JWT gate, slug resolve via HTTP | ✅ — no server port imports |
| `@noname/auth` | Permissions, JWT, edit-mode (server + workers + client) | ✅ |
| `@noname/documents` | CMS wire types + ref/label pure helpers (client + server) | ✅ (finish schema unification) |
| `@noname/shared` | Domain-agnostic pure helpers (slug, coerceScalarString) | ✅ |
| `@noname/extensions` | Manifest-gated extension catalogs (commerce) | ✅ |

```
@noname/shared          ← generic pure (3+ consumers)
@noname/auth            ← auth wire contract
@noname/documents       ← CMS wire contract
@noname/server          ← behavior + storage
@noname/client          ← HTTP + json-render
@noname/workers         ← HTTP to server only
```

---

## Good patterns (keep doing)

### Server

| Pattern | Where | Why it works |
|---|---|---|
| `createXDomain(deps) → { routes, service }` | All domains | Explicit wiring in `index.ts` |
| Thin `api.ts` + `routes/*.ts` | auth, documents, analytics, flags, context, agent, tenant, machines, ai-pipeline | Reviewable route groups |
| `denyUnless(c, PERMISSIONS.*)` | Most mutating routes | Single auth gate |
| `flushEvents(entity)` | content, layout, flags service, agent | Aggregate-root event collection |
| `documents/contracts.ts` | auth, tenant, edge, analytics imports | Cross-domain boundary |
| `domain-events.ts` + `ALL_DOMAIN_EVENTS` | Analytics auto-subscribe | No phantom events |
| `shared/respond.ts`, `domain-error.ts`, `parse-body.ts` | HTTP layer | Consistent errors |
| `eventBus.publish` after persist | pages, assets, content-types, tenant-settings, machines, context, flags eval | Service/runtime — no aggregate class |

### Client

| Pattern | Where | Why it works |
|---|---|---|
| `platform/catalog.ts` merges core + admin schemas | 11 lines | Thin assembler |
| `platform/registry.ts` merges core + admin components | 12 lines | Same |
| `admin/registry.ts` + `admin/catalog-schemas.ts` | Admin panel isolation | Matches extensions pattern |
| `MountAction` + `ADMIN_STATE` + `useStateValue` | team, flags, replay, routing | Spec-driven data loads |
| `useActions().execute()` for mutations | CMS save/publish, layout, auth save | Catalog action layer |
| `@noname/documents` for refs + labels | `content-entries.ts` re-exports | No label drift vs server |

### Shared / tests

| Pattern | Where |
|---|---|
| Colocated `*.test.ts` | `@noname/shared`, `@noname/documents`, `@noname/auth`, server domains |
| Pure logic tested in-package | `refs.test.ts`, `locale.test.ts`, `store-slug.test.ts` |
| Integration tests at boundary | `api-permissions.test.ts`, `content.service.test.ts` |

---

## Bad patterns (remaining)

Ranked by **bug risk**, not line count.

### P1 — Fixed (2026-07-31)

| Issue | Fix |
|---|---|
| Client admin read bypass | `loadContentAdmin`, `loadLayoutAdmin`, `loadAuthSettings` + `ADMIN_STATE` + `useMountAction` |
| `canDraft` drift | `canDraftFromPermissions` + `sessionCanDraft` via `@noname/auth` |
| Permission string literals | Client uses `PERMISSIONS` from `@noname/auth` |
| Dual `ContentTypeSchema` | Server `ports.ts` imports from `@noname/documents`; `FieldDefinition` aliased |
| Two event publish styles | Documented — **keep both; do not add a third** (see decision table) |

### P2 — Cleanup when convenient

| Issue | Location | Notes |
|---|---|---|
| **`parseBody` only in auth** | All other domains use raw `c.req.json()` | OK for internal admin APIs; add Zod at the HTTP boundary when exposing publicly |
| **`edge/api.ts` — routes not split** | 34 lines — not a god file | Split only if `/personalize` grows |
| **God components** | ~~`AuthSettingsForm`, `login-views`, `ContentEntryAdmin`~~ | ✅ Split into section components / `login-views/*` / action hook |
| **`fetchWithTimeout` triplicated** | ~~auth, workers, client~~ | ✅ Consolidated in `@noname/auth` |
| **`requireAuthManage` vs `denyUnless`** | Auth domain only | Intentional — auth routes need user context |

### P3 — Defer / by design

| Item | Why defer |
|---|---|
| Edge HMAC routes (no JWT) | Worker path — intentional |
| `@noname/documents` in workers | No CMS parsing at edge yet |
| Per-event payload typing on event bus | No consumer needs strict shapes |
| Microservices split | Monolith wiring is fine |

---

## Server domain matrix

| Domain | `routes/` split | Events | Auth | Notes |
|---|---|---|---|---|
| auth | ✅ 8 modules | — | `requireAuthManage` / public | Only user of `parseBody` |
| documents | ✅ 7 modules | flushEvents + direct publish | `denyUnless` on writes | Hub domain |
| analytics | ✅ 3 modules | subscribe only | custom view guard | |
| flags | ✅ 3 modules | flushEvents + direct publish (eval) | `denyUnless` | Eval path is hot |
| context | ✅ 2 modules | direct publish | partial | `/resolve` unguarded (runtime) |
| agent | ✅ 1 module | flushEvents | `denyUnless` | |
| tenant | ✅ 3 modules | — | mixed public/manage | |
| machines | ✅ 2 modules | direct publish in engine | `denyUnless` | XState — keeps `engine.ts` |
| ai-pipeline | ✅ 1 module | — | `denyUnless` | |
| edge | inline (34 lines) | — | org HMAC / public schema | Thin orchestrator |

### Event publishing — two styles only

| Style | API | Use when | Examples |
|---|---|---|---|
| **Aggregate (deferred)** | `entity.apply()` then `flushEvents(entity)` | Mutable object with lifecycle; events belong to state transition; flush **after** persist | `ContentDocument`, `LayoutDocument`, `FeatureFlag`, `AgentTask` |
| **Direct (immediate)** | `void eventBus.publish(name, payload)` | No aggregate class, or runtime/telemetry on read paths | pages, assets, content-types, tenant-settings, machines engine, context resolve, `flag.evaluated` |

**Removed:** `emitDocumentEvent` — it was a thin alias for `eventBus.publish` with no extra behavior. Do not reintroduce domain-specific publish wrappers.

**Do not migrate** pages/assets to `AggregateRoot` unless you need multi-event atomic batches or rich in-object validation. Procedural services that publish one event after save are fine on the direct path.

**Flags is the reference split:** CRUD on `FeatureFlag` → `flushEvents`; hot evaluation path → direct `eventBus.publish(FlagEvents.EVALUATED, …)`.

All analytics-bound payloads must include **`orgId`**.

---

## Client data-flow patterns

```
Pattern A (all admin panels):
  useMountAction → catalog load action → ADMIN_STATE → useStateValue
  mutations → execute({ action })
```

---

## Test file conventions

| Rule | Example |
|---|---|
| Colocate `foo.test.ts` beside `foo.ts` | `content.service.test.ts` |
| Cross-cutting HTTP guards | `api-permissions.test.ts` at domain root |
| Pure helpers in shared packages | `packages/documents/src/locale.test.ts` |
| 3–5 cases per behavior, not coverage theater | 401 / 403 / 200 for permission guards |

**Do not test:** thin re-export shims, Drizzle adapters, one-line route delegates.

---

## Anti-patterns (never add)

| Anti-pattern | Why |
|---|---|
| Domain logic in `@noname/shared` | Stays domain-agnostic — slug/coerce helpers only; wire types belong in `@noname/auth` / `@noname/documents` |
| Server domain imports in workers | Workers have no DB — HTTP + `@noname/auth` / `@noname/shared` only |
| `eventBus.publish` in route handlers | Routes are HTTP adapters — publish from service/runtime or `flushEvents(entity)` |
| Phantom events in `ALL_DOMAIN_EVENTS` | Analytics auto-subscribes to every name — only register events with active publishers |
| Direct `clearSession()` in admin components | `session.ts` is auth infrastructure — call `logout` action or `performLogout()` from UI |
| New admin components in `core/components.tsx` | `core/components.tsx` is storefront + auth shell — register admin panels in `admin/registry.ts` |
| Duplicate ref/label logic outside `@noname/documents` | Single source for ref parsing and entry labels — import from `@noname/documents` (server: `refs/parse.ts` re-export) |

---

## Recommended next steps (ordered)

1. **P2:** add Zod at HTTP boundaries when exposing admin APIs publicly
2. **P2:** split `edge/api.ts` only if `/personalize` grows

---

## Scorecard

| Area | Grade | One-line |
|---|---|---|
| Package boundaries | A | Workers clean; shared libs scoped |
| Server domain structure | A- | 9/10 domains split; 2 event styles |
| Event/analytics pipeline | A | orgId fixed; all CMS events wired |
| Client catalog/registry | A | Split done; reads use load actions |
| Shared packages | A | shared + auth + documents clear roles |
| Test discipline | A- | `pages.service` event tests added |
| Documentation | A- | Package READMEs for shared/auth/documents; SHARED-PACKAGES synced |

**Overall: B+ → A-** — solid monolith architecture with known, bounded consistency debt.
