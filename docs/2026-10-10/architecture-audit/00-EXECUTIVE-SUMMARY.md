# Architecture Audit — Executive Summary

**Repository:** `C:\Workspace\noname` ("noname" — AI-native declarative platform)
**Date:** 2026-10-10 · **Mode:** read-only analysis; **no code was changed**
**Depth:** full repository — 12 packages, 938 tracked TypeScript files, 167 test files, 17 server domains, 51 catalog components, 248 documentation files

---

## What this project is

An AI-native, **identity-agnostic** platform where **UI is JSON**. Org-facing pages are not hand-written React — they are resolved at runtime from a JSON layout document plus a component catalog:

```text
browser → client (React + json-render) → edge worker (JWT, KV, bot SSR)
        → API server (Hono + Node, 17 DDD domains)
        → Postgres (JSONB documents) + ClickHouse (analytics)
        + Dragonfly/Redis (queues, fan-out) + ZITADEL/Keto + Vault + R2
```

Content, layouts, workflow logic (XState machines), feature flags, audiences, and audit records are all generic platform primitives. **Commerce is the first proving vertical, not the product identity** — its business semantics live in `packages/verticals/src/commerce` and its UI in `packages/extensions/src/commerce`, deliberately *not* in the generic server.

---

## Overall verdict

**The architecture is coherent and defensible, and a surprising amount of it was actually executed as designed. The problem is not the design — it is that none of the design's invariants are enforced, and the documentation of record cannot be trusted.**

| Dimension | Verdict |
|---|---|
| Architectural intent | **Strong.** Clear layering, explicit ownership boundaries, an ADR registry, written UI skill with an honest named exception. |
| Execution of hard decisions | **Mixed but credible.** 8 of 15 recorded decisions fully followed; the hardest ones (documents consolidation, Evidence kernel, audience/experience replacing `contextHash`, spec-driven UI) were genuinely built. |
| Rule conformance in code | **Partial.** Flat-props migration complete; boundary, copy-ownership, fetch-isolation, and registry-sync rules violated in documented, countable ways. |
| Enforcement of its own rules | **Zero.** No CI, no architecture tests, no convention tests, no coverage thresholds, no boot-time env validation. |
| Security posture | **Two verified critical defects**, one committed secret. |
| Scale readiness | **Single-instance by construction** in durability- and identity-sensitive paths. |
| Documentation integrity | **Rotted.** 64% of docs self-declare stale; the most discoverable architecture doc is materially wrong. |

---

## The five findings that matter most

### 1. Critical — a forged, unsigned JWT grants permissions on public capability routes

The edge marks `POST /api/capabilities/:name` public (`public-routes.ts:43`) but validates credentials for only one capability (`proxy.ts:38-41`). On every other capability it skips JWT validation **yet still forwards the raw `Authorization` header** (`proxy.ts:167-175`), while signing the HMAC with an **empty** user id and role (`:145`). The origin then falls back to the unverified token for both identity (`guards.ts:45`) and permissions (`guards.ts:82-85` → `jwt/decode.ts:13`, whose own comment says *"no signature verification — trust edge/API gateway"*). A wildcard role claim is honoured with no project check (`jwt/roles.ts:47-52`).

Net: a crafted token satisfies `COMMERCE_ORDERS_VIEW` / `COMMERCE_ORDERS_MANAGE` for any store, because the org comes from the `Host` header, which outranks the JWT. Verified statically end-to-end; not reproduced at runtime. → **[05 §7.3](05-SCALABILITY-SECURITY-RUNTIME.md)**

### 2. Critical — the edge↔origin trust secret is committed to git

`packages/workers/.dev.vars` is **tracked in HEAD** and contains a real 32-character `WORKER_SERVER_SECRET` — the single symmetric key behind the entire edge→origin identity boundary (and also the SSE ticket key and the agent-token comparison key). The identical value is printed in `docs/2026-07-13/AUTH.md` at lines 72, 81, and 112. It has **9 read sites** and no rotation story; with no timestamp or nonce in the signed payload, captured headers replay indefinitely. Additionally, `.kilo/` is **not gitignored** and contains three more copies of `.env`/`.dev.vars` inside two repository worktrees. → **[05 §8](05-SCALABILITY-SECURITY-RUNTIME.md)**, **[06 §5](06-MAINTAINABILITY-DOCS-DX.md)**

### 3. Critical — cross-tenant document reads

