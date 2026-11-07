# Verification log — implementation blocks

> **Purpose:** an append-only record of what was built, how it was verified, and what the evidence was. Each entry is written **after** the verification, and names the command or artefact that proves it.
> **Rule:** a block is not “done” because the code compiles; it is done when the listed evidence was observed.
> **Related:** [`EVAL-SERVICE-IMPLEMENTATION-PLAN.md`](./EVAL-SERVICE-IMPLEMENTATION-PLAN.md) (the plan this log tracks) · [`RFC-RELEASE-GATE.md`](./RFC-RELEASE-GATE.md)

---

## 2026-11-07 — environment bootstrap (precondition for any verification)

The machine had no running stack: the podman machine was stopped, no infra containers existed, and the
Kubernetes cluster in WSL was unreachable from the host (its API VIP `172.29.7.40:6443` refused connections,
and the workloads were 6 days old with `Unknown` pods). The documented compose path was used instead.

| Step | Command | Result |
|---|---|---|
| Start podman machine | `podman machine start noname` | running (6 CPU / 6 GiB) |
| Compose provider | `docker-compose` (preinstalled) tried to reach `//./pipe/podman-noname` and failed | installed `podman-compose` 1.6.0 via pip; **not committed** (tooling only) |
| Infra | `python -m podman_compose up -d` | 10 containers up: postgres, dragonfly, clickhouse, s3, vault, jaeger, zitadel, keto, nango; init jobs exited 0 |
| Schema | `DATABASE_URL=postgres://noname:noname_dev@localhost:5432/app pnpm --filter @noname/server db:push` | changes applied |
| Identity | `pnpm init:zitadel` | org `396614483469991947`, project `397185680666525707`, client `397185682746900491`; `.env`, `wrangler.toml`, `oidc.json` updated |
| Seed | `pnpm seed:demo` | completed: tenant `yogastore`, home layout, 11 admin layouts, demo users |

**Caveat recorded:** `seed:demo` reported `Keto org editor seed failed: fetch failed` because the seed process
loads the root `.env`, whose `KETO_*_URL` still points at the Kubernetes NodePorts. The storefront, admin
layout data and eval checks do not depend on that call; Keto role seeding is outstanding for this local
compose instance.

**How the host reaches the tenant:** the Windows `hosts` file is not writable without elevation, and
`yogastore.localhost` does not resolve through `getaddrinfo`. Chromium was launched with
`--host-resolver-rules=MAP yogastore.localhost 127.0.0.1` for the browser verification below. This is a
verification workaround, not an application change.

## 2026-11-07 — Block 1: typed check registry (E1)

**Scope.** Replace the contradictory check shapes (`Check` as a bare function vs `{ id, run }` objects) with
one `Check` type (`meta` + `run`), one registry, and one place that derives `passed`. Behaviour of every
existing check is unchanged.

**Code.** `packages/eval/src/types.ts`, `registry.ts`, `index.ts`, `checks/{manifest,routes,browser}.ts`,
`observers/browser.ts`, `registry.test.ts`.

### Verification

| Check | Command | Observed |
|---|---|---|
| Types | `pnpm --filter @noname/eval typecheck` | no diagnostics (was 10 errors) |
| CLI types | `pnpm --filter @noname/cli typecheck` | no diagnostics |
| Lint/format | `pnpm exec biome check packages/eval/src` | 0 errors after `--write` |
| Unit tests | `pnpm vitest run packages/eval/src/registry.test.ts` | 6/6 passed |
| Catalogue integrity | test `has unique group ids and unique emitted result ids` | passes; duplicate result id is rejected |
| Crash semantics | test `reports a crash as skip, never pass` | passes |
| Integration (real API) | `pnpm exec tsx packages/cli/src/index.ts eval --tenant yogastore --json` | `passed: true`, `R1.resolve` pass (`/` → `home`), `R1.fallback` warn, `R2.blocks` pass (6 blocks), `M4`/`M5` skip (no service token), `B1`/`B2` skip (no browser endpoint) |
| Browser (real Chromium) | `.tools/verify-storefront.mjs` (Playwright, Chrome channel) | storefront HTTP 200, title `Noname`, 147 chars of rendered text, **0 console errors**; `/login` HTTP 200 with an email field; screenshots [`evidence/storefront.png`](./evidence/storefront.png), [`evidence/login.png`](./evidence/login.png) |

**What this block does *not* prove.** The manifest checks still read the filesystem inside the check
(`E12`), the browser checks still use a fixed viewport (`E17`), tier 2 is not wired to the fleet (`E24`),
and the catalogue is still 5 ids of the RFC's ~16 (`E7–E11`, `E13–E22`). Those remain as listed in the plan.

## 2026-11-07 — Block 2: manifest observer (E12)

**Scope.** Move filesystem reads and stored-definition reads out of `M4`/`M5` into a manifest observer. The
runner builds the observation; checks compare two plain values. No check imports `node:fs` any more, and a
unit test can run them with an exploding HTTP client.

**Code.** `packages/eval/src/observers/manifest.ts` (new), `checks/manifest.ts`, `types.ts`
(`ManifestObservation`), `index.ts` (runner builds the observation when a selected check needs it),
`registry.test.ts`.

### Verification

| Check | Command | Observed |
|---|---|---|
| Types | `pnpm --filter @noname/eval typecheck` | no diagnostics |
| Unit tests | `pnpm vitest run packages/eval/src/registry.test.ts` | **9/9 passed** |
| Purity | test `runs M4/M5 from an observation without touching the filesystem or the API` | passes with `machinesDir = Z:\does-not-exist` and a client that throws on any call |
| Falsification | test `fails M4 on transition drift inside the observation` | `passed: false`, `M4` fail |
| Credential silence | test `skips — never passes — when the caller has no credential` | both checks `skip` |
| Integration | `pnpm exec tsx packages/cli/src/index.ts eval --tenant yogastore --json` | `passed: true`, 3 pass / 0 fail / 4 skip (M4/M5 skip: no service token; B1/B2 skip: no endpoint) |
| Browser smoke | `.tools/verify-storefront.mjs` | storefront 200, `/login` 200, 0 console errors (unchanged) |

**Still open.** The checks run pure, but the *integration* still skips them because no service credential
exists (`E5`). `M4`/`M5` therefore pass in unit tests and skip against the live stack — which is the correct
behaviour until the service actor lands, and is recorded here rather than hidden.

## 2026-11-07 — Block 3: machine actor + read/write permission split (E5)

**Scope.** A service principal that is neither a human nor an agent, an `nsv.` HMAC token, `MACHINES_READ`
split from `MACHINES_DEFINE`, and a CLI that can use the token. The eval service can now read definitions
without borrowing a person's JWT — and cannot write them.

