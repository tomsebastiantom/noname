# Action plan

> Ranked recommendations from [`ARCHITECTURE.md`](./ARCHITECTURE.md), [`SCALABILITY.md`](./SCALABILITY.md), [`EFFICIENCY-PERFORMANCE.md`](./EFFICIENCY-PERFORMANCE.md), [`MAINTAINABILITY.md`](./MAINTAINABILITY.md), and [`EXPANDABILITY.md`](./EXPANDABILITY.md).
>
> **P0** = do now (correctness risk or actively broken). **P1** = do before the next scaling event or major feature push. **P2** = cleanup, do opportunistically. **P3** = defer / product decision, not a code smell.
>
> Note: the initial pass through this repo flagged the committed `packages/workers/.dev.vars` as a P0 security incident. On closer inspection it's a local-dev-only value with no production exposure — downgraded to a **dev-hygiene** item (see below) rather than an emergency.

---

## P0 — now

| # | Action | Why | Ref |
|---|---|---|---|
| 1 | **Reconcile the failing `pnpm -r typecheck`** — either fix the real TS errors in `packages/server` or confirm CI is actually failing and treat it as a broken build. | A "passing" CI gate that doesn't actually gate is worse than no gate — it's false confidence. | `MAINTAINABILITY.md` |
| 2 | **Fix the `/admin/settings/traces` route mapping gap** in `platform-routes.ts`. | Confirmed live bug: the route is unreachable via its intended template resolution and prefetch. | `ARCHITECTURE.md`, `EXPANDABILITY.md` |
| 3 | **Add `CommsEvents`/`WebhookEvents` to `DOMAIN_EVENT_SOURCES`** in `domain-events.ts` (or explicitly document why they're excluded). | Comms/webhook lifecycle events are currently invisible to analytics — a silent product/data gap, not just style. | `ARCHITECTURE.md` |

---

## P1.5 — dev hygiene (not an incident)

| # | Action | Why | Ref |
|---|---|---|---|
| 4 | **Untrack `packages/workers/.dev.vars`**: add to `.gitignore`, commit a `.dev.vars.example` placeholder, rotate the specific committed value as good practice. | It's a **local-dev-only** secret — `org.ts` gates its bypass on non-production `NODE_ENV`, and the team's own [`VAULT-CLIENT-SECRETS.md`](../2026-08-04/VAULT-CLIENT-SECRETS.md) plan already routes the production value through Vault, not this file. No rotation-under-pressure or history-scrub needed; just stop the file from being re-committed on every clone. | `MAINTAINABILITY.md` |
| 5 | **Verify the Vault path for `WORKER_SERVER_SECRET` is actually wired in the deploy pipeline** (server reads from Vault/injected env in prod, Worker uses `wrangler secret put` rather than a `[vars]` literal). | The design is already correct on paper; this just confirms it's implemented, since the current server code reads `process.env.WORKER_SERVER_SECRET` unconditionally with no visible Vault call in `org.ts`. | `MAINTAINABILITY.md` |
| 6 | Stop committing real-looking `ZITADEL_CLIENT_ID`/`ZITADEL_PROJECT_ID` values in `wrangler.toml` — regenerate via `init:zitadel` per environment and gitignore the result. These aren't secrets (they're IDs, not keys) but they're per-deployment config and currently look copy-pasted. | Consistency with the `zitadel_keys/` pattern already used elsewhere. | `MAINTAINABILITY.md` |

---

## P1 — before the next scaling event or major feature push

### Scalability

