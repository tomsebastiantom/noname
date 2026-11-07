# Pending decisions — release mechanism and eval gaps

> **Status:** decision document · **Date:** 2026-11-07 (America/Toronto)
> **Implementation status:** **D14, D15, D16 and D1 C1 implemented 2026-11-07** (see [`RELEASE-D14-DESIGN.md`](./RELEASE-D14-DESIGN.md), [`RELEASE-D15-DESIGN.md`](./RELEASE-D15-DESIGN.md), [`RELEASE-D16-DESIGN.md`](./RELEASE-D16-DESIGN.md), [`RELEASE-D1-DESIGN.md`](./RELEASE-D1-DESIGN.md), [`RELEASE-VERIFICATION-LOG.md`](./RELEASE-VERIFICATION-LOG.md)). **D1 waves/UI remain open.**
> **Purpose:** list every open decision, give several options with trade-offs, and tie each option to what this
> repository actually does today and to how established projects solved the same problem.
> **How to use:** read the summary, then each decision. Tick one option per decision (or write your own). Nothing
> here is implemented yet except where it says “current state”.
> **Related:** [`RFC-RELEASE-GATE.md`](./RFC-RELEASE-GATE.md) · [`EVAL-SERVICE-IMPLEMENTATION-PLAN.md`](./EVAL-SERVICE-IMPLEMENTATION-PLAN.md) · [`RELEASE-VERIFICATION-GAPS.md`](./RELEASE-VERIFICATION-GAPS.md) · [`RFC-PROGRESSIVE-DELIVERY.md`](../2026-10-24/RFC-PROGRESSIVE-DELIVERY.md)

---

## Summary — what needs a decision

| # | Decision | Options | Recommendation | Urgency |
|---|---|---|---|---|
| **D1** | **UI** release pointer (client bundle) | manifest pointer / DB column / **release bounded context** / separate deployable | **C1: release bounded context**, DB truth through a port — **implemented 2026-11-07** | **High** — waves/UI remaining |
| **D14** | What counts as a release | bundle only / bundle + image + migrations + config / whole environment | **Bundle + image + migrations + config** — **implemented 2026-11-07** | **Highest** — defines the unit everything else moves |
| **D15** | How a server change reaches cohorts | deploy-all after preview / blue-green / per-tenant versions / flags | **Preview + blue-green + flags; no per-tenant servers** — **implemented 2026-11-07** | **Highest** — the missing server half |
| **D16** | Migrations across a release | expand/contract / breaking + downtime / per-tenant schema | **Expand/contract mandatory** — **implemented 2026-11-07** | High — shared database |
| **D2** | Machine-definition versions and pinning | append-only versions / instance snapshot / event sourcing | **Append-only versions + pinned instance** | High — definition updates currently hit in-flight carts |
| **D3** | Channels and canary rollout (V2) | defer / release-domain channel table / tenant column / rules engine | **Defer; then release-domain channel table (B)** | Later — only after D1+D2 are in use |
| **D4** | Tenant roles for `M2.permissions` | live ZITADEL API / projection table / token claims / drop | **Live API + cache** | Medium — unblocks E8 |
| **D5** | Checkout verification (`B5`) | contract test / staging provider smoke / check in eval / drop | **Contract test now; provider smoke in staging; never in eval** | Medium — provider half is not ours |
| **D13** | Who chooses the checkout provider | hardcoded literal / tenant setting / server resolves | **Server resolves** | Medium — removes the last provider-specific string from the storefront |
| **D6** | Visual rubric (`B7`) | vision model / visual regression service / drop | **Drop for now** | Low |
| **D7** | Determinism and aggregation (E6) | N runs + median / retry-on-fail / none | **B — implemented (retry-once + attempts)** | Medium |
| **D8** | Cost policy and change detection (E27) | `specHash@release@checks` + sampling / TTL / always full | **Key + tiered sampling** | Medium |
| **D9** | Gate behaviour on `unverified` | block / human ack / mark only | **Human ack, block for contract/data** | Medium |
| **D10** | Eval worker placement | same API process / separate entrypoint / separate image | **Separate entrypoint now** | Medium |
| **D11** | NetworkPolicy and staging | local Calico / kind+Calico / staging cluster | **Staging cluster** | Later |
| **D12** | Evidence retention for eval decisions | bounded samples / `eval_runs` table / metrics only | **Bounded samples now** | Low |

---

## D1 — UI release pointer (client bundle only)

**Status:** **chosen (C1) and implemented 2026-11-07** — pointer + catalog projection; waves/UI remain open. See [`RELEASE-D1-DESIGN.md`](./RELEASE-D1-DESIGN.md).

**Question.** How do we version the **client bundle**, say which one a tenant loads, and switch it back?

**Scope.** This decision covers the **UI half** of a release. It does not version the API server, the worker or
the database — those are D14 (what a release is) and D15 (how the server rolls out). See
[`RELEASE-UNIT-FINDING.md`](./RELEASE-UNIT-FINDING.md) for why that distinction matters. A pointer that moves a
tenant to a new bundle while the server is on a different version is only safe when the server changes are
backward-compatible.

