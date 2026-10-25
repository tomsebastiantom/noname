# RFC — Eval service: fidelity, structure and behaviour verification

> **Status:** **Proposed** — awaiting review. No code written yet.
> **Date:** 2026-10-24 (America/New_York)
> **Split from:** [`RFC-PROGRESSIVE-DELIVERY.md`](./RFC-PROGRESSIVE-DELIVERY.md) §6 — that RFC keeps the *rollout* decision and delegates the *gate* here.
> **Related:** [`DATABASE-MIGRATIONS.md`](./DATABASE-MIGRATIONS.md) · [`../2026-10-23/CODE-VERIFIED-STATUS.md`](../2026-10-23/CODE-VERIFIED-STATUS.md) · [`ADR-0013`](../../apps/docs/docs/decisions/ADR-0013-progressive-delivery.md)

---

## 1. Why this is its own service

The eval harness has **five consumers with different urgency**, and it is the only component that can answer "does this tenant's app actually work?":

| Consumer | Needs | Latency |
|---|---|---|
| **AI agent** (while drafting) | "what did I break?" | seconds, interactive |
| **Draft save** (tier 0 only) | structural validity | milliseconds, inline |
| **Publish gate** | block/warn before customers see it | seconds, synchronous-ish |
| **Cohort promotion** (rollout) | "is this cohort healthy?" | minutes, asynchronous |
| **Nightly sweep** | "did a platform change break somebody?" | hours, background |

Embedding that inside the rollout RFC made both documents harder to reason about. Split:

- **Progressive delivery** decides *how changes reach tenants* and treats eval as a gate it calls.
- **This RFC** decides *what is verified, how, at what cost, and with what result contract*.

The two compose through one interface: `evaluate(scope) → { passed, checks[], evidenceId }`.

## 2. What "verified" means — four fidelity dimensions

The word "fidelity" needs disambiguation, because each dimension fails differently and none is covered by the existing schema validation.

| Dimension | Question | Failure mode it catches |
|---|---|---|
| **Structure fidelity** | does every node in the spec exist in the DOM, exactly once, of the right type? | a dropped/ignored component, a slot that silently renders nothing, an unknown block |
| **Content fidelity** | does the resolved data actually appear? | empty grid, placeholder prices, `undefined` copy, a reference pointing at an unpublished document |
| **Design fidelity** | does it hold at real widths? | horizontal overflow at 375px, collapsed grid, unreadable contrast |
| **Behaviour fidelity** | do the actions work? | add-to-cart does nothing, checkout never reaches `paid`, a button 403s because the role lacks the permission |

Schema validation covers **none** of these: it proves each artifact is well-formed, not that the composition is correct. A valid layout can render an empty page; a valid action can be forbidden for the tenant's roles.

## 3. Tiers by cost

```
tier 0  manifest     pure code, no network          microseconds
tier 1  routes       HTTP to the edge               ~10–50 ms per route
tier 2  browser      Playwright + axe-core          2–5 s per route × width
```

Rule: **never use a browser to answer a question HTTP can answer.** Tier 0/1 must be able to run on every keystroke-save; tier 2 is a publish/nightly affair.

## 4. Check catalogue

Every check has a stable id, a tier, and a default **level** (`off | warn | error`) that maps to gate policy.

### Tier 0 — manifest (default level `error`, runs at draft save)

| id | Assertion |
|---|---|
| `M1.references` | every content-type `reference` field resolves to an existing type |
| `M2.permissions` | every action used by a block maps to a capability whose permission the tenant's roles hold |
| `M3.reachability` | every published page is reachable from `page_tree`; every `page_tree` entry points at an existing document |
| `M4.machines` | machine definitions referenced by blocks exist, and declare the transitions the blocks emit |
| `M5.vocabulary` | every block type and prop is in the catalog schema (unknown → reject) |

### Tier 1 — routes (default level `error`, runs at publish)

