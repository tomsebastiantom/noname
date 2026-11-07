# Eval service — implementation plan (RFC vs code)

> **Status:** plan (design only, no implementation started) · **Date:** 2026-11-07 (America/Toronto)
> **Scope:** [`RFC-EVAL-SERVICE.md`](../2026-10-24/RFC-EVAL-SERVICE.md) — the **measurement layer**: what a check is, how it runs, what it returns.
> **Not in scope:** gate verdicts, promotion, Evidence-per-decision — those moved to [`RFC-RELEASE-GATE.md`](./RFC-RELEASE-GATE.md) (see its §12). This plan builds what that gate consumes.
> **Method:** every claim below was checked against the current code, not against the RFC. Where the RFC and the code disagree, the disagreement is recorded as a gap and a decision, not silently resolved.
> **Related:** [`RELEASE-VERIFICATION-GAPS.md`](./RELEASE-VERIFICATION-GAPS.md) · [`RFC-CRITICAL-REVIEW.md`](../2026-10-31/RFC-CRITICAL-REVIEW.md) · [`RFC-RELEASE-GATE.md`](./RFC-RELEASE-GATE.md)
>
> **Implementation status:** Blocks 1–3, tier 0/1, tier 2, S1, the cart half of E20, envelope/config, the gate
> sink, the async worker with tier 2, B6, E4, E6 (retry-once) and **E8 (tenant-role coverage)** are **done and
> verified** on 2026-11-07. **E20 checkout→`paid` is blocked by an external dependency** (provider sandbox).
> Open: E27 cost/sampling, B7 rubric. See [`VERIFICATION-LOG.md`](./VERIFICATION-LOG.md).

---

## 1. What “done” means

The eval service is done when all of the following are true, and each is demonstrated by a failing fixture, not by a passing test alone:

1. **One catalogue.** Every check in RFC §4 exists (or is explicitly dropped with a recorded reason), has a stable id, a tier, and a `off | warn | error` level.
2. **One seam.** Checks are pure functions of an `Observation`. No check reads the filesystem, a database, or a browser directly.
3. **One runner.** Plan → execute → evaluate → report, with modes `dev | gate | agent` as policy, not as separate code paths.
4. **One result contract.** `CheckResult` plus a run envelope (`runId`, `releaseId`, `specHash`, `checksVersion`), with `skip`/`unverified` never reported as `pass`.
5. **A real browser path.** Tier 2 renders through the Playwright fleet with viewport, readiness, a11y and console observations; the CLI can drive it locally.
6. **Cost controls.** Tiers, change detection, and sampling exist as enforced policy — not as prose.
7. **Production plumbing.** A BullMQ queue, an isolated worker process, Evidence/metrics sinks, and an audited service identity.

The RFC’s own rule applies: **a harness that has never been seen to fail is decoration.** Every phase below ends with a deliberate break that must be caught.

## 2. Architecture constraints (what the implementation must fit)

These are not preferences; they are how this repository works today.

| Constraint | Evidence | Consequence for eval |
|---|---|---|
| Workspace packages export raw TS | `@noname/auth`, `@noname/documents`, `@noname/seeding` all use `"exports": "./src/index.ts"` | `@noname/eval` is consistent; it runs under `tsx` (server/CLI) or a bundler, not plain `node` |
| Server domains are factories | `createApp()` composes `create*Domain()`; each returns routes and, sometimes, a worker ([`bootstrap.ts`](../../packages/server/src/bootstrap.ts)) | Eval’s server-side pieces become `domains/eval` with the same shape |
| Ports and adapters | `DocumentStorage`, `MachineRouteDeps`, `EdgeService` ([`documents/ports.ts`](../../packages/server/src/domains/documents/ports.ts)) | Eval defines ports (`EvalClient`, `BrowserObserver`, `SpecObserver`); adapters live outside |
| No cross-domain DB access | Domains take services/ports, not the Drizzle client | Eval must **never** import Drizzle or server adapters |
| Hono + `respond` helpers | Routes in `domains/*/routes` | Any eval API route follows the same shape |
| BullMQ with hashed queue names | [`bullmq-queues.ts`](../../packages/server/src/shared/bullmq-queues.ts) | New queue name must be `"{eval-runs}"` (Dragonfly hashtag requirement) |
| Worker gating | `RUN_WORKERS`, `workerConcurrency()` ([`worker-runtime.ts`](../../packages/server/src/shared/worker-runtime.ts)) | Eval worker obeys the same flags, plus its own entrypoint |
| prom-client registry | [`metrics.ts`](../../packages/server/src/shared/metrics.ts) | Metrics are registered there with `noname_` names |
| Evidence service | [`evidence/ports.ts`](../../packages/server/src/domains/evidence/ports.ts) | Gate-decision Evidence goes through the service; per-check detail is metrics |
| Colocated Vitest | `*.test.ts` next to source; `vitest.config.ts` | New checks get unit tests with fake observations |
| Auth actors + permissions | `denyUnless` rejects agents ([`deny-unless.ts`](../../packages/server/src/domains/auth/deny-unless.ts)); `MACHINES_DEFINE` guards both read and write ([`definitions.ts`](../../packages/server/src/domains/machines/routes/definitions.ts)) | Eval needs a machine/service actor and a read permission split |

