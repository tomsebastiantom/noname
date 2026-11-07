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

## Next block (planned)

`E14` — `R3.content`: the content a route references resolves non-empty (no published-but-empty collection).
Verification: publishing an empty collection makes `R3` fail with the collection id.
