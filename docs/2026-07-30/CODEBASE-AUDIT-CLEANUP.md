# Codebase & Docs Audit — Cleanup Recommendations

> **Date:** 2026-07-30
> **Purpose:** Full-repo pass (server domains, client, browser-sdk, workers, docs) looking for (1) code that overlaps/duplicates across domains and could be consolidated, (2) fragile spots likely to break, (3) scalability risks, and (4) doc cleanup. Read this alongside [`../2026-07-25/ARCHITECTURE-MAP.md`](../2026-07-25/ARCHITECTURE-MAP.md) and [`../2026-07-25/PLATFORM-STATUS.md`](../2026-07-25/PLATFORM-STATUS.md).
> **Scope note:** Audit/recommendation doc. Findings are being fixed incrementally (see §5); each item is only marked ✅ **Fixed** below once the change has actually been made and verified (typecheck/tests passing). §4 is a second, deeper pass added 2026-07-30 — those findings are new and **not yet fixed**; this pass was read-only by request (find issues, don't fix them). Severity: 🔴 high · 🟡 med · 🟢 low.

---

## TL;DR — top things to fix first

**Round 2 (2026-07-30, deeper pass) — highest severity, not yet fixed:**

0. 🔴 **Edge-auth is fail-open by default (`REQUIRE_EDGE_HMAC` unset).** If a request to the API server omits the `x-auth-hmac` header, `packages/server/src/shared/org.ts`'s `orgMiddleware` accepts the caller-supplied `x-org-id`/`x-user-id`/`x-role` headers with no verification — it only `console.warn`s. `REQUIRE_EDGE_HMAC=true` is commented out in both `.env.example` files, so a deployment that copies the example as-is (or simply forgets this one flag) lets anyone with network access to the API server impersonate any org, user, or role by omitting one header. See §4.1.
0. 🔴 **Live flag SSE broadcast and the domain event bus are in-process-only — break silently the moment the server scales past one instance.** `shared/sse-manager.ts` and `shared/event-bus.ts` are plain in-memory `Map`s with no Redis/Dragonfly-backed pub/sub, even though Dragonfly is already deployed for BullMQ. Run two API replicas behind a load balancer and: an admin's flag toggle only reaches storefront tabs whose SSE connection happens to be pinned to the same instance that received the write; `flag.updated`/`content.published`/etc. events fired via `eventBus.publish` never reach analytics listeners on other instances. This directly undercuts the flags-live-update feature described in `docs/2026-07-27/FLAGS-UI-LIVE-UPDATE-DECISION.md`. See §4.2.
0. 🔴 **Tenant catalog manifest/build-status store is in-memory-only despite being fed by a distributed BullMQ worker.** `tenant/adapters/manifest-store.ts`'s only implementation is a plain `Map` — if the BullMQ worker and API server are ever separate processes (the normal case for BullMQ), build-status polling can never see a "completed" build. See §4.3.

**Round 3 (2026-07-30, third pass) — highest severity, not yet fixed:**

0. 🔴 **`flags`, `machines`, `tenant`, and `agent` domains have no permission checks on any mutating route.** `documents/api.ts` and `analytics/api.ts` correctly gate every write/sensitive-read behind `requirePermission`/`denyUnless`, but the equivalent routes in the other four domains only check org scoping, not role/permission — including `POST /api/tenants/:id/components`, which compiles and runs arbitrary tenant-submitted source (§4.5). Combined with the fail-open edge auth above (item 0), this is currently the most exploitable gap in the repo. See §4.6.

**Round 1 (still open):**

1. ✅ **Fixed** — 🔴 **Edge worker has no timeouts on outbound fetches** (`packages/workers/src/routes/proxy.ts`, `resolve-slug.ts`) — a slow/hung API origin can hold a Cloudflare Worker request open indefinitely. This is the single biggest scale risk in the repo.
2. ✅ **Fixed** — 🔴 **Module Federation catalog loading has no per-remote error isolation** (`packages/client/src/catalog-loader.ts`) — one broken marketplace extension takes down the entire storefront instead of degrading gracefully.
3. 🟡 **`documents` domain is a god-service** (`service.ts` is 894 lines, `ports.ts` 434 lines) mixing content types, layouts, pages, assets, tenant settings, and permission checks in one file — hardest domain to safely change.
4. 🟡 **Auth/documents/tenant domains reach into each other's internals** instead of going through `index.ts`, defeating the DDD boundary the whole codebase is supposed to follow.
5. 🟡 **~15–20% of the `docs/` tree is stale or redundant** (superseded plans, merged stubs, pre-ZITADEL docs) and should be archived so `ARCHITECTURE-MAP.md` stays trustworthy as the single index.

---

## 1. Server domains (`packages/server/src/domains`)

The 10 domains are meant to follow one pattern: `ports.ts` → `entity.ts` → `service.ts` → `adapters/postgres.ts` → `api.ts` → `index.ts`. Verified file layout per domain:

| Domain | Has ports/entity/service/api/index | Notable extra files |
|---|---|---|
| `agent` | ✅ full pattern | `events.ts`, `queue.ts`, `tools.ts`, `worker.ts` (BullMQ + tool-calling) |
| `ai-pipeline` | ✅ (no `entity.ts` — stateless, reasonable) | `providers.ts` |
| `analytics` | ✅ (no `entity.ts`) | `browser-ingest.ts`, `listeners.ts`, `queue.ts`, `read-guards.ts`, `replay-storage.ts`, `worker.ts` |
| `auth` | ⚠️ no `entity.ts`, no `adapters/postgres.ts` (uses ZITADEL as system of record instead) | `asset-url.ts`, `guards.ts`, `idp-registry.ts`, `providers/publish.ts`, `adapters/zitadel/*` |
| `context` | ✅ (no `entity.ts`) | `engine.ts`, `signal-extraction.ts` |
| `documents` | ✅ full pattern, but heavily overloaded | `merge.ts`, `assets/*`, `refs/*`, `tenant/auth-config.ts`, `validation/*` |
| `edge` | ✅ (no `entity.ts`, no adapter — pure aggregation domain) | `resolve-spec.ts` |
| `flags` | ✅ full pattern, cleanest domain in the repo | `adapters/mock.ts` alongside `adapters/postgres.ts` |
| `machines` | ✅ (no `entity.ts` — XState-based) | `engine.ts` |
| `tenant` | ✅ (no `entity.ts`) | `adapters/bundler.ts`, `adapters/manifest-store.ts`, `adapters/r2.ts`, `queue.ts`, `worker.ts` |

**Takeaway:** the pattern isn't violated so much as **selectively applied** — several domains skip `entity.ts` when there's no real aggregate (fine), and `auth` skips `adapters/postgres.ts` because ZITADEL is the system of record for identity (also fine, but this exception isn't documented anywhere, so a newcomer following the README's stated pattern will go looking for a Postgres adapter that doesn't exist). 🟢 **Fix:** add one sentence to `ARCHITECTURE-MAP.md` noting `entity.ts`/adapter files are omitted when a domain has no local aggregate or storage.

### 1.1 God-files — largest server-side files

The 15 largest non-test files in `packages/server/src/domains` (by `wc -l`):

| Lines | File |
|---|---|
| 894 | `documents/service.ts` |
| 460 | `auth/api.ts` |
| 448 | `documents/api.ts` |
| 434 | `documents/ports.ts` |
| 357 | `flags/service.ts` |
| 354 | `auth/adapters/zitadel/client.ts` |
| 318 | `documents/adapters/postgres.ts` |
| 297 | `analytics/adapters/clickhouse.ts` |
| 292 | `auth/service.ts` |
| 290 | `auth/adapters/zitadel/management.ts` |
| 235 | `analytics/api.ts` |
| 217 | `machines/engine.ts` |
| 188 | `documents/validation/validator.ts` |
| 187 | `auth/adapters/zitadel/users.ts` |
| 186 | `tenant/adapters/bundler.ts` |

🟡 **`documents/service.ts` (894 lines) is the clearest god-file in the codebase.** One factory function (`createDocumentsService`) builds and returns sub-services for content types, content entries, layouts, pages, page trees, assets, and tenant settings, plus ~15 free-standing validation/helper functions at the bottom of the same file (`buildContentData`, `validateContentTypeName`, `validateSchema`, `validateTemplateName`, `validateSpec`, `validateAssetMime`, `resolveAssetUrl`, `enrichAssetUrls`, `validateFieldWritePermissions`, `filterReadFields`, `defaultTenantSettings`, `toLayoutEntity`, etc.). This mirrors the `documents` domain being the CMS for everything (content, layouts, pages, assets, refs, tenant settings) — the file has grown with every new content concept instead of splitting into sub-modules.
**Fix:** split into `content-types.service.ts`, `layouts.service.ts`, `pages.service.ts`, `assets.service.ts`, `tenant-settings.service.ts`, each still exported through one `service.ts`/`index.ts` barrel — no behavior change, just smaller units that are easier to review and test in isolation.

🟡 **`auth/api.ts` (460 lines) repeats the same request-handling shape 11+ times** — every route does `schema.safeParse(body)` → manual `if (!parsed.success) return c.json({ error }, 400)` → `try { ... } catch (e) { return c.json({ error: e.message }, code) }`. This shows up at (non-exhaustive) lines 135, 156, 181, 203, 242, 288, 310, 327, 349, 423, 444 for validation, and 142, 174, 194, 233, 258, 276, 301, 318, 340, 363, 396, 411, 431, 453 for the raw `c.json({ error })` catch blocks.
**Fix:** adopt a `parseBody(c, schema)` helper (throws `ValidationError`, caught once by the central `handleDomainError`) and let ZITADEL-call failures throw typed errors instead of hand-formatting a response in every handler — see §1.3.

🟢 `documents/ports.ts` (434 lines) is a type-only file (interfaces for every sub-service) — large but not risky; it grows in lockstep with `service.ts`, so splitting `service.ts` (above) will naturally split this too.

🟢 `flags/service.ts` (357 lines) and `machines/engine.ts` (217 lines) are large but cohesive — each is one evaluator (targeting rules; state transitions) without mixed responsibilities. Not a priority.

### 1.2 Domains reaching into each other's internals (DDD boundary violations)

Each domain is supposed to be consumed only through its `index.ts`/`api.ts` public surface. In practice `auth`, `documents`, and `tenant` import each other's private files directly:

- 🔴 `auth/providers/publish.ts` imports from `../../documents/content-types/auth-provider`, `../../documents/ports`, and `../../documents/tenant/auth-config` — three separate reaches past `documents/index.ts`.
- 🟡 `documents/refs/resolve.ts` imports `iconUrlFromAsset` from `../../auth/asset-url` — `documents` reaching into `auth` internals.
- 🟡 `tenant/adapters/r2.ts` imports/re-exports `../../documents/assets/r2` directly instead of via `documents/index.ts`.
- 🟢 `documents/content-types/auth-provider/runtime.test.ts` imports `../../tenant/auth-config` internal (test-only, same pattern).

Net effect: `auth`, `documents`, and `tenant` have grown a small circular dependency around "auth provider as a content type" — `documents` owns the CMS entity for `auth_provider`, but the actual auth-config normalization and asset-URL logic live in `auth`, and both domains reach across the line to get at each other's helpers.
**Fix:** pick one owner for the auth-provider-as-content-type contract (types + normalization) and put it in `shared/` or expose it via `documents/index.ts`/`auth/index.ts`, then fix the 3–4 import sites to use the public surface.

### 1.3 Duplicated small patterns across domains

- 🟢 **Org-id scoping is the one thing done right.** ~9 of 10 domains consistently call `getOrgId(c)`/`requireHeaderOrgId(c)` from `shared/org.ts` in their `api.ts`. `auth` and `tenant` intentionally resolve org from a URL param/slug instead of the edge-injected header — that's a legitimate difference, not a bug, but it's undocumented as an exception.
- 🟡 **No shared pagination helper.** `analytics/api.ts` alone parses `c.req.query("limit")`/`("offset")` by hand in 4 different route handlers; `documents/api.ts` does the same for layout filters. **Fix:** add `shared/pagination.ts` with one `parseLimitOffset(c, { defaultLimit })` and use it everywhere a list endpoint takes `limit`/`offset`.
- 🟡 **`shared/respond.ts`'s `error()` helper is defined but barely used.** Every domain still hand-rolls `c.json({ error: message }, status)` inline — `auth/api.ts` alone does this 14 times, `documents/api.ts` and `tenant/api.ts` mix the shared helper with raw `c.json` calls in the same file. **Fix:** standardize on `error(c, message, status)` and remove the ad-hoc duplicates; this is a low-risk, high-consistency win.
- 🟡 **Two coexisting error-handling strategies.** `shared/error-handler.ts`'s `handleDomainError` is wired once as `app.onError` in `index.ts` (good — throw a typed `DomainError`/`ValidationError`/`NotFoundError` and it's handled centrally), but `auth/api.ts` and several adapters (`documents/adapters/postgres.ts`, `flags/adapters/postgres.ts`, `agent/adapters/postgres.ts`, `context/adapters/postgres.ts`, `machines/adapters/postgres.ts`) still throw plain `new Error(...)` and/or catch-and-reformat locally instead of throwing a typed error and letting the central handler do its job. Concretely: `flags/service.ts`, `agent/service.ts`, `documents/service.ts`, and `machines/engine.ts` **do** consistently use `NotFoundError`/`ValidationError` — but the five Postgres adapters listed above throw generic `Error` for "insert didn't return a row"-style failures, and `auth/service.ts` + all of `auth/adapters/zitadel/*` throw generic `Error` for every failure mode (18+ call sites). **Fix:** either (a) add `DomainError` subclasses for infra failures (e.g. `PersistenceError`) and use them in adapters, or (b) accept that raw infra errors are fine to stay generic (they become 500s either way) and only require domain/service-layer code to throw typed errors — but write down which rule applies, since right now it looks accidental rather than decided.
- 🟢 **Repeated `.where(eq(table.orgId, orgId))` in 3 Postgres adapters** (`documents`, `context`, `machines`) — trivial duplication, not urgent, but a `shared/db-scope.ts` helper would prevent someone eventually forgetting the org filter on a new query.
- 🟢 **Small bounded `switch` statements** in `flags/service.ts` (condition type/operator), `ai-pipeline/providers.ts` (two `switch (targetType)` blocks), and `documents/validation/validator.ts` (field type) — not a problem today, but if more cases get added, a `Record<type, handler>` lookup map would scale better and keep the two `providers.ts` switches from drifting out of sync with each other.

---

## 2. Client, browser-sdk, edge worker (`packages/client`, `packages/browser-sdk`, `packages/workers`)

### 2.1 Edge worker (`packages/workers/src`) — scale risk

This is the highest-traffic component (every storefront request passes through it) and has the most concrete scale problems in the repo:

- ✅ **Fixed** — 🔴 **No timeout on any outbound fetch.** `resolveSiteId` in `resolve-slug.ts` and the main proxy `fetch(target, init)` in `routes/proxy.ts` called `fetch()` with no `AbortController`. Added `packages/workers/src/fetch-with-timeout.ts` (`fetchWithTimeout()`, 10s default, AbortController-based) and switched both call sites to use it. `renderer.ts` (`fetchSchema`/`personalizeSchema`/`isBot`) turned out to be dead code — confirmed zero importers anywhere in the repo — so it was deleted outright instead of given a timeout, along with its now-unused `react`/`react-dom`/`@json-render/core` deps in `packages/workers/package.json` and two now-unused cache constants/export in `cache.ts` (`_PERSONALIZED_CACHE_TTL`, `_STATIC_CACHE_TTL`, `staticCacheKey`). Verified: `pnpm --filter @noname/workers typecheck` and `vitest` pass (duplicate `strip-client-org.test.ts` removed — logic lives in `strip-public-org.ts`, covered by `strip-public-org.test.ts`).
- ✅ **Fixed** — 🔴 **JWKS fetch has no KV-backed cross-isolate cache.** Added `jwks-cache.ts` — JWKS JSON cached in Workers KV (1h TTL) with `fetchWithTimeout`; `createCachedGetKey()` used in `auth.ts`.
- ✅ **Fixed** — 🟡 **HMAC key re-imported on every request.** Module-level `CryptoKey` cache in `hmac.ts`, keyed by secret.
- ✅ **Fixed** — 🟡 **JWT parsed before public-route check.** `proxy.ts` skips `tryParseJwt` on public routes unless `?edit=true`; auth enforced only on protected routes.
- ✅ **Fixed** — 🟡 **Non-mutating POST bodies always buffered.** Body read only when `shouldStripBodyOrg`; otherwise streams `c.req.raw.body`.

### 2.2 Client (`packages/client/src`) — duplicated boilerplate

Overall structure is reasonable (`auth/` = API + state helpers, `admin/` = CMS/layout/routing data helpers, `core/actions/` = json-render catalog action handlers, `core/components/` = React views), but several patterns are copy-pasted instead of shared:

- ✅ **Fixed** — 🟡 **Fetch-with-auth hand-rolled in 4+ places.** `lib/api.ts` (`apiFetch`, `apiFetchData`, `apiFetchOptional`, `apiFetchVoid`); migrated `admin/*`, `auth/auth-settings.ts`, `auth/team-users.ts`, `platform/browser-observability.ts` (layout flag keys).
- 🟡 **The same form-handling boilerplate is copy-pasted across 9 admin components.** *(unchanged — `useAsyncForm` deferred)*
- 🟢 **Tenant/store-slug parsing is duplicated between client and edge worker.** `storeSlugFromHostname`/`requireStoreSlug` in `auth/org.ts` and `storeSlugFromHost`/`resolveOrgIdFromHost` in `workers/src/resolve-slug.ts` independently implement the same "first subdomain label" logic, each with its own tiny cache. They can't trivially share a module (browser vs. edge runtime), but the pure slug-parsing logic (no fetch/cache) could move to a shared util so the two copies can't silently drift.
- ✅ **Fixed** — 🟢 **PKCE code-verifier logic duplicated** — `account-flows.ts` now imports `createCodeVerifier` from `oauth.ts`.
- ✅ **Fixed** — 🟢 **`FeatureFlagsAdmin.tsx` bypasses admin data layer** — added `admin/flags.ts` (`listFlags`, `updateBooleanFlag`).
- 🟢 **Two pairs of pure re-export shims add indirection with no logic:** `auth/login.ts` is a 2-line wrapper around `account-flows.ts`; root-level `catalog.ts`/`registry.ts` are 1-line re-exports of `platform/catalog.ts`/`platform/registry.ts`. **Fix:** delete the shims, update the handful of call sites to import directly.
- 🟢 **Two god-components mix data-fetching, multiple view states, and presentation:** `ContentEntryAdmin.tsx` (611 lines — field renderer, empty state, new-entry form, and edit/publish/delete form all in one file) and `LoginForm.tsx` (530 lines — 5 view states in one big conditional-JSX return, effectively an unbuilt state machine). **Fix:** split each by responsibility/view (`ContentTypeList` / `ContentEntryForm` / `ContentEntrySidebar`; `LoginView` / `ForgotView` / `ResetView` / `SignupView` / `MfaView` sharing a thin shell).

### 2.3 Module Federation / catalog loading — fragility

Relevant files: `mf-init.ts`, `catalog-loader.ts`, `catalog.ts`/`registry.ts` shims, `platform/catalog.ts`, `platform/registry.ts`.

- ✅ **Fixed** — 🔴 **One broken remote takes down the entire storefront.** `loadCatalogs()` in `catalog-loader.ts` called `loadRemote` for every marketplace/private remote with no per-remote `try/catch`, so any single remote throwing (bad URL, broken build, network failure) bubbled up and broke the entire page load. Added a `loadRemoteRegistry(name, url, shareScope)` helper that wraps `registerRemotes`/`loadRemote` in its own try/catch, logs the error, and returns `null` on failure instead of throwing — both the marketplace loop and the private-remote load now use it, so one broken extension is simply omitted from the merged registry instead of crashing the load. Verified: `pnpm --filter @noname/client typecheck` passes clean (no existing unit tests covered this file).
- ✅ **Fixed (partial)** — 🟢 **Marketplace remotes loaded serially instead of in parallel.** As part of the fix above, the marketplace loop now uses `Promise.all(marketplace.map(...))` instead of a sequential `for` loop, so per-remote network+eval time no longer stacks up when there are multiple marketplace extensions.
- ✅ **Fixed** — 🟡 **No caching of loaded remote catalogs across navigations.** `loadCatalogs()` memoizes by manifest hash; unchanged manifest skips re-fetch.
- 🟡 **Hardcoded shared-dependency versions.** React/react-dom/@json-render versions (e.g. `"19.2.7"`, `"0.19.0"`) are hardcoded string literals in `mf-init.ts` rather than derived from `package.json` — a version bump can silently desync what's advertised to remotes, causing shared-scope mismatches at runtime. **Fix:** inject versions via a build-time `DefinePlugin` constant reading from `package.json`.
- ✅ **Fixed** — 🟢 **Silent last-writer-wins on component name collisions.** `mergeRegistries` logs a warning on overwrite.
- ✅ **Fixed** — 🟢 **Built-in extension loaders had no try/catch.** `loadExtensionRegistries` now isolates failures like marketplace remotes.

### 2.4 browser-sdk — consistency

No files in `browser-sdk/src` exceed 400 lines and the package is reasonably decomposed by concern (analytics / errors / trace / flags / replay). The one thing worth normalizing:

- 🟢 **Module init signatures are inconsistent.** Most `create*Module` factories take a long list of positional primitive args (e.g. `createAnalyticsModule(endpoint, getContext, getHeaders, getUser, batchSize, flushIntervalMs)` — 6 positional params) instead of one options object, making call sites hard to read and easy to get wrong when adding a new parameter. **Fix:** standardize every `create*Module` on a single `options: {...}` object parameter.

---

## 3. Docs cleanup (`docs/`)

There are roughly **83 markdown files** in the repo (78 in `docs/` across 7 date-based folders, plus `docs/aiagents.md`, `skills/spec-driven-ui/` files, and the root `README.md`). About **15–20% are safely archivable today** with near-zero risk; the rest are either currently load-bearing or legitimate point-in-time records.

### 3.1 Fully superseded — archive or delete

| # | Old file | Replaced by | Severity | Recommendation |
|---|---|---|---|---|
| 1 | `docs/2026-07-25/LOGIN-UI-PLAN.md` | `docs/2026-07-25/LOGIN-UI.md` | 🟢 | Already a 3-line "merged" stub — delete outright instead of leaving a redirect file. |
| 2 | `docs/2026-07-25/LOGIN-UI-MODERN-PLAN.md` | `docs/2026-07-25/LOGIN-UI.md` | 🟢 | Same — confirmed merged stub, delete. |
| 3 | `docs/2026-07-11/AUTH.md` | `docs/2026-07-13/AUTH.md` | 🟡 | Pre-ZITADEL (Logto-era) design doc; the 07-13 version is the current ZITADEL OIDC + edge HMAC model everything else links to. Has a banner pointing to the newer file, but isn't listed in `ARCHITECTURE-MAP.md`'s deprecated table — add it there, then archive. |
| 4 | `docs/2026-07-25/PERMISSIONS-REBAC.md` + role-framing parts of `docs/2026-07-25/TEAM-ROLES-ZITADEL.md` | `docs/2026-07-27/PERMISSIONS-MASTER-PLAN.md` | 🟡 | Partial supersession, not a clean redirect — the master plan explicitly overrides the July 25 role-only framing but still references the older docs' Zanzibar/tuple design as "later" work. Keep both, but add a "current model — read `PERMISSIONS-MASTER-PLAN.md` first" banner to the two older docs. |
| 5 | `docs/2026-05-23/STRESS_TEST.md` | *(moot — ZITADEL decision made)* | 🟢 | One-off "should we build auth ourselves" thought experiment, overtaken by the actual ZITADEL adoption. Archive as historical record. |
| 6 | `docs/2026-07-04/agent-domain.md`, `analytics-domain.md`, `context-domain.md`, `flags-domain.md`, `nango-domain.md`, `external-execution-layer.md` | `docs/2026-07-04/ARCHITECTURE_DECISIONS.md` (still current) + `docs/2026-07-11/STATUS.md` | 🔴 | **Most misleading docs in the repo.** Each still reads "Current State (Scaffolding): not yet created" for domains that are fully built today. A reader unfamiliar with the timeline could easily think these domains are stubs. Add a banner to each: "⚠️ Written when this domain was scaffolding-only (2026-07-04) — now implemented, see `ARCHITECTURE_DECISIONS.md`," then archive. |

### 3.2 `docs/2026-05-23/` (oldest folder) — mostly superseded, but not uniformly

- 🔴 `BUILD_PLAN.md`, `ROADMAP.md`, `STACK.md`, `TECH.md` describe an idealized pre-implementation architecture (ClickHouse, Nango, Mastra, GrapesJS, Vela, a sweeping "AI Agent Manager") that shipped only partially or differently. Fully superseded by `docs/2026-07-25/ROADMAP-PHASES.md`, `ARCHITECTURE-MAP.md`, and `docs/2026-07-04/ARCHITECTURE_DECISIONS.md`. **Archive** — nobody asking "what does the codebase do today" should land here first.
- 🟡 `OVERVIEW.md`, `PRODUCT.md`, `POSITIONING.md`, `DIFFERENTIATION.md`, `FINDINGS.md` are a different genre entirely — pitch/vision/competitive-analysis docs with no 07-25-era equivalent. They are *not* technically superseded, just misfiled next to stale engineering docs under the same date stamp. **Don't delete** — relocate to a `docs/product/` or `docs/vision/` folder so a blanket "archive 2026-05-23" pass doesn't destroy them by accident.
- 🟢 `docs/2026-05-23/STRESS_TEST.md` — see §3.1 item 5.

**Net for this folder:** ~7 of 11 files are safely archivable; ~4 (product/vision docs) should survive any cleanup, just under a different, non-date-implying home.

### 3.3 Is the date-folder structure itself an anti-pattern?

**Verdict: partially, and the project is already compensating for it — but the compensation is falling behind.**

- The structure conflates *creation date* with *freshness*. `docs/2026-07-04/ARCHITECTURE_DECISIONS.md` is still actively edited ("Updated 2026-07-25") and load-bearing, but it sits in a folder that reads as three weeks stale next to genuinely dead scaffolding docs in the *same folder*. A folder name signals when a file was created, not whether its contents are current.
- `docs/2026-07-25/` alone has grown to 35 files spanning permissions design, the reverted tenant-MF feature, visual editor UX, login UI, account flows, and admin UI — all flat in one date bucket with no topic sub-grouping.
- `ARCHITECTURE-MAP.md`'s "Doc index by topic" section is a good stopgap — it re-groups the date folders by subject (Platform / Client / Auth / Admin) — but it's a manual, easy-to-forget step, and it's already visibly behind: its "Deprecated / merged docs" table lists only the `LOGIN-UI-*` pair, not `docs/2026-07-11/AUTH.md` (superseded by 07-13), not the stale 07-04 domain docs, and doesn't cross-reference that `PERMISSIONS-MASTER-PLAN.md` overrides parts of `PERMISSIONS-REBAC.md`/`TEAM-ROLES-ZITADEL.md` — all three currently sit in the map's topic list with equal visual weight and no "superseded" marker.
- `docs/2026-07-27/` is only 9 files and already reads as "this session's overrides of last week's docs" (its own `PERMISSIONS-MASTER-PLAN.md` says "Supersedes... 07-25 framing"). This pattern will keep recurring and will keep fragmenting topics across more date folders as the project continues at its current pace.

**Recommendation:** keep date folders for genuinely point-in-time content — handoffs, test runs, decision records (`ANALYTICS-REPLAY-TEST-RUN.md`, `TENANT-MF-HANDOFF.md`) are legitimately chronological and belong there. Move **canonical/reference** docs (domain models, architecture decisions, the permissions model, the auth model) toward a topic-based tree over time, or at minimum treat keeping `ARCHITECTURE-MAP.md`'s superseded-table exhaustive as a mandatory step whenever any doc's status changes — right now that table is the only thing standing between "many folders" and "actually confusing," and it's already missing three known supersessions.

### 3.4 "Code reverted, docs only" banners

The Tenant-MF cluster is actually the **best-handled** example of this pattern in the repo — every file already carries a clear banner:

| File | Banner present? |
|---|---|
| `TENANT-MF-REIMPL.md` | ✅ "Code **reverted**; docs retained." |
| `TENANT-MF-HANDOFF.md` | ✅ "Code **reverted** (2026-07-25)." |
| `TENANT-MF-CDN.md` | ✅ "code reverted — implement via REIMPL.md" |
| `TENANT-MF-GIT.md` | ✅ Self-describes as "Planned — not implemented yet" (never claimed to be built). |
| `TENANT-MF-SECURITY.md` | ✅ "Design + gaps — read before Git integration." |

🟢 **Only gap:** `ARCHITECTURE-MAP.md`'s "Where data lives" table links `TENANT-MF-REIMPL.md` with just "Rebuild per TENANT-MF-REIMPL.md" — no inline "not implemented today" caveat, relying on the reader having also seen `PLATFORM-STATUS.md`. Low severity since the linked doc itself is unambiguous once opened. No other reverted-but-undocumented features were found (flags, permissions, analytics/replay, browser-sdk clusters all describe shipped or explicitly-not-started work, not reverted work).

---

## 4. Round 2 findings (2026-07-30, deeper pass) — not yet fixed

Everything in this section is new since the round-1 pass above and has **not** been implemented — read-only findings only, per request.

### 4.1 Edge-auth is fail-open when `REQUIRE_EDGE_HMAC` is unset 

🔴 `packages/server/src/shared/org.ts`'s `orgMiddleware` runs on every API request. When the `x-auth-hmac` header is present, it verifies it via HMAC-SHA256 against `WORKER_SERVER_SECRET` — correct. When the header is **absent**, the fallback path is: check `edgeHmacRequired()` (`process.env.REQUIRE_EDGE_HMAC === "true"`) — if that's false (the default), fall through to `console.warn("No HMAC on request — may bypass edge worker")` and **proceed anyway**, trusting whatever `x-org-id`/`x-user-id`/`x-role` values the caller supplied.

Both `.env.example` files (root and `packages/server/.env.example`) ship `# REQUIRE_EDGE_HMAC=true` — commented out. A deployment that copies the example file, or a developer who never learns this flag exists, runs with this hole in production: any client with network access to the API server (not just the edge worker) can set `x-org-id: <victim-org>` and `x-role: admin` directly and be trusted, no signature required.

**Fix options (pick one, don't leave it optional):**
- Make `REQUIRE_EDGE_HMAC` default to `true` and require an explicit opt-out for local dev (e.g. only skip verification when `NODE_ENV !== "production"` AND the flag is explicitly set to `false`), or
- Drop the flag entirely and always require a valid HMAC once `WORKER_SERVER_SECRET` is set (local dev without the edge worker already doesn't set the secret, so `verifyHmac` naturally returns `false` — but today unset-secret + no-header still passes because the `else if (secret ...)` branch only warns).

### 4.2 In-process-only SSE broadcast and event bus — breaks the moment the server scales past one instance

🔴 Two pieces of shared server infra are plain in-memory `Map`s with zero cross-instance coordination, even though the project already runs Dragonfly (Redis-compatible) for BullMQ:

- `packages/server/src/shared/sse-manager.ts` keeps all connected SSE clients in `const clients = new Map<OrgId, Map<StreamId, SSEStreamingApi>>()`. `broadcast(orgId, data)` only reaches clients whose connection landed on *this* process.
- `packages/server/src/shared/event-bus.ts` keeps subscribers in `const handlers = new Map<string, EventHandler[]>()`. `eventBus.publish(event, payload)` only invokes handlers registered in *this* process.

Concretely, `flags/index.ts` wires `eventBus.subscribe("flag.created"/"flag.updated"/"flag.archived", ...)` to call `broadcast(orgId, ...)`, and `analytics/listeners.ts` subscribes to 25+ domain events (content, layout, asset, page, machine, flag, task lifecycle) purely to record analytics. Today, with one server process, this works. The moment there's more than one API replica behind a load balancer (which `docker-compose.yml`'s single-instance setup doesn't yet reflect, but any real deployment eventually needs for availability/throughput):

- An admin's flag toggle handled by replica A only reaches SSE clients connected to replica A — storefront tabs pinned to replica B via the load balancer never get the live update described in `docs/2026-07-27/FLAGS-UI-LIVE-UPDATE-DECISION.md`.
- Analytics listeners on replica B never see events published by writes that landed on replica A — silent data loss for anything routed through `eventBus`, not just flags.
- `agent/queue.ts`, `analytics/queue.ts`, and `tenant/queue.ts` correctly use BullMQ/Dragonfly for the *cross-process* work they need (background jobs) — but `event-bus.ts` was never given the equivalent treatment despite being used for the same kind of "something happened, tell other listeners" fan-out, just synchronous instead of a queue.

**Fix:** back both with Dragonfly. `event-bus.ts`'s `publish`/`subscribe` shape maps directly onto Redis pub/sub (`PUBLISH`/`SUBSCRIBE`) with almost no API change to callers; `sse-manager.ts` needs the same — publish `broadcast()` payloads to a Redis channel and have every instance's local SSE clients subscribed to it, so a write on any instance reaches every connected client regardless of which instance it landed on.

### 4.3 Tenant catalog manifest & build-status store is in-memory-only, despite being fed by a distributed BullMQ worker

🔴 `packages/server/src/domains/tenant/adapters/manifest-store.ts`'s `createInMemoryManifestStore()` is the *only* implementation wired up in `tenant/index.ts` — there is no Postgres/Redis-backed alternative, unlike every other domain's storage. It backs:

- `getManifest`/`setManifest` — the per-org Module Federation catalog manifest (what remotes/marketplace entries a storefront loads).
- `getBuildStatus`/`setBuildStatus` — status polling for catalog builds.

But the actual build work happens in `tenant/worker.ts`, a **BullMQ `Worker`** consuming `BULLMQ_QUEUES.CATALOG` via Dragonfly — i.e. explicitly designed to run as a separate process/replica from the API server that enqueues the job and serves `GET /:id/builds/:buildId` polling requests. If the worker and the API server are ever different processes (which is exactly what BullMQ is for), `setBuildStatus("completed", ...)` writes to the worker process's local `Map`, and the API server polling `getBuildStatus` reads from its own, disjoint `Map` — the client polls forever and never sees `"completed"`. Even within a single process, an API server restart or redeploy silently drops every org's catalog manifest and any in-flight build status.

**Fix:** back `ManifestStore` with Postgres (manifests are small, low-write JSON blobs — a natural fit) or at minimum Dragonfly/Redis (`HSET`/`GET` per org, `SETEX` for build status with a TTL). The `ManifestStore` interface is already storage-agnostic, so this is an adapter swap, not a redesign — same shape as `flags/adapters/mock.ts` vs. `flags/adapters/postgres.ts`.

### 4.4 Test coverage is very uneven across server domains

🟡 Ratio of `*.test.ts` files to source files per domain in `packages/server/src/domains`:

| Domain | Test files | Source files |
|---|---|---|
| `documents` | 8 | 29 |
| `auth` | 6 | 20 |
| `analytics` | 2 | 13 |
| `flags` | 1 | 10 |
| `edge` | 1 | 6 |
| `agent` | 0 | 11 |
| `ai-pipeline` | 0 | 6 |
| `context` | 0 | 7 |
| `machines` | 0 | 6 |
| `tenant` | 0 | 9 |

Half the domains (`agent`, `ai-pipeline`, `context`, `machines`, `tenant`) have **zero** test files. `tenant` is a particularly notable gap given §4.3 above — the in-memory store, the BullMQ worker, and the rspack-based `bundler.ts` (dynamic Module Federation bundling at runtime, the most complex single operation in the domain) all have no test coverage, so a regression in the build pipeline would only surface in a live catalog-build request. `machines` (XState-based state machine engine — `engine.ts`, 217 lines, transition/guard logic) and `context` (`signal-extraction.ts`, segment resolution) are the kind of business-rule-heavy code most likely to have subtle bugs that only a test would catch. This isn't necessarily wrong for a fast-moving prototype, but it's worth being deliberate about rather than accidental — if `documents`/`auth` got tests because they're closest to auth/security-sensitive paths, that's a reasonable prioritization to state explicitly; if it's just where whoever wrote tests happened to be working, the five untested domains are the ones most likely to regress silently.

Same pattern in the client: `packages/client/src` has 82 non-test source files and only 2 test files (`login-branding.test.ts`, `props-panel.test.ts`). `browser-sdk` has 13 source files and zero tests, which is notable since it's the one package shipped to end-user browsers across every storefront and any regression there is the hardest to roll back quickly (cached/CDN'd bundles).

### 4.5 Smaller findings

- 🟡 **`tenant/adapters/bundler.ts` shells out to a full rspack compiler per catalog-build job, with no resource limits.** Each `bundleCatalog()` call spins up an in-process `rspack()` compiler writing to a fresh `mkdtempSync` directory, with `concurrency: 2` on the BullMQ worker (`worker.ts`). Two concurrent bundling jobs means two rspack compiler instances running in the same Node process — no memory ceiling, no build timeout, and a hung/slow compile (e.g. a malicious or accidentally-pathological `source` string from `POST /:id/components`) blocks a worker slot indefinitely. There's also no validation of `source` beyond "is a non-empty string" before it's spliced directly into a generated entry file and compiled — a tenant with API access to `POST /api/tenants/:id/components` can submit arbitrary TypeScript that gets executed inside the bundling pipeline (not sandboxed).
- 🟡 **ClickHouse client credentials default to hardcoded dev values in code, not just `.env.example`.** `analytics/adapters/clickhouse.ts`'s `getClickHouseClient()` falls back to `process.env.CLICKHOUSE_USER || "noname"` / `process.env.CLICKHOUSE_PASSWORD || "noname_dev"` — if the env var is ever unset in a real deployment (typo, missed secret injection, etc.), it silently connects with the checked-in dev password instead of failing loudly. Same pattern likely worth checking in other adapters that read `process.env.X || "<dev-default>"` for credentials specifically (as opposed to non-sensitive config like ports/URLs, which are fine to default).
- 🟢 **No CI workflow exists in the repo** (`.github/workflows/` doesn't exist). `pnpm typecheck`/`lint`/`vitest` all work locally per-package but nothing runs them automatically on push/PR, so the `strip-client-org.test.ts` breakage found during round 1 (a test file importing a module that doesn't exist) could have sat broken indefinitely without anyone noticing outside a manual full-repo pass like this one.
- 🟢 **`shared/event-bus.ts` subscribers are typed `(data: any)` at every call site** (`flags/index.ts`, `analytics/listeners.ts`) because `EventHandler = (payload: unknown) => Promise<void>` forces a cast at every subscriber — 25+ places do `async (data: any) => {...}`. Minor, but it means a typo'd property name on any event payload fails silently at runtime instead of at compile time. A typed event map (`{ "flag.updated": { orgId: string; key: string }; ... }`) keyed by event name would let `subscribe`/`publish` be generic instead of `unknown`-typed everywhere.

### 4.6 Round 3 findings (2026-07-30, third pass) — not yet fixed

- 🔴 **Every mutating route in `tenant/api.ts` and `machines/api.ts`, plus every write route in `flags/api.ts` and `agent/api.ts`, has no permission check at all** — they call `getOrgId(c)`/`requireHeaderOrgId(c)` for org scoping but never `requirePermission`/`denyUnless`. Contrast with `documents/api.ts`, which gates all 19 of its mutating routes on `PERMISSIONS.CONTENT_DRAFT_WRITE`/`LAYOUT_PUBLISH`/etc., and `analytics/api.ts`, which gates every read route on `ANALYTICS_VIEW`. Concretely: `POST /api/tenants/:id/components` (compiles and executes arbitrary tenant-submitted source, §4.5) and `DELETE /api/tenants/:id/components/:name` require no `AUTH_MANAGE`-equivalent permission; `POST/PUT/DELETE /api/flags` (feature-flag create/update/archive) and `POST /api/machines/definitions` (state-machine definitions) are reachable by anyone who can produce a valid `x-org-id`/`x-auth-hmac` for the org — including, per §4.1, anyone at all if `REQUIRE_EDGE_HMAC` is unset. This isn't "some domains chose a different auth model" (like `auth`/`tenant` resolving org from a URL param, which is documented as intentional) — it looks like `requirePermission` simply wasn't wired into these four domains' route files while it was being added to `documents`/`analytics`.
  **Fix:** add `denyUnless(c, PERMISSIONS.X)` calls to the mutating routes in `flags/api.ts`, `machines/api.ts`, `tenant/api.ts`, `agent/api.ts` — likely needs 1-2 new `PermissionKey`s (e.g. `flags:write`, `tenant:manage`) since the existing 9 keys don't cleanly cover these domains.

- 🟡 **`packages/auth` (the shared JWT/OIDC/permissions package used by both server and edge worker) has zero input hardening on the base64url JWT decode path, matching the "trust edge/API gateway" comment but worth a second look.** `jwt/decode.ts`'s `decodeAccessTokenPayload` explicitly documents itself as "no signature verification — trust edge/API gateway," which is fine given real verification happens elsewhere (`@cfworker/jwt` at the edge). But `oidc/userinfo.ts`'s `fetchUserinfo` has no timeout on its `fetch()` call to the ZITADEL `/oidc/v1/userinfo` endpoint — the same class of bug already fixed in the edge worker (§2.1) exists again here, and this function is called from `auth/guards.ts::requirePermission`, i.e. on **every permission check that falls back to userinfo** (whenever the JWT is missing project-role claims). A slow ZITADEL response would hang the request handling it. **Fix:** reuse (or port) `fetchWithTimeout` from `packages/workers/src/fetch-with-timeout.ts` into `packages/auth` and use it in `fetchUserinfo`.
- 🟡 **No response-body size/shape validation on `fetchUserinfo`'s ZITADEL response** — the fallback userinfo call (previous bullet) trusts an arbitrary-size JSON body from a remote endpoint with no size cap before `res.json()`. Low realistic risk since ZITADEL is a trusted first-party service, but if ZITADEL ever gets compromised or DNS-hijacked, this is an unbounded-download vector into the same process handling every authenticated request. Same fix as above (timeout) mitigates most of the risk; a `res.headers.get("content-length")` sanity check is optional extra hardening.
- 🟡 **`packages/cli` is a stub with no real logic — `init`/`dev`/`status` commands only `console.log` and contain `// Phase N` comments, no `docker compose` invocation, no health-check HTTP call.** Not a bug, but if this package is published/distributed today, users following the README will find the commands do nothing. **Fix:** either implement the three commands for real (they're each a few lines: `execa("docker", ["compose", "up", "-d"])`, a health-check `fetch` loop) or mark the package `private`/pre-release in its `package.json` so it isn't mistaken for a working CLI.
- 🟢 **`packages/extensions/src/commerce/cart.ts` re-fetches the entire cart instance (`GET /api/machines/instances/:id`) before every `addProductToCart` call just to read `context.items`, then does a second round-trip to append one item.** Two sequential network calls per "add to cart" action is a minor latency/scale concern for a storefront's most common interaction — a dedicated `POST /api/machines/:id/addToCart` that appends server-side (the endpoint already exists and is called second) would let the first `GET` be dropped entirely if the machine service accepted `{ productId, quantity }` instead of a full replacement `items` array. **Fix:** change the machine engine's `addToCart` action/guard to accept an incremental item rather than requiring the caller to read-modify-write the full array.
- 🟢 **`primaryRoleFromKeys`/`primaryTeamRole`/`teamRoleFromJwt` in `packages/auth` implement three overlapping variants of "pick one role from a set" with slightly different return types** (`PlatformRole` defaulting to `"customer"`, `PlatformRole | null`, `"admin" | "editor" | null`) and are re-exported with a `@deprecated Use canDraft` note on `canDraftAtEdge` that doesn't actually apply to the whole block it decorates in `index.ts` (the JSDoc comment sits above `export { canDraft, canDraft as canDraftAtEdge, expandPermissions, ... }` — a 7-item export list — even though only `canDraftAtEdge` is the deprecated one). **Fix:** move the `@deprecated` comment to sit directly above just `canDraft as canDraftAtEdge`, and consider collapsing the three role-picking functions into one parameterized helper (`primaryRole(roles, { default: "customer" | null })`).

---

## 5. Consolidated action plan

Ordered by impact-to-effort ratio — the first three are small, contained changes; the rest are larger but still incremental (no big-bang rewrite needed anywhere).

| Priority | Action | Area | Effort | Status |
|---|---|---|---|---|
| 1 | Add `AbortController` timeouts to every edge→origin fetch (`proxy.ts`, `resolve-slug.ts`); delete dead `renderer.ts` instead of adding a timeout to unreachable code | Edge worker | Small | ✅ Fixed |
| 2 | Wrap each MF remote load in its own try/catch so one broken extension doesn't take down the storefront; parallelize marketplace remote loads | Client | Small | ✅ Fixed |
| 3 | Cache JWKS in Workers KV; cache the imported HMAC `CryptoKey` module-level; public routes skip JWT; conditional POST body buffer | Edge worker | Small | ✅ Fixed |
| 4 | Add banners to the 6 stale `docs/2026-07-04/*-domain.md` files + archive `docs/2026-05-23/BUILD_PLAN.md`/`ROADMAP.md`/`STACK.md`/`TECH.md`/`STRESS_TEST.md`; delete the two `LOGIN-UI-*` merged stubs; extend `ARCHITECTURE-MAP.md` deprecated table | Docs | Small | ✅ Fixed |
| 5 | Extract `apiFetch<T>` helper + migrate admin/auth data modules; `useAsyncForm()` hook deferred | Client | Medium | ✅ Fixed (apiFetch; useAsyncForm deferred) |
| 6 | Add `shared/pagination.ts` and standardize on `shared/respond.ts::error()` across `auth/api.ts`, `documents/api.ts`, `tenant/api.ts` | Server | Medium | Not started |
| 7 | Split `documents/service.ts` (894 lines) into `content-types`/`layouts`/`pages`/`assets`/`tenant-settings` sub-services behind the same public surface | Server | Medium | Not started |
| 8 | Fix the `auth ⇄ documents ⇄ tenant` internal-file cross-imports to go through each domain's `index.ts` | Server | Medium | Not started |
| 9 | Decide and document one error-handling rule (throw typed `DomainError` vs. local catch-and-format) and apply it to `auth/api.ts` and the five Postgres adapters that still throw generic `Error` | Server | Medium | Not started |
| 10 | Relocate `docs/2026-05-23/OVERVIEW.md`/`PRODUCT.md`/`POSITIONING.md`/`DIFFERENTIATION.md`/`FINDINGS.md` to a topic-based `docs/product/` folder; keep `ARCHITECTURE-MAP.md`'s deprecated-docs table exhaustive going forward | Docs | Small, ongoing discipline | Not started |
| 11 | Make `REQUIRE_EDGE_HMAC` fail-closed by default (or drop the flag and always require HMAC once a secret is configured) | Server / security | Small | Not started |
| 12 | Back `shared/sse-manager.ts` and `shared/event-bus.ts` with Dragonfly pub/sub so live updates and domain events work across multiple API replicas | Server | Medium | Not started |
| 13 | Replace `tenant/adapters/manifest-store.ts`'s in-memory `Map` with a Postgres or Dragonfly-backed store | Server | Medium | Not started |
| 14 | Add test coverage for the five untested server domains (`agent`, `ai-pipeline`, `context`, `machines`, `tenant`), prioritizing `tenant/adapters/bundler.ts` and `machines/engine.ts`; add a CI workflow to run `typecheck`/`lint`/`vitest` on every push | Server / CI | Medium, ongoing | Not started |
| 15 | Add a build timeout + resource limit to `tenant/adapters/bundler.ts`'s per-job rspack compile, and validate/sandbox tenant-submitted `source` before compiling it | Server | Medium | Not started |
| 16 | Add `denyUnless(c, PERMISSIONS.X)` permission checks to every mutating route in `flags/api.ts`, `machines/api.ts`, `tenant/api.ts`, `agent/api.ts` (currently org-scoped only, no role check) | Server / security | Medium | Not started |
| 17 | Add a fetch timeout to `packages/auth/src/oidc/userinfo.ts::fetchUserinfo` (reuse/port `fetchWithTimeout` from the edge worker) — it's on the hot path of every permission check that falls back to userinfo | Auth package | Small | Not started |

None of this blocks current feature work (visual editor, per-user flag targeting, permissions) — it's safe to fold into normal PRs opportunistically, but items 1–3 are worth a dedicated pass soon since they're the direct scale/reliability risks.