## 3. Verified baseline — what exists today

| Area | State | Evidence |
|---|---|---|
| Package | `@noname/eval`, `playwright-core` only, no build script | [`packages/eval/package.json`](../../packages/eval/package.json) |
| Check functions | 3: manifest (`M4`, `M5`), routes (`R1` + `R2` emitted), browser (`B1.render`, `B2.console`, uncommitted) | [`checks/`](../../packages/eval/src/checks/) |
| Types | `Check` = bare function; `CheckResult` with `pass/fail/skip`, `error/warn` | [`types.ts`](../../packages/eval/src/types.ts) |
| Observers | HTTP client only; browser observer uncommitted | [`observers/http.ts`](../../packages/eval/src/observers/http.ts) |
| Runner | `evaluate()` loops a mixed array; derives `passed` | [`index.ts`](../../packages/eval/src/index.ts) |
| CLI | `noname eval` with tenant/api-base/machines-dir/max-routes/json | [`cli/src/commands/eval.ts`](../../packages/cli/src/commands/eval.ts) |
| Browser fleet | K3s deployment + Playwright server; idle | [`deploy/base/browser/deployment.yaml`](../../deploy/base/browser/deployment.yaml) |
| Typecheck | **Fails** (10 errors): `Check` shape mismatch; nullable browser context | `pnpm --filter @noname/eval typecheck` |
| DOM markers | **None** (`data-block-*`, `data-eval-ready` absent) | `grep` over `packages/client/src` |
| A11y | **No `axe-core` dependency** | package manifests |
| Queue | **No eval queue**; `BULLMQ_QUEUES` has 7 unrelated queues | [`bullmq-queues.ts`](../../packages/server/src/shared/bullmq-queues.ts) |
| Evidence | `platform.eval.run` not written anywhere | `grep` |
| Metrics | No `eval_*` instruments | [`metrics.ts`](../../packages/server/src/shared/metrics.ts) |
| Modes | None | — |
| Service identity | Agents are rejected; no machine actor in `AuthActor` | [`actors.ts`](../../packages/auth/src/actors.ts), [`deny-unless.ts`](../../packages/server/src/domains/auth/deny-unless.ts) |
| Catalog schema | Exists, but duplicated and React-coupled (`client/src/component-schemas.ts`, `client/src/core/catalog-schemas.ts`, `extensions/src/commerce/catalog-schemas.ts`) | those files |

## 4. Target architecture

### 4.1 Dependency rule

```
server/domains/eval ──┐
cli (dev mode) ───────┼──▶ @noname/eval  (pure core + ports)
eval worker ──────────┘        │
                               ├─ checks/      pure: Observation → CheckResult
                               ├─ observers/   the only I/O (HTTP, browser, manifest/spec)
                               ├─ runner/      plan → execute → report
                               ├─ config/      presets + assertMatrix
                               └─ sinks/       stdout, json, metrics, evidence (ports)
```

Rules:

1. `@noname/eval` imports **no** server domain, no Drizzle, no Hono.
2. Checks import nothing but types and pure primitives.
3. Observers are created by the caller (CLI, worker, server), never inside a check.
4. The server and CLI are **adapters**; they own credentials, telemetry and blocking.

### 4.2 Package layout

```
packages/eval/src/
  types.ts            Observation, CheckResult, RunResult, Level, Tier, Mode
  registry.ts         the single catalogue + id uniqueness
  config.ts           presets, assertMatrix, resolution order
  primitives/         overflow, text-normalise, structure-count, route-match
  checks/
    manifest.ts       M1..M5
    routes.ts         R1..R3
    render.ts         B1,B2,B4,B6
    a11y.ts           B3
    behaviour.ts      B5
    security.ts       S1
  observers/
    http.ts           ApiPort (exists)
    spec.ts           manifest/documents/catalog facts
    browser.ts        Playwright/CDP, viewport, readiness, a11y injection
  runner/
    plan.ts           scope → targets
    execute.ts        targets × checks → observations
    evaluate.ts       observations → results (levels)
    report.ts         run envelope + output
  sinks/
    stdout.ts, json.ts, metrics.ts, evidence.ts
  index.ts            public API: evaluate(scope, mode, deps)
```