| id | Assertion |
|---|---|
| `R1.resolve` | `GET /api/edge/schema/:siteId?url=<route>` → 200 |
| `R2.blocks` | expected block types for that template are present in the resolved spec |
| `R3.content` | content the spec requires resolves non-empty (no published-but-empty collections) |

### Tier 2 — browser (levels per §5.1; `off` disables per route pattern)

| id | Assertion | Default level |
|---|---|---|
| `B1.structure` | rendered DOM node count per block type == spec node count per type | error |
| `B2.overflow` | `scrollWidth <= clientWidth + 1` at 375 / 768 / 1440 | error |
| `B3.a11y` | images have `alt`; form fields have labels; interactive elements have accessible names (axe-core subset) | error |
| `B4.content` | key content visible: page title, product name, price | error |
| `B5.behaviour` | add-to-cart updates the cart; checkout reaches `paid`; order row exists for the run's `correlation_id` | error (checkout template only) |
| `B6.design` | contrast / spacing advisories | warn |
| `B7.visual-rubric` | vision-model review of the screenshot (§5.2) | warn — triage only, never a gate |

Tier 2 runs at three fixed widths and records them, so "verified" always means "verified at the widths your customers use".

## 5. Architecture

> **The target shape, in one paragraph.** A **browser pool** — Chromium in its own pods, exposing a CDP endpoint behind `/pressure` — connected to by **stateless eval workers** that drain the `eval` queue; the same pool also serves the **agent** when it browses to check its own work. One pool, two consumers, separated contexts.
>
> **What that is not:** it is not where we start, and it is not Kubernetes today — the repository runs on podman compose, and adding an orchestrator before the checks exist would be building the roof first. The ladder is: `checks → CLI → worker → browser service → autoscaled service`, each step only after the previous one is proven. §5 "Browser runtime" defines the trigger for the fourth step.

```
packages/eval/                        LIBRARY — no CLI of its own
  src/checks/{manifest,routes,render,a11y,commerce}.ts   pure check functions
  src/runner.ts        scope → plan → execute → report
  src/report.ts        result contract (see §7)
  src/index.ts         evaluate(scope) — the one interface other systems call

packages/cli/src/commands/eval.ts     THIN ADAPTER — `noname eval` (existing bin)
```

**Execution split.** Pure checks run in the caller's process (agent tool, API inline). Browser checks are **enqueued to BullMQ** and executed by a worker — never inside the API request path:

```
queue: eval
  job: { runId, tenant, route, width, specHash, checkIds }
  concurrency: 4 contexts per worker
  shards:    additional worker replicas
```

Playwright and Chromium are already installed; BullMQ is already a dependency; the repeatable-job pattern already exists (retention reapers `1128929`, transition relay `3f13a64`).

### Where it runs — and why it needs its own deployment unit

Three placements, and only the middle one is right:

| Placement | Verdict |
|---|---|
| Inside the **API** process | **No.** A Chromium OOM, a hung page or a browser crash takes down HTTP for tenants. Also pollutes request latency with a 300 MB allocation |
| Inside the **existing worker** (`worker.ts`) | Fine to start (concurrency 1), wrong at scale — see blast radius below |
| **Its own eval worker process/image** | **Yes**, from phase P3 |

`packages/server/src/worker.ts` already proves the pattern: a process that never binds HTTP and exists only to drain queues, paired with `RUN_WORKERS=false` on API replicas. Eval reuses it, but must not *share* it.

**Why not share the existing worker — blast radius, not capacity.** That worker already carries order delivery, agent orchestration, catalog builds and analytics ingest. A browser is the least stable thing in the process: it can exhaust memory, spin a core, or wedge forever on a page that never becomes ready. If it lives in the same process, **a bad tenant page can stop webhook delivery and catalog builds for everyone**. Separating them means browser failures degrade eval and nothing else.

The other two reasons are mundane but decisive: the image must carry Chromium **and fonts** (~400 MB more), and the scaling policy is completely different — eval scales with routes × widths × tenants on a nightly cycle; delivery scales with order volume.