**Current state.** There is no release concept. The catalog worker writes
`tenants/<orgId>/<file>` and `version: 1`
([`worker.ts:44-62`](../../packages/server/src/domains/tenant/worker.ts#L44-L62)), so every build **overwrites**
the previous bundle. The client fetches `/api/tenants/:slug/catalog`
([`use-app-page-loader.ts:59-75`](../../packages/client/src/platform/use-app-page-loader.ts#L59-L75)); that
manifest lives only in Redis ([`redis-manifest-store.ts`](../../packages/server/src/domains/tenant/adapters/redis-manifest-store.ts)).
Redis is a cache, not a durable record.

**Options.**

| Option | How it works | Pros | Cons |
|---|---|---|---|
| **A. Pointer inside the manifest** | `release: { id }` added to the Redis manifest; bundle keys become `tenants/<org>/releases/<id>/…`; the catalog endpoint reads the pointer from Redis | Smallest change; no new table; the client already consumes the manifest | Redis loss = lost pointer; no audit trail; “who moved which tenant” is unanswerable |
| **B. DB is truth, manifest is projection** | New `releases` table + `tenant_release_pointers(org_id, release_id)`; the catalog endpoint resolves the pointer and returns the release’s bundle URL; Redis caches the result | Durable, auditable, queryable; rollback is one row; matches how Kubernetes keeps revision history and Cloudflare keeps versions | One migration + endpoint change; cache invalidation on promote |
| **C1. Release bounded context (same monolith)** | New `domains/release` owning `releases`, `release_artifacts`, `tenant_release_pointers`; exposes a **port** (`ReleasePointerPort`) and API endpoints; tenant catalog reads the pointer through the port, the gate writes verdicts keyed by `releaseId` | Explicit domain boundary; no cycles; one transaction; extractable later without rewriting callers | New domain + tables + endpoints; must enforce the dependency direction |
| **C2. Separate release deployable** | A standalone service owns releases and serves pointers over HTTP | Independent scaling/lifecycle | Network hop for one row; distributed writes with the catalog cache; auth, retries, another failure mode; premature |

**Why C1 and not C2 (yet).** Your instinct — release deserves its own bounded context — is right. The boundary is
the valuable part; the network boundary is the expensive part. C1 gives the boundary now and can be extracted to
C2 later without changing callers, because they already depend on a port. Start with C1.

**Dependency direction (enforced, not aspirational).**

```
domains/release      → imports nothing from tenant, eval or gate
domains/tenant       → imports release/ports (read pointer)
domains/eval/gate    → imports release/ports (write verdict with releaseId)
domains/eval         → receives releaseId as input; imports no release code
```

Example (C1).

```
releases:                id=r_17, org=yogastore, artifact=sha256:3f…, checks=9f2a1c, state=canary
tenant_release_pointers: org_id=3966… → release_id=r_17
R2:                      tenants/3966…/releases/r_17/remoteEntry.js
                         tenants/3966…/releases/r_16/remoteEntry.js   (retained for rollback)

promote:  UPDATE tenant_release_pointers SET release_id='r_17', updated_by='tom' WHERE org_id='3966…'
rollback: UPDATE tenant_release_pointers SET release_id='r_16', updated_by='tom' WHERE org_id='3966…'
```

There is no `tenants` table in this codebase — a tenant is a `tenant_settings` document keyed by slug/org — which
is why the pointer gets its own table. Promotion in production goes through an API that writes Evidence, not
through raw SQL; the SQL above is the effect, not the interface.

**OSS precedent.** Kubernetes keeps a ReplicaSet revision history and rolls back with `kubectl rollout undo`
([docs](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#rolling-back-a-deployment));
Cloudflare Workers upload immutable **versions** and then create a **deployment** that points at one or splits
traffic ([gradual deployments](https://developers.cloudflare.com/workers/versions-and-deployments/gradual-deployments/)).
Both separate *artifact* from *pointer*. That is exactly the missing piece here.

**Recommendation: C1.** The release boundary is the fix for the coupling you identified: tenant and gate depend
on a port, release depends on nobody. B is acceptable only as a stop-gap if the domain split must wait; C2 is a
later extraction, not a first step.

**Caveat — this rolls back the client, not the server.** The API stays on whatever version is deployed. A
pointer rollback is safe only while server changes remain compatible with the previous bundle (additive fields,
no renamed endpoints in the same release). That constraint is D15/D16, not optional.

**Validation — how we know it works (run together, not as separate stories).**

| # | Check | Method | Expected |
|---|---|---|---|
| 1 | Dependency direction | `grep` imports in `domains/release` | zero imports from tenant/eval/gate |
| 2 | Promotion is audited | call promote, then read Evidence | one row: actor, from, to, releaseId |
| 3 | Catalog follows the pointer | promote tenant, fetch `/api/tenants/:slug/catalog` | `private.url` contains the new release id |
| 4 | Rollback is symmetric | roll back, fetch catalog | previous release URL restored |
| 5 | Cache cannot lie | promote then read twice | second read already new; key includes releaseId |
| 6 | Gate binds the release | run gate, read verdict | `releaseId` present; eval received it as input |
| 7 | Release domain is inert | boot with release domain disabled | tenant catalog falls back to the default manifest, no crash |

These seven checks are the acceptance for C1; they are also the regression suite for the later C2 extraction.

**Decision:** ☑ **C1** — chosen 2026-11-07. The pointer lives in the release bounded context
(`domains/release`), exposed as a port; the tenant catalog consumes the port and never reads the pointer table
directly. Implementation follows the D1 validation table above (next release block after D2).

---

## D2 — Machine-definition versions and in-flight pinning

**Question.** How do we stop a definition edit from changing the behaviour of carts already in flight?

**Current state.** `machine_definitions` has `(org_id, name, definition, created_at, updated_at)` — no version
([`schema.ts`](../../packages/server/src/domains/machines/schema.ts)). `define()` updates in place. A cart that
started under the 4-state definition can be evaluated by the 9-state definition after an edit. This is the
original incident the progressive-delivery RFC was written for.

**Options.**

| Option | How it works | Pros | Cons |
|---|---|---|---|
| **A. Append-only versions + pinned instance** | `machine_definition_versions` rows; `machine_instances.definition_version` set at start; the engine loads the pinned version | Auditable; instances never change semantics; matches Camunda/Temporal | New table + column + engine lookup; “which version is current” needs a pointer |
| **B. Snapshot the definition into the instance** | Store the definition JSON in the instance at start; the engine reads the snapshot | No new tables; in-flight safety immediately; easy migration | Large JSON per instance; no shared version identity; updating a definition still has no history |
| **C. Event-sourced definitions** | Definitions are events; instances replay to their start position | Full history and replay | Overkill for this stage; large refactor |

**Example (A).** `cart.json` edited from 4 to 9 states creates version 4. An instance started at version 3 keeps
transitioning under version 3; new carts start at version 4. The engine's `transition` loads
`definitionVersion` from the instance row.

**OSS precedent.** Camunda versions process definitions and pins running instances to the version they started
on; Temporal pins workflows to a worker build and offers worker versioning for the transition period
([Temporal worker versioning](https://docs.temporal.io/worker-versioning)). The pattern is “the run keeps the
rules it started with”.

**Recommendation: A.** It is the durable, queryable answer, and it composes with D1 (both are “pin the immutable
thing, move the pointer”). Option B is a valid emergency stop-gap if the schema migration is unwelcome now.

**Decision:** ☑ A — chosen and implemented 2026-11-07. See [`RELEASE-D2-DESIGN.md`](./RELEASE-D2-DESIGN.md).

---

## D3 — Channels and canary rollout (V2)

**Question.** Do we build tenant channels (`internal → canary → stable`) now, later, or never?

**Current state.** No channel or cohort concept exists. The RFC describes V2; the critical review already said
it is for “a fleet and a deploy pipeline that do not exist”.

**Options.**

| Option | How it works | Pros | Cons |
|---|---|---|---|
| **A. Defer** | Build D1 first; canary is decided by moving pointers for a named list of tenants | No unused machinery; the pointer already enables a manual canary | No automated cohort logic; promotion is a script |
| **B. Channel table in the release domain** | `release_channels(org_id, channel, release_id)` + the tenant pointer stores a channel (or resolves through it); promotion moves a whole ring by updating one row | Matches D1 C1 (assignment owned by the release context); rings can be moved and rolled back in one write; auditable | One more table + a resolve step on catalog read |
| **C. Tenant channel column** | `tenant_settings.channel` + a channel→release map owned by tenant | Simple for one tenant at a time | Splits assignment across two domains; there is no `tenants` table (a tenant is a `tenant_settings` document), so it still needs a side table; cannot answer “who is in canary?” from the release context |
| **D. Rules engine** | Reuse feature-flag targeting (Unleash-style constraints) to pick a release per request | Flexible targeting (tenant, region, plan) | Request-level version skew; much larger surface |

**Example (A).** Canary today is: create release `r_17`, move 5 named tenants, watch the eval gate and error
rate, then move the rest. No new table needed — D1’s pointer is the mechanism.

**Example (B).**

```
release_channels:        canary → r_17,  stable → r_16
tenant_release_pointers: org 3966… → channel=canary
promote ring:  UPDATE release_channels SET release_id='r_17' WHERE channel='canary'
rollback ring: UPDATE release_channels SET release_id='r_16' WHERE channel='canary'
```

**Why not a tenant column (C).** D1 chose the release bounded context precisely so assignment has one owner. A
tenant-side channel would reintroduce the two-owners problem: the release domain could not answer “which tenants
are on r_17?” without a cross-domain query, and the catalog would resolve a channel through a table it does not
own. Channels, when they are needed, are a release-domain table.

**OSS precedent.** Unleash separates **activation strategies** (who sees a flag) from the flag itself and offers
gradual rollout by percentage and constraints ([activation strategies](https://docs.getunleash.io/concepts/activation-strategies)).
That is the right shape for D (rules engine), but it is a product of its own; B is the narrow version that fits a
tenant-level release.

**Recommendation: A now, B when channels are actually needed.** Choosing D before a release pipeline exists
repeats the mistake the critical review identified; choosing C conflicts with D1.

**Decision:** ☑ **A** — deferred 2026-11-07. Placement settled in advance: when channels are built, they are a
release-domain table (option B), not a tenant column. Build only after D1 + D2 are in use.

---

## D4 — Where `M2` gets tenant roles from

**Question.** `M2.permissions` currently proves that an action is wired to a capability; it cannot prove the
tenant’s roles hold that capability’s permission. Where does role data come from?

**Current state.** Roles live in ZITADEL. The eval context endpoint returns capability descriptors and installed
extensions, not role assignments ([`api.ts`](../../packages/server/src/domains/eval/api.ts)). `denyUnless` uses
the caller’s JWT/agent/machine permissions, but there is no “roles of this org” projection.

**Options.**

| Option | How it works | Pros | Cons |
|---|---|---|---|
| **A. Live ZITADEL API + short cache** | On `/api/eval/context`, call ZITADEL’s authorization/role API for the org, cache 30–60 s | No new table; always current; uses the system of record | Latency and rate limits on every eval run; ZITADEL outage = eval skip |
| **B. Projection table** | `org_role_assignments(org_id, user_id, role)` updated by ZITADEL events/webhooks or a periodic sync; eval reads it | Fast, durable, auditable; survives ZITADEL downtime | New table + sync job; staleness window |
| **C. Token claims of the acting admin** | Pass the admin’s JWT to eval; derive permissions from the token | No new infrastructure; matches how the app authorises | The admin holds every permission, so the check becomes trivially true; not a tenant-role check |
| **D. Drop role evaluation** | Keep capability/extension wiring only, and document it | Honest about what is known | Leaves E8 permanently partial |

**Example (A).** Eval asks “which roles does org `3966…` have?” ZITADEL returns `admin, editor, analyst`;
`expandPermissions` yields the union; `commerce:orders_manage` is present because admin holds it. A tenant with
only `analyst` would fail `cancelOrder`.

**OSS precedent.** ZITADEL exposes role assignments through the auth/management APIs and token claims, with the
guidance to prefer the project-scoped claim
([ZITADEL: retrieve user roles](https://zitadel.com/docs/guides/integrate/retrieve-user-roles)). OpenFGA models
roles as relations and evaluates them per request
([OpenFGA roles](https://openfga.dev/docs/modeling/roles-and-permissions)) — the projection-table approach is the
local version of that.

**Recommendation: A now, B if latency or ZITADEL availability becomes a problem.** It uses the existing source
of truth and is a small addition to the context endpoint. C is not a real check; D should only be chosen if the
decision is “M2 stays vocabulary-only”.

**Decision:** ☐ A  ☐ B  ☐ C  ☐ D  ☐ other: ______________________

---

## D5 — How to verify checkout reaches `paid`

**Question.** `B5` proves add-to-cart. Completing checkout to `paid` crosses into a **payment provider**. What do
we verify, and where — given that the eval service verifies the tenant’s app, not third-party services?

**Current state.** `PAYMENT_SUCCEEDED`/`PAYMENT_FAILED` are rejected on the public cart routes by design
([`instances.ts:121`](../../packages/server/src/domains/machines/routes/instances.ts#L121)); only the provider
event pipeline may transition a cart to `paid`. No provider integration is configured locally. The commerce
contribution registers exactly one adapter today; the interface is `CheckoutProviderAdapter`, so the platform is
provider-neutral by design even though one provider is wired.

**First, the boundary.** The eval service is a black-box verifier of the tenant’s storefront. It must **never**
call a payment provider: that would test the provider’s sandbox, require external credentials, and make the gate
flaky. The provider half is covered by **contract tests in CI** and, separately, by a **staging smoke test** with
whatever provider the tenant configured.

**Options.**

| Option | How it works | Pros | Cons |
|---|---|---|---|
| **A. Contract test with a fake provider** | CI test drives capability → adapter → event mapping → guard → `paid` against a fake provider; asserts transitions, amount/currency guard, duplicate-callback suppression, Evidence | Deterministic, no secrets, no external account; tests **our** code | Does not prove the deployed provider delivery |
| **B. Staging smoke with the configured provider** | One run in staging using the tenant’s configured provider integration (the commerce contribution registers one adapter today — Stripe — behind the interface); real checkout, real webhook | Proves the real delivery path once | Needs an external account and credentials; not suitable for every release |
| **C. Provider check inside eval** | Eval drives a real test checkout through the provider | “Real” end to end | Tests the provider’s sandbox, needs credentials, becomes flaky, and puts an external dependency in the release gate |
| **D. Drop checkout coverage entirely** | Keep add-to-cart only; document checkout as untested | Honest, zero cost | The most business-critical flow stays uncovered |

**Example (A).** A fake provider returns `{ externalCheckoutId, redirectUrl }`; the test emits the provider’s
`checkout.session.completed` through the same mapping and guard; the cart must reach `paid`, and a replayed
callback must not transition twice. No network, no account.

**OSS precedent.** Contract testing (Pact-style) is the standard way to verify a provider boundary without the
provider; provider sandbox tooling (for example a CLI webhook forwarder) is a **staging** tool, not a unit of a
release gate.

**Recommendation: A now; B in staging when a provider account exists; C never.** The checkout code we own is
small and testable; the provider is someone else’s system.

**Decision:** ☐ A  ☐ B  ☐ C  ☐ D  ☐ other: ______________________

---

## D13 — Who chooses the checkout provider?

**Question.** The storefront currently sends `integrationId: "stripe"` as a literal
([`cart.ts:163-166`](../../packages/extensions/src/commerce/cart.ts#L163-L166)). Is that the right place to name a
provider?

**Current state.** The capability resolves `checkoutProviders[integrationId]`; the registry is built by the commerce
contribution with one entry. The client hardcodes the id; the provider adapter is the only provider-specific code.

**Options.**

| Option | How it works | Pros | Cons |
|---|---|---|---|
| **A. Keep the literal** | Client always sends `"stripe"` | Smallest; works today | Locks the storefront to one provider; a second provider needs a client change |
| **B. Tenant setting** | `tenant_settings.checkoutProvider` (default `"stripe"`); client reads it and sends the id | Multiple providers per tenant possible; no client deploy to switch | Another setting to validate and display in admin |
| **C. Server resolves the provider** | Client omits the id; the capability asks the tenant’s integration config which checkout provider is active and picks the adapter | Client stays provider-agnostic; one source of truth; simplest UI contract | Requires an integration lookup in the capability path; one active provider per tenant |

**Example (C).** The browser posts `{ instanceId }`; the capability reads the tenant’s configured checkout
integration, resolves `stripe` (or another), and returns a redirect. The storefront never names a provider.

**OSS precedent.** Payment abstraction layers (and Shopify’s multi-provider payments) keep the provider behind a
server-side selection, because providers differ in capabilities and the client should not encode them.

**Recommendation: C.** It matches the existing port (`CheckoutProviderAdapter`) and removes the last
provider-specific string from the storefront. Choose B only if one tenant must run two providers at once.

**Decision:** ☐ A  ☐ B  ☐ C  ☐ other: ______________________

---

## D6 — `B7` visual rubric

**Question.** Do we add a model-based visual review, a visual-regression service, or nothing?

**Current state.** `B6` covers contrast only. `B7` does not exist.

**Options.**

| Option | How it works | Pros | Cons |
|---|---|---|---|
| **A. Vision model** | Screenshot → multimodal model with a rubric prompt → warn-only result | Catches “looks broken” beyond rules | Cost per run, non-determinism, model/prompt drift; results hard to reproduce |
| **B. Visual regression service** | Chromatic/Percy-style baseline snapshots, diff on change | Deterministic, reviewed baselines, good UI | Another service and cost; renderer/state noise; baselines need curation |
| **C. Drop** | No `B7`; keep `B6` + human review | Nothing to maintain | Visual defects rely on humans |

**Example (B).** A changed `ProductCard` produces a pixel diff against the approved baseline; a human approves or
rejects it. That is reviewable; a model’s opinion is not.

**OSS precedent.** Chromatic keeps a **baseline per branch** and diffs new builds against it
([branches and baselines](https://www.chromatic.com/docs/branching-and-baselines/)); that is visual regression,
not a model rubric.

**Recommendation: C now.** The RFC already says design review should be `warn`; a non-deterministic check that
cannot be reproduced is worse than no check. Revisit B when visual regressions are observed in practice.

**Decision:** ☐ A  ☐ B  ☐ C  ☐ other: ______________________

---

## D7 — Determinism and aggregation (E6)

**Question.** How do we avoid flaky results and report confidence?

**Current state.** One run per check; `data-eval-ready` is the only determinism control. No retries, no repeated
runs, no flake accounting.

**Options.**

| Option | How it works | Pros | Cons |
|---|---|---|---|
| **A. N runs + aggregation** | Run each check 3×; numeric → median, correctness → pessimistic (any fail fails); record attempts | Statistically honest; Lighthouse-style | 3× tier‑2 cost; slower sweeps |
| **B. Retry-on-fail once** | A failing check is retried; both attempts recorded; second failure is final | Cheap; removes transient flakes | Masks genuinely flaky pages; no confidence number |
| **C. None** | Single run | Fast | Flakes become false blocks; trust erodes |

**Example (B).** `B1.structure` fails on a slow hydration; retry passes; the result is `pass` with
`attempts: 2`, and it is counted as `flaky`. If it fails twice, it blocks.

**OSS precedent.** Lighthouse CI defaults to `numberOfRuns: 3` and supports median/pessimistic/optimistic
aggregation ([config](https://raw.githubusercontent.com/GoogleChrome/lighthouse-ci/main/docs/configuration.md));
Playwright retries failing tests with `retries` and records them
([retries](https://playwright.dev/docs/test-retries)).

**Recommendation: B for tier 2, A only for a specific numeric check if one appears.** Our checks are boolean
assertions; median of booleans is not meaningful. Recording attempts and counting flakes gives the honest signal
without tripling browser cost.

**Decision:** ☑ **B** — implemented 2026-11-07. Retry-once for deterministic tier‑2 checks; `attempts` recorded;
pass-on-retry counted as `flaky`; `B5` excluded (side effects). No N-run median (boolean checks). See
[`EVAL-E6-DETERMINISM.md`](./EVAL-E6-DETERMINISM.md).

---

## D8 — Cost policy and change detection (E27)

**Question.** When may a result be reused instead of re-run, and how much do we sample?

**Current state.** Every run checks everything. There is no `specHash`/`releaseId` skip, no sampling, no budget.

**Options.**

| Option | How it works | Pros | Cons |
|---|---|---|---|
| **A. Key + tiered sampling** | Key results by `specHash@releaseId@checksVersion`; tenant publishes run affected routes only; platform releases run a fixed sample + weekly full sweep | Correct invalidation; predictable cost | Needs the release id (D1) and a sample registry |
| **B. TTL cache** | Reuse a result for N minutes | Trivial | Time is not a correctness signal; a changed page can be skipped |
| **C. Always full** | No reuse | Simple; no stale risk | Cost grows linearly with tenants × routes; the RFC's own numbers reach hours |

**Example (A).** A tenant edits one page: only that route runs. A platform release changes the renderer: the
release id changes, so every sample is invalidated and re-run — unlike the old `specHash`-only key, which would
have skipped everything.

**OSS precedent.** Crater/CITGM run the ecosystem because a compiler change invalidates everything
([Crater](https://rustc-dev-guide.rust-lang.org/tests/crater.html)); per-route sampling is the compromise for
storefronts. Lighthouse budgets bound what a gate may spend.

**Recommendation: A.** It is the only option that is both correct and bounded, and it depends on D1 — another
reason D1 is first.

**Decision:** ☐ A  ☐ B  ☐ C  ☐ other: ______________________

---

## D9 — What the gate does with `unverified`

**Question.** A required check could not run (no browser, edge down, timeout). Does the release pass, block, or
pass with a caveat?

**Current state.** `unverified` is counted and reported, but `passed` ignores it — so a release can be `pass` with
`unverified > 0`. That is visible today in the worker run (`unverified: 2`).

**Options.**

| Option | How it works | Pros | Cons |
|---|---|---|---|
| **A. Fail closed** | Any unverified required check blocks | Strongest guarantee | An edge outage freezes every release |
| **B. Human acknowledgement** | Promote only if a named actor acks the unverified list; recorded in Evidence | Explicit, auditable, does not block on infrastructure | Depends on discipline; ack can become rubber-stamp |
| **C. Mark only** | Release proceeds marked unverified | No friction | “Verified” becomes meaningless |

**Example (B).** “Tier 2 unavailable — browser endpoint down; 4 checks unverified.” The release role acknowledges;
the Evidence row records `decision: pass, unverified: 4, ackedBy: tom`. For a migration or contract check,
acknowledgement is not offered.

**OSS precedent.** Google SRE’s canary analysis separates “the metric failed” from “the analysis could not run”;
Argo Rollouts marks analysis runs inconclusive rather than successful. The rule is the same: missing data is not
a pass.

**Recommendation: B, with A for contract/data changes.** It matches the release-gate RFC’s own rule (“only the
inability to check lets a release through, and it is recorded”) and avoids freezing releases on infrastructure
noise.

**Decision:** ☐ A  ☐ B  ☐ C  ☐ other: ______________________

---

## D10 — Where the eval worker runs

**Question.** The eval worker currently starts inside the API process. Keep that, split the entrypoint, or split
the image?

**Current state.** `createEvalDomain` starts the BullMQ worker when `RUN_WORKERS` is true, so the API replica also
drains `{eval-runs}`. Tier‑2 jobs can hold a browser context for tens of seconds.

**Options.**

| Option | How it works | Pros | Cons |
|---|---|---|---|
| **A. Same process** | Status quo | Zero deployment change | CPU/memory contention with HTTP; a crashed browser can affect API latency |
| **B. Separate entrypoint** | `eval-worker.ts` boots only the eval domain (no HTTP), same image, `RUN_WORKERS=false` on API | Isolation of process, not of image; cheap; follows the existing `worker.ts` pattern | Still shares node_modules/image; ops must run one more process |
| **C. Separate image + deployment** | Dedicated image/deployment with browser sidecar, own resources/HPA | Full isolation and scaling; matches the RFC's blast-radius reason | Build/release pipeline for a second image; more manifests |

**Example (B).** `pnpm --filter @noname/server eval-worker` runs the worker with no port bound; Kubernetes gets a
second Deployment with different resources; a browser crash kills a worker pod, not the API.

**OSS precedent.** The repository already separates `worker.ts` from `index.ts` for exactly this reason
([`worker.ts`](../../packages/server/src/worker.ts)); the eval worker is a second tenant of that pattern.

**Recommendation: B now, C when tier‑2 volume justifies its own image.** It is a small change with most of the
isolation benefit.

**Decision:** ☐ A  ☐ B  ☐ C  ☐ other: ______________________

---

## D11 — NetworkPolicy and staging

**Question.** Where do we prove that the eval browser cannot reach internal services?

**Current state.** Local k3s uses Flannel, which **accepts NetworkPolicy objects and enforces nothing**. No
NetworkPolicy manifests exist. S1 proves the local fact (browser can reach the API) but cannot prove the policy.

**Options.**

| Option | How it works | Pros | Cons |
|---|---|---|---|
| **A. Local k3s + Calico** | Replace Flannel with Calico, author policies, run S1 locally | Proves the policy on the dev machine | Cluster networking rebuild; risk to local data; heavy for a laptop |
| **B. kind + Calico** | A second disposable cluster for policy tests | Clean and reproducible; no risk to local k3s | Another cluster to maintain; not the real deployment |
| **C. Staging cluster** | Policies authored and enforced where they matter; local stays Flannel and S1 stays `warn` | Honest; no laptop heroics; policy tested in the environment that needs it | Staging does not exist yet (D11 depends on it) |

**Example (C).** Staging runs Calico; S1 passes because the browser pod cannot reach `api:3000` or the metadata
address; local S1 stays a warning that says “the local browser shares the host network”.

**Recommendation: C**, with the caveat that it requires the staging environment. A is only justified if local
enforcement is itself a requirement.

**Decision:** ☐ A  ☐ B  ☐ C  ☐ other: ______________________

---

## D12 — Evidence retention for eval decisions

**Question.** How long do we keep eval decisions, and in what shape?

**Current state.** One `platform.eval.run` Evidence row per gate decision, append-only; no retention registration.
The critical review warned that per-check Evidence would flood the audit kernel; that is already avoided.

**Options.**

| Option | How it works | Pros | Cons |
|---|---|---|---|
| **A. Bounded samples, current shape** | One row per decision; failures capped; add a retention entry | Small volume; audit-friendly | Cannot answer “how did check X trend over 90 days” from Evidence alone |
| **B. `eval_runs` table** | Operational table with per-check summaries + TTL; Evidence only for decisions | Queryable history; keeps audit kernel clean | New table + cleanup job |
| **C. Metrics only** | No decision rows | Cheapest | Loses the audit of who allowed what |

**Recommendation: A now, B when someone asks for trend/history.** The decision record is the audit; per-check
history belongs in metrics.

**Decision:** ☐ A  ☐ B  ☐ C  ☐ other: ______________________

---

## D14 — What counts as a release?

**Status:** **chosen (B) and implemented 2026-11-07** — [`RELEASE-D14-DESIGN.md`](./RELEASE-D14-DESIGN.md), [`RELEASE-VERIFICATION-LOG.md`](./RELEASE-VERIFICATION-LOG.md). The text below is the original decision record.

**Question.** Is a release the client bundle, or the whole deployable artifact set? This decides whether “canary
a release” means anything for server changes.

**Current state.** Bundles are overwritten; the server is one image; migrations are shared. The release-gate RFC
says the artifact is “client bundle and server image”, while the progressive-delivery RFC versions only bundles.
See [`RELEASE-UNIT-FINDING.md`](./RELEASE-UNIT-FINDING.md).

**Options.**

| Option | How it works | Pros | Cons |
|---|---|---|---|
| **A. Bundle only** | A release is a client bundle | Smallest; fits D1 exactly | Server changes still hit everyone; the word “release” becomes misleading |
| **B. Release binds bundle + server image + migrations + config** | One `release_id` references all four; the gate verdict attaches to that id | Honest unit; one verdict per release; server rollout is a separate layer (D15) | Build pipeline must produce and record all four; image registry/retention work |
| **C. Whole environment snapshot** | Each release is a complete stack (two environments) | Strongest isolation; trivial rollback by switching | Doubles infrastructure; the database is still shared, so it does not remove migration compatibility |

**Example (B).** `r_17 = { image: sha256:9c…, bundle: sha256:3f…, migrations: [0042,0043], config: v12 }`. A gate
verdict names `r_17`, not “the latest deploy”.

**OSS precedent.** Cloudflare Workers separates a **version** (code) from a **deployment** (which version serves);
Kubernetes rollouts separate the image revision from the Service selector.

**Recommendation: B.** It is the smallest honest definition and it makes the gate verdict meaningful. A is what
we accidentally have today; C is a staging/production convenience, not a release definition.

**Decision:** ☐ A  ☐ B  ☐ C  ☐ other: ______________________

---

## D15 — How does a server change reach a subset of tenants?

**Status:** **chosen (B + D) and implemented 2026-11-07** — [`RELEASE-D15-DESIGN.md`](./RELEASE-D15-DESIGN.md), [`RELEASE-VERIFICATION-LOG.md`](./RELEASE-VERIFICATION-LOG.md). The text below is the original decision record.

**Question.** The pointer can move a tenant between bundles. How does a **server** change reach five tenants
first?

**Current state.** One API deployment, one worker, one database. Nothing routes a tenant to a server version.

**Options.**

| Option | How it works | Pros | Cons |
|---|---|---|---|
| **A. Deploy-all after preview verification** | Candidate runs in preview; checks pass; deploy to all | Cheapest; catches most breakage before exposure | No real canary; rollback is a redeploy (or blue/green) |
| **B. Blue/green whole stack** | Run `r_16` and `r_17` side by side; switch the Service selector | Seconds to roll back; no per-tenant version skew; works with one database | All-or-nothing at the switch; two stacks of capacity during the window |
| **C. Per-tenant server versions** | Edge routes each tenant to a versioned API deployment | True tenant-level server canary | N deployments; N−1 API/queue compatibility; migration constraints; operational load |
| **D. Deploy-all + flags/expand-contract** | One server version; behaviour per tenant behind flags; APIs additive | Behaviour canary without version skew; simple infra | Discipline: flags must be removed, contracts kept |

**Example (B+D).** `r_17` adds an endpoint and a new price rule behind a flag. Preview passes; blue/green switch;
the flag is enabled for 5 tenants; a problem is fixed by disabling the flag or switching the selector — no
redeploy, no per-tenant server fleet.

**OSS precedent.** Kubernetes blue/green and Argo Rollouts for whole-stack switching; Cloudflare Workers
deployments with version overrides for per-version routing; LaunchDarkly/Unleash for behaviour targeting.

**Recommendation: B + D, with A’s preview step before either.** C only if a hard requirement appears (regulated
tenants, contractual isolation). The pointer (D1) is not a substitute for this decision.

**Decision:** ☐ A  ☐ B  ☐ C  ☐ D  ☐ other: ______________________

---

## D16 — How do migrations work across a release?

**Status:** **chosen (A) and implemented 2026-11-07** — [`RELEASE-D16-DESIGN.md`](./RELEASE-D16-DESIGN.md), [`RELEASE-VERIFICATION-LOG.md`](./RELEASE-VERIFICATION-LOG.md). The text below is the original decision record.

**Question.** A release changes the schema. Old server and new server may both run during blue/green; the client
pointer may move back. What is the rule?

**Options.**

| Option | How it works | Pros | Cons |
|---|---|---|---|
| **A. Expand/contract mandatory** | Add new columns/tables (expand) → deploy code writing both → backfill → switch reads → remove old (contract) in a later release | Both versions work during the window; rollback stays possible; matches Fowler’s parallel change | More migrations; slower; requires discipline |
| **B. Breaking migration + downtime** | Stop, migrate, start new | Simple | Outage; no rollback without restore |
| **C. Per-tenant schema** | Separate schema/database per tenant | Isolation | Migration explosion; the platform is not built for it; reject |

**Example (A).** Renaming `price` to `amount`: add `amount`, dual-write, backfill, switch reads, deploy, then drop
`price` two releases later. A rollback in between still works.

**OSS precedent.** Martin Fowler’s parallel change (expand/contract); every blue/green guide says the same: the
database is the hard part.

**Recommendation: A.** It is the only option compatible with blue/green and with a shared database.

**Decision:** ☐ A  ☐ B  ☐ C  ☐ other: ______________________

---

## Suggested order if you accept the recommendations

1. **D14, D15, D16** — decide what a release is and how the server moves; D1 depends on the answer.
2. **D1** (UI pointer) — the client half, once the release unit is defined.
3. **D2** (definition pinning) — the live correctness hazard.
4. **D4** (roles) + **D9** (unverified policy) — finish the gate semantics.
5. **D7/D8** (determinism, cost) — make the gate truthful and affordable.
6. **D13** (provider resolution) — remove the last provider literal from the storefront.
7. **D10** (worker split) — operational isolation.
8. **D3/D5/D6/D11/D12** — when their preconditions are real (fleet, provider account, staging).

Nothing above requires choosing all sixteen today. D14–D16 decide what “release” means; D1 and D2 are the first
two mechanisms that implement it; the rest are policy and operations.
