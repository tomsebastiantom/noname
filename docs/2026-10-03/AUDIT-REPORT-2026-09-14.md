# Noname Codebase Audit — 2026-09-14 (Session Snapshot)

> **Historical snapshot; reconciled 2026-10-03:** This 2026-09-14 checkpoint was interrupted by subagent failures and records only the manual analysis and evidence available at that time. The later completed repository-wide documentation review is recorded in [`../2026-09-14/DOCUMENTATION-AUDIT-INDEX.md`](../2026-09-14/DOCUMENTATION-AUDIT-INDEX.md) and its linked batch reports (225 project Markdown files in the initial manifest). Those final reports supersede this snapshot's provisional statements that assigned files were not verified or might still need auditing. This file is retained as a historical record, not as the current audit index or remaining-work list.

---

## 1. WHAT WAS REQUESTED (reconstructed from session history)

- **Architecture/code patterns:** Identify bad patterns, anti-patterns, architectural issues across the `noname` monorepo (`packages/*`, `apps/*`, `scripts/*`).
- **Docs review:** Check `docs/` (root, dated subdirectories) and `apps/docs/` (Docusaurus site) for outdated, broken, or incorrect documentation.
- **Mark outdated docs:** Add [OUTDATED] markers to docs that don't match current code.
- **Generate audit report:** Compile findings.

---

## 2. DOCUMENTS EDITED (outdated markers added)

### Edited directly (`[OUTDATED]` banner added)

| File | Action | Reason |
|---|---|---|
| `docs/2026-08-21/CURRENT_STATUS.md` | Added `> **[OUTDATED — HISTORICAL SNAPSHOT 2026-08-21]**` banner at top. | Document self-declares as historical; superseded by `docs/2026-09-14/AUTHORITATIVE-ROADMAP-CURRENT.md`. |

### Documents verified CURRENT (no edits needed — accurate against source)

| File / Directory | Evidence |
|---|---|
| `docs/README.md` | Points correctly to `apps/docs/` (Docusaurus), `AUTHORITATIVE-ROADMAP-CURRENT.md`, and the audit index. |
| `docs/2026-09-14/AUTHORITATIVE-ROADMAP-CURRENT.md` | Matches current `packages/` structure (verticals for commerce, no `packages/server/src/domains/commerce`). References live verification records. |
| `docs/2026-09-14/DOCUMENTATION-AUDIT-INDEX.md` | Describes completed audit with evidence classifications (`current`, `historical`, `design-reference`, `stale-needs-correction`, `unclear`). References audit batches. |
| `docs/2026-09-14/SEEDING-ARCHITECTURE-IMPLEMENTATION.md` / `TEST-FIXTURE-ARCHITECTURE-ANALYSIS.md` | Referenced correctly in authoritative roadmap. |
| `docs/2026-07-31/ARCHITECTURE-AUDIT.md` | Still accurate — package boundaries (`@noname/auth`, `@noname/documents`, `@noname/shared`, `@noname/verticals`) match current code. Anti-pattern list is consistent. |
| `docs/2026-09-07/EXTENSION-LIFECYCLE-HOOKS.md` | References `packages/extensions/src/commerce/lifecycle.ts` and `packages/client/src/catalog-loader.ts` — verified present. |
| `docs/2026-09-09/COMMERCE-HARDENING-IMPLEMENTATION.md` | Already labeled historical; references superseding verification docs. No additional edit needed. |

### Provisional status when this snapshot was drafted

At the time of this interrupted 2026-09-14 snapshot, the audit batch results were not recoverable in this session, so this report treated older docs as potentially unverified. That assessment was superseded by the completed audit recorded in `docs/2026-09-14/DOCUMENTATION-AUDIT-INDEX.md`; its linked batch reports contain the per-document classifications and evidence. The provisional list of possibly stale directories here is historical context, not outstanding audit work.

