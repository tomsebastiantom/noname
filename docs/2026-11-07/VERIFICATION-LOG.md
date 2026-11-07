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

## Next block (planned)

`E5` — machine actor + `MACHINES_READ` split, so the CLI can run `M4`/`M5` against the live API without a
human JWT. Verification: the same CLI command reports `M4`/`M5` as `pass`, and the same token is rejected on
`POST /api/machines/definitions`.