**Code.** `packages/auth/src/{permissions,actors,write-audit,index}.ts`,
`packages/server/src/shared/service-token.ts` (new), `domains/auth/guards.ts`,
`domains/machines/routes/definitions.ts`, `domains/collab/routes.ts`,
`scripts/mint-service-token.ts` (new), `packages/cli/src/index.ts` (`--token` registered),
`shared/service-token.test.ts` (new).

### Verification

| Check | Command | Observed |
|---|---|---|
| Types | `pnpm --filter @noname/{auth,server,cli} typecheck` | all clean |
| Token + guard tests | `pnpm vitest run packages/server/src/shared/service-token.test.ts` | **8/8 passed**: round-trip, tampered payload, expiry, unknown permission, no secret, allowed read, denied write, wrong org |
| Read integration | `pnpm exec tsx scripts/mint-service-token.ts --org <org>` then `noname eval --tenant yogastore --token <token>` | **7 pass / 0 fail / 2 skip** — `M4.machines` and `M5.vocabulary` now pass for both seeded definitions (`cart`, `inventory_reservation`) |
| Write denial | `POST /api/machines/definitions` with the same token + HMAC headers | **403 `Forbidden`** — a read token cannot define |
| Browser smoke | `.tools/verify-storefront.mjs` | storefront 200, `/login` 200, 0 console errors |

**Secret handling.** `SERVICE_TOKEN_SECRET` is used when present; it falls back to `WORKER_SERVER_SECRET`
so local setups need no new env var. The token is org-scoped and short-lived (default 1 h); the mint script
defaults to `machines:read` and rejects unknown permission names.

**Still open.** `M4`/`M5` now pass against the live API only when the caller passes a token; without one they
still skip, which is the intended “silence is not success” behaviour. The catalogue itself is still 5 ids of
the RFC’s ~16.

## 2026-11-07 — E7: `M1.references`

**Scope.** A tier‑0 check that reads the content-type registry and fails when a `reference` field points at a
type that does not exist, or declares no target at all. The write path already rejects the second case; the
first only surfaced when an editor tried to use the field.

**Code.** `packages/eval/src/checks/references.ts` (new), `checks/references.test.ts` (new), `registry.ts`,
`index.ts`, `registry.test.ts` (fake API extended).

### Verification

| Check | Command | Observed |
|---|---|---|
| Types | `pnpm --filter @noname/eval typecheck` | clean |
| Unit tests | `pnpm vitest run packages/eval/src` | **14/14 passed** (5 new M1 tests + registry suite) |
| Falsification (unit) | test `fails when a reference target does not exist` | `passed: false`, subject `product`, detail names the missing type |
| Missing target | test `fails when a reference field declares no target` | `passed: false`, detail “declares no target” |
| Unreadable registry | test `skips — never passes — when the registry cannot be read` | `skip` at `error` level, `passed` unaffected |
| Live integration | `noname eval --tenant yogastore --token <service-token>` | `M1.references` **pass** on all 5 seeded content types (`page`, `editor_prefs`, `notification_email`, `auth_provider`, `product`); overall **12 pass / 0 fail / 2 skip** |
| Browser smoke | `.tools/verify-storefront.mjs` | storefront 200, `/login` 200, 0 console errors |

**Falsification caveat.** The live tenant has no reference fields, and content types cannot be deleted through
the API, so the dangling-target case was falsified at unit level rather than by mutating demo data. Creating a
temporary content type and deleting it via SQL was rejected on purpose: verification must not write around the
domain boundary it is checking.

## 2026-11-07 — E9: `M3.reachability`

**Scope.** A tier‑0 check over the routing graph: every `page_tree` entry must point at an existing page and
have a route; every **published** page must be reachable from the tree. Draft pages are deliberately exempt.

**Code.** `packages/eval/src/checks/reachability.ts` (new), `checks/reachability.test.ts` (new), `registry.ts`,
`index.ts`, `registry.test.ts`.

### Verification

| Check | Command | Observed |
|---|---|---|
| Types | `pnpm --filter @noname/eval typecheck` | clean |
| Unit tests | `pnpm vitest run packages/eval/src` | **20/20 passed** (6 new M3 tests) |
| Live — first run | `noname eval --tenant yogastore --token <service-token>` | **M3 failed with 3 findings**: `collection-all`, `product-demo`, `product-search` published but absent from `page_tree`; overall `12 pass / 3 fail / 2 skip` |
| Live — after restoring routing | `pnpm seed:demo:commerce` then the same eval | **M3 pass**: “4 page_tree entries, 4 pages — all reachable”; overall **19 pass / 0 fail / 2 skip** |
| Browser smoke | `.tools/verify-storefront.mjs` | storefront 200 with the commerce layout (358 chars, 0 console errors), `/login` 200 |

**Real finding, not a synthetic one.** Running the platform seed alone overwrites `page_tree/main` with the
home entry; the commerce routes are then published pages that no route reaches. `M3` caught exactly that, and
re-running the commerce seed restored the entries. The seed-ordering hazard is recorded here because it is a
defect the check exposed on its first live run — the platform seed should preserve existing tree entries (or
the two profiles should be ordered explicitly).

`pnpm seed:demo:commerce` itself exited 1 **after** printing the restored routing, while inserting the demo
order Evidence row; that failure is unrelated to M3 and is recorded so it is not mistaken for a check failure.

## 2026-11-07 — E13/E15: R2 template and element-type comparison

**Scope.** `R2.blocks` no longer passes on “at least one block”. It now compares the template the edge
resolved against the template the page declares in `routing/pages`, rejects elements with no block type, and
still fails a zero-block page. `R1.resolve`, `R1.fallback` and `R2.blocks` remain separate result ids.

**Code.** `packages/eval/src/checks/routes.ts`, `checks/routes.test.ts` (new), `registry.test.ts` (routing
fixture gains `layoutRef`).

### Verification

| Check | Command | Observed |
|---|---|---|
| Types | `pnpm --filter @noname/eval typecheck` | clean |
| Unit tests | `pnpm vitest run packages/eval/src` | **26/26 passed** (6 new route tests) |
| Falsification | test `fails R2 when the route renders a different template than the page declares` | R1 pass, **R2 fail**, detail names declared vs resolved |
| Zero blocks | test `fails R2 when the page renders zero blocks` | fail |
| Untyped element | test `fails R2 when an element has no block type` | fail |
| Missing routing record | test `fails R2 when the page has no routing record` | fail |
| Routing unavailable | test `skips the template comparison — never passes it` | R1 pass, **R2 skip** at `error` level |
| Live | `noname eval --tenant yogastore --token <service-token>` | 4 routes: `/` 7 blocks `home`, `/collections/all` 5 `collection`, `/products/demo-sneakers` 3 `product_detail`, `/search` 4 `search` — **all pass**; overall **19 pass / 0 fail / 2 skip** |
| Browser smoke | `.tools/verify-storefront.mjs` | storefront 200, commerce layout, 0 console errors; `/login` 200 |

