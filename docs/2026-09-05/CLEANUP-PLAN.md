# Cleanup Plan — Before New Domain

> **Date:** 2026-09-05
> **Status:** In progress — mark each item complete as fixed
> **Rule:** Fix data-loss / 500 / mystery-400 now. God-file refactors after commerce MVP.
> **Related:** [`ADD-DOMAIN-VS-EXTENSION.md`](./ADD-DOMAIN-VS-EXTENSION.md) · [`ARCHITECTURE.md`](../2026-08-07/ARCHITECTURE.md) · [`ACTION-PLAN.md`](../2026-08-07/ACTION-PLAN.md) · [`EDGE-STOREFRONT-FIXES.md`](../2026-08-23/EDGE-STOREFRONT-FIXES.md) · [`SHARED-SECRET-STRATEGY.md`](../2026-08-23/SHARED-SECRET-STRATEGY.md)

---

## 1. Edge safety `packages/workers/src` — [ ]

- [ ] Unify HMAC: delete `renderer.ts:4-27 hmacHeaders`, reuse `hmac.ts:6-38 hmacHeaders()` + `toTenantHeaders()` adapter. Unify server `shared/org.ts:22-32` verify into one `shared/hmac.ts`.
- [ ] Merge public routes: single `PUBLIC_ROUTE {method,pattern}[]` in `public-routes.ts:3-40`. Add `GET /api/notifications/stream`, `GET /api/collab/*` ticket routes. Delete `isFlags/NotificationsStreamWithTicket` triplication in `proxy.ts:29-61`.
- [ ] Fix status masking: `proxy.ts:90-98` + `resolve-slug.ts:25` return 401 for ticket/stream/collab when `!orgId`, preserve upstream status, log slug resolve status, cache only 200.
- [ ] Harden KV: `cache.ts:5-17`, `jwks-cache.ts:39-56`, `resolve-slug.ts:16-30` — try/catch KV I/O, normalize keys, cache miss 60s, in-memory Map 30-60s + SWR, jitter TTL.
- [ ] Bot SSR: `storefront.ts:76-82`, `bot-ssr.ts:9-15`, `renderer.ts:29-44` — delete dead `renderer.isBot`, cap bot fetch 3-5s, KV 300s, `Vary: User-Agent` + `Cache-Control public,max-age=300`, fallback shell on timeout.
- [ ] Secrets sync: implement `SHARED-SECRET-STRATEGY.md` B+D — canonical `env/.env.shared` + `secrets:sync/check` + fingerprint logs, gate `workers dev` on check.

Accept: anonymous `GET /api/tenants/yogastore/catalog`, `GET /api/edge/schema/yogastore`, `GET /api/flags/public` 200; ticket mint + SSE hold; mismatched secret fails fast with file names.

---

## 2. Server safety `packages/server/src` — [ ]

- [ ] Split graphs: `bootstrap.ts:44-72` `createApp()` → `createApiGraph()` vs `createWorkerGraph()`. Separate DB pools API 20 / workers 10-30. No `app.route` in `worker.ts:30`.
- [ ] Pagination: `machines/routes/instances.ts:38`, `machines/routes/definitions.ts:16`, `context/adapters/postgres.ts:42`, `documents/adapters/postgres.ts:155-168`, `webhooks/adapters/postgres.ts:216-222` — require `shared/pagination.ts:15 parseLimitOffset 50/200`, push LIMIT/OFFSET to Drizzle.
- [ ] Indexes: `machines/schema.ts:45-81` `(orgId,machineName)`, `(instanceId)`; `ai-pipeline/schema.ts:3-12` `(orgId,created_at)`; `documents/schema.ts:67-75` `(orgId,collectionId)` + trigram/GIN for search paths in `adapters/postgres.ts:161-162,240-265`.
- [ ] N+1: `auth/scope/bindings.ts:22-27` batch Keto tuples once; `webhooks/adapters/postgres.ts:274-282` push `eventTypes @>` to SQL; replace `data::text LIKE` with FTS + limit.
- [ ] Workers: `analytics/worker.ts:17-50` remove app batching, `concurrency:1` → tuned; all workers set `lockDuration/stalledInterval/backoff/limiter`; `worker.ts:34-39` `worker.close()/queue.close()/sdk.shutdown()` on SIGTERM with drain timeout.
- [ ] Redis: `shared/event-bus.ts:31-32`, `sse-manager.ts:46-47`, `collab-relay.ts:40-41` — single shared IORedis + dedicated subscriber, await publish with timeout + degraded metric, shard by `orgId` hash.
- [ ] OTel: `tracing.ts:23-28` `parentbased_traceidratio` 0.05-0.1 prod, hash/cap prompt attrs in `ai-pipeline/service.ts:32-47`, link not child in `agent/mastra/executor.ts:46-58`.