```bash
# same repo, own entrypoint and image
packages/eval/src/worker.ts        # start:eval-worker — never binds HTTP
```

### Container requirements (non-obvious, each one has bitten someone)

- Linux base with Chromium's shared libraries **and font packages** — missing fonts silently change layout and produce phantom overflow failures.
- `init: true` (or a tiny init) in the container: Chromium leaves zombie processes and they accumulate until PID exhaustion.
- Memory limit above the concurrency budget (4 contexts ≈ 1.5 GB, plus Node), and a **per-job timeout** so a hung page fails the check instead of the worker.
- Non-root user; if user namespaces are unavailable, `--no-sandbox` is required — that is a real safety reduction, so the network isolation below is not optional.
- **`--shm-size=2g`.** `/dev/shm` defaults to 64 MB in containers and Chrome crashes under load because of it — the most common "works locally, dies in prod" browser failure. Details in "Browser runtime" below.
- Throwaway browser profile per run: no persisted state, no reuse across tenants.

### Security: the browser renders untrusted content

Eval loads tenant storefronts — content the tenant controls, and (once tenant extensions ship) **code the tenant controls**. So the eval browser is an untrusted workload:

- **No platform credentials in the browser context.** Use a scoped, short-lived test session; never an admin token.
- **Egress allowlist**: the tenant's edge origin and CDN only. Deny link-local, loopback and private ranges so a page cannot SSRF into Postgres, Redis or the Vault.
- **No shared network namespace** with the platform's internal services.
- Treat any successful internal fetch from a page as a security bug, not a flake.

### Scaling model

- Concurrency: **4 contexts per worker**; scale replicas by queue depth, not by CPU.
- Worked number: 20 routes × 3 widths = 60 renders ≈ **3–5 min** per tenant at 4-way concurrency. The nightly fleet is minutes-to-hours, not a capacity problem — the constraints are isolation, crash containment and image size, not throughput.
- Cap total concurrent contexts per environment (start at 8) so an evals storm cannot starve the delivery queues of memory on a shared host.
- Nightly wall-time cap: 2 h, then defer the remainder to the next night with a recorded `skip` (never a silent pass).

### Browser runtime — two topologies, and when to switch