**Note on the split.** `R1` and `R2` still share one HTTP pass over the route list — fetching the edge schema
twice to make them separate *functions* would double tier‑1 cost for no assertion gain. The ids and
verdicts are separate, which is what the gate consumes.

## 2026-11-07 — E10/E11: node-safe catalog + `M5.vocabulary`

**Scope.** Extract every catalog schema (core, commerce, admin, editor, shared labels) into a React-free
`@noname/catalog`, make the old client/extension paths re-export shims, and make `M5.vocabulary` validate the
block types (and static props) of every published layout.

**Code.** `packages/catalog/**` (new; schemas moved with `git mv`), re-export shims under
`packages/client/src/{core,admin,editor,schemas}` and `packages/extensions/src/commerce/catalog-schemas.ts`,
`packages/client/rspack.config.mjs` (catalog added to the SWC TypeScript include),
`packages/eval/src/checks/manifest.ts`, `checks/vocabulary.test.ts` (new), workspace dependency updates.

### Verification

| Check | Command | Observed |
|---|---|---|
| Types | `pnpm --filter @noname/{catalog,client,extensions,eval} typecheck` | all clean |
| Tests | `pnpm vitest run packages/eval/src packages/extensions/src/commerce/catalog-schemas.test.ts` | **40/40 passed** (6 new vocabulary tests + 8 existing commerce schema tests through the shim) |
| Live — first run | `noname eval --tenant yogastore --token <service-token>` | **22 failures**: 20 unknown admin/editor block types + 2 dynamic-prop mismatches (`ProductCard`, `ProductInfo`) |
| Fix 1 | moved admin/editor schemas into the catalog | failures 22 → **2** (`AdminShell` props, `TracesAdmin` missing schema) |
| Fix 2 | `TracesAdmin` schema added; shell/panel/editor layouts validate **types only** (their props are injected at render time); dynamic `$`-bindings defer prop validation | failures → **0** |
| Live — final | same command | **47 pass / 0 fail / 2 skip**; `home` reports “7 block(s) in the catalog” |
| Client build | rspack dev restart + browser smoke | first attempt failed to parse `catalog/src/*.ts` (not in the TS loader); adding the package to `rspack.config.mjs` fixed it — storefront 200 (358 chars), `/login` 200, **0 console errors** |

**Findings exposed by the check.**

1. `TracesAdmin` was renderable but had **no catalog schema** — a real vocabulary hole, now closed.
2. `AdminShell` declares required `description`/`activeNav` props, but shell layouts receive them at render
   time. Prop validation is therefore scoped to `renderAs: "standalone"` layouts; types are checked everywhere.
3. Storefront layouts bind product data through json-render `$state` expressions. Validating those raw values
   as strings/numbers is a false positive, so prop validation is deferred when a `$`-binding is present. The
   resolved values are already covered by `R2`/`B4`.

## 2026-11-07 — E14: `R3.content`

**Scope.** For each route, compare the **raw** layout’s content bindings (`$state`/`$item`/…) with the spec the
edge actually resolved. A required bound prop that resolved to empty means the page is published but its
content is missing; an optional/nullable prop that is empty (no product image) is legitimate.

**Code.** `packages/eval/src/checks/routes.ts`, `checks/routes.test.ts` (2 new tests),
`packages/catalog/src/index.ts` (`catalogPropRequirement`).

### Verification

| Check | Command | Observed |
|---|---|---|
| Types | `pnpm --filter @noname/{catalog,eval} typecheck` | clean |
| Tests | `pnpm vitest run packages/eval/src` | **34/34 passed** |
| Unit — resolves | `passes R3 when content-bound props resolve` | pass |
| Unit — empty | `fails R3 when a content-bound prop resolves empty` | fail names `card.title` |
| Live — first run | `noname eval --tenant yogastore --token <service-token>` | 2 failures: `product1.image` / `productInfo.image` “resolved empty” |
| Diagnosis | the product has no image; `image` is nullable in `ProductCard`/`ProductInfo` | false positive — emptiness alone is not a content failure |
| Fix | `catalogPropRequirement(type, prop)` reads the zod field’s optional/nullable status; R3 only fails **required** props | — |
| Live — final | same command | **49 pass / 0 fail / 2 skip**; `/` and `/products/demo-sneakers` each report “6 content-bound prop(s) resolved” |
| Browser smoke | `.tools/verify-storefront.mjs` | storefront 200 (358 chars), `/login` 200, 0 console errors |

**Design lesson recorded.** “Resolved empty” is only a defect when the catalog says the prop is required. Using
the schema instead of a hard-coded list is what makes the check safe across tenancy — and it is the same schema
M5 already validates against, so the two checks cannot disagree.

## 2026-11-07 — E8 (partial): `M2.actions`

**Scope.** The vocabulary half of M2: every action referenced by a published layout must be a declared platform
action. The permission half — mapping an action to a capability and checking the tenant’s roles — remains open
and is recorded as such, not guessed.

**Code.** `packages/catalog/src/actions.ts` (new; core + admin + editor + commerce action schemas),
`packages/eval/src/checks/actions.ts` (new), `checks/actions.test.ts` (new), registry/index exports.

### Verification

| Check | Command | Observed |
|---|---|---|
| Types | `pnpm --filter @noname/{catalog,eval} typecheck` | clean |
| Tests | `pnpm vitest run packages/eval/src` | **38/38 passed** (4 new M2 tests) |
| Live — first run | `noname eval --tenant yogastore --token <service-token>` | 2 failures: `loadScopeAdmin` (`admin_scope`), `loadAgentsAdmin` (`admin_agents`) referenced but not declared |
| Diagnosis | handlers exist in `client/src/core/actions/{scope,agents}.ts`, schemas did not | a real action-vocabulary hole |
| Fix | both actions added to `catalog/src/admin-actions.ts` | — |
| Live — final | same command | **63 pass / 0 fail / 2 skip** |
| Browser smoke | `.tools/verify-storefront.mjs` | storefront 200, `/login` 200, 0 console errors |

**What is still missing (E8 permission half).** Knowing that `cancelOrder` maps to capability
`commerce.orders.cancel` and that capability requires `commerce:orders_manage` — then deciding whether the
tenant’s roles hold it. That needs the capability registry exposed to eval (a machine-only context endpoint)
and an action→capability table; without those, the check deliberately stops at vocabulary.

## 2026-11-07 — E8 (wiring): `M2.permissions` + `/api/eval/context`

**Scope.** Expose the capability registry and installed extensions to the eval service through a machine-only
endpoint, add explicit action→capability contracts, and check every contract (not only actions a layout
happens to reference — components invoke actions internally).

**Code.** `packages/server/src/domains/eval/{api,index}.ts` (new), `bootstrap.ts` route wiring,
`packages/catalog/src/action-contracts.ts` (new), `packages/eval/src/checks/actions.ts`, `checks/actions.test.ts`.

### Verification