`findDocumentById(id)` takes no `orgId` (`documents/ports.ts:348`, adapter `:226-229`), and `content.service.ts:78-84` / `:176-178` **ignore the org parameter entirely**. Reached from `GET /api/documents/:type/:id` and `.../resolve`, both requiring only `CONTENT_DRAFT_WRITE` — so any staff user in any org can read another org's document by UUID. Writes are correctly guarded (`document-guards.ts:51-55`), which makes this a pure read leak and a textbook *caller-enforced tenancy* anti-pattern. → **[05 §7.2](05-SCALABILITY-SECURITY-RUNTIME.md)**

### 4. High — nothing enforces anything

**There is no CI of any kind.** Lint, typecheck, and 167 test files exist and work; nothing runs them automatically. As a direct result:

- `README.md:208` claims all 9 (actually 17) domains follow `ports → entity → service → adapters → api → index`; **only `documents` matches it**.
- Both `defineRegistry` call sites use `as never` (`platform/registry.ts:12`, `editor/registry.ts:44`), which makes registry↔catalog drift **type-invisible** — `tsc --noEmit` exits 0 today even though `TracesAdmin` is registered, routed, permissioned, and seeded with **no props schema**.
- ~70 user-visible strings are hardcoded across ~20 registry-reachable components; 12 components call fetching domain helpers; 4 mount loads put `execute` in a `useEffect` deps array.
- Coverage is scoped to 1 of 12 packages; there are no thresholds.

This is the **single highest-leverage fix in the audit**: one CI workflow plus two convention-test files would fail on today's code and lock in every rule the project has already written down. → **[04 §10](04-UI-SPEC-CONFORMANCE.md)**, **[06 §7](06-MAINTAINABILITY-DOCS-DX.md)**

### 5. High — the system is single-instance by construction

- The **event bus is at-most-once**: Redis pub/sub with no replay, no consumer groups, handler errors swallowed (`event-bus.ts:19-23`), published un-awaited *after* the Postgres commit (`aggregate-root.ts:19-22`). More replicas and more deploys mean more silent loss.
- **ClickHouse gates process boot**: `analytics/index.ts:13` awaits `ensureClickHouseTable()` inside `createApp`, so analytics being down crash-loops the API and every worker.
- **Analytics acks before writing** — up to 49 accepted events are lost per replica per crash/deploy, and ClickHouse write errors are swallowed (`analytics/worker.ts:32-37`).
- **No SIGTERM handling in the API process at all** (`index.ts:1-31`).
- SSE, collab rooms, caches, and queue workers are all process-affine, and the degraded-health flag is structurally incapable of flipping after startup.

→ **[05 §2, §9, §10, §14](05-SCALABILITY-SECURITY-RUNTIME.md)**

---

## Decision review at a glance

15 recorded decisions, each verified against code rather than against other documents:

| Verdict | Count | Decisions |
|---|---|---|
| **Followed** | 8 | Edge/client render split (D2), Postgres+ClickHouse+Redis (D7), identity-agnostic verticals (D8), native flags (D9 form), unified `documents` domain (D10), Module Federation (D12), Evidence kernel (D13), audience/experience replacing `contextHash` (D14) |
| **Partially followed** | 5 | "Pure API server" (D1 — React email + rspack in `packages/server`), HMAC/PII isolation (D3 — credentials transit the origin), "flow = JSON not code" (D4 — false), inline editor (D11 — drifted toward the deferred GrapesJS form), docs system (D15) |
| **Abandoned** | 2 | In-memory event bus (D5), "two packages" (D6) |

The two abandoned decisions were both **deliberate improvements under load** that were never written back into the record — the same failure mode that produced the documentation drift. → **[02](02-DECISION-REVIEW.md)**

---

## Conformance scorecards

**UI skill (51 repo-owned catalog components):**

| Rule | Conformance |
|---|---|
| R1 flat props | ~96% ✅ |
| R2 copy from props | **~60%** ❌ |
| R3 no `fetch` in registered components | ~90% ⚠️ |
| R4 schema ↔ registry ↔ seed sync | ~94%, with 2 hard mismatches ❌ |
| R5 mount loads | ~87% ⚠️ |
| R6/R7 registry typing | **0%** ❌ |
| Enforcement of R1–R7 | **0 of 7** ❌ |

**Package boundaries:** `documents`, `auth`, `shared` (bar one leak), and `workers` are clean. `verticals` declares an illegal unused dependency on `@noname/server`; `seeding` makes 9 deep relative imports into 5 packages and opens its own Postgres connection; `extensions` declares an upward `@noname/client` dep.

**Cross-boundary duplication:** 10 duplicated units, including a **cart-total divergence** — the server computes integer minor units (`verticals/.../capabilities.ts:723-739`) while the client computes float major units (`components.tsx:362-365`).