There are two ways to run Chrome, and the decision is not "self-hosted vs cloud" — it is **in-process vs a browser service**. [Browserless's production guide](https://docs.browserless.io/enterprise/docker/enterprise-image.md) documents the second shape well enough to copy, and [Steel](https://steel.dev/blog/self-hosting-steel-browser) is an open-source reference implementation of the same idea.

**A — in-process (start here).** Playwright launches Chromium inside the eval worker.

- Simplest, one image, no network hop.
- Good to roughly **4 contexts per worker**.
- Fine for the nightly sweep and for a handful of tenants.

**B — browser service (when A saturates).** Chromium runs as its own deployment exposing a CDP endpoint; workers stay small and stateless and connect over it:

```ts
// eval worker — no browser in the process
const browser = await chromium.connectOverCDP(`ws://eval-browser:3000/chromium`);
const context = await browser.newContext();          // isolated per check
const page = await context.newPage();
await page.goto(url, { waitUntil: "domcontentloaded" });
```

This is the Kubernetes-native split: **two deployments, scaled independently** — browser pods are memory-heavy and churn; eval workers are light and long-lived. `playwright run-server` + `connect()` is the same topology without a third-party image.

**The service contract to copy** (these are the things you otherwise rediscover in production):

| Knob | Why it exists |
|---|---|
| `/pressure` | readiness *as the pool sees it*, so the caller or the queue throttles instead of timing out |
| `CONCURRENT` | hard cap on simultaneous sessions |
| `QUEUED` | bounded wait — beyond it requests are **rejected**, not buffered into memory |
| `TIMEOUT` | per-session ceiling so a hung page cannot hold a slot forever |
| `/metrics` | pool-level metrics, so saturation is visible before it becomes failures |

We already hold ourselves to `/health` + `/ready` + `/metrics`; the browser pool should meet the same bar, and `/pressure` is the missing analogue for "can I take more work".

**Sizing** (adapted from their table):

| Concurrency | CPU | Memory |
|---|---|---|
| 4 (our starting cap) | 2 cores | 4 GB |
| 10–20 | 4 cores | 8 GB |
| 20–50 | 8+ cores | 16 GB+ |

**Scaling in Kubernetes:** scale the browser deployment on **queue depth**, not CPU — [KEDA](https://keda.sh) has Redis and Prometheus scalers, so the eval queue is the signal. Keep a small warm floor (min 1 replica); a cold Chromium start is seconds of latency on the first check of every run.

**Two footguns worth writing down now:**

- **`/dev/shm` is 64 MB by default in containers**, and Chrome crashes under load because of it. Set `--shm-size=2g` (or mount a memory volume). This is the single most common "works locally, dies in prod" browser failure.
- **Fonts must be mounted or baked in** — otherwise layouts shift and overflow checks fail for reasons that have nothing to do with the tenant's page.

**Where the cloud service fits.** A hosted browser product removes the image, the reaper and the warm pool, but adds per-page cost, egress through a third party, and — critically — less control over **fonts and networking**, which is exactly what determines layout fidelity and SSRF safety. Recommend self-hosted until it demonstrably costs more than it saves.

**One pool, two consumers.** The agent needs to *browse* (to check its own work); eval needs to *verify*. Both want the same pool. Build it once, but keep the contexts separate: eval contexts carry no platform credentials, and neither does the agent's browsing context.

### 5.1 Assertion model — borrowed from Lighthouse CI

[Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci/blob/main/docs/configuration.md) is the closest mature OSS analogue of this gate, and its assertion model solves several problems I had hand-waved. Copy it rather than invent:

**1. Three levels, not two.** `off | warn | error` (eslint-style `"check-id": ["error", { … }]`).

- `off` — not run. This is how a tenant or route template disables a check without a code change, and it answers "which checks apply where" without a schema change.
- `warn` — reported, does not fail the run.
- `error` — fails the run.

`passed` is then: **no `error`-level failure**. My earlier `blocking | warning` pair had no way to express "off", which is the level you actually need on day one.

**2. Multiple runs with declarative aggregation.** Lighthouse defaults to `numberOfRuns: 3` and aggregates before asserting: `median`, `optimistic`, `pessimistic`, `median-run`. That is a better answer to flakiness than "retry twice":

| Check class | Runs | Aggregation |
|---|---|---|
| Numeric (overflow px, contrast ratio) | 3 | `median` |
| Correctness (route resolves, block present, order exists) | 3 | `pessimistic` — any failure fails |
| Behaviour (add to cart, checkout) | 1 | single run, but a `skip` on infrastructure error |

**3. `assertMatrix` — per-pattern assertion sets.** Route templates need different assertions: the checkout template must run `B5.behaviour`; a marketing page must not. A pattern-matched matrix replaces per-tenant config sprawl:

```jsonc
{
  "assertMatrix": [
    { "matchingRoute": ".*", "assertions": { "B2.overflow": "error", "B3.a11y": "error" } },
    { "matchingRoute": "^/checkout", "assertions": { "B5.behaviour": "error" } },
    { "matchingRoute": "^/legal", "assertions": { "B4.content": "warn" } }
  ]
}
```

**4. Presets.** A named baseline (`eval:baseline`) that a tenant extends, rather than every tenant authoring a full set. Lighthouse ships `lighthouse:recommended` for exactly this reason.

**5. Deterministic comparison inputs.** Lighthouse normalises non-deterministic URL parts (`urlReplacementPatterns` masking ports and UUIDs) before comparing runs. We need the same for `specHash` and for route identity, or the change detection will think everything changed on every run.

**6. Output defaults to failures only.** `includePassedAssertions` is opt-in; noise is what makes people stop reading reports.

**What we add that Lighthouse cannot:** Lighthouse audits a page it did not build. We know the spec, so we can assert **structure fidelity** — spec node count vs DOM node count — which is far stronger than "the page loaded".

### 5.2 Model-judged reviews (warning only, never a gate)

[OpenUI](https://github.com/wandb/openui) evaluates generated UI by screenshotting it and asking a vision model to rate the elements. It is a genuine technique, and worth having as `B7.visual-rubric` — **`warn` level only**.

Reasons it cannot be a gate: it is non-deterministic, costs a model call per route, and "looks fine" is exactly the judgement humans must keep. Its real use is triage: *"something looks off on /collections/all"* sends a human to the right page. Structural assertions decide pass/fail.

### 5.3 Where it plugs in — no parallel stacks

There are **four** verification paths in this repository today, and adding a fifth would be the real cost of this RFC:

| Existing | Status after this lands |
|---|---|
| `packages/cli` — `noname init|dev|status` (commander, bin `noname`) | **extended**, not duplicated: eval becomes `noname eval` |
| `packages/seeding` — `verifyStoredMachineDefinition()` plus an inline `GET /api/edge/schema/...` assertion | **kept** (it is a *seed postcondition*, not a gate); the inline schema assertion is replaced by tier 1 `R1.resolve` |
| Ad-hoc scripts and probes (earlier `verify-*.ts` runs, now deleted) | **retired** — each was a one-off test that left no result record |
| `docs/MANUAL-VERIFICATION-CHECKLIST.md` — hand-written claims | **generated** from Evidence (see below) |
| `@playwright/mcp` | **stays**, for interactive *agent exploration* only; never for verification |

Three rules that prevent the duplication:

1. **One CLI.** `packages/eval` is a library; the command is a thin adapter on the existing `noname` program. A separate `pnpm eval` bin would mean two entrypoints, two env loaders and two places to update. The earlier `src/cli.ts` in this RFC is dropped for that reason.
2. **One browser driver for the same work.** `playwright-core` is the driver for both the eval worker and the agent's verification tool, so a check computed by the agent and a check computed by the gate are computed the same way. `@playwright/mcp` stays for open-ended exploration (a human or agent poking at a page with no predefined assertion).
3. **One place decides pass/fail.** The checks. The agent's `read_rendered_page` tool, the publish gate, the cohort gate and the nightly sweep all call the same function — if any of them re-implemented a check, drift is guaranteed.

**But "one implementation" is not "one behaviour".** These are genuinely *different steps of verification* with different targets, lifetimes and telemetry obligations, and collapsing them would be the opposite mistake:

| Mode | Caller | Targets | Browser | Writes |
|---|---|---|---|---|
| **`gate`** | publish, cohort promotion, nightly sweep, CI | **published** routes | headless, short-lived, parallel | **Evidence + metrics** — this is the observability coupling |
| **`dev`** | `noname eval` (local CLI) | local stack, optionally **drafts** | headless via `playwright-core`, single | **nothing to fleet telemetry**; human-readable output + optional local JSON |
| **`agent`** | the AI's `read_rendered_page` tool | the **draft being edited** | interactive session, may return DOM + screenshot | nothing to fleet telemetry; the agent *task* is the audit record |

That third column is the whole point of the distinction: **a developer's local run must never flip `tenant_storefront_healthy`.** Eval and observability "go hand in hand" precisely in `gate` mode, and must be *deliberately severed* in the other two, or the fleet dashboards become noise produced by laptops.

Two consequences worth stating:

- The **checks** are shared and must never fork. The **policies** (target, telemetry, blocking) are per mode and belong in the caller.
- `dev` and `agent` are where the harness earns trust *before* it is allowed to gate anything: they let us run the checks against the real tenants and see whether they produce true failures, without a single publish being blocked by an unproven assertion.

**The payoff also fixes a known doc bug.** `MANUAL-VERIFICATION-CHECKLIST.md` currently *overstates* what was proven — its own sibling record contradicts it. Once `gate` mode writes `platform.eval.run` Evidence, that checklist can be **generated** from the latest gated runs per tenant, turning "what we claim" into "what was measured, when, at which widths". `dev`/`agent` runs deliberately do not count toward it — a claim of verification should mean a gate ran.

### 5.4 Layers — one core, three observers, four sinks

The way to unify without rebuilding is to separate **what is decided** from **where the facts come from** from **where results go**. Five layers, each with one job:

| Layer | Job | Must never do |
|---|---|---|
| **L0 primitives** | pure assertions over data: overflow maths, spec↔DOM structure match, a11y rules, HTTP status | touch a browser, a database or the network |
| **L1 checks** | the named catalogue (`M1…`, `R1…`, `B1…`) composed from L0 + the assertion config | perform I/O |
| **L2 observers** | produce the facts: HTTP, browser, manifest | decide pass/fail |
| **L3 runner/policy** | scope → plan → execute → evaluate → report; the `gate \| dev \| agent` mode is a policy here | contain check logic |
| **L4 sinks** | Evidence, metrics, CLI output, agent tool result, generated checklist | compute anything |

**The seam is one type.** Checks are functions of an `Observation`, and observers are the only thing that builds one:

```ts
type Observation = {
  route: string;
  width?: number;
  http?: { status: number; headers: Record<string, string> };
  spec?: ResolvedSpec;          // what the edge says the page is
  dom?: {                        // what the browser actually rendered
    nodesByType: Record<string, number>;
    boxes: { type: string; width: number; x: number }[];
    text: Record<string, string>;
  };
  a11y?: AxeResults;
  console?: string[];
  durationMs: number;
};

type Check = (obs: Observation, cfg: AssertionConfig) => CheckResult[];
```

Because both `spec` (HTTP) and `dom` (browser) are in the same shape, **`B1.structure` is a pure function** — spec node count vs DOM node count — with no browser in the check itself. That is what makes the same catalogue runnable in all three modes.

### Where each piece lives

```
packages/eval/                 L0 + L1 + L3 (pure library, no bin)
  src/primitives/*.ts          overflow, structure, a11y bridge, status
  src/checks/*.ts              the catalogue (M*, R*, B*) + assertion config/presets
  src/observers/{http,browser,manifest}.ts    L2
  src/sinks/{evidence,metrics,stdout,tool,checklist}.ts   L4
  src/runner.ts, src/index.ts  L3: evaluate(scope, mode)

packages/cli/src/commands/eval.ts                  thin adapter → mode "dev"
packages/server/src/domains/eval/                  queue + worker + gate wiring → mode "gate"
packages/server/src/domains/agent/mastra/tools/    read-rendered-page → mode "agent"
```

Three adapters, one core. Adding a fourth consumer later means writing an adapter, not a harness.

### What this collapses, and what it deliberately keeps apart

**Collapses** — today's four verification paths become three adapters over one catalogue:

| Today | Becomes |
|---|---|
| seed's inline `GET /api/edge/schema` assertion | `R1.resolve` in the catalogue, called by the seed or not at all |
| ad-hoc `verify-*.ts` probes | `evaluate({ mode: "dev" })` |
| hand-written manual checklist | the `checklist` sink over `gate` Evidence |
| MCP exploration | **stays separate** — open-ended, no assertion, feeds *humans*, and any finding it produces is promoted into a check |

**Stays apart, on purpose:**

- **Observers** — an HTTP observer cannot produce a DOM, a browser observer cannot produce the edge spec; sharing one would force the browser on everything.
- **Modes/policies** — target, telemetry and blocking differ (`§5.3`).
- **Sinks** — the same result must be able to go to Evidence *or* to a terminal *or* to a model, and a sink that also computed would destroy that.
- **Trust boundaries** — the browser observer is the only one that runs untrusted content, so it is the only one that needs egress allowlists and the sandbox (§"Security").

### Migration — additive, in four steps

Nothing is rebuilt; each step is shippable on its own and the later ones only add.

1. **L0 + L1 + `manifest`/`http` observers** → gate tier 0/1 works with no browser at all. This alone replaces the seed's inline assertion and gives the publish gate something real.
2. **`dev` mode in `noname eval`** → the catalogue becomes runnable by a human against the local stack. Trust is earned here before anything blocks.
3. **`browser` observer + `render`/`a11y` checks** → tier 2; still in-process, still `dev`.
4. **`gate` wiring (queue, worker, Evidence/metrics sinks)** → publish and sweep modes; then the browser pool (see "Browser runtime") when in-process saturates.

At every step the catalogue is shared, so an assertion written once is immediately available to whichever modes exist. That is the "unify the core, separate the seams" property: **adding a mode never re-implements a check, and adding a check never touches a mode.**

## 6. Cost control — three levers

1. **Tiers** — most checks never touch a browser.
2. **Change detection** — hash the composed spec (content + layout + `page_tree` + machine definitions). Skip any `(route, width)` whose `specHash` already passed. This is the difference between "verify every publish" being affordable or not, and it is what makes AI iteration cheap: only what changed is re-checked.
3. **Sampling** — tier 2 nightly for changed tenants, full sweep weekly; tier 1 always.

Worked number: 20 routes × 3 widths = 60 renders ≈ **3–5 min** at 4-way concurrency per tenant. 50 tenants nightly ≈ 4 h on one node — shard, or rely on change detection so most nights are near-empty.

## 7. Result contract

```ts
type EvalScope = {
  orgId: string;
  tenantSlug: string;
  routes?: string[];        // default: all published
  widths?: number[];        // default: [375, 768, 1440]
  tiers?: (0 | 1 | 2)[];
  changedSince?: string;    // change detection
  reason: "draft" | "publish" | "cohort" | "sweep" | "agent";
};

type EvalCheckResult = {
  id: string;               // "B2.overflow"
  status: "pass" | "fail" | "skip" | "error";
  level: "off" | "warn" | "error";   // eslint-style, borrowed from Lighthouse CI (§5.1)
  route?: string;
  width?: number;
  runs?: number;            // how many runs were aggregated (§5.1 #2)
  detail: string;           // human sentence, not a stack trace
  fix?: { kind: string; payload?: unknown };   // what the UI can offer
};

type EvalResult = {
  runId: string;
  specHash: string;
  passed: boolean;          // derived: no error-level failure
  checks: EvalCheckResult[];
  evidenceId: string;       // platform.eval.run
};
```

`passed` is derived, never passed in: **no `error`-level failure ⇒ passed.** `warn` is reported and does not block; `off` is not run.

## 8. Where results are stored

- **Per run → Evidence**: `type: "platform.eval.run"`, `subjectType: "tenant.storefront"`, `subjectId: tenantSlug`, `correlationId: runId`, idempotency key `eval:<runId>:<specHash>`. Data carries `specHash`, platform version, git sha, failing check ids and human details.
- **Aggregates → metrics** (existing registry):
  `eval_checks_total{result,check}`, `tenant_eval_failures{tenant,check}`,
  `tenant_storefront_healthy{tenant}`, `tenant_last_verified_timestamp{tenant}`,
  `eval_run_duration_seconds`, `eval_browser_failures_total`.
- **No new tables in phase 1.** Evidence + metrics answer "what failed" and "is the fleet healthy". A dedicated `eval_runs`/`eval_checks` table is added only when per-check history queries are actually needed (open question Q3).

## 9. Isolation and cleanup

Tier 2 creates real artifacts (cart, order, evidence rows). Rules:

- reserved **test product** and sandbox checkout, never a live product;
- everything tagged with the run's `correlationId`;
- cleanup deletes by `correlationId` — the precise key fixed on 2026-10-24 (`7caf130`), not by guessing a column;
- runs are idempotent: a re-run with the same `runId` + `specHash` returns the stored result instead of re-executing.

## 10. Determinism (the thing that decides whether anyone trusts it)

- **Structural assertions, not pixels, in phase 1.** Pixel diffing arrives later with baselines and tolerances, if ever.
- One explicit readiness signal (`data-eval-ready` on the root) instead of arbitrary sleeps.
- Animations disabled (`prefers-reduced-motion`), network idle awaited, fixed fonts.
- Retries: 2 for tier 2, with attempts recorded in the result — a flaky pass is not silently a pass.
- A check that cannot run reports `skip`/`error`, never `pass`. **Silence is not success.**

## 11. Consumers and how they call it

| Consumer | Call | Behaviour on failure |
|---|---|---|
| Agent tool (`read_rendered_page`) | `evaluate({reason:"agent", tiers:[0,1,2], routes:[current]})` | returns failures to the model so it self-corrects |
| Draft save | `evaluate({reason:"draft", tiers:[0]})` | inline field errors |
| Publish | `evaluate({reason:"publish", tiers:[0,1]})` then tier 2 async | `warn` for the first 2 weeks, then `error` |
| Cohort promotion | `evaluate({reason:"cohort", tiers:[1,2]})` per cohort | gate advance/halt |
| Nightly sweep | `evaluate({reason:"sweep", tiers:[1,2], changedSince})` | regression alert |

The agent's self-check and the platform's guarantee are **the same implementation** — that is the point of building it once.

## 12. Non-goals

- Not a general CI/CD or monitoring product.
- Not pixel-perfect visual regression in phase 1.
- Not load testing or performance budgets (separate concern; `/metrics` covers throughput).
- Not a security scanner for tenant extension code (see [`TENANT-MF-SECURITY.md`](../2026-07-25/TENANT-MF-SECURITY.md)).
- Not evaluating *content quality* — only whether the app works.

## 13. Phasing and falsification

| Phase | Ship | Acceptance (observed) |
|---|---|---|
| **P1** | tier 0 + `M1..M5` + CLI | add a dangling content-type reference → `M1` fails; remove a page from `page_tree` → `M3` fails; restore → passes |
| **P2** | tier 1 + `R1..R3` | rename a `page_tree` slug → `R1` fails with the route named; publish an empty collection → `R3` fails |
| **P3** | tier 2 + render/a11y | remove an `alt` → `B3` fails; force a 400px-wide element at 375 → `B2` fails; both recorded in Evidence + metrics |
| **P4** | behaviour + commerce | break the cart action → `B5` fails; restore → passes; order row appears and is cleaned by `correlationId` |
| **P5** | change detection + sweep + regression alert | re-run with unchanged spec → all `skip` (fast); change one route → only that route re-runs |

Every phase ships only with a demonstrated failure. **A harness that has never been seen to fail is decoration.**

## 14. Open questions

| # | Question | Recommendation |
|---|---|---|
| Q1 | Tier 2 at `error` level at launch, or `warn` first? | `warn` for 2 weeks, then `error` for `B1,B2,B3,B5` |
| Q2 | Which routes get tier 2 by default? | all published routes for small tenants; top-10 + checkout for >20 routes |
| Q3 | Evidence-only results, or an `eval_runs` table? | Evidence + metrics first; table only when per-check history is needed |
| Q4 | Browser-minute budget and concurrency cap? | 4 contexts/worker; cap nightly wall time at 2 h |
| Q5 | Should `read_rendered_page` be one agent tool or several (`read_render`, `read_a11y`)? | one tool returning all checks, model picks what to act on |
| Q6 | Do tenant extensions get their own checks (their blocks)? | yes, later — `B1`/`B2` per extension block, own level |