| Check | Command | Observed |
|---|---|---|
| Types | `pnpm --filter @noname/{catalog,server,eval} typecheck` | clean |
| Tests | `pnpm vitest run packages/eval/src` | **43/43 passed** (9 M2 tests, incl. missing capability, missing extension, permission drift, no context) |
| Endpoint | `GET /api/eval/context` with the service token | 200 with capability descriptors + `extensions: ["commerce"]` |
| Live | `noname eval --tenant yogastore --token <service-token>` | `M2.permissions` pass: “6 capability contract(s) wired”; overall **64 pass / 0 fail / 2 skip** |
| Negative — capability | unit test removes `commerce.orders.cancel` | fail “not registered” |
| Negative — extension | unit test empties `extensions` | fail “not installed” |
| Negative — drift | unit test changes the declared permission | fail “contract expects” |
| No credential | unit test returns 401 from context | `M2.permissions` **skip**, vocabulary still runs |
| Browser smoke | `.tools/verify-storefront.mjs` | storefront 200, `/login` 200, 0 console errors |

**Why every contract is checked, not only referenced actions.** The layout scan sees `props.action`; components
such as the orders admin call `loadOrdersAdmin` internally, so “not referenced in a layout” does not mean
“unused”. The global contract pass covers all six.

**What remains for E8.** Evaluating the tenant’s actual staff roles against the capability permission. The
endpoint exposes what a capability declares, not which roles the tenant has; that projection does not exist
yet, and inventing it would turn a wiring check into a guess.

## 2026-11-07 — E16: renderer contract + `B1.structure`

**Scope.** Make the DOM say which block is which, then compare the spec’s element counts with the rendered
counts. This is the check the critical review called impossible before the renderer contract existed.

**Code.** `packages/client/src/platform/block-markers.tsx` (new), `catalog-ui-shell.tsx` (wrap + readiness),
`block-markers.test.ts` (new), `packages/eval/src/types.ts` (`nodesByType`), `observers/browser.ts`,
`checks/browser.ts` (`B1.structure`), `checks/structure.test.ts` (new), `registry.test.ts` (skip count).

### Verification

| Check | Command | Observed |
|---|---|---|
| Types | `pnpm --filter @noname/{client,eval} typecheck` | clean |
| Tests | `pnpm vitest run packages/eval/src packages/client/src/platform/block-markers.test.ts` | **49/49 passed** (5 B1 tests + 1 marker test) |
| Unit — missing block | `fails when a block is missing from the DOM` | fail names `GridBase: spec 1, DOM 0` |
| Unit — extra block | `fails when the DOM renders an extra block type` | fail names `Mystery: spec 0, DOM 1` |
| Unit — no browser | `skips — never passes — without a browser` | skip at `error` level |
| Browser — markers | `.tools/verify-storefront.mjs` (real Chrome) | spec counts = DOM counts exactly: `StackBase, Hero, TextBase, ProductGrid, ProductCard, CartSummary, CartDrawer` ×1; `match: true` |
| Browser — readiness | same run | `document.documentElement.dataset.evalReady === "true"` |
| Browser — regressions | same run | storefront 200, `/login` 200, 0 console errors |

**Deliberate limitation: type, not id.** `@json-render/core`’s `UIElement` exposes `type`, `props`, `children`,
`on`, `visible`, `repeat` — but not the map key, so the renderer cannot hand a component a stable block id
without an upstream API change. `B1.structure` therefore compares **counts by type**, which is what catches a
dropped or duplicated block. A per-element id is recorded as a future renderer-contract extension.

**Not yet run through the CLI.** `B1.structure` needs a browser endpoint, and `noname eval` does not have the
`--browser-endpoint` flag yet (E24). The check is unit-tested and the markers are verified in a real browser;
wiring the CLI is the next plumbing step after tier 2.

## 2026-11-07 — E17/E18: `B2.overflow` + `B3.a11y`

**Scope.** Viewport-aware visits (375/768/1440) with a measured overflow fact, and an axe-core audit of the RFC’s
rule subset. Both are tier 2 and report `skip` — never `pass` — when the browser or the measurement is missing.

**Code.** `packages/eval/src/types.ts` (`width`, `overflow`, `a11y` on `PageVisit`), `observers/browser.ts`
(viewport per visit, overflow measurement, axe injection), `checks/browser.ts` (`B2.overflow`, `B3.a11y`),
`checks/{overflow,a11y}.test.ts`, `axe-core` dependency.

### Verification

| Check | Command | Observed |
|---|---|---|
| Types | `pnpm --filter @noname/eval typecheck` | clean |
| Tests | `pnpm vitest run packages/eval/src` | **56/56 passed** (4 overflow + 4 a11y tests) |
| Unit — overflow | `fails only the width that overflows` | fail at `/375`, detail “45px” |
| Unit — unmeasured width | `skips a width whose overflow could not be measured` | skip at `error` level |
| Unit — a11y | `fails and names the violated rules` | `image-alt (2 node(s)); label (1 node(s))` |
| Unit — audit unavailable | `skips — never passes — when the audit could not run` | skip |
| Browser — overflow | `.tools/verify-storefront.mjs` | 375: 375/375; 768: 768/768; 1440: 1440/1440 — **no overflow** |
| Browser — a11y | same run, axe-core in the page | **0 violations** in `image-alt`, `label`, `button-name`, `link-name` |
| Browser — markers | same run | spec/DOM match still true; `data-eval-ready` true |
| Console | same run | 0 errors |

**Not yet through the CLI.** `B2.overflow`/`B3.a11y` need a browser endpoint; `noname eval` still lacks
`--browser-endpoint` (E24). The checks are unit-tested and the underlying measurements are verified in a real
browser, but the CLI path is the remaining plumbing before tier 2 can gate anything.

## 2026-11-07 — E19/E24: `B4.content` + CLI tier‑2 wiring

**Scope.** Prove the resolved spec’s title/copy/price reached the screen, and make tier 2 runnable from
`noname eval` instead of only from a bespoke Playwright script.

**Code.** `packages/eval/src/checks/browser.ts` (`B4.content`), `types.ts` (`PageVisit.text`),
`checks/content.test.ts`, `packages/cli/src/index.ts` (`--browser-endpoint`, `--site`),
`packages/cli/src/commands/eval.ts` (observer lifecycle).

### Verification

| Check | Command | Observed |
|---|---|---|
| Types | `pnpm --filter @noname/{eval,cli} typecheck` | clean |
| Tests | `pnpm vitest run packages/eval/src` | **61/61 passed** (5 B4 tests) |
| Unit — missing price | `fails when the price is not visible` | fail names `99.99` |
| Unit — no title | `fails when the page has no document title` | fail |
| Unit — skips | no browser / unreadable spec | skip at `error` level |
| Local server | `.tools/playwright-server.mjs` (`chromium.launchServer`, Chrome channel, :9222) | `ws://[::1]:9222/…` |
| End-to-end CLI | `noname eval --tenant yogastore --token <service-token> --browser-endpoint ws://… --site http://yogastore.localhost:5173` | **72 pass / 0 fail / 0 skip** |

