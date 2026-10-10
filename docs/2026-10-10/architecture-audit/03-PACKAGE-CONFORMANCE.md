# 03 — Package Conformance Audit

**Question answered:** does each package respect the architecture's own layering rules, or does it break them?

The rules being tested are the ones the project states for itself:

| Rule | Source |
|---|---|
| R-A | Server domain = `ports.ts` → `entity.ts` → `service.ts` → `adapters/postgres.ts` → `api.ts` → `index.ts`; services depend on ports, never on Postgres/SDKs | `README.md:208`, `ARCHITECTURE_DECISIONS.md:36` |
| R-B | Domains communicate via ports/events, not by reaching into each other's services, adapters, or tables | `shared/event-bus.ts`, `ARCHITECTURE_DECISIONS.md` |
| R-C | Generic server domains contain no vertical (commerce) semantics | `ADR-0006`, `apps/docs/docs/architecture/package-boundaries.md` |
| R-D | Dependency direction is downward: `client → extensions → documents/shared/verticals`; `server → shared/documents/verticals`; nothing imports upward | `ADR-0001`, `ADR-0006` |
| R-E | Shared packages (`documents`, `auth`, `shared`) contain no env/Node/React/runtime coupling and are safe for every consumer | `packages/shared/README.md:24` |
| R-F | Seeding owns profiles/orchestration; fixtures own pure data; tests import fixtures, not seed profiles | `ADR-0011` |

---

## 1. Conformance matrix

| Package | R-A | R-B | R-C | R-D | R-E | R-F | Overall |
|---|:-:|:-:|:-:|:-:|:-:|:-:|---|
| `server` | ⚠️ 13/17 ports, 3/17 entity; 12 root-level infra files | ❌ 6 concrete cross-domain imports; 1 domain reads another's tables | ❌ 3 verified leaks | ⚠️ `shared/*` imports domains (type-only) | n/a | n/a | **Layered but unenforced** |
| `client` | n/a | ❌ `core/actions/*` imports `admin/*` | ✅ no vertical logic in core | ✅ | ✅ | ✅ | **Mostly conformant** |
| `extensions` | n/a | ✅ | ✅ commerce-only | ❌ declares `@noname/client` dep | ✅ | ✅ | **Conformant** |
| `verticals` | n/a | ✅ | ✅ | ❌ **declares `@noname/server`** + tsconfig alias | ✅ | ✅ | **1 illegal dep** |
| `documents` | n/a | ✅ | ✅ | ✅ | ✅ genuinely pure | ✅ | **Clean** |
| `auth` | n/a | ✅ | ✅ | ✅ zero runtime deps | ✅ | ✅ | **Clean** |
| `shared` | n/a | ✅ | ⚠️ `comms-providers.ts` is domain data | ✅ | ✅ zero runtime deps | ✅ | **Clean, 1 leak** |
| `workers` | ✅ modular routes | ✅ no DB access | ❌ hardcodes `commerce.checkout` | ✅ | ✅ | ✅ | **Conformant** |
| `browser-sdk` | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ 0 tests | **Conformant, untested** |
| `seeding` | n/a | ❌ | ❌ | ❌ **9 deep relative imports into 5 packages + `readFileSync` into extensions** | n/a | ❌ isn't declarative data | **Worst offender** |
| `fixtures` | n/a | ✅ pure data | ✅ | ✅ | ✅ | ⚠️ root is `export {}`; only `notifications/` built | **Under-built** |
| `cli` | n/a | ✅ | ✅ | ✅ | ✅ | ✅ | **Dead stub** |

---

## 2. `packages/server`

### 2.1 Skeleton inconsistency (R-A)

Only `documents` matches the full documented chain. Aggregate: **13/17 have `ports.ts`, 3/17 have `entity.ts`, 17/17 have `index.ts`.** `capabilities` and `collab` skip the layering entirely. `evidence`'s adapter is named `create…Service`; `machines` calls its service `engine.ts`; `integrations` renames `schema.ts`/`events.ts`; route files use three conventions (`api.ts` ×10, `routes.ts` ×4, `routes/` ×5).

This is not a defect in itself — it is a defect that **nothing detects**, and `README.md:208` asserts uniformity that does not exist.

### 2.2 Layering violations (R-A) — services/domain roots importing infrastructure

