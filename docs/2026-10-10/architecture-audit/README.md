# Architecture Audit — 2026-10-10

Read-only architectural review of the noname repository. **No production code was changed.** The only files created are the eight reports in this directory.

## Start here

**[00-EXECUTIVE-SUMMARY.md](00-EXECUTIVE-SUMMARY.md)** — what the project is, the overall verdict, the five findings that matter most, decision and conformance scorecards, what is already good, and the recommended first moves.

## Reports

| # | Report | Read it for |
|---|---|---|
| 00 | [Executive Summary](00-EXECUTIVE-SUMMARY.md) | The whole picture in one document |
| 01 | [Architecture As Built](01-ARCHITECTURE-AS-BUILT.md) | What the system actually is — packages, 17 domains, runtime topology, data layer, the spec-driven UI pipeline, and every divergence between docs and code |
| 02 | [Decision Review](02-DECISION-REVIEW.md) | Each of the 15 recorded decisions and 11 ADRs: is it followed, does it scale, keep or revise |
| 03 | [Package Conformance](03-PACKAGE-CONFORMANCE.md) | Which packages break the architecture's own layering rules, and how |
| 04 | [UI Spec Conformance](04-UI-SPEC-CONFORMANCE.md) | All 51 catalog components against the `spec-driven-ui` skill (R1–R7) |
| 05 | [Scalability, Runtime & Security](05-SCALABILITY-SECURITY-RUNTIME.md) | 17 ranked risks with evidence and fixes |
| 06 | [Maintainability, Docs & DX](06-MAINTAINABILITY-DOCS-DX.md) | Documentation rot, repo hygiene, config drift, quality gates, onboarding friction |
| 07 | [Remediation Roadmap](07-REMEDIATION-ROADMAP.md) | The phased, effort-estimated plan |

## Method

Static analysis by eight parallel auditors, each scoped to a package group, decision set, or cross-cutting concern, followed by independent verification of every high-severity claim by the lead auditor.

- 938 tracked TypeScript files, 167 tracked test files, 12 packages + `apps/docs`
- All findings cite `file:line`
- Claims verified statically but not reproduced at runtime are explicitly labelled
- Unverifiable questions are recorded as "not verified" rather than guessed

## Three things to act on first

1. **Rotate `WORKER_SERVER_SECRET`** — it is committed in `packages/workers/.dev.vars` and printed in `docs/2026-07-13/AUTH.md`. → [05 §8](05-SCALABILITY-SECURITY-RUNTIME.md)
2. **Close the forged-JWT path on public capability routes.** → [05 §7.3](05-SCALABILITY-SECURITY-RUNTIME.md)
3. **Add CI plus two convention tests.** They fail on today's code — which is exactly why they are worth having. → [07 Phase 1](07-REMEDIATION-ROADMAP.md)