Tier‑2 results from that run:

```
B1.render      pass   rendered "Noname" (358 chars)
B1.structure   pass   7 block(s) across 7 type(s) match the DOM
B2.overflow    pass   /375, /768, /1440 — scroll <= client at each
B3.a11y        pass   no violations in the checked rule set
B4.content     pass   6 content value(s) visible
B2.console     pass   no console errors
```

**Note on the server.** The Kubernetes browser fleet is not reachable from this host (see the environment
bootstrap entry), so the run used a locally launched Playwright server with Chrome. The CLI only knows the
WebSocket endpoint, so the same command works against the fleet unchanged.

## 2026-11-07 — E22: `S1.no_internal_egress`

**Scope.** Turn the SSRF assumption into a check: from inside the browser, try to reach the platform’s own
network. Passing requires every probe to fail.

**Code.** `packages/eval/src/types.ts` (`EgressProbe`, optional `probeEgress` on the observer),
`observers/browser.ts` (`no-cors` fetch probe with per-target timeout), `checks/browser.ts` (`S1`),
`checks/s1.test.ts`.

### Verification

| Check | Command | Observed |
|---|---|---|
| Types | `pnpm --filter @noname/eval typecheck` | clean |
| Tests | `pnpm vitest run packages/eval/src` | **66/66 passed** (5 S1 tests) |
| Unit — clean | no target reachable | pass |
| Unit — leak | API reachable | fail at `warn`, names `127.0.0.1:3000` |
| Unit — probe failure | probe throws | skip, never pass |
| Unit — no capability | observer without `probeEgress` | skip |
| Live | `noname eval … --browser-endpoint ws://…` | **S1 fail (warn)**: “internal endpoint(s) reachable from the browser: http://127.0.0.1:3000/health” |
| Overall run | same | **72 pass / 1 warn failure / 0 skip**, `passed: true` |

**This is the expected local result.** The local browser runs on the host network, where `127.0.0.1:3000` is
the API; there is no egress policy to enforce. In staging/production the browser pod is the untrusted workload
and the same check becomes the proof that the policy works. That is why S1 is `warn` by default: a local failure
is information, not a release blocker.

**Recorded limit.** `fetch` can probe HTTP(S) targets only; a raw Redis port cannot be tested from page
JavaScript. The check lists what it proved rather than implying full network coverage.

## 2026-11-07 — E20 (cart half): `B5.behaviour`

**Scope.** Make the browser click add-to-cart and prove the cart changed — the first behavioural assertion that
does not trust the spec or the DOM shape, only what happens.

**Code.** `packages/eval/src/types.ts` (`CartFlow`, optional `addFirstProductToCart`),
`observers/browser.ts` (navigate, wait for `data-eval-ready`, click the accessible add-to-cart control, compare
body text), `checks/browser.ts` (`B5`), `checks/b5.test.ts`.

### Verification

| Check | Command | Observed |
|---|---|---|
| Types | `pnpm --filter @noname/eval typecheck` | clean |
| Tests | `pnpm vitest run packages/eval/src` | **72/72 passed** (6 B5 tests) |
| Unit — success | cart `1 item` after click | pass |
| Unit — no control | `clicked: false` | fail “no add-to-cart control” |
| Unit — no change | before === after | fail “did not change” |
| Unit — no count | text changed, no `N item` | fail “no cart item count” |
| Unit — no capability | observer without the method | skip |
| Live | `noname eval … --browser-endpoint ws://…` | **B5 pass**: “cart shows 1 item(s) after add-to-cart” |
| Overall | same run | **73 pass / 1 warn failure / 0 skip** |

**What this does not cover (recorded, not implied).** Checkout → `paid` is not automated. It needs a reserved
sandbox product, a provider sandbox/callback, and cleanup keyed by `correlationId`. A cart that updates but a
checkout that never completes would still pass `B5` today; the plan keeps E20 **partial** for that reason.

## 2026-11-07 — E3/E23: run envelope + assertion config

**Scope.** Give every run an identity and a version, count required skips as `unverified`, and let a caller
turn checks off or re-level them without a code change — including per-route assertions.

**Code.** `packages/eval/src/types.ts` (`AssertionConfig`, `EvalResult.runId/checksVersion`,
`counts.unverified`), `config.ts` (ordered resolver), `index.ts` (apply config, compute version),
`config.test.ts`, `packages/cli` (`--config <file>`, unverified in human output).

### Verification

| Check | Command | Observed |
|---|---|---|
| Types | `pnpm --filter @noname/{eval,cli} typecheck` | clean |
| Tests | `pnpm vitest run packages/eval/src` | **80/80 passed** (8 new config/envelope tests) |
| Unit — off | `drops off-level results and re-levels the rest` | result removed; verdict unchanged |
| Unit — unverified | `counts required skips as unverified` | `counts.unverified === 1` |
| Unit — matrix | `applies the last matching matrix entry` | `/legal/terms` → off, `/checkout` → error |
| Unit — malformed pattern | ignored, default kept | no crash |
| Unit — version | same config stable, changed config differs | yes |
| Live — off | `--config` disabling `B3.a11y` and `S1.no_internal_egress` | both absent; **72 pass / 0 fail / 0 skip**; `runId` + `checksVersion` present |
| Live — matrix | `assertMatrix: [{ matchingRoute: "^/375$", assertions: { "B2.overflow": "off" } }]` | `B2.overflow` results drop from 3 to 2 (`/768`, `/1440`); `checksVersion` changes |

**Semantics recorded.** `off` removes a result entirely (it was not run); a required check that **could not
run** is `skip` at `error` level and increments `unverified`. The two are deliberately different: one is a
decision, the other is missing evidence.

## 2026-11-07 — E4/E26: gate sink, modes, Evidence + metrics

**Scope.** Give the same catalogue two reporting modes: `dev` (terminal only) and `gate` (one Evidence decision
plus metrics). The CLI posts a completed run to a machine-only endpoint; the server remains the only writer to
the audit kernel.

**Code.** `packages/eval` unchanged; `packages/cli` (`--mode dev|gate|agent`, gate POST, unverified output),
`packages/server/src/domains/eval/{gate,api,index}.ts`, `bootstrap.ts` (evidence dep),
`packages/server/src/shared/metrics.ts` (`noname_eval_*`), `gate.test.ts`.

### Verification