→ **[03](03-PACKAGE-CONFORMANCE.md)**, **[04](04-UI-SPEC-CONFORMANCE.md)**

---

## What is already good (do not rebuild)

Stated explicitly so remediation does not erase working design:

- The **spec-driven UI pipeline is real**, used for every org-facing surface. No react-router, no `pages/` tree.
- The **flat-props migration genuinely completed** — zero live `config`/`labels` reads anywhere.
- The **editor → admin import boundary is clean** (zero violations), and the editor exception is a documented, defensible choice.
- The **Evidence kernel**, the **documents type registry**, and the **audience/experience replacement of `contextHash`** are well-designed and were executed to their recorded decisions (D14 is the most rigorously executed decision in the set).
- The **edge worker has no database access** and uses only WebCrypto — the boundary holds.
- `packages/documents`, `packages/auth`, and `packages/shared` are **genuinely pure** (zero runtime deps) and safe for all consumers.
- The **`spec-driven-ui` skill is the best architectural document in the repository** — precise, honest about its own gaps, and correct.
- The **test suite is real** (167 files), and the documented "tests import seeds" problem is genuinely fixed.

---

## Recommended first moves

Full sequenced plan in **[07-REMEDIATION-ROADMAP.md](07-REMEDIATION-ROADMAP.md)**. The short version:

**This week — stop the bleeding**
1. Rotate `WORKER_SERVER_SECRET`; remove it from `.dev.vars` and `AUTH.md`; gitignore `.dev.vars` **and `.kilo/`**. (§Executive 2)
2. Close the forged-JWT path — verify the JWT at the origin, **or** strip `Authorization` on all public routes at the edge; remove the wildcard role claim. (§Executive 1)
3. Add `orgId` to the document storage signatures and filter in SQL. (§Executive 3)
4. Make ClickHouse non-fatal at boot; add SIGTERM handling; make analytics flush before acking.

**This month — make the rules enforceable**
5. **Add CI.** One workflow running `biome check`, `pnpm -r typecheck`, `pnpm test`.
6. Add `architecture.test.ts` (boundaries) and `catalog-conventions.test.ts` (UI rules). **Both fail on today's code — that is the proof they are worth having.**
7. Validate env at boot from a schema; generate `.env.example` from it (~66 variables are undocumented today).

**Then** — fix what CI now catches, move the event bus to a durable fan-out, and archive the stale documentation.

---

## Two rules for the whole programme

1. **Do not add a new architectural rule until enforcement exists.** Every rule added before there is a gate becomes another document that drifts — that is precisely how this repository arrived at its current state.
2. **When a decision changes, change the ADR in the same PR.** The two abandoned decisions were both improvements nobody wrote back.

---

## Report index

| Report | Contents |
|---|---|
| **[01 — Architecture As Built](01-ARCHITECTURE-AS-BUILT.md)** | What the system actually is: packages, 17 domains, runtime topology, data layer, the spec-driven UI pipeline, and every place documentation diverges from code |
| **[02 — Decision Review](02-DECISION-REVIEW.md)** | All 15 recorded decisions + the 11 ADRs: verdict, code evidence, scalability assessment, recommendation |
| **[03 — Package Conformance](03-PACKAGE-CONFORMANCE.md)** | Package-by-package boundary audit: layering violations, cross-domain coupling, vertical leakage, DI consistency, cross-boundary duplication, enforcement gap |
| **[04 — UI Spec Conformance](04-UI-SPEC-CONFORMANCE.md)** | All 51 catalog components against R1–R7: scorecard, orphans and desync, copy violations, fetch violations, the registry-drift root cause, and the cheapest fix |
| **[05 — Scalability, Runtime & Security](05-SCALABILITY-SECURITY-RUNTIME.md)** | 17 ranked risks with evidence and fixes: connections, event durability, queues, locking, analytics, caching, tenancy isolation, observability, multi-instance hazards, SPOFs |
| **[06 — Maintainability, Docs & DX](06-MAINTAINABILITY-DOCS-DX.md)** | Documentation inventory and contradictions, ADR governance, repo hygiene, config drift, quality gates, skills, line-cited onboarding friction |
| **[07 — Remediation Roadmap](07-REMEDIATION-ROADMAP.md)** | Phased, effort-estimated plan: Phase 0 security → Phase 1 enforcement → Phase 2 debt → Phase 3 docs → Phase 4 design revisions |

---

*All findings are cited with `file:line`. Claims verified statically and not reproduced at runtime are labelled as such. No file outside this report directory was created, modified, or deleted.*