Accept: `pnpm check + typecheck` clean; lists capped; concurrent checkout no race; SIGTERM drains without job loss.

---

## 3. Cleanliness (ports, errors, imports) — [ ]

- [ ] Canonicalize `documents/ports.ts` vs `contracts.ts` — one surface, thin re-export shim, lint-ban divergence.
- [ ] Route cross-domain via ports only: `collab/layout-room.ts:7`, `collab/r2-*.ts:10`, `documents/api.ts:2`, `auth/guards.ts:12`, `secrets/service.ts:5`, `agent/mastra/executor.ts:17-18` — inject `LayoutValidator/R2Config/AuthVerifier/WebhookVerifier` in `bootstrap.ts`, add `no-restricted-imports` for `../*/services|assets|adapters`.
- [ ] Typed errors: replace raw `throw` in `bootstrap.ts:68`, `agent/mastra/executor.ts:109,112`, `collab/*-session.ts`, `layout-collab-document-id.ts:20` with `DomainError` subclasses, fallback `code:INTERNAL` + `traceId`.
- [ ] Demo hygiene: remove `COLLAB-TEST-456me / Lol` seeds, enable `extensions: ["commerce"]` for `yogastore`.

Accept: no deep cross-domain imports; `handleDomainError` maps all known errors; live store has no test artifacts.

---

## 4. Client cleanup (was deferred, now active) — [ ]

- [x] 4.1 Split `main.tsx` god component — done: `platform/use-app-route.ts` (route resolution) + `platform/use-app-page-loader.ts` (all loading state + catalog/schema fetch), `App` is render branch only. Verified live: home + product, 0 errors.
- [x] 4.2 Split `use-edit-page-orchestration` — done: `use-editor-shell-config.ts` + `use-element-mutations.ts` + `use-editor-persistence.ts` + `use-editor-session-data.ts`, orchestrator is composition only (~270 lines, was 604). Verified live: editor loads, block select, prop edit, Save draft shows "Draft saved", revert-save restores, 0 errors.
- [x] 4.3 Fix `EditorCanvas` remount — done: `routeKey` (`template:layoutId`) replaces `specStructureKey` remount key; shell remounts only on route switch. Verified live: select + prop edit + Save draft → "Draft saved", revert-save, 0 errors. (Edge wrangler dev crashed once mid-verify with 504s — restarted, same code, all green; unrelated to change.)
- [x] 4.4 Replace per-keystroke `JSON.stringify` equality — done: new `specValueEqual` (reference-first recursive deep-equal, no serialization) replaces guards in `automerge-spec.ts` (4 spots) + `use-layout-collab.ts` connect sync (2 spots, `specJson` helper deleted). Verified live: subtitle keystroke edit + Save draft → "Draft saved" + revert-save, 0 errors.
- [x] 4.5 `React.memo` pass — done: memoized `PaletteBlockButton`/`PinnedBlockRow` (direct `onAdd` pass, no inline arrows) + `LayerTreeRow` (scalar props via new `isRoot`, no spec objects); stabilized `stageAdd`/mutations/history/drag callbacks via ref reads so identities survive keystrokes; `specValueEqual` in history `snapshotsEqual` + content `dirty`; editor-session Data/Actions contexts were already split. Verified live: tree select, 0 errors.
- [x] 4.6 Single `ROUTE_TABLE` — done: `platform-routes.ts` `ROUTE_TABLE` (longest-match scan) replaces 4 prefix chains; `ADMIN_ROUTE_PATHS` + `ACCOUNT_ROUTE_PATHS` derive from it (access rules stay put). Verified live: agents page + sidebar hrefs, `/account/security` MFA, `/login` form, 0 errors.
- [x] 4.7 Reverse editor (DONE: widgets moved)→admin imports — `editor/content-fields.ts:2-3` re-exports admin inputs; `platform/registry.ts:3`, `platform/catalog.ts:4`, `platform/admin-platform-view.tsx:9` import from `../admin`. Move shared inputs to `components/shared`, platform imports from there, admin keeps its own. Accept: no `editor/*` → `admin/*` and no `platform/*` → `admin/*` imports (`grep` clean), all forms render, 0 errors.
- [x] 4.8 Route client (DONE: registry addToCart, org resolve, idp start/callback, oidc.json, login config all via apiFetch*; org resolve keeps null-on-failure; verified login + Add to Cart live, 0 errors) `fetch` via `lib/api.ts` — raw `fetch` in `registry.ts:26` (`POST /api/machines/cart/add`), `auth/org.ts:20`, `auth/idp-login.ts:33,58`, `auth/config.ts:13`, `core/actions/auth.ts:39`. Migrate all to `lib/api.ts` `apiFetch` (HMAC/JWT/org headers in one place). Accept: no raw `fetch` outside `lib/api.ts` (`grep` clean), login/cart/catalog flows work, 0 errors.
- [x] 4.9 Code-split (DONE: vendor chunks initial-only + editor-vendor async group; specValueEqual moved to dep-free lib/spec-equal; build proves editor-vendor 5.7MB async chunk; editor loads, 0 errors) TipTap/Yjs/Automerge — `package.json:14-17,32-44,50,55` + `rspack.config.mjs:108-124`: TipTap ×10, Yjs, Automerge ×3, `rrweb-player` ship in initial bundle. `React.lazy` the rich-text editor + collab hooks (`RichTextTipTapEditor.tsx:10-18`, `use-rich-text-collab.ts:3-5`), `cacheGroups` for tiptap/automerge/yjs, import `automerge/slim` only. Accept: initial JS down on storefront (no editor libs on `/`), editor still loads on demand, 0 errors.
- [x] 4.10 Fix client (DONE: extensions @json-render pinned ^0.20.0 single version; local components use ComponentFn<typeof catalog, Name>; catalog.ts per-key types instead of fromEntries union; dead root registry.ts deleted; client+server+workers+extensions tsc all clean; home renders product, 0 errors) `tsc` debt — dual `@json-render` 0.19 vs 0.20 (`catalog-loader.ts:92`, `registry.ts:15-21`) + `catalog.ts:12` `slots` type gap. Pin single 0.20.x across client, fix `slots` prop typing. Accept: `pnpm --filter @noname/client exec tsc --noEmit` clean.