| Severity | Location | What |
|---|---|---|
| **HIGH** | `domains/auth/service.ts:18-40` | service imports runtime functions from `./adapters/zitadel/{authorizations,client,management,mfa,project-id,users}`; `auth/ports.ts` defines **no** identity-provider port → auth logic is untestable without ZITADEL |
| **HIGH** | `domains/auth/scope/{collections,bindings,teams,helpers}.ts:1-6` | drizzle ORM + direct `documents/schema` table imports in service-layer files |
| MED | `domains/capabilities/idempotency.ts:2-3` | `drizzle-orm` + DB in domain root (no `adapters/`) |
| MED | `domains/integrations/provider-event-receipts.ts:2-3` | same |
| MED | `domains/collab/collab-automerge-chunk-store.ts:2` | `drizzle-orm` in root file |
| MED | `domains/collab/collab-redis-relay.ts:1` | `ioredis` in root file; module-level `publisher` singleton |
| MED | `domains/analytics/replay-storage.ts:2`, `domains/collab/r2-automerge-chunk-store.ts:8`, `domains/documents/assets/r2.ts:1` | `@aws-sdk/client-s3` outside `adapters/` |
| MED | `domains/notifications/service.ts:6-7`, `domains/webhooks/service.ts:5-6` | service imports concrete adapter DTO mappers at runtime |
| MED | `domains/agent/mastra/*` | de-facto adapter (`@mastra/core`) outside the adapter convention; wired directly from `bootstrap.ts:14,248` |

No `service.ts` imports `drizzle-orm`/`postgres`/`ioredis`/`@clickhouse/client` **directly** — the violations are root-level store files and `auth/scope/*`. Credit where due: the worst pattern (SQL in service logic) is rare.

### 2.3 Cross-domain coupling (R-B)

| Severity | Location | Reaches into |
|---|---|---|
| **HIGH** | `auth/scope/helpers.ts:6`, `collections.ts:3`, `bindings.ts:3` | `documents/schema` tables (`contentCollections`, `contentTeams`, `documents`) + `documents/shared/document-collection` — **auth reads/writes another domain's tables directly** |
| **HIGH** | `agent/index.ts:3-4` | `auth/adapters/zitadel/{issuer,project-id}` (concrete adapter) |
| **HIGH** | `agent/mastra/executor.ts:18-19` | `collab/{agent-collab-runtime,layout-collab-session-options}` (collab has no ports, so concrete is forced) |
| MED | `edge/service.ts:15` | `documents/services/pages.service` (`normalizeRoutePath`) |
| MED | `agent/revert-layout-patch.ts:3` | `documents/services/normalize-layout-spec` |
| MED | `auth/service.ts:10` | `documents/contracts` runtime values |
| MED | `webhooks/outbound-router.ts:2-3` | `machines/events`, `notifications/events` runtime constants |

**No runtime import cycle verified.** Two type-only cycles exist and are safe only because the edges are `import type`: documents ↔ auth, and shared ↔ domains.

Note the direction inversion: `shared/public-actor.ts:2`, `site-id.ts:2`, `document-audit.ts:2-3`, `task-audit.ts:2` import **from** `domains/*`. The shared layer should not know about domains.

### 2.4 Vertical leakage (R-C)

| Severity | Location | What |
|---|---|---|
| **HIGH** | `machines/routes/instances.ts:25,68-221` | `const CART_MACHINE = "cart"`; hard-coded `/cart/start`, `/cart/:id`, `/cart/:id/:event`; `CLIENT_CART_EVENTS`; `PAYMENT_SUCCEEDED`/`PAYMENT_FAILED` policy |
| **HIGH** | `integrations/extension-dispatcher.ts:52-59` | `process.env.COMMERCE_BACKEND_URL`, `extension: "commerce"`, `events: ["stripe/checkout.session.completed"]` |
| MED | `integrations/provider-event-worker.ts:82-115` | `recoverPersistedPaidCartProjection` — `machineName !== "cart"`, `currentState !== "paid"`, `context.paymentRef` |
| MED | `documents/adapters/postgres.ts:92-93` | SQL `data->'integrations'->'stripe'->>'connectionId'`, `->'googleMail'` |
| LOW | `bootstrap.ts:130-205` | commerce permission maps + projectors in the composition root (defensible as wiring, but the *types* are vertical knowledge) |

### 2.5 Composition root and DI

