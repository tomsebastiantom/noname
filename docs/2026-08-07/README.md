# Codebase Health Audit — 2026-08-07

> **Scope:** Full monorepo — `packages/server`, `packages/client`, `packages/{auth,documents,shared,extensions,browser-sdk,workers,cli}`, root tooling/CI, `scripts/`.
> **Method:** Independent static analysis (grep/glob/line counts) verified against actual source, not against prior audit docs' self-graded claims. Every finding below is backed by a file path and, where practical, a line number.
> **Why a fresh audit:** `docs/` already contains ~15 prior audits (`ARCHITECTURE-AUDIT.md`, `CLIENT-UI-ARCHITECTURE-AUDIT.md`, `CODEBASE-AUDIT-CLEANUP.md`, etc.) that grade the codebase "A-" to "B+". This audit treats those grades as unverified and re-checks the code directly. Some prior findings hold up; several new, more severe issues (in-process collab state, unpaginated queries, zero `React.memo`, committed worker secret) were not previously flagged.

## Files in this report

| File | Contents |
|---|---|
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Layering, coupling, god files, domain wiring |
| [`SCALABILITY.md`](./SCALABILITY.md) | Multi-instance readiness, DB/query scaling, queueing |
| [`EFFICIENCY-PERFORMANCE.md`](./EFFICIENCY-PERFORMANCE.md) | Hot-path cost, re-renders, blocking I/O |
| [`MAINTAINABILITY.md`](./MAINTAINABILITY.md) | Test coverage, duplication, typing, CI, secrets |
| [`EXPANDABILITY.md`](./EXPANDABILITY.md) | Extension points, vendor lock-in, multi-touch-point registries |
| [`SPEC-DRIVEN-UI-COMPLIANCE.md`](./SPEC-DRIVEN-UI-COMPLIANCE.md) | Client checked against the team's own [`spec-driven-ui` skill](../../skills/spec-driven-ui/SKILL.md) — where the stated architecture vision is and isn't followed |
| [`JSON-RENDER-REFERENCE-PATTERNS.md`](./JSON-RENDER-REFERENCE-PATTERNS.md) | Client checked against the **upstream `@json-render` library itself** (its README, official examples, live source) — patterns already installed in `node_modules` but unused, independent of the internal skill |
| [`SKILL-REWRITE-PROPOSAL.md`](./SKILL-REWRITE-PROPOSAL.md) | **Draft, not applied** — proposed rewrite of `skills/spec-driven-ui/SKILL.md`: narrows the fetch rule to match upstream, adds a missing CMS/persistence-layer section, documents the editor's `?edit=true` exception, expands the PR checklist |
| [`ACTION-PLAN.md`](./ACTION-PLAN.md) | Prioritized, ranked remediation list (P0–P3) |

## Top-line numbers

| Metric | Value |
|---|---|
| `packages/server` LOC / files / tests | ~28,700 LOC · 360 source files · 88 tests (24%) |
| `packages/client` LOC / files / tests | ~29,300 LOC · 247 source files · 16 tests (**6.5%**) |
| Files >300 lines (server) | 14 |
| Files >300 lines (client) | 22 (worst: `ScopeAdminForm.tsx` at 932) |
| `React.memo` usages in client | **0** |
| Rate limiting in server | **0** matches |
| Unpaginated list endpoints (server) | ≥6 confirmed (documents, machines, content-types) |
| In-process-only state that breaks multi-instance scaling | Collab rooms, SSE registry, LLM key cache, guard registry |
| Committed dev-secret file (local-only, not prod — see note below) | `packages/workers/.dev.vars` (32-char `WORKER_SERVER_SECRET`, tracked in git) |
| `pnpm -r typecheck` at root | **fails** locally (server has real TS errors) despite CI running it |

## Executive summary

This is a large, actively-developed monolith (~60k LOC across two big packages) with genuinely good primitives — domain-factory wiring on the server, a spec-driven UI system on the client, decent package boundaries, and real (if uneven) test coverage in the smaller shared packages. It is **not** in the "solid A-" state some prior audits claim. Six themes recur across every package:

1. **Single-instance assumptions baked into a service meant to scale.** Collab (Yjs/Automerge) rooms, SSE client registries, LLM key caches, and machine-engine guards are all `Map`s living in process memory. None of this survives a second replica without sticky sessions or a rewrite — this is a scalability ceiling, not a cleanup item.
2. **God files concentrate risk.** 14 server files and 22 client files exceed 300 lines, several 500–900+ lines (`ScopeAdminForm.tsx` 932, `AgentsAdminForm.tsx` 728, `auth/scope/service.ts` 525). These are the files most likely to get a risky change and least likely to be safely reviewed or tested.
3. **Test coverage is a real gap, not a rounding error.** Client sits at 6.5% file coverage with zero tests on `main.tsx`, routing, or any admin panel. Server domains `context` and `machines` have zero tests. `@noname/browser-sdk` and `@noname/extensions` (analytics/session-replay and commerce/rich-text) have zero tests.
4. **Expandability is manual and multi-touch-point by design.** Adding a domain (server) touches ≥4 files; adding an admin panel (client) touches ≥7 files with no compile-time check that they stay in sync — this already produced a live bug (`/admin/settings/traces` is unroutable via `platformTemplateFromPath`).
5. **The client's own stated architecture vision (spec-driven UI) is real but unenforced.** The team has a clear skill document (`skills/spec-driven-ui/SKILL.md`) and a prior audit naming specific violations a week ago (`docs/2026-08-01/CLIENT-UI-ARCHITECTURE-AUDIT.md`). Re-checked now: the same violations are still there (direct `fetch()` in admin components, editor importing `admin/*`, `?edit=true` bypassing the spec pipeline entirely, `as never` casts disabling the one compiler check that would catch action-wiring gaps) — because nothing in CI enforces the rules the skill states. See [`SPEC-DRIVEN-UI-COMPLIANCE.md`](./SPEC-DRIVEN-UI-COMPLIANCE.md).
6. **The client already depends on solutions to problems it's re-solving by hand.** `packages/client` ships `@json-render/core`/`@json-render/react` at the latest version (`0.19.0`), which already provides a JSON-Patch diff/apply mechanism (`diffToPatches`/`applySpecPatch`) and a split state/visibility/action context architecture — both directly applicable to the `JSON.stringify`-diffing and monolithic-editor-context findings above, and neither currently used where they'd help most. See [`JSON-RENDER-REFERENCE-PATTERNS.md`](./JSON-RENDER-REFERENCE-PATTERNS.md).

None of this means "rewrite it" — the architecture's bones (domain factories, ports/adapters, spec-driven catalog) are sound and should be kept. The recommendation is targeted: fix the handful of things that are load-bearing for scale (collab/SSE/cache statefulness, pagination, rate limiting), and put a maintenance backstop under the god files and untested surfaces before they grow further.

See [`ACTION-PLAN.md`](./ACTION-PLAN.md) for a ranked, actionable list.