---

## Progress log

| Date | Item | Status |
|---|---|---|
| 2026-09-05 | Plan created | open |
| 2026-09-05 | 1 Edge safety batch 1-5: HMAC unify, public routes merge, 401 vs 400, KV harden, bot SSR cache | done — `tsc --noEmit` clean, 21 vitest pass |
| 2026-09-05 | Live server + browser verify | done — podman up, API :3000 ok, edge :8787 ok, flags/public 200, schema 200, browser yogastore renders with flag promo, only favicon 404 |
| 2026-09-05 | Batch 2: favicon passthrough, worker drain, pagination, indexes, N+1 | done — tsc clean, 11 vitest pass, db:push applied, live API/edge 200, browser 0 console errors |
| 2026-09-05 | Section 3a: ports canonicalization | done — types to `ports`, values stay in `contracts`, tsc clean, 14 vitest pass, live API/edge 200, browser 0 errors |
| 2026-09-05 | Shim removal (pre-prod, no back-compat) | done — contracts type re-exports + shim comment removed, tenantHmacHeaders removed, PUBLIC_*_PATTERNS removed, agent-token verify re-export removed, secrets factories required, 29 vitest pass, live commerce home renders 0 errors |
| 2026-09-05 | Section 3b-d: cross-domain ports, DomainError, commerce seed | done — shared/agent-token, validateSpec via documents index, required authorization, injected LLM factories, Validation/ServiceUnavailable/Storage errors, extensions ["commerce"] live |
| 2026-09-05 | Full browser sweep (home, PDP, login, admin, agents, editor, cart) | done — 0 console errors on all routes; found+fixed LoginForm providerList crash; login OIDC + admin + agents + editor + authenticated Add to Cart ("Added to cart") verified live; guest cart 401 is pre-existing (not wired) |
| 2026-09-05 | Collab stale-chunk overwrite bug (home spec reverted twice) | fixed + tested — `layout-room.ts` `createRoom` converges rehydrated Automerge doc onto Postgres before baselining + `persistRoom` write path re-checks DB vs baseline; 31 vitest pass (collab + layouts service); live: 2 editor open-wait cycles incl. cold start after API restart hold product1, home shows product + Add to Cart, 0 console errors |

Add to Cart guest — 401 POST /api/machines/start, UI shows "sign in required". Pre-existing: guest cart never wired (commerce MVP gap), not a refactor regression.