### 4.3 Core types (replacing the current mismatch)

```ts
export type Tier = 0 | 1 | 2;
export type Level = "off" | "warn" | "error";
export type CheckStatus = "pass" | "fail" | "skip";

export type CheckMeta = {
  id: string;                 // "M4.machines"
  tier: Tier;
  defaultLevel: Level;
  needs: Array<"api" | "spec" | "browser">;
  description: string;
};

export type Check = {
  meta: CheckMeta;
  run(obs: Observation, cfg: ResolvedAssertions): CheckResult[];
};
```

`Observation` is the single seam (RFC §5.4), extended with what the checks actually need:

```ts
type Observation = {
  route: string;
  width?: number;
  http?: { status: number; headers: Record<string, string>; body?: unknown };
  spec?: { templateName: string; elements: Record<string, { type: string; props?: Record<string, unknown> }> };
  dom?: {
    nodesByType: Record<string, number>;   // requires the renderer marker
    boxes: Array<{ type: string; width: number; scrollWidth: number }>;
    text: Record<string, string>;
    title: string;
  };
  a11y?: Array<{ id: string; impact: string; nodes: number }>;
  console?: string[];
  durationMs: number;
};
```

`RunResult`:

```ts
type RunResult = {
  runId: string;
  releaseId?: string;      // from RFC-RELEASE-GATE; absent in dev
  specHash: string;
  checksVersion: string;   // hash of the check expectations
  checks: CheckResult[];
  counts: { pass: number; fail: number; skip: number; unverified: number };
};
```

### 4.4 Registry and configuration

- `registry.ts` holds `CHECK_REGISTRY: Check[]`; a test asserts unique ids, valid tiers, and that every id in the RFC catalogue is either registered or explicitly dropped.
- `config.ts` implements the Lighthouse model the RFC already cites: presets + `assertMatrix`, resolved per route in this order: **repo default → preset → tenant override → route pattern**. `off` disables a check without a code change.
- Aggregation (RFC §5.1): numeric checks run 3× with `median`; correctness 3× with `pessimistic`; behaviour 1× with `skip` on infrastructure error.

### 4.5 Modes as policy

| Mode | Target | Blocking | Writes |
|---|---|---|---|
| `dev` | local stack, drafts allowed | exit code only | stdout/JSON |
| `gate` | published routes | level `error` | Evidence (decision) + metrics |
| `agent` | current draft route | returned to model | none |

Same checks in all three; only the caller’s policy differs (RFC §5.3).

### 4.6 Runtime

- **Queue:** `"{eval-runs}"`; job `{ runId, orgId, tenantSlug, route, width, releaseId, checkIds }`; concurrency 4.
- **Worker:** `packages/server/src/domains/eval/worker.ts`, started under `RUN_WORKERS`, later extracted to `eval-worker.ts` with its own image (blast-radius reason already in RFC §5).
- **Browser:** `playwright-core` `chromium.connect(ws)` to `playwright run-server`; pool contract (`/pressure`, `CONCURRENT`, `QUEUED`, `TIMEOUT`) added at the service layer, not invented in the worker.
- **Process boundary:** the API never runs tier 2 inline; the agent tool uses the same observer but a separate context.

## 5. Gap catalogue

Sizes: S < 1 day, M ≈ 2–5 days, L > 1 week. “Acceptance” = the observed failure that proves the gap closed.

### 5.1 Foundations