| # | Action | Ref |
|---|---|---|
| 5 | Add pagination (`parseLimitOffset`, already exists) to `documents.listDocuments`, `findContentTypes`, `machines.listInstances`/`listDefinitions`/`listTransitions`, and any other unbounded list route. | `SCALABILITY.md` |
| 6 | Add missing indexes: `machine_instances(orgId)`, `machine_transitions(instanceId)`, and a GIN/functional index for the JSONB paths actually queried (`documents.data->>'slug'`, `documents.meta->>'searchText'`). Replace the `documents.data::text LIKE` search with a JSONB-native or full-text approach. | `SCALABILITY.md`, `EFFICIENCY-PERFORMANCE.md` |
| 7 | Decide and document the horizontal-scaling story for collab rooms and SSE: either (a) enforce document-scoped sticky sessions at the LB and document it as a hard constraint, or (b) move room state to Redis/Hocuspocus-style shared storage. Do this **before** running >1 replica in production, not after an incident. | `SCALABILITY.md` |
| 8 | Add alerting on the event-bus Redis-fallback path (`event-bus.ts`'s `catch { publisher = null }`) so a silent degrade-to-single-instance failure is visible. | `SCALABILITY.md` |
| 9 | Fix N+1s: batch Zitadel MFA lookups in `auth/service.ts` team listing; batch Keto tuple revokes in `scope/service.ts`; reconsider per-flag DB writes in the hot evaluation path (`flags/service.ts`). | `SCALABILITY.md` |
| 10 | Separate background workers from the API process (or at minimum make worker concurrency independently configurable) so HTTP and job-processing scale independently and don't compete for the fixed 10-connection DB pool. | `SCALABILITY.md` |

### Efficiency

| # | Action | Ref |
|---|---|---|
| 11 | Replace `gzipSync` with async `gzip` (or stream/offload) on the analytics ingest path. | `EFFICIENCY-PERFORMANCE.md` |
| 12 | **Split the editor session context using the library's own `StateProvider`/`VisibilityProvider`/`ActionProvider` shape** (already used correctly by the platform runtime shell) instead of one monolithic context — fixes the 24-dependency `sessionData` memo (`use-edit-page-orchestration.ts`) at the root cause, using a pattern already installed via `@json-render/react`, not a new abstraction. | `EFFICIENCY-PERFORMANCE.md`, `ARCHITECTURE.md`, `JSON-RENDER-REFERENCE-PATTERNS.md` |
| 13 | **Replace `JSON.stringify`-based equality with `@json-render/core`'s `diffToPatches`/`applySpecPatch`** (already installed, unused) in `automerge-spec.ts`, `use-layout-collab.ts`, and `use-content-draft.ts`'s dirty check — this is the library's purpose-built solution to exactly this problem, not a new dependency to add. | `EFFICIENCY-PERFORMANCE.md`, `JSON-RENDER-REFERENCE-PATTERNS.md` |
| 14 | Add `React.memo` to the heaviest leaf components first: `LayerTreePanel`, `EditorCanvas`, `RichTextTipTapEditor`. | `EFFICIENCY-PERFORMANCE.md` |

### Maintainability

| # | Action | Ref |
|---|---|---|
| 15 | Add tests for `packages/server/domains/context` and `domains/machines` (currently 0%), and for `@noname/browser-sdk`/`@noname/extensions` (currently 0%). Prioritize the parts with the highest blast radius (machines engine, browser-sdk error/replay capture). | `MAINTAINABILITY.md` |
| 16 | Add a `test` script to `packages/client/package.json` and wire it into CI; then start closing the 6.5% coverage gap, prioritizing `main.tsx`/routing (given the traces bug above) and the god components. | `MAINTAINABILITY.md` |
| 17 | Add a coverage `thresholds` block to `vitest.config.ts` (even a modest one) so the numbers above stop being able to silently regress; expand `coverage.include` beyond `packages/server` once client tests exist. | `MAINTAINABILITY.md` |
| 18 | Add `pnpm build` (and ideally `pnpm audit`) to CI. | `MAINTAINABILITY.md` |
| 19 | Pick one home for the `documents/ports.ts` vs `contracts.ts` duplication and update all importers to use it consistently. | `ARCHITECTURE.md`, `MAINTAINABILITY.md` |

### Expandability

| # | Action | Ref |
|---|---|---|
| 20 | Write down the "add a domain" and "add an admin panel" checklists explicitly (they're implicit today) and, where possible, turn at least one step into a compile-time check — e.g. a lint rule or a small script that asserts every id in `auth/admin-routes.ts` has a matching branch in `platform-routes.ts`, to prevent a repeat of the traces bug. | `EXPANDABILITY.md` |
| 21 | Extract an identity-port abstraction so `agent/index.ts` and others stop importing Zitadel adapters directly — even if Zitadel is the only implementation today, route through the port. | `EXPANDABILITY.md` |

### Spec-driven UI enforcement (client)

The design in `skills/spec-driven-ui/SKILL.md` is sound; these are the violations of the team's own stated rules that a compiler/linter/CI check could catch instead of relying on the next audit to re-find them (see `SPEC-DRIVEN-UI-COMPLIANCE.md` for full detail):

| # | Action | Ref |
|---|---|---|
| 22 | Fix the `as never` casts in `platform/registry.ts:10` and `editor/registry.ts:42` by making the action-handler maps actually satisfy their catalog schemas — turns on a compiler check for all future action additions, not just today's gap. | `SPEC-DRIVEN-UI-COMPLIANCE.md` |
| 23 | Add a lint rule (or CI import-graph script) banning `fetch(` under `src/admin/**` and `src/editor/**` (allow-list `lib/api.ts`/auth modules), and a second rule banning `editor/**` → `admin/**` imports. | `SPEC-DRIVEN-UI-COMPLIANCE.md` |
| 24 | Formally document the `?edit=true` editor bypass in `SKILL.md` as an approved exception (with reasoning), or put the editor on a roadmap to route through the schema pipeline — right now it silently contradicts the skill's own "no hand-written React route" rule. | `SPEC-DRIVEN-UI-COMPLIANCE.md` |
| 25 | Wire the remaining mount-load bypasses onto `MountAction`/`useMountAction`: `AgentsAdminForm.tsx`, `ReferenceFieldInput.tsx`, `MediaFieldInput.tsx`, `AccountSecurityForm.tsx`. | `SPEC-DRIVEN-UI-COMPLIANCE.md` |

### Upstream `@json-render` primitives (already installed, unused)

| # | Action | Ref |
|---|---|---|
| 25b | Type `coreActionHandlers`/`editorActionHandlers` as single object literals against their catalog's action-params type (matching how every upstream `@json-render` example declares its registry inline) to eliminate the two `as never` casts at their real source, rather than accepting them as a library limitation. | `JSON-RENDER-REFERENCE-PATTERNS.md` |
| 25c | Evaluate `@json-render/directives`' built-in `$t` i18n directive (or a project directive via the already-installed `defineDirective`/`createDirectiveRegistry`) before building a bespoke localization layer for the hardcoded-copy findings. | `JSON-RENDER-REFERENCE-PATTERNS.md`, `SPEC-DRIVEN-UI-COMPLIANCE.md` |
| 25d | When rewriting `skills/spec-driven-ui/SKILL.md`, scope the "never fetch in components" rule to "components registered in a catalog registry," matching how the upstream library's own hooks (`useUIStream`, `useChatUI`) and example host pages fetch directly — the current blanket rule is stricter than the library it's built on. | `JSON-RENDER-REFERENCE-PATTERNS.md` |
| 25e | **When rewriting the skill, add a dedicated, from-scratch section for the CMS/documents/persistence layer** (layout documents, content types/entries, refs, draft/publish, edge schema caching) — no upstream `@json-render` skill covers this, since the library itself has no concept of it. Don't let it get folded into or overshadowed by sections that mirror upstream's catalog/registry/action guidance. | `JSON-RENDER-REFERENCE-PATTERNS.md`, `EXPANDABILITY.md` |
| 25f | **Review and apply [`SKILL-REWRITE-PROPOSAL.md`](./SKILL-REWRITE-PROPOSAL.md)** — a drafted, ready-to-paste rewrite of `skills/spec-driven-ui/SKILL.md` covering 25d/25e above plus a merged, expanded PR-review checklist. Not yet applied to the live skill file; needs a decision on which parts to accept before editing `skills/spec-driven-ui/SKILL.md` itself. | `SKILL-REWRITE-PROPOSAL.md` |

---

## P2 — cleanup, do opportunistically

| # | Action | Ref |
|---|---|---|
| 26 | Deduplicate `catalogProps` (client, extensions, and the inline copy in `scripts/seed/demo.ts`) into one shared home. | `ARCHITECTURE.md`, `MAINTAINABILITY.md` |
| 27 | Add a shared HMAC contract test covering both the worker's sign and the server's verify implementation, so a change to one side fails CI instead of failing silently in production. | `ARCHITECTURE.md`, `MAINTAINABILITY.md` |
| 28 | Break up the largest god files, starting with the ones with zero tests: `ScopeAdminForm.tsx` (932), `AgentsAdminForm.tsx` (728), `auth/scope/service.ts` (525), `notifications/service.ts` (492). | `ARCHITECTURE.md` |
| 29 | Route `scripts/seed/*.ts` through a published server/client interface instead of relative imports into `src/domains/...` internals; consider splitting the 2,191-line `demo.ts`. | `ARCHITECTURE.md`, `MAINTAINABILITY.md` |
| 30 | Add `typecheck`/`lint`/`test` scripts to `@noname/cli`; remove its unused `chalk` dependency. | `MAINTAINABILITY.md` |
| 31 | Route the 163 raw `throw new Error(...)` call sites toward typed `DomainError` subclasses over time, prioritizing the domains with the most raw throws (`notifications`, `webhooks`, `documents/adapters/postgres.ts`) since they also have thin test coverage. | `MAINTAINABILITY.md` |
| 32 | Add code splitting for TipTap/Automerge/rrweb-player so non-editor visitors don't download that weight. | `EFFICIENCY-PERFORMANCE.md` |
| 33 | Move `admin/registry.ts`'s duplicate import/export blocks to a single re-export pattern. | `MAINTAINABILITY.md` |

---

## P3 — defer / product decision, not a code smell

- Rate limiting is entirely absent (0 matches). This is a real gap for a production system with public login/webhook/ingest endpoints, but the right approach (edge-level via the Workers layer vs. app-level middleware) is a product/infra decision, not a quick fix — flagging it here so it's decided deliberately rather than by omission.
- Microservice extraction — the monolith wiring itself (domain factories) is fine; do not split services just to split them.
- Full field-type plugin registry for the client's content editor — worth doing if/when third-party extensions need to contribute field types; premature otherwise given only ~7 types exist today.
- Multi-vendor abstraction for Keto/Zitadel/ClickHouse — worth building only if a second vendor is actually planned; otherwise this is speculative flexibility that isn't free (see `EXPANDABILITY.md` for what exists today).

---

## How to use this document

This is a snapshot, not a backlog system — treat it as an input to whatever the team already uses (Linear/Jira/GitHub issues), not a replacement for it. Re-run this audit (or at least the raw grep/count commands cited in each file) after a major refactor to check whether the numbers moved in the right direction, the same way the repo's existing `docs/*/ARCHITECTURE-AUDIT.md` series does — just verify against the code each time rather than carrying forward a grade.