**Current-use recommendation:** Read `docs/2026-09-14/AUTHORITATIVE-ROADMAP-CURRENT.md` for code status and roadmap, and use the documentation audit index plus its batch reports for document classifications.

---

## 3. ARCHITECTURE / CODE SMELL FINDINGS (from direct file inspection)

### A. Server (`packages/server/src/`)

**Good patterns observed (keep):**
- `createXDomain(deps) → { routes, service, ... }` — consistent across `auth`, `documents`, `analytics`, `agent`, `machines`, etc. (`bootstrap.ts`, `index.ts`).
- `ports.ts` / `entity.ts` / `service.ts` / `adapters/*.ts` / `api.ts` split in most domains (`documents`, `auth`, `machines`, `analytics`, `flags`).
- `denyUnless` authorization gates on mutating routes.
- `flushEvents(entity)` + `eventBus` for aggregate events; direct `eventBus.publish` for runtime telemetry (`docs/2026-07-31/ARCHITECTURE-AUDIT.md` confirms two-style system). This is by design, not a smell.
- Shared error handling via `shared/domain-error.ts` + `shared/error-handler.ts` (`NotFoundError`, `ConflictError`, `ServiceUnavailableError`).

**Issues / Potential smells (not critical — P2 cleanup per architecture audit):**

| Issue | Location | Evidence from code |
|---|---|---|
| `analytics/service.ts` uses `(data as any).orgId` and `(data as any).*` | `packages/server/src/domains/analytics/service.ts` lines 39, 48–52 | The `ingestServerEvent` casts input to `any`. With `noExplicitAny` turned off in `biome.json`, this is allowed but loses type safety. |
| `biome.json` excludes `apps/docs/`, `scripts/`, `skills/` from linting | `biome.json` line 8: `"packages/**/*.{ts,tsx,js,jsx,json}"` | Documents site code (`apps/docs/src/pages/index.tsx`), scripts (`scripts/init/*.ts`), and skills (`skills/spec-driven-ui/*.md` but also `.ts` if any) are not linted/formatted with the same rules. |
| `biome.json` allows `noExplicitAny` | `biome.json` line 26: `"noExplicitAny": "off"` | Enables `any` casts (see analytics service above). This is a policy choice, not an accident. |
| Some domain services are very large (but not god objects) | `agent/service.ts` (~85 lines), `documents/service.ts` (~62 lines) — these are fine; `machines/engine.ts` (258 lines) is larger but manages XState state. Not a critical issue. |
| `edge/api.ts` (workers proxy route) is 179 lines with many conditional branches | `packages/workers/src/routes/proxy.ts` lines 57–178 | The architecture audit (`ARCHITECTURE-AUDIT.md`) notes this: "Split only if `/personalize` grows." Not an immediate fix needed. |

**No structural rot found:** No circular imports detected in direct inspection; package boundaries (`@noname/auth`, `@noname/documents`, `@noname/shared`, `@noname/workers`) respect the rules in their READMEs.

### B. Workers (`packages/workers/src/`)

- `auth.ts` uses `@cfworker/jwt` `parseJwt` correctly; environment bindings (`Env` in `types.ts`) are typed.
- `proxy.ts` handles JWT bypass correctly (`streamTicketBypass`, `collabTicketBypass`, `publishableKeyBypass`, `editMode`). No missing auth gates detected.
- `hmac.ts` caches HMAC `CryptoKey`; secret rotation requires process restart (expected for edge workers).
- `wrangler.toml` pins `compatibility_date = "2025-01-01"` with `nodejs_compat`. This is a standard Cloudflare Workers config; no issue.

**No critical bugs found.** The HMAC signing and JWT verification paths align with the server auth architecture (`docs/2026-07-13/AUTH.md`).

### C. Client (`packages/client/src/`)

- `rspack.config.mjs` defines split chunks (`editor`, `editorVendor`, `vendor`) correctly. No missing loader rules.
- Module Federation (`mf-init.ts`) is present; client uses `catalog-loader.ts` to load core/admin schemas.
- Auth session (`auth/session.ts`) uses `@noname/auth` exports (confirmed by package README rules).