| Check | Command | Observed |
|---|---|---|
| Types | `pnpm --filter @noname/{server,cli,eval} typecheck` | clean |
| Tests | `pnpm vitest run packages/server/src/domains/eval packages/eval/src` | **82/82 passed** (2 gate tests) |
| Unit — pass | `writes one pass decision with the run identity` | Evidence input: `platform.eval.run`, `tenant.storefront`, `eval:<runId>:<checksVersion>` |
| Unit — blocked | `records only error-level failures` | `failingCheckIds: ["B1.structure"]`, warn failure excluded |
| Live — gate run | `noname eval … --browser-endpoint … --mode gate --json` | `decision=pass`, `evidenceId=9364788e…`, `runId=411cabb8…` |
| Live — Evidence row | `psql … where type='platform.eval.run'` | `platform.eval.run \| yogastore \| pass \| 44d480f6eb85 \| 411cabb8…` |
| Live — metrics | `GET /metrics` | `noname_eval_runs_total{decision="pass"} 1`; per-check counters; `noname_eval_unverified_total 0` |
| Dev mode | default | no POST, no Evidence row, terminal/JSON only |

**Mode semantics recorded.** `gate` writes exactly one decision; `dev` and `agent` write none. Target and
blocking policy per mode (drafts in dev, published in gate) is still open — the CLI target is the tenant, not a
mode-specific route set. The queue/worker (E25) remains the async path for large sweeps.

## 2026-11-07 — E25: eval queue + worker

**Scope.** Run a tenant sweep off the request path: enqueue a job, let a worker drain it, and have the worker
mint its own org-scoped service credential, talk to the API over HTTP, and record one decision.

**Code.** `shared/bullmq-queues.ts` (`{eval-runs}`), `domains/eval/job.ts` (executeEvalJob + injected run seam),
`worker.ts` (BullMQ worker, concurrency 1, 120 s lock), `api.ts` (`POST /api/eval/runs`), `index.ts`
(worker start), `@noname/eval` added to the server package, `job.test.ts`.

### Verification

| Check | Command | Observed |
|---|---|---|
| Types | `pnpm --filter @noname/server typecheck` | clean |
| Tests | `pnpm vitest run packages/server/src/domains/eval` | **4/4 passed** (2 gate + 2 job) |
| Enqueue | `POST /api/eval/runs` with a service token | `200 {"data":{"jobId":"1"}}` |
| Worker | BullMQ `{eval-runs}` | `completed 1`, `failed 0` |
| Evidence | `psql … where type='platform.eval.run'` | new row `bc34f24f-2ddf-4784-89f2-84f250f43ad9`, decision `pass`, recorded 18:11:12 |
| Metrics | `GET /metrics` | `noname_eval_runs_total{decision="pass"} 1`; per-check counters; `noname_eval_unverified_total 1` |

**Reading the unverified counter.** The async run had no browser endpoint configured, so tier‑2 checks skipped
(`B1`, `B2`, `B3`, `B4`, `B5`, `S1`) and counted as unverified — exactly the semantics added in E23. The
decision is still `pass`, which is why unverified is a separate number rather than a silent success.

**Operational note.** During the first enqueue the API had crashed because `@noname/eval` was linked into the
server only after `pnpm install`; the restart fixed it. That is recorded so the next person does not read the
crash as a queue bug.

## 2026-11-07 — E21 (B6) + E4 blocking policy

**Scope.** Add the measurable half of design review (`color-contrast`, warning only) and make `--mode` mean
something for exit codes: agents report, gates block, and a human `dev` run fails the shell.

**Code.** `packages/eval/src/types.ts` (`contrast`), `observers/browser.ts` (contrast audit), `checks/browser.ts`
(`B6.design`), `checks/b6.test.ts`, `packages/cli/src/commands/eval.ts` (agent exits 0).

### Verification

| Check | Command | Observed |
|---|---|---|
| Types | `pnpm --filter @noname/{eval,cli} typecheck` | clean |
| Tests | `pnpm vitest run packages/eval/src` | **84/84 passed** (4 B6 tests) |
| Unit — advisories | contrast violation `color-contrast (3 node(s))` | fail at `warn`, `passed` still true |
| Unit — unavailable | audit could not run | skip, never pass |
| Live — B6 | `noname eval … --browser-endpoint …` | **B6.design pass**: “no contrast advisories”; overall **74 pass / 1 warn failure / 0 skip** |
| Live — policy | same failing site (`--site http://127.0.0.1:9`), two modes | **agent exit 0**, **dev exit 1** |

**Deliberate limits.** `B6` covers contrast because it has a deterministic answer; spacing and “looks right”
are not automatable without a model. `B7.visual-rubric` remains open (warn only, never a gate). `--mode` target
policy is still tenant-wide: “dev may inspect drafts” is not implemented.

## 2026-11-07 — E25 tier‑2 worker verification + E20 checkout blocker

**Scope.** Prove the async worker can carry tier 2 (not just tier 0/1), and establish exactly what blocks the
checkout half of E20.

### Async tier‑2 run

The API was restarted with `EVAL_CDP_ENDPOINT=ws://[::1]:9222/…` and `EVAL_SITE_BASE=http://yogastore.localhost:5173`,
then a job was enqueued:

| Check | Observed |
|---|---|
| Enqueue | `POST /api/eval/runs` → `200 {"data":{"jobId":"2"}}` |
| Queue | `{eval-runs}` `completed 2`, `failed 0` |
| Evidence | new row `18:17:13`, decision `pass`, counts `{ pass: 70, fail: 1, skip: 2, unverified: 2 }` |
| Tier‑2 metrics | `B1.render`, `B1.structure`, `B2.overflow`, `B3.a11y`, `B4.content`, `B5.behaviour`, `B6.design` all `pass`; `S1.no_internal_egress` `fail` at `warn` |
| Unverified | 2 — the two checks that still skip in the worker (definitions path); tier 2 is no longer among them |

The one `fail` is S1, which is expected locally: the worker’s browser can reach `127.0.0.1:3000`. The decision
remains `pass` because S1 is `warn` — the gate does not treat a local-network fact as a release blocker.

### E20 checkout — blocked, with evidence

`PAYMENT_SUCCEEDED` / `PAYMENT_FAILED` are **rejected on the public cart routes by design**
(`packages/server/src/domains/machines/routes/instances.ts:121`: “Sensitive transitions require JWT / provider
lane”). The only legitimate path to `paid` is the provider event pipeline (configured provider → Nango →
integration webhook), and this environment has no payment-provider integration connected. Therefore:

- a browser click on Checkout can start the capability, but it cannot complete a payment locally;
- forcing `paid` through the API would mean weakening a security boundary to make a test pass — rejected;
- `B5` remains the **cart** behaviour check, and E20 stays partial.

**Provider validation is not an eval concern.** Our half of checkout (cart transitions, amount/currency guard,
event mapping, duplicate-callback suppression) belongs in contract tests with a fake provider; real delivery is a
staging smoke with the tenant’s configured provider. See [`PENDING-DECISIONS` D5](./PENDING-DECISIONS.md).

**What would complete the eval-side E20 work:** a reserved sandbox product and cleanup keyed by
`correlationId`, so the cart flow can be exercised without leaving state behind. Checkout-to-`paid` itself stays
outside the catalogue.

