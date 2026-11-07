# E6 — Determinism: retry-once, attempts and flake accounting

> **Status:** **Implemented and verified** · **Date:** 2026-11-07 (America/Toronto)
> **Decision:** retry a failing check once, record the attempts, and count a pass-on-retry as **flaky**.
> Median/pessimistic aggregation of repeated runs is deliberately **not** implemented (see §6).
> **Scope:** `packages/eval` runner + `B1/B2/B3/B4/B6/S1` retryability, CLI summary, gate sink/metrics.
> **Related:** [`EVAL-SERVICE-IMPLEMENTATION-PLAN.md`](./EVAL-SERVICE-IMPLEMENTATION-PLAN.md) E6 · [`VERIFICATION-LOG.md`](./VERIFICATION-LOG.md) · [`PENDING-DECISIONS.md`](./PENDING-DECISIONS.md) D7

---

## 1. Why retry-once and not N runs

Every check here is a boolean assertion, not a numeric score. A median of three booleans is not a meaningful
statistic; what matters is **whether a failure is reproducible**. Lighthouse’s `numberOfRuns: 3` + median exists
because it aggregates numeric scores; Playwright’s retry model exists because a boolean test either passes or it
does not.

So the model is:

| Concept | Meaning |
|---|---|
| `attempts` | how many times the check ran before the final result |
| `flaky` | a check that failed, then passed on retry |
| `retries` | how many extra attempts are allowed (default 1) |
| `retryable` | per-check opt-in; side-effecting checks must never set it |

## 2. Safety: only observational checks retry

`B5.behaviour` adds an item to the cart. Retrying it would add twice, so it is **not** retryable. The retry set is
the deterministic observers: `B1.render`, `B1.structure`, `B2.overflow`, `B3.a11y`, `B4.content`, `B6.design`,
`B2.console`, `S1.no_internal_egress`.

## 3. Where each number comes from

```
check.run() → fail? ── retryable && retries>0 ──► run again
               │                                    │
               │ pass                               │ pass → result pass, attempts=2, flaky+1
               │ fail twice → result fail, attempts=2, flaky 0
               │ not retryable → fail, attempts absent
```

- `EvalResult.counts.flaky` = number of **checks** that passed only on retry.
- `CheckResult.attempts` = set only when `> 1`, so a clean run is unchanged.
- Gate sink stores `flakyChecks` in the Evidence payload and increments `noname_eval_flaky_total`.
- CLI prints `… (N flaky)` in the summary; `--json` carries the raw counts.

## 4. Configuration

```json
{ "retries": 0 }
```

`assertions`/`assertMatrix` are unchanged. `retries` is global for the run; per-check override is not needed yet
(a check that must never retry simply does not set `retryable`).

## 5. What changed vs. what could break

| Surface | Change | Compatibility |
|---|---|---|
| `CheckMeta` | new optional `retryable` | additive |
| `CheckResult` | new optional `attempts` | additive |
| `EvalResult.counts` | new `flaky` (required in the type) | JSON gains a field; server schema treats it as optional |
| `AssertionConfig` | new optional `retries` | additive |
| Gate Evidence | new `flakyChecks` field | additive |
| Prometheus | new `noname_eval_flaky_total` | additive |
| Runtime | a failing retryable check runs twice | slower only on failure; a clean run is unchanged |

## 6. What is intentionally not built

- **No N-run median/pessimistic aggregation.** It would triple tier‑2 cost to average booleans. If a numeric
  check is added later (e.g. layout shift score), aggregate that check, not the suite.
- **No per-attempt Evidence rows.** The audit records the final decision and the flake count; the attempts are
  in the run output.
- **Retry does not replay part of a check.** A check that visits three widths re-visits all three on retry. This
  is acceptable at current check sizes; a per-visit retry would need a different check shape.

## 7. Verification (observed)

| Check | Command | Result |
|---|---|---|
| Types | `pnpm --filter @noname/{eval,cli,server} typecheck` | clean |
| Unit — flaky | retryable check fails then passes | **pass**, `attempts: 2`, `counts.flaky: 1` |
| Unit — never passes | always-failing retryable check | `fail`, `attempts: 2`, `flaky: 0` |
| Unit — opt-out | non-retryable check fails then would pass | one run, no `attempts`, `passed: false` |
| Unit — config | `retries: 0` | no retry |
| Unit — skip | retryable check returns skip | no retry, `flaky: 0` |
| Live | `noname eval … --browser-endpoint …` | **73 pass / 2 warn fail / 0 skip / 0 flaky**; `S1` and `B2.console` each `attempts: 2` (retried, still failed) |
| Gate sink | `POST /api/eval/record` | accepts counts with `flaky`; Evidence gains `flakyChecks` |

The live result is the important one: a retry did **not** turn the two warn failures into passes. It re-ran them,
recorded the second attempt, and left them failing — which is the behaviour that keeps a retry from becoming a
silent waiver.