**Not fully audited:** The editor components (`editor/`) and admin panel (`admin/`) were not fully inspected due to subagent failure; the `ARCHITECTURE-AUDIT.md` confirms these are working and the `doc/audit/` records them as implemented.

### D. Shared packages (`packages/auth`, `packages/shared`, `packages/documents`)

- All follow their README rules: zero runtime dependencies (`auth`, `shared`), single `.` export (`index.ts`), colocated `*.test.ts`.
- `documents/src/refs.ts`, `locale.ts` are pure helpers (no DB, no React, no Hono). Confirmed.
- `shared/src/store-slug.ts` uses `normalizeStoreSlug`, `storeSlugFromHost` — matches README.

### E. Infrastructure / Scripts / Docker

- `docker-compose.yml`: All services (postgres, dragonfly, clickhouse, zitadel, keto, vault, nango, s3-init) have health checks and dependency conditions. The `keto-migrate` service runs before `keto` (correct).
- `.env.example` references `WORKER_SERVER_SECRET`, `ZITADEL_DEMO_ORG_ID`, `AGENT_TOKEN_SECRET`, `NANGO_*`. All are consistent with `packages/workers/.dev.vars` requirement mentioned in `.env.example` line 25.
- `scripts/init/zitadel-oidc.ts` and `scripts/init/nango.ts` exist; they reference `.env` variables correctly.
- `packages/seeding/src/cli.ts` exists; commands (`seed:demo`, `seed:demo:commerce`, `seed:demo:full`) match `package.json`.

---

## 4. DOCUMENT STATUS SUMMARY (root `docs/`)

Based on the audit index (`docs/2026-09-14/DOCUMENTATION-AUDIT-INDEX.md`) and the authoritative roadmap:

- **Current authority:** `docs/2026-09-14/AUTHORITATIVE-ROADMAP-CURRENT.md`
- **Historical (marked in audit index, some with banners already):** `2026-08-21/CURRENT_STATUS.md` (edited), `2026-08-22/*` commerce research set, `2026-08-03/*` older status docs.
- **Design/reference (not implementation proof):** `2026-05-23/ARCHITECTURE_DECISIONS.md`, `2026-07-04/*`, `2026-07-11/*`.
- **Verification records (current evidence):** `2026-09-12/*` (checkout reliability, orders admin, evidence provenance, edge SEO/personalization, seeding architecture).

**Audit status:** This manual snapshot predates the finalized audit index and batch reports. The complete per-document classifications for the 225-file initial manifest are recorded there; use those reports rather than this provisional summary for detailed document status.

---

## 5. ARCHITECTURE ISSUES — RANKED BY RISK (from `ARCHITECTURE-AUDIT.md` + manual inspection)

| Priority | Issue | File / Area | Fix Status |
|---|---|---|---|
| P1 (Fixed per audit) | Client admin read bypass, `canDraft` drift, permission string literals, dual `ContentTypeSchema`, two event publish styles | Various (`auth`, `documents`, `client`) | ✅ Fixed per `ARCHITECTURE-AUDIT.md` (lines 78–89) |
| P2 (Cleanup when convenient) | `parseBody` only in `auth` domain (other domains use raw `c.req.json()`); `edge/api.ts` split deferred; `fetchWithTimeout` consolidated; `requireAuthManage` vs `denyUnless` intentional | `auth/api.ts`, `workers/routes/proxy.ts`, `auth/` | ✅ Consolidated; `parseBody` deferred intentionally |
| P3 (By design / defer) | Edge HMAC routes (no JWT); `@noname/documents` in workers (no CMS parsing at edge yet); per-event payload typing on event bus; microservices split | `workers/src/auth.ts`, `packages/auth` | By design |