- **Single composition root** — `bootstrap.ts:61 createApp()`, called by `index.ts:22` and `worker.ts:30`. Genuinely centralized.
- **Per-domain factory pattern is broadly uniform** (`domains/*/index.ts` returns `{service, routes, worker}`), but bootstrap **bypasses it ~11 times** (`createPostgresDocumentStorage`, `createStorefrontContentRoutes`, three agent executors, capability registry/routes/idempotency store, extension dispatcher, provider receipt store, webhook router).
- **Factory signatures are non-uniform** — object-deps vs positional vs `new Hono()` created inside bootstrap (`:316`).
- **Worker startup is a construction side-effect** of building domains (`analytics/index.ts:20`, `webhooks/index.ts:30`, `agent/index.ts:56`, `tenant/index.ts:17`, `notifications/index.ts:42`, `integrations/index.ts:76-82`). `worker.ts:30` therefore also builds the HTTP graph. This is documented and deliberate (`worker.ts:11-25`, `shared/worker-runtime.ts:21-23`), but it means API and worker wiring are the same code path with an env switch.

### 2.6 Shared-layer health

`src/shared/` holds 26 files. Two problems:

1. **Domain knowledge in a generic layer**: `org.ts:8-11` hard-codes `NANGO_WEBHOOK_PATHS` and special-cases them at `:41-44`; four modules import domain ports/payload types.
2. **Process-local state that breaks horizontal scaling**: `event-bus.ts` handler map + publisher, `sse-manager.ts:17` client map, `collab-redis-relay.ts:21` handler map, `bullmq-queue.ts:4` queue map, `redis-fanout-status.ts:5-6` registry + `setInterval`, `tracing.ts:9` `NodeSDK`, `org.ts:21` module-level secret capture.

### 2.7 Test gaps

No domain has zero tests, but coverage is very uneven and **there are no architecture tests**. Thin spots: `capabilities` (1 test, no idempotency coverage), `evidence` (1, adapter untested), `tenant` (1, queue/worker/api/r2 untested), `webhooks` (1, outbound worker untested), `audiences`, `flags`, `secrets`.

---

## 3. `packages/client`

Detailed UI conformance is report 04. Package-layering findings:

| Severity | Finding |
|---|---|
| MED | **Layering inversion:** `core/actions/content.ts:2-3` (`admin/document-folder`, `admin/folder-tree`), `layout.ts:1`, `audiences.ts:1,14` — platform-core depends on the admin feature layer. Same class of inversion the editor→admin rule targets, on the other axis. |
| MED | **Duplicate legacy catalog subsystem, 375 lines, 0 importers:** `src/catalog.ts` (56), `src/component-schemas.ts` (78), `src/components/index.tsx` (161, contains `"Add to Cart"` at `:62`). `component-schemas.ts:5,16` re-declares `Hero`/`ProductCard` that already exist in `extensions/src/commerce/catalog-schemas.ts:142,237`. `ARCHITECTURE_DECISIONS.md:28` still points at this dead module as "the commerce component catalog". |
| LOW | 4 dead `@deprecated` re-export shims with zero importers (`admin/layout-entries.ts`, `admin/content-entries.ts`, `editor/layout-entries.ts`, `editor/content-entries.ts`); orphan `editor/collab/ws-bytes.ts` |
| LOW | Inconsistent intra-`admin` layering: shared widgets split across `admin/components/shared`, `components/content`, `components/rich-text`, while `admin/components/content/*` still exists alongside `components/content/*` |
| LOW | Editor (~96 files) has three overlapping persistence/collab paths (`use-editor-persistence.ts`, `use-layout-draft.ts`, `use-content-draft.ts`, `collab/layout-collab-repo.ts`, `platform/persistence/`) |

Largest files (maintainability signal): `AudiencesAdmin.tsx` 865, `RichTextTipTapEditor.tsx` 678, `admin/schemas/components.ts` 647, `EditorCanvas.tsx` 555, `editor/lib/spec-utils.ts` 437.

---

## 4. `packages/verticals`

**One illegal dependency, declared and unused:**

- `verticals/package.json:16` — `"@noname/server": "workspace:*"` creates an **upward dependency**, while the real edge runs `server → verticals` (`server/src/bootstrap.ts:9` imports `@noname/verticals/commerce`). Declared cycle.
- `verticals/tsconfig.json:5` — `"@noname/server/*": ["../server/src/*"]` is a resolver escape hatch into server internals.
- No source file imports `@noname/server`; `verticals/src/commerce/activity-types.ts:37` explicitly says the local port "prevents the vertical package from depending on the server implementation" — the manifest contradicts the code's stated intent.

**Fix:** delete both. Add a CI boundary check so it cannot return.

---

## 5. `packages/extensions`

Conformant on the big rules:

- ✅ flat props, no `config`/`labels`
- ✅ registered through a manifest/loader, not a custom route (`extensions/src/index.ts:23-25` `extensionLoaders`, consumed by `client/src/catalog-loader.ts` gated on `manifest.extensions`, `:166-182`)
- ✅ no route registration anywhere in the package
- ✅ 11 commerce components, matching the roadmap inventory

Findings:

| Severity | Finding |
|---|---|
| MED | **Duplicated commerce logic with `verticals`** — see §7 |
| MED | 3 hardcoded user-visible strings: `components.tsx:326` "Cart unavailable", `orders-admin.tsx:393` `placeholder="CAD"`, `shared/RichTextRenderer.tsx:207` "Embedded asset" |
| LOW | Raw API paths + tenant derived as `window.location.hostname.split(".")[0]` inside the UI layer (`commerce/cart.ts:30,96,103,129,135,146,152,160,179`; `product-content-api.ts:36`) |
| LOW | Declares `@noname/client` (upward) |

---

## 6. `packages/documents`, `packages/auth`, `packages/shared`

- **`documents` is genuinely pure.** Grep for `process.env|node:|react|fs|path|http|window.|globalThis|Date.now|fetch(` across `documents/src` → **0 matches**. Deps are only `@noname/shared` + zod. `tiptap-bridge.ts` (419 lines) does not even import TipTap — it is a pure JSON converter. One dead subpath export (`"./richtext-html"`, zero consumers) and one misplaced helper (`catalog-props.ts` `specProps` — a UI/seed concern duplicated in seeding).
- **`auth` is safe for all three runtimes**: zero runtime deps, no Node built-ins, uses `atob`/`TextDecoder` and global `fetch`. The real gap is what it *doesn't* own: **HMAC signing/verification is not in `@noname/auth`** — signing lives in the worker (`workers/src/hmac.ts`), verification is duplicated server-side in `shared/org.ts:27` and `shared/tenant.ts:20`. The one contract both runtimes must agree on byte-for-byte is the one thing not shared, pinned only by a test.
- **`shared` is dependency-correct** (zero runtime deps, no upward imports) with one rule violation: `comms-providers.ts` is domain data in a pure-helpers package, contradicting `packages/shared/README.md:24`, and it is **missing from the README's export table** that agents are told to read first.

---

## 7. Cross-boundary duplication (highest-value maintainability finding)

Duplicate logic repeated on both sides of a package boundary:

| # | Duplicate | Locations |
|---|---|---|
| D1 | minor-unit exponent | `verticals/commerce/money.ts:9-10` vs `extensions/commerce/product-catalog.ts:37-38` |
| D2 | minor→major conversion | `money.ts:31-43` vs `product-catalog.ts:42` |
| D3 | ISO-4217 regex | `money.ts:19` vs `cart.ts:197`, `actions.ts:110`, `catalog-schemas.ts` ×7 |
| D4 | quantity cap 999 | `verticals/.../capabilities.ts:373` vs `cart.ts:193,209,214`, `catalog-schemas.ts` ×4, `components.tsx:399`, `storefront-components.tsx:175` |
| D5 | **cart total math** | server: integer minor units (`capabilities.ts:723-739`) vs client: float major units (`components.tsx:362-365`; `storefront-components.tsx:157,202`) — different arithmetic on the same value |
| D6 | Evidence record type/subject literals | `order-projection.ts:105,107,134,136,157` vs re-typed in `server/src/bootstrap.ts:146-153` |
| D7 | cart machine contract strings | `extensions/.../machines/cart.json` vs `order-projection.ts:71-76,187-190`, `capabilities.ts:274,459,649,717,879,894` |
| D8 | `specProps` | `documents/src/catalog-props.ts:9` vs `seeding/src/profiles/commerce/index.ts:77-82` |
| D9 | `ComponentCtx` type | `extensions/src/types.ts:4` vs `client/src/core/components/types.ts:3` |
| D10 | Evidence `schemaVersion` drift | `order-projection.ts:106` writes `2`; `verticals/.../demo-order-evidence.ts:16` writes `1` |

D5 is the most dangerous: a client-side float total and a server-side integer total for the same cart is a correctness divergence waiting for a rounding case to expose it.

---

## 8. `packages/seeding` — the worst boundary offender

Despite `ADR-0011` assigning it "CLI profiles and environment workflows" and `SEEDING-ARCHITECTURE-IMPLEMENTATION.md:88-105` saying it owns orchestration only, seeding:

1. Reaches into **server internals by relative path** — `profiles/commerce/index.ts:11,12,13`, `profiles/platform/index.ts:17`, `profiles/platform/demo-users.ts:12` (including ZITADEL adapters via the barrel `server/src/seed.ts:3-5`).
2. Reaches into **client**: `profiles/platform/demo-specs.ts:1`, `demo-labels.ts:1` (login-form labels).
3. Reaches into **documents**: `demo-specs.ts:2`.
4. Reaches into **verticals**: `profiles/commerce/index.ts:14`.
5. **Reads extensions source off the filesystem**: `profiles/commerce/index.ts:663` `readFileSync(join(ROOT,"packages/extensions/src/commerce/machines/cart.json"))`.
6. **Opens Postgres itself**: `profiles/commerce/index.ts:622-632` reads `DATABASE_URL`, builds a Drizzle DB, instantiates the Postgres evidence adapter.
7. Is **imperative, not declarative**: 709 + 773 lines with inline spec JSON; `SeedContext.now`/`dryRun` are defined but unused.
8. Nothing imports `@noname/seeding` (its `exports` map is dead surface).

**Good news:** the documented past problem is genuinely fixed — **zero** test files import seed profiles; tests use `@noname/fixtures/notifications`.

**Fix:** domain-owned seed modules, package specifiers instead of relative paths, injected ports instead of self-opened Postgres, declarative profile data, and tests.

---

## 9. `packages/fixtures` and `packages/cli`

- **fixtures**: pure, zero deps, correct direction — but under-built. `fixtures/src/index.ts` is literally `export {}` and is imported by nothing; only `notifications/` exists. The recommended `commerce/order.ts`, `documents/layouts.ts`, `builders/deterministic-id.ts` were never created (`deterministicSeedId` lives in `seeding/src/index.ts:82`).
- **cli**: 42 lines, unreferenced by any root script or package, duplicating `pnpm dev` + `docker compose`. `init` is a `console.log`. Its own critique document (`docs/2026-08-07/MAINTAINABILITY.md:113`) is itself stale (it claims no typecheck/lint/test — false now).

---

## 10. `packages/workers`

Modular and correct on the important axis — **no DB access, no Node built-ins, WebCrypto only**. Routes are separated by concern (auth, hmac, cache, bot-ssr, public-routes, proxy-websocket).

Findings:

| Severity | Finding |
|---|---|
| MED | `routes/proxy.ts:40` hard-codes `POST /api/capabilities/commerce.checkout` — directly contradicting its own comment at `:58-62` ("no per-domain path config, ever again") |
| MED | `shared/resolve-slug.ts:22` awaits `fetchWithTimeout` with **no try/catch**, so an origin outage throws out of `resolveProxyOrgId` and 500s instead of degrading (`storefront.ts` and `jwks-cache.ts` degrade correctly by contrast) |
| LOW | Dead branch: `proxy.ts:25,133,140` — `isResolveSlugPath` special case is unreachable (the guard at `:133` already returned) |
| LOW | `wrangler.toml:4` enables `nodejs_compat` with no Node API in use |
| LOW | `renderer.ts:1` is a 3-line stub; `POST /api/edge/personalize` no longer exists, contradicting `docs/2026-09-12/EDGE-PERSONALIZATION-IMPLEMENTATION.md:16` |

---

## 11. Enforcement gap (the root cause)

**Nothing enforces R-A … R-F.**

- `biome.json:17-35` — recommended preset only; no custom/GritQL rule; `noExplicitAny: "off"` (`:26`); no `noRestrictedImports` for domain boundaries or the editor→admin rule.
- `vitest.config.ts` — no boundary plugin, no source-scanning test; `coverage.include` scoped to `packages/server/src` only, so 11 of 12 packages are excluded from coverage reporting.
- **No CI at all** — `.github/`, `.gitlab-ci.yml`, `.circleci`, `azure-pipelines.yml`, `.woodpecker.yml` all absent.

This is why every rule above drifted. The rules were written; nothing held them.

**Cheapest effective enforcement** (recommended in report 07):
1. One `architecture.test.ts` walking `packages/*/src/**` asserting: no `service*.ts` imports `drizzle-orm`/`ioredis`/`@aws-sdk`/`@clickhouse`; cross-domain imports target only `ports`; no `packages/verticals` → `@noname/server`; no `seeding` relative imports into other packages.
2. One `catalog-conventions.test.ts` asserting registry↔schema key parity per UI pack and banning `fetch(`/`getCart(` in registry-mapped component files.
3. Biome `noRestrictedImports` for `packages/client/src/editor/**` → `admin/*`.
4. A CI workflow that runs `biome check`, `pnpm -r typecheck`, `pnpm test` on every PR. Today none of these run automatically.