## 2026-11-07 — E4 target policy: drafts in dev only

**Scope.** Finish the mode policy: `dev` may inspect draft layouts; `gate` verifies only what customers see and
refuses the draft flag.

**Code.** `packages/eval/src/types.ts` (`includeDrafts`), `checks/manifest.ts` + `checks/actions.ts` (candidate
filter), `checks/{vocabulary,actions}.test.ts` (draft cases), `packages/cli` (`--drafts`, mode check).

### Verification

| Check | Command | Observed |
|---|---|---|
| Types | `pnpm --filter @noname/{eval,cli} typecheck` | clean |
| Tests | `pnpm vitest run packages/eval/src` | **86/86 passed** (2 new draft tests) |
| Unit — ignored | draft layout with an unknown block, default context | pass (draft not checked) |
| Unit — included | same layout, `includeDrafts: true` | fail “unknown block type” |
| Live — gate | `--mode gate --drafts` | **exit 2**, “--drafts is a dev-mode policy: a gate must verify what customers see” |
| Live — dev | `--mode dev --drafts` with the browser | **74 pass / 1 warn failure / 0 skip** |

**Limit recorded.** Drafts affect the layout-based checks (`M2`, `M5`); route and browser checks still operate on
the published route set. “Dev may test a draft route end to end” would need a draft route resolver, which is a
separate piece of work.

## 2026-11-07 — E6: retry-once, attempts and flake accounting

**Scope.** A failing check should be re-run once before it blocks, the retry should be visible, and a pass that
only happened on retry must not look clean. Option B from D7.

**Code.** `packages/eval/src/types.ts` (`retryable`, `attempts`, `counts.flaky`, `retries`),
`index.ts` (retry loop), `checks/browser.ts` (retryable set), `retry.test.ts`; CLI summary;
`packages/server/src/domains/eval/{gate,api}.ts` (`flakyChecks`), `shared/metrics.ts` (`noname_eval_flaky_total`).

### Verification

| Check | Command | Observed |
|---|---|---|
| Types | `pnpm --filter @noname/{eval,cli,server} typecheck` | clean |
| Unit | `pnpm vitest run packages/eval/src/retry.test.ts` | **5/5**: fail→pass is `pass`, `attempts: 2`, `flaky: 1`; persistent fail stays fail with `attempts: 2`; non-retryable runs once; `retries: 0` disables; skip is not retried |
| Unit — registry | `pnpm vitest run … registry.test.ts` | 9/9 |
| Live | `noname eval … --browser-endpoint …` | **73 pass / 2 warn fail / 0 skip / 0 flaky**; `S1` and `B2.console` each `attempts: 2` |
| Gate sink | `POST /api/eval/record` | accepts optional `counts.flaky`; Evidence stores `flakyChecks` |
| Metric | `GET /metrics` after a gate run | `noname_eval_flaky_total` present (0 for this run) |

**The live result is the point.** Retry re-ran the two failing warnings and left them failing; it did not turn a
failure into a pass. `attempts: 2` is the evidence that the retry happened; `flaky: 0` is the evidence that it
did not change the verdict.

**Operational note.** Before the live run the API and the CDP server were down, and port 9222 was held by a
stale Playwright node process whose parent job had been killed. Killed PID 13420, restarted the API and the
browser server, then verified. Recorded because `EADDRINUSE … ::1:9222` reads like a code bug and is not one.

**Limit.** No N-run median/pessimistic aggregation: the checks are boolean, and tripling tier‑2 cost to average
booleans would buy nothing. If a numeric check is added, aggregate that check, not the suite.

## 2026-11-07 — E8: tenant-role coverage in one phase

**Scope.** Finish the permission story: the runner is a service identity, the evaluation context carries the
tenant’s **role→permissions map**, every capability-backed action declares a mandatory **audience**, and
`M2.roles` fails when none of the audience roles can invoke it. No advisory stage.

**Code.** `catalog/src/action-contracts.ts` (audience on 6 contracts), `eval/src/contracts.ts` (import-time
validation), `eval/src/checks/actions.ts` (`M2.roles`), `eval/src/index.ts` (validation wired),
`server/domains/eval/{api,index}.ts` + `bootstrap.ts` (role map), `auth/adapters/zitadel/authorizations.ts`
(pagination), CLI/worker identity headers, `roles.test.ts`, `contracts.test.ts`.

### Verification

| Check | Command | Observed |
|---|---|---|
| Types | catalog, eval, server, CLI | clean |
| Eval suite | `pnpm vitest run packages/eval/src` | **99/99** (17 files) |
| Contract validation | `pnpm vitest run … contracts.test.ts` | 4/4 — shipped contracts pass; missing/unknown/duplicate audience throws |
| Role unit | `pnpm vitest run … roles.test.ts` | 4/4 — pass (admin holds), fail (editor grants nothing), skip on unavailable roles, skip when no audience role is present |
| Server eval | `pnpm vitest run packages/server/src/domains/eval` | 4/4 |
| Context live | `GET /api/eval/context` with a service token | **200**, `roles` map with 8 keys (admin, access_manager, publisher, editor, analyst, replay_viewer, trace_viewer, flags_manager) |
| Identity live | `x-user-id: eval-worker`, `x-role: service`, HMAC + `nsv.` token | **200** — no admin email in the request |
| `M2.roles` live | `noname eval --tenant yogastore --token …` | **pass**: “5 action audience(s) hold their permission” |
| Full eval live | same command, no browser | **65 pass / 0 fail / 9 skip / 6 unverified**, `passed: true` |
| Registry | `pnpm vitest run … registry.test.ts` | full-catalogue skip count is 10 (`M2.roles` skips without a role map) |

**Limits recorded.**

- **No cache.** `/api/eval/context` lists ZITADEL authorizations per call (now paginated). A cache/projection is
  a follow-up; the decision doc records it.
- **Fail path is unit-proven, not live-proven.** The demo org has `admin`, so every audience is covered. A live
  failure needs a tenant whose only audience role lacks the permission; that fixture is not seeded.
- **`customer` is not a staff role.** `checkout` declares `audience: ["customer"]`; the staff role map has no
  customer, so the action is “not applicable” and the check skips it rather than passing. Customer access is
  enforced by the public/publishable-key lane.
- **Pagination ceiling** is 10 × 1000 rows; beyond that the list truncates, and a missing audience role is a skip,
  never a pass.
- **No separate Evidence row** for the role result; it is part of the eval verdict. Gate Evidence remains one
  decision row per run.

## 2026-11-07 — E27 v1: content-addressed reuse and no-reuse gate

**Scope.** Stop re-running everything on every sweep: build a key from the inputs that can change the answer,
store clean passes, and reuse only when every input matches. The gate never reuses.