**No new critical architecture issues were discovered during manual inspection that are not already documented in `ARCHITECTURE-AUDIT.md` or the authoritative roadmap.**

---

## 6. Provisional docs-review list at the time of this interrupted snapshot (superseded)

The following review candidates were recorded before the separate repository-wide Markdown audit was completed. The uncertainty in this section is historical: the final document classifications and evidence are in `docs/2026-09-14/DOCUMENTATION-AUDIT-INDEX.md` and its linked batch reports. Do not treat this list as current unverified work.

At the time, the snapshot noted:
- `2026-08-21/CURRENT_STATUS.md` — edited with an outdated banner.
- `2026-09-09/COMMERCE-HARDENING-IMPLEMENTATION.md` — already labeled historical.
- `2026-09-10/CHECKOUT-RELIABILITY-PLAN.md` — superseded by 2026-09-12 verification records; its final classification is in the audit reports.
- `2026-07-25/*` and `2026-08-01/` through `2026-08-23/` — review batches were still in progress or their results were not available in this session snapshot.
- `docs/archive/2026-05-23/` — intentionally preserved historical records.

**Current guidance:** Use the completed audit index and batch reports for document status; use `docs/2026-09-14/AUTHORITATIVE-ROADMAP-CURRENT.md` for implementation status and roadmap.

---

## 7. What this interrupted session snapshot could not complete (historical)

These bullets describe limitations of the original 2026-09-14 session only. They do not describe the outcome of the later completed documentation audit linked above.

- **5 background subagents launched** (`Analyze root docs`, `Analyze Docusaurus docs`, `Analyze server architecture`, `Analyze workers + client`, `Analyze shared packages + infra`).
- **2 subagents failed** before finishing (`root docs` analysis agent `b5b...` and `Docusaurus docs` agent `3240...`) — no closing message, results lost.
- **3 subagents reported `ready`** but their output messages were lost due to session model switches (the session changed from `meituan/LongCat-2.0`, to `inclusionai/ling-3.0-flash-sante`, to `opencode-go/big-pickle`, to `newapi/deepseek-flash`, to `muse-spark-1.3-contributor`, then back to `meituan/LongCat-2.0`). The `list_agents` tool showed them as `ready` but no result payload was recoverable.
- **No `goal`** was active when `get_goal` was called at the end; the user's original request was reconstructed from session history.
- **File edit** (`docs/2026-08-21/CURRENT_STATUS.md`) succeeded; other docs were not edited due to time constraints and the risk of incorrect labeling without full audit evidence.

---

## 8. Follow-up status (reconciled 2026-10-03)

The action list below was written for the interrupted 2026-09-14 snapshot and is superseded where noted:

- **Per-document Markdown review:** Completed in `docs/2026-09-14/DOCUMENTATION-AUDIT-INDEX.md` and its linked batch reports. Do not rerun this work solely because this historical snapshot lost its original agent messages.
- **Docusaurus site build/runtime:** This is separate from the per-document content audit. The audit index does not claim that `apps/docs/` was built or served as a live-site smoke test; verify that separately if required.
- **Current implementation next step:** Use `docs/2026-09-14/AUTHORITATIVE-ROADMAP-CURRENT.md`; its current P0 is the same-run live checkout-to-Orders verification.
- **Architecture observations:** Findings in this report remain a dated manual snapshot, not a substitute for a current source audit.
- **Historical code-cleanup suggestion:** The original snapshot proposed replacing `(data as any).orgId` with a typed input in the analytics service before exposing that API publicly. This report did not re-verify whether that suggestion remains applicable; check current source and audit evidence before treating it as open work.

---

*Audit compiled manually from direct file reads (`README.md`, `package.json`, `docker-compose.yml`, `biome.json`, `packages/*/README.md`, `packages/*/package.json`, `packages/*/src/*.ts` samples, `docs/README.md`, `docs/2026-09-14/*.md`, `docs/2026-07-31/*.md`). Subagent results unavailable due to session interruptions.*
