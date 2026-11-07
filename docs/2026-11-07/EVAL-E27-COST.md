# E27 / D8 — Cost policy: change detection, reuse and sampling

> **Status:** design (implementation not started) · **Date:** 2026-11-07 (America/Toronto)
> **Question:** when may eval reuse a previous result, and how much may it sample?
> **Decision (proposed):** content-addressed keys + tiered sampling; **the gate never reuses**; cache
> **passes only**, **read-only checks only**, **per route**; `--no-cache` is explicit.
> **Dependency:** D1 is implemented (tenant pointer + catalog projection), so a tenant has a real `releaseId`.
> **Related:** [`PENDING-DECISIONS.md`](./PENDING-DECISIONS.md) D8 · [`EVAL-SERVICE-IMPLEMENTATION-PLAN.md`](./EVAL-SERVICE-IMPLEMENTATION-PLAN.md) E27 · [`VERIFICATION-LOG.md`](./VERIFICATION-LOG.md)

---

## 1. The problem in one example

Two events look similar to a naive cache and are completely different:

```
tenant edits /products      → only that page can have changed
platform ships r_2          → every page is rendered by new code
```

A TTL cache or a `specHash`-only key would reuse the previous `pass` in the second case. That is the bug D8 is
about: **time is not a correctness input.**

## 2. The key

```
key = sha256(
  orgId | tenantSlug | route |
  specHash(route) | releaseId | platformVersion | checksVersion | browserFleetVersion
)
```

| Input | What it covers | Why it must be there |
|---|---|---|
| `orgId` / `tenantSlug` | isolation | never reuse across tenants |
| `route` | the page | one page edit must not invalidate all pages |
| `specHash(route)` | canonical layout/spec for that route | content edit |
| `releaseId` | tenant→bundle pointer (D1) | platform release changes rendering for everyone |
| `platformVersion` / server image | server-only releases (D15) | a server release may not change the bundle pointer |
| `checksVersion` | catalogue + assertion levels/config | turning a check off/on changes what “verified” means |
| `browserFleetVersion` | Chrome/fonts/image | rendering can change with no tenant or release change |

**Canonicalization:** sort object keys, drop volatile fields (ids, timestamps, generated keys), hash the **spec**,
not the rendered DOM. Two equal specs must produce equal hashes; a timestamp must not.

**Route-level:** the key is per route. A tenant edit to `/products` invalidates `/products` only.

## 3. Policy

| Run | Reuse? | Why |
|---|---|---|
| **Gate** (promotion) | **Never** — `--no-cache` is explicit | the claim is “this release, this tenant, verified now” |
| **Nightly / agent sweep** | **Yes**, when the key is unchanged | the only way a sweep stays affordable |
| **Platform release** | **No** — `releaseId`/`platformVersion` changes every key | nothing is reusable after a renderer/server change |
| **Tenant edit** | Only the changed route re-runs; other routes may be reused | route-level key |

Additional rules, not negotiable:

1. **Cache passes only.** Failures and skips are never stored. A cached flake is worse than no cache.
2. **Read-only checks only.** `B5.behaviour` (add-to-cart) and any future mutating check are never reused.
3. **Provenance on every reused result:** `reused: true`, `key`, `computedAt`, and the inputs snapshot.
4. **Evidence stays separate.** A reused sweep result is metrics, never a gate decision row.

## 4. Architecture placement

| Piece | Where | Why |
|---|---|---|
| Key function | `packages/eval/src/cache.ts` (pure) | testable without Redis, used by CLI and worker |
| `ResultStore` port | `packages/eval` interface | eval owns its results; no release import |
| Redis adapter | `packages/server` (or CLI adapter) | the platform already uses Redis; TTL is natural |
| Route hashes | computed from layouts + routing pages **before** checks run | checks must not fetch specs twice just to key them |
| Sampling | orchestration/scheduler | never inside a check |
| `releaseId`, `platformVersion` | passed **into** eval as inputs (context) | eval must not read release tables |

`domains/release` is untouched. `domains/tenant` is untouched. The result store is eval’s data.

## 5. Sampling

| Run | Sample |
|---|---|
| Gate | **all** routes of the tenant — a gate may not sample |
| Sweep | deterministic N per tenant: `hash(tenant, route, day) % N`, **rotating daily**; always include home, cart/checkout, and routes whose `specHash` changed |
| Platform release | fixed tenant sample + a scheduled full sweep |

Deterministic is mandatory: a failure must be reproducible. Rotation avoids permanently blind spots.

## 6. Metrics

| Metric | Meaning |
|---|---|
| `noname_eval_results_reused_total` | checks served from cache |
| `noname_eval_results_computed_total` | checks actually run |
| `noname_eval_cache_hit_ratio` (derived) | reused / (reused + computed) |
| `noname_eval_gate_duration_seconds` | gate is fresh; its cost must be visible |
| `noname_eval_gate_reuse_total` | must stay **0**; a non-zero value is an incident |

## 7. Implementation steps

1. **Key module** — canonical hashing + `cacheKey(inputs)` + policy helpers (`cacheable(result)`), unit tests:
   equal specs → equal hash; order-independent; volatile fields ignored; different release/platform/browser/route →
   different key; failures/skips not cacheable; `B5` not cacheable.
2. **Route hash pre-step** — fetch routing pages + layouts once, compute `route → specHash`, pass to the runner
   (`ctx.routeHashes`).
3. **`ResultStore` port + Redis adapter** — `get(key)`, `put(key, result, { ttlSec })`; JSON; TTL for passes.
4. **Runner reuse** — for read-only, retryable checks: if a cached pass exists for `(check, route, key)`, use it
   with provenance; otherwise run and store the pass. Failures and skips are never stored.
5. **CLI/worker** — `--no-cache` (gate defaults to it), `--release`, platform/browser version from context;
   print reused vs computed in the summary/JSON.
6. **Gate** — always `--no-cache`; assert in code, not only in the flag default.
7. **Metrics** — the counters above; gate reuse must be zero.
8. **E2E** —
   - run twice with identical inputs → second run reuses, duration drops;
   - edit one route’s spec → only that route recomputes, others reuse;
   - change `releaseId` (promote another release) → **nothing** is reused;
   - `gate --no-cache` → everything runs, cache untouched;
   - verify no failure/skip was stored.

## 8. Risks and limits

| Risk | Mitigation |
|---|---|
| Key misses an input (server image, browser, flags) | the input list is part of the design review; `platformVersion` and fleet version are mandatory |
| Cached flake | never cache failures/skips |
| Side-effecting check cached | explicit allow-list of read-only checks; `B5` excluded |
| Tenant spec hash unstable | canonicalization + tests |
| Sample blind spot | deterministic rotation + always-on high-risk routes |
| Cache growth | TTL on passes; per-route keys |
| Server-only release not in `releaseId` | `platformVersion`/image in the key (this is the gap D1 alone does not close) |
| Reused pass presented as fresh | provenance fields; gate reuse metric must be zero |

## 9. What not to do

- TTL as correctness (time is not an input).
- `specHash`-only key (misses platform/server releases).
- Cache failures or skips.
- Cache `B5` or any mutating check.
- Random sampling.
- Write a reused sweep result as a gate Evidence decision.
- Let the gate reuse silently via a default.

## 10. Open implementation choice

Route-level reuse needs the **route hash pre-step** (step 2). That is the only structural change, and it is the
difference between “correct but coarse” and the design above. It does not touch release or tenant domains; it is
eval-local.