| # | Gap | Current evidence | Design | Acceptance | Size |
|---|---|---|---|---|---|
| **E1** | `Check` type mismatch | `Check` is `(ctx) => …`; manifest exports `{ id, run }`; browser exports `{ id, level, run }`; `evaluate` mixes them ([`index.ts:24`](../../packages/eval/src/index.ts#L24)) | **DONE 2026-11-07.** `Check = { meta, run }`; registry array; compile-time + test uniqueness | `pnpm typecheck` clean; duplicate id fails a test | S |
| **E2** | Checks do I/O | `readdirSync`/`readFileSync` in [`manifest.ts`](../../packages/eval/src/checks/manifest.ts); HTTP calls in checks; browser launched by check | `Observation` built by observers; checks pure; runner owns I/O. **Manifest path done 2026-11-07**; HTTP/browser I/O still lives in checks. | A check test runs with zero mocks/network; a check cannot import `node:fs` (lint rule) | M |
| **E3** | No assertion config | levels are hardcoded per result | **DONE 2026-11-07.** `AssertionConfig` (`assertions`, `assertMatrix`) resolved per result: catalogue default → id override → matching route patterns (last wins); `off` removes the result; `--config <file>` loads it. Presets remain a convenience, not a mechanism | A route pattern with `B2.overflow: off` removes only that result | M |
| **E4** | No modes/sinks | `evaluate()` returns a value only | **DONE 2026-11-07.** `--mode dev|gate|agent`; gate writes one Evidence decision + metrics, dev/agent write nothing; blocking: `agent` exits 0, `dev`/`gate` non-zero on failure; target: `--drafts` includes draft layouts in `dev` only (gate refuses it) | A failing run exits 1 in dev and 0 in agent; `gate --drafts` refuses; `dev --drafts` includes drafts | M |
| **E5** | No service identity | `denyUnless` returns 403 for agents; no machine actor in `AuthActor`; `MACHINES_DEFINE` guards reads | **DONE 2026-11-07.** `machine` actor + `nsv.` service token; `MACHINES_READ` split from `MACHINES_DEFINE`; token org-scoped with `exp` | Eval reads definitions with a service token; the same token cannot write them | M |
| **E6** | No determinism | `data-eval-ready`, reduced motion, fixed widths; no retries/runs | **DONE 2026-11-07 (option B).** Retry-once for deterministic tier‑2 checks, `attempts` recorded, pass-on-retry counted as `flaky`; `B5` excluded (side effects); `retries` config. N-run median intentionally not built (boolean checks) | A retryable check that fails then passes is `pass` with `attempts: 2` and `flaky: 1`; a persistent failure stays failing after retry | M |

### 5.2 Catalogue — tier 0

| # | Gap | Current evidence | Design | Acceptance | Size |
|---|---|---|---|---|---|
| **E7** | `M1.references` missing | `reference` fields exist with `references?: string` ([`documents/schema.ts:11-23`](../../packages/documents/src/schema.ts#L11-L23)); no check | **DONE 2026-11-07.** Reads `/api/documents/content-types`; every reference field must name an existing type (or fail with the field path) | A dangling reference fails `M1` with the field path; restoring passes | S |
| **E8** | `M2.permissions` missing — **and not implementable as written** | Actions are client handlers, not capability names ([`extensions/commerce/actions.ts`](../../packages/extensions/src/commerce/actions.ts)); no action→permission metadata | **DONE 2026-11-07.** `M2.actions` vocabulary; `M2.permissions` capability/extension/permission wiring; **`M2.roles`** evaluates a **mandatory `audience`** on every contract against a **role→permissions map** read server-side from ZITADEL (paginated; no cache). Fails when a present audience role grants nothing; skips when role data is unavailable or the tenant has none of the audience roles. Live: 5 audiences covered; `customer` is not a staff role, so checkout is not role-gated (public lane) | An audience role that lacks the permission fails; unavailable role data skips (unverified) and never passes | L |
| **E9** | `M3.reachability` missing | `pages.getMainTree` / `listRoutingPages` exist ([`pages.ts`](../../packages/server/src/domains/documents/routes/pages.ts)); no check | **DONE 2026-11-07.** Reads `page_tree/main` + `routing/pages`; every entry must exist and have a route; every published page must be in the tree | A dangling `page_tree` entry fails `M3` with both ids | S |
| **E10** | `M5.vocabulary` is only “is it registered” | `vocabulary` checks API presence, not block/prop names ([`manifest.ts:35-86`](../../packages/eval/src/checks/manifest.ts#L35-L86)) | **DONE 2026-11-07.** For every published layout: type must exist in `@noname/catalog`; standalone layouts also validate props (dynamic json-render bindings deferred to the rendered check). Shell/panel/editor layouts validate types only | An unknown block type or invalid static prop fails `M5` with the element key | M |
| **E11** | Catalog schema is duplicated and React-coupled | `client/src/component-schemas.ts`, `client/src/core/catalog-schemas.ts`, `extensions/src/commerce/catalog-schemas.ts` | **DONE 2026-11-07.** `@noname/catalog` owns core, commerce, admin, editor and shared schemas (zod only); client/extension paths are re-export shims; rspack includes the package in its TS loader | Client build unchanged; eval imports the same schema; one definition per component | L |
| **E12** | `M4` reads the filesystem inside the check | [`manifest.ts:26-32`](../../packages/eval/src/checks/manifest.ts#L26-L32) | **DONE 2026-11-07.** `ManifestObserver` produces `{ files, stored, canReadDefinitions }`; `M4` compares two values | Check unit test with two objects, no fs | S |

### 5.3 Catalogue — tier 1

| # | Gap | Current evidence | Design | Acceptance | Size |
|---|---|---|---|---|---|
| **E13** | `R1` is implemented as fallback detection, not resolution | [`routes.ts`](../../packages/eval/src/checks/routes.ts) — good behaviour, but folded into one check with `R2` | **DONE 2026-11-07.** `R1.resolve`, `R1.fallback` and `R2.blocks` are emitted as separate result ids; R2 is no longer “count > 0” | A renamed slug fails `R1`; a page with 0 blocks fails `R2` | S |
| **E14** | `R3.content` missing | none | **DONE 2026-11-07.** Compares raw layout bindings with the edge-resolved spec: a **required** bound prop that resolves empty fails; nullable props (e.g. an absent image) are ignored via `catalogPropRequirement` | Publishing an empty collection fails `R3` with the prop path | M |
| **E15** | `R2` compares only “count > 0” | [`routes.ts:142-158`](../../packages/eval/src/checks/routes.ts#L142-L158) | **DONE 2026-11-07.** Compares the resolved template to the page’s declared `layoutRef`, rejects untyped elements, and still fails on zero blocks | A route rendering the wrong template passes R1 but fails R2 | S |

### 5.4 Catalogue — tier 2 and security

| # | Gap | Current evidence | Design | Acceptance | Size |
|---|---|---|---|---|---|
| **E16** | `B1.structure` impossible — no DOM markers | no `data-block-*` anywhere; `Renderer` passes `element` (key + type) to every registry component ([`@json-render/react` index.d.ts](../../node_modules/.pnpm/@json-render+react@0.20.0_react@19.2.7_zod@4.4.3/node_modules/@json-render/react/dist/index.d.ts#L366)) | **DONE 2026-11-07.** `withBlockMarkers(registry)` wraps every component in `display: contents` with `data-block-type`; `data-eval-ready` is set when the shell mounts. `B1.structure` compares spec element-type counts with `[data-block-type]` counts in the browser observer | A missing/extra block type fails `B1` with spec vs DOM counts | M |
| **E17** | `B2` is console errors, not overflow | uncommitted `B2.console`; viewport fixed 1280×800 ([`observers/browser.ts:30`](../../packages/eval/src/observers/browser.ts#L30)) | **DONE 2026-11-07.** Real `B2.overflow` at 375/768/1440; observer takes a width per visit and records `scrollWidth`/`clientWidth`; `B2.console` kept separately | A forced 400 px element fails at 375 only | S |
| **E18** | `B3.a11y` missing | no `axe-core` | **DONE 2026-11-07.** axe-core injected in the browser observer; `B3.a11y` asserts the RFC subset (`image-alt`, `label`, `button-name`, `link-name`) and fails with rule ids + node counts | Removing an `alt` fails `B3` with the rule | M |
| **E19** | `B4.content` missing | `B1.render` only checks text length | **DONE 2026-11-07.** Title, text and price values are collected from the edge-resolved spec and looked up in the rendered body; a missing value fails with its text | Removing the price from a product page fails `B4` | S |
| **E20** | `B5.behaviour` missing | checkout capability exists; no sandbox product; no correlation cleanup | **PARTIAL 2026-11-07 — checkout blocked externally.** `B5.behaviour` clicks add-to-cart and asserts a non-zero cart count. **Blocked:** `PAYMENT_SUCCEEDED`/`PAYMENT_FAILED` are rejected on cart routes by design ([`instances.ts:121`](../../packages/server/src/domains/machines/routes/instances.ts#L121)), so `paid` can only arrive through the provider pipeline; no payment-provider integration is configured locally, and **provider validation is not an eval concern** (see [`PENDING-DECISIONS` D5](./PENDING-DECISIONS.md) — contract test in CI, provider smoke in staging) | Add-to-cart fails `B5` (observed); checkout needs a provider account for a staging smoke, plus a reserved product and `correlationId` cleanup | L |
| **E21** | `B6`/`B7` missing | none | **PARTIAL 2026-11-07.** `B6.design` runs axe `color-contrast` and reports `warn`; **still open:** spacing advisories and `B7.visual-rubric` (vision model, warn only) | A contrast failure is reported but does not block | M |
| **E22** | `S1.no_internal_egress` missing | RFC §5.5; no implementation | **DONE 2026-11-07.** The browser observer probes internal HTTP targets (`127.0.0.1:3000`, metadata address) with `no-cors` fetches; S1 passes only if all are unreachable, and is `warn` by default because a local browser legitimately shares the host network | A reachable internal endpoint fails `S1` (observed locally) | M |

### 5.5 Runner, CLI and plumbing

| # | Gap | Current evidence | Design | Acceptance | Size |
|---|---|---|---|---|---|
| **E23** | Result contract incomplete | no `runId`/`releaseId`/`checksVersion`/`unverified`; `CheckResult` lacks `runs`/`fix` | **DONE 2026-11-07.** `EvalResult` carries `runId` + `checksVersion`; `counts.unverified` counts required skips; `CheckResult` already had `runs`/`fix` hooks | A run with an unmeasured required check reports `unverified` > 0, not passed-silently | S |
| **E24** | CLI cannot reach the browser or choose a mode | no browser/site/mode flags; `evalCommand` re-parses `process.argv` | **DONE 2026-11-07.** `--browser-endpoint` / `--site` (default `EVAL_CDP_ENDPOINT`, origin `http://<tenant>.localhost:5173`); observer is created, passed to `evaluate()`, and closed in `finally` | `noname eval --browser-endpoint ws://…` runs tier 2 (verified: 72 pass / 0 fail / 0 skip) | S |
| **E25** | No queue/worker | no eval queue; browser idle | **DONE 2026-11-07.** `{eval-runs}` queue; `POST /api/eval/runs` enqueues; worker drains with concurrency 1 and a 120 s lock, mints an org-scoped service token, runs the catalogue over HTTP and records one decision | A queued run completes and writes `platform.eval.run`; queue depth `completed` increments | M |
| **E26** | No Evidence/metrics sinks | none | **DONE 2026-11-07.** `POST /api/eval/record` (machine-only) writes one `platform.eval.run` Evidence row with decision/run/checksVersion and records `noname_eval_runs_total`, `noname_eval_checks_total`, `noname_eval_unverified_total` | One decision row per gate run; eval counters visible at `/metrics` | M |
| **E27** | No cost policy | none | Sampling + `specHash@releaseId@checksVersion` skip, enforced in the runner | Unchanged release re-run produces skips, reported as `unverified` unless the policy says otherwise | S |

## 6. Phases

Each phase is shippable and ends with a falsification. No phase starts before the previous phase’s falsification is observed.

### P0 — Foundations (E1 ✅, E5 ✅, E12 ✅, E2 manifest path ✅ / HTTP+browser pending, E6 partially)

- Rebuild `types.ts` around `CheckMeta`/`Check`; add `registry.ts`; convert existing checks; make checks pure (manifest observer).
- Fix the browser observer’s nullable-context typing; one context per visit; close in `finally`.
- **Falsification:** `pnpm --filter @noname/eval typecheck` passes; a unit test runs `M4` with two plain objects and no filesystem.

### P1 — Tier 0 complete (E7–E12, E5)

- `M1`, `M2` (with the action registry), `M3`, `M5` against `@noname/catalog`, `M4` via observer.
- Service actor + `MACHINES_READ` split; CLI `--token` accepts the service token.
- **Falsification:** delete a content type (M1 fails), add an unknown block type (M5 fails), point `page_tree` at a missing page (M3 fails), change a cart state (M4 fails).

### P2 — Tier 1 complete (E13–E15)

- Split `R1`/`R2`; add `R3`.
- **Falsification:** rename a slug (R1), render the wrong template (R2), publish an empty collection (R3).

### P3 — Renderer contract + tier 2 (E16–E19, E21)

- Client: `withBlockMarkers`, `data-eval-ready`, route attribute. This is a **separate package change** with its own regression test.
- Eval: viewport-aware browser observer, `B1`, `B2`, `B3` (axe), `B4`, `B6`.
- **Falsification:** drop a node (B1), force overflow at 375 (B2), remove `alt` (B3), remove a price (B4).

### P4 — Behaviour + security (E20, E22)

- Fixture tenant, reserved product, sandbox checkout, correlation-tagged cleanup.
- `S1` canary page.
- **Falsification:** break add-to-cart (B5), open an internal route (S1).

### P5 — Modes, sinks, queue (E3, E4, E23–E26, E27)

- `EvalConfig` + presets; `dev/gate/agent`; stdout/JSON/Evidence/metrics sinks; `EVAL` queue + worker.
- **Falsification:** a `dev` run writes no Evidence; a `gate` run writes exactly one decision; a queued run survives an API restart.

### P6 — Scale and determinism (E6, E27)

- `data-eval-ready` wait, runs/aggregation, flake accounting, sampling, change detection, browser pool `/pressure`.
- **Falsification:** a flaky page is retried and the attempts are recorded; an unchanged release is skipped and reported as unverified.

## 7. OSS precedents (what to copy, what not to)

| Problem | Project | What we copy | What we don’t |
|---|---|---|---|
| Assertion config, levels, aggregation, presets | [Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci/blob/main/docs/configuration.md) | `off/warn/error`, `assertMatrix`, `numberOfRuns` + median/pessimistic, failures-only output | Its audit set and Chrome-launcher model |
| Accessibility | [axe-core](https://github.com/dequelabs/axe-core) | Rule-based checks + node selectors | The full ruleset as a gate (start with the RFC subset) |
| Browser control | [Playwright](https://playwright.dev/docs/browser-contexts) | Contexts per visit, viewports, console capture, `connect()` to a server | Launching a browser inside the worker (the fleet does that) |
| Browser pool contract | [Browserless](https://docs.browserless.io/enterprise/docker/enterprise-image), [Steel](https://steel.dev/blog/self-hosting-steel-browser) | `/pressure`, `CONCURRENT`, `QUEUED`, `TIMEOUT`, `/metrics` | Their images and pricing model |
| Fleet-wide regression | [Crater](https://rustc-dev-guide.rust-lang.org/tests/crater.html), [CITGM](https://github.com/nodejs/citgm) | Sample registry, expect-fail/skip flags, published breakage counts | Running the whole fleet per commit (that’s the release gate) |
| Differential comparison | [Scientist](https://github.com/github/scientist) | Control vs candidate, ignore lists, publish mismatches | Its Ruby control flow; ours is release-level (release-gate §4) |
| Contracts | [Pact](https://docs.pact.io/) | Consumer expectations as the contract | A broker/service; we can start with event/subscriber inventory |
| Metrics | [prom-client](https://github.com/siimon/prom-client) | Registry, labelled counters/histograms | A second metrics stack |
| Queue | [BullMQ](https://docs.bullmq.io/) | Retries, backoff, concurrency, job events | A new queue library |

## 8. Architectural decisions to record

| # | Decision | Rationale |
|---|---|---|
| D1 | Checks are pure; observers are the only I/O | Makes every check unit-testable and keeps the RFC’s L0–L4 split real |
| D2 | `@noname/eval` never imports server code | Prevents the boundary debt the 2026-10-10 audit named; the server is an adapter |
| D3 | A `machine` actor exists, with `MACHINES_READ` split from `MACHINES_DEFINE` | Eval must read definitions without holding a write permission; agents stay forbidden |
| D4 | Catalog schemas move to a node-safe `@noname/catalog` | One definition used by client, bundler and eval; removes the duplicate `baseComponentSchemas` |
| D5 | DOM markers are a renderer contract, not a test detail | `B1` is impossible otherwise; the marker gets its own regression test |
| D6 | `B7` stays `warn` forever | Non-deterministic judgement cannot gate a release |
| D7 | Progress reporting is metric-first, Evidence-second | The audit kernel records decisions, not every check (release-gate §8) |

## 9. Testing strategy

| Level | What | How |
|---|---|---|
| Unit | Every check | Fake `Observation`; no network, no fs, no browser |
| Contract | Every check id | One passing and one failing fixture per id; the failing fixture is the falsification |
| Integration | Observers | HTTP against the local API; browser against the local Playwright server |
| Type/registry | Catalogue | Unique ids, valid tiers, every RFC id registered or explicitly dropped |
| Golden output | CLI JSON | Snapshot shape, not text |
| Performance | Tier budgets | Tier 0 < 100 ms, tier 1 < 50 ms/route, tier 2 recorded per route |

## 10. Risks and mitigations

| Risk | Mitigation |
|---|---|
| `B1` marker change breaks rendering | Separate client PR, visual regression on the demo tenant, markers are additive attributes |
| Catalog extraction churns client imports | Re-export from the old modules; migrate imports in one PR; no behaviour change |
| Service token becomes a backdoor | Org-scoped, short-lived, `MACHINES_READ` only, audited; no write permission |
| Tier 2 flakiness destroys trust | readiness marker, fixed fonts, retries recorded, runs/aggregation, flake metric |
| Eval becomes a second data path | D2 + lint rule forbidding `drizzle`/server imports in `packages/eval` |
| Cost grows with tenants | sampling + change detection enforced in the runner, not documented only |

## 11. Open questions

| # | Question | Recommendation |
|---|---|---|
| Q1 | Does `M2` need an action registry in `@noname/extensions`, or a metadata endpoint? | Registry in the package; expose it through the same API the eval reads, so one source |
| Q2 | Is `B5` allowed to create real orders in a sandbox? | Yes, but only for the reserved tenant/product and only with `correlationId` cleanup |
| Q3 | Does `B1` count elements or rendered nodes? | Elements by `data-block-type`, repeated children excluded per contract |
| Q4 | Where does `checksVersion` come from? | Hash of the resolved assertion config + check ids; bumping a check bumps it |
| Q5 | Is the eval worker a separate image in phase 5 or phase 6? | Phase 5 entrypoint, phase 6 image split — the blast-radius reason applies once tier 2 is real |

## 12. Evidence index

| Claim | Source |
|---|---|
| Check shape mismatch + mixed array | [`eval/src/index.ts`](../../packages/eval/src/index.ts), [`eval/src/checks/manifest.ts`](../../packages/eval/src/checks/manifest.ts) |
| FS reads inside a check | [`checks/manifest.ts:26-32`](../../packages/eval/src/checks/manifest.ts#L26-L32) |
| Fixed viewport | [`observers/browser.ts:30`](../../packages/eval/src/observers/browser.ts#L30) |
| Agent rejection | [`deny-unless.ts`](../../packages/server/src/domains/auth/deny-unless.ts) |
| Read/write permission conflation | [`machines/routes/definitions.ts`](../../packages/server/src/domains/machines/routes/definitions.ts) |
| Renderer passes `element` | `@json-render/react` `ComponentRenderProps` (index.d.ts) |
| Catalog schema duplication | `client/src/component-schemas.ts`, `client/src/core/catalog-schemas.ts`, `extensions/src/commerce/catalog-schemas.ts` |
| Queue naming convention | [`shared/bullmq-queues.ts`](../../packages/server/src/shared/bullmq-queues.ts) |
| Metrics registry | [`shared/metrics.ts`](../../packages/server/src/shared/metrics.ts) |
| Evidence port | [`domains/evidence/ports.ts`](../../packages/server/src/domains/evidence/ports.ts) |
| Domain factory composition | [`bootstrap.ts`](../../packages/server/src/bootstrap.ts) |
| Reference field shape | [`documents/src/schema.ts:11-23`](../../packages/documents/src/schema.ts#L11-L23) |
| Page tree routes | [`documents/routes/pages.ts`](../../packages/server/src/domains/documents/routes/pages.ts) |

## 13. Implementation status (live)

This table is the running record; the evidence for each row is in [`VERIFICATION-LOG.md`](./VERIFICATION-LOG.md).

| Block | Scope | Status | Evidence |
|---|---|---|---|
| **B1** | E1 — typed `Check`, registry, derived verdict | **Done 2026-11-07** | typecheck clean, 6/6 tests, CLI run `passed: true`, browser smoke |
| **B2** | E12/E2 — manifest/spec observer, pure `M4`/`M5` | **Done 2026-11-07** | typecheck, 9/9 tests (incl. exploding client), CLI run, browser smoke |
| **B3** | E5 — machine actor, `MACHINES_READ`, service token | **Done 2026-11-07** | 8/8 token/guard tests, CLI `7 pass / 0 fail / 2 skip`, POST 403, browser smoke |
| **B4** | E7–E11, E13–E15 — tier 0/1 catalogue | **Done except E8’s tenant-role half** — vocabulary, capability wiring, M1/M3/M5/R1–R3 complete | 43 tests; live **64 pass / 0 fail / 2 skip** |
| **B5** | E16–E19, E21 — renderer markers + tier 2 | **Done except B7** — E16–E19; E21's B6 done | 84 tests; live tier 2 pass, 0 contrast advisories |
| **B6** | E20, E22 — behaviour + `S1` | **In progress** — E22 done; E20 cart done, checkout blocked externally | S1 warn-fail names the API; B5 pass “1 item” |
| **B7** | E3, E4, E23–E26 — config, modes, sinks, queue | **Done 2026-11-07** — E3/E4/E23/E24/E25/E26 | 86 tests; async tier 2 verified; drafts policy verified |