**Code.** `eval/src/cache.ts` (canonical JSON, per-route key, run key, pass-only policy),
`eval/src/route-hashes.ts` (routing + layouts → route hashes), `eval/src/index.ts` (exports, checks-version),
`server/domains/eval/results.ts` + `api.ts` (Redis store, machine-only GET/PUT), `cli/src/commands/eval.ts`
(cache flow, `--release`, `--platform-version`, `--browser-fleet`, `--no-cache`), CLI flags, tests.

### Verification

| Check | Command | Observed |
|---|---|---|
| Types | eval, CLI, server | clean |
| Tests | `pnpm vitest run packages/eval/src` | **122/122**, 19 files (23 cache/route-hash assertions) |
| Key stability | equal inputs, reversed route order | same key |
| Key invalidation | release / platform / browser fleet / checks / one route hash | each changes the key |
| Pass-only policy | `isCacheableRun` | refuses failures and unverified runs; `B5` not cacheable |
| Store policy | `PUT /api/eval/results/:key` with a failure | **400** (server refuses independently of the CLI) |
| Live — run 1 | `noname eval … --release r_cache_1 --platform-version v1 --browser-fleet chrome-140 --config …` | computed, key `0cc1839d…` |
| Live — run 2 (identical) | same command | **`reused: true`**, same key, counts unchanged |
| Live — release change | `--release r_cache_2` | **new key `84564191…`**, recomputed (not reused) |
| Live — platform change | `--platform-version v2` | **new key `8dd5a143…`**, recomputed (not reused) |
| Live — `--no-cache` | same release/platform | no key, no read, no write |
| Redis | `scan eval:result:*` | exactly **3** keys — the three computed runs; `--no-cache` added none |

**Limits recorded.**

- **Coarse reuse.** The key is route-aware, but the cache stores a **whole run**: one route edit invalidates the
  whole run. Per-route recompute is the next optimisation, not a v1 claim.
- **No sampling yet.** Gate = all routes; sweeps currently run all routes and reuse only when nothing changed.
- **No reuse metrics.** `reused` is in the JSON result; the `reused/computed` counters are not built.
- **Worker not wired.** The CLI uses the cache; the async worker does not yet.
- **E2E config.** Tier 2 was disabled via a local `.tools/eval-config-cache.json` so the live runs finish quickly
  and produce a clean pass; the cache logic itself is independent of which checks run.

## 2026-11-07 — E27: per-home and per-route reuse

**Scope.** Complete the reuse promise: when one route changes, only that route recomputes. Route hashes are keyed
by **URL** (page tree → pageId → routing → layout); home checks cache under the home hash; route checks cache per
route; the whole-run fast path still handles the no-change case.

**Code.** `eval/src/route-hashes.ts` (`computeRouteHashesFromTree`, URL keys), `eval/src/cache.ts`
(`evalBaseKey`, `CheckCache`), `eval/src/types.ts` (`scope`, `reused`), `eval/src/index.ts` (home cache),
`eval/src/checks/routes.ts` (partition by cached route, persist passing route slices),
`server/domains/eval/api.ts` (`/checks/:key`), CLI cache client, tests.

### Verification

| Check | Command | Observed |
|---|---|---|
| Types | eval, CLI, server | clean |
| Unit — cache/key | `cache.test.ts` | 15/15 |
| Unit — route hashes | `route-hashes.test.ts` | 5/5; keys are `/`, `/products`; editing one layout changes only that route |
| Unit — home cache | `check-cache.test.ts` | 3/3 — hit skips the check, miss stores a pass, failure stores nothing |
| Live — run 1 | `--release r_pc3 --platform-version pv3 --browser-fleet cf3` | computed; `reused: 0` |
| Live — run 2 | same command after deleting only the **run** key | **`reused: 17`**, 0 failures — 7 home results + 10 route results |
| Live — run 3 | same again | **`reused: 17`** — stable |
| Redis | `scan eval:result:*` | run keys and per-check keys coexist; TTL 7 days |
| Gate | `--mode gate` ⇒ `--no-cache` | no key, no read, no write |

**Limits recorded.**

- **The per-route live proof used cache deletion, not a spec edit.** Deleting only the run key proves the
  per-route/per-home caches serve unchanged work; the “edit one route” invalidation itself is proven by the
  route-hash unit test (edited layout → only that route hash changes) and by the key construction, not by a live
  layout edit.
- **Sampling is not implemented.** Every route still runs on a miss.
- **No reuse/computed Prometheus counters.** `counts.reused` is in the JSON only.
- **Worker cache is not wired.** The CLI uses it; the async worker does not.
- **E2E config** turned off `B3.a11y`, `S1`, `B2.console` so the run would be a clean pass (cache requires
  `unverified: 0`, and those checks are expected to warn/fail locally).

## 2026-11-07 — E27: sampling, reuse metrics, worker cache

**Scope.** Complete the cost policy: deterministic rotating sampling, Prometheus reuse counters, and the worker
sweep cache.

**Code.** `eval/src/sampling.ts` + tests, route-check sample filter, CLI `--sample`,
`server/shared/metrics.ts` counters, `POST /api/eval/reuse`, `domains/eval/job.ts` worker cache,
`EvalJobData` mode/release fields, API `/runs` mode support.

### Verification

| Check | Command | Observed |
|---|---|---|
| Types | eval, CLI, server | clean |
| Sampling unit | `sampling.test.ts` | 5/5 — stable per tenant/day, always home, rotates, tenant-specific |
| Sampling live | `--sample 1` vs unsampled | **58** vs **65** results |
| Gate vs sample | `--mode gate --sample 1` | **exit 2**, “a gate must verify every route, not a sample” |
| Reuse metrics | `GET /metrics` after a cached run | `noname_eval_results_reused_total 58`, `computed_total 116`, `gate_reuse_total 0` |
| Worker mode | sweep job | `mode=sweep`, second job `hit=true`, `countsReused=33` |
| Worker Evidence | psql, latest two rows | second: **`reused: true`, `counts.reused: 33`**, pass 33, fresh `correlationId`; first: `reused: false`, 0 |

**Root cause found and fixed.** The first worker E2E showed `hit=true` but Evidence `reused:false`: a reused
result kept the cached `runId`, so the second decision reused the first Evidence **idempotency key** and
deduplicated into it. Reused runs now get a fresh `runId` (cache key + `reused` flag retain provenance). After
the fix, the second job writes its own Evidence row with `reused:true` and `counts.reused:33`.

**Limits.** Sampling applies to route checks (tier‑2 is home-scoped); no tenant sampling; no per-mode sampling
policy beyond the CLI flag.

## Next steps

1. **E27 worker** — isolate the queue consumer (one `workers` process), re-run the sweep pair, and capture the
   Evidence row showing `reused:true` / `counts.reused > 0`.
2. **B7** — visual rubric (warn only, needs a vision model).
3. **E20 checkout** — blocked on a provider sandbox.
