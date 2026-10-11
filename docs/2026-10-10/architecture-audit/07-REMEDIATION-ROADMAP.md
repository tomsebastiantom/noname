# 07 — Remediation Roadmap

Prioritised, sequenced plan. **No code was changed by this audit** — this is the recommended next work.

Ordering principle: **correctness and security before capacity, capacity before polish, and enforcement before new rules.** Adding rules to an unenforced system is how this repository arrived at its current state.

Effort scale: **S** ≤ 1 day · **M** 2–5 days · **L** 1–3 weeks · **XL** > 3 weeks.

---

## Phase 0 — Stop the bleeding (do this week)

These are security and correctness defects that are exploitable or data-losing today. Nothing else in this report should start first.

| # | Action | Evidence | Effort |
|---|---|---|---|
| 0.1 | **Rotate `WORKER_SERVER_SECRET`** and remove it from `packages/workers/.dev.vars` and `docs/2026-07-13/AUTH.md:72,81,112`; add `.dev.vars` to `.gitignore` and commit a `.dev.vars.example`; purge the blob from git history. **Also add `.kilo/` to `.gitignore` and delete its two worktrees** — it is unignored and holds 3 further copies of `.env`/`.dev.vars`. | report 05 §8, report 06 §5 — the value is tracked and present in HEAD | S |
| 0.2 | **Close the forged-JWT path.** Either (a) verify the JWT signature at the origin via JWKS before deriving permissions, or (b) strip `Authorization` on all `PUBLIC_ROUTES` at the edge and rely solely on HMAC-signed `x-user-id`/`x-role`. Also remove the `urn:zitadel:iam:org:projects:roles` wildcard acceptance in `packages/auth/src/jwt/roles.ts:47-52`. | report 05 §7.3 — verified chain from `public-routes.ts:43` to `capabilities/routes.ts:66` | M |
| 0.3 | **Add the regression test** that would have caught 0.2: for every entry in `PUBLIC_ROUTES`, assert a forged-role token is rejected. | `workers/src/routes/public-routes.ts` | S |
| 0.4 | **Scope tenant reads at the data-access boundary.** Add `orgId` to `findDocumentById`/`updateDocument`/`publishDocument`/`archiveDocument`/`deleteDocument` and filter in SQL; fix `content.service.ts:78-84` and `:176-178`. Fail closed. | report 05 §7.2 — `documents/adapters/postgres.ts:226-229` | M |
| 0.5 | **Delete `packages/server/src/shared/tenant.ts`.** It is a dead second HMAC verifier that only warns on a missing signature and signs a header the worker never sets. | report 05 §8 | S |
| 0.6 | **Make ClickHouse non-fatal at boot.** `analytics/index.ts:13` currently gates `createApp`, so ClickHouse down ⇒ every API/worker replica crash-loops. Make `ensureClickHouseTable` lazy + retrying; expose analytics health separately. | report 05 §9 | S |
| 0.7 | **Add SIGTERM handling to the API.** `server/src/index.ts` has none: stop accepting, `server.close()`, drain SSE/queues/DB with a timeout. | report 05 §10 | M |
| 0.8 | **Fix analytics at-most-once.** Flush inside the job (`addBulk` + await), `attempts: 5` with backoff, stop swallowing ClickHouse errors in `analytics/worker.ts:32-37`. | report 05 §5 | M |
| 0.9 | **Fix `trackBatch` serial enqueue** — use `addBulk`. | `analytics/service.ts:64-70` | S |
| 0.10 | Remove the repo-root scratch files (`key` — a live-looking API credential — plus 7 `console-*.log` and `stripe_events*.log`) and resolve the uncommitted `temp_inventory_fixture.sql` deletion. | report 06 §5 | S |
| 0.11 | Untrack `.dsh/skills/*` and `kilo.json` (absolute machine path); keep harness state out of the product repo. | report 06 §5, §8 | S |

**Exit criteria:** no known-exploitable auth or tenancy path; no committed secret; the platform survives a ClickHouse outage, a deploy, and a single lost analytics batch.

---

## Phase 1 — Make the rules enforceable (do this month)

**This is the highest-leverage phase for maintainability.** Every drift documented in reports 03–06 exists because nothing was in the way. One CI file plus two test files converts the entire body of written architecture into executable constraints — and both tests fail on the current code, which is the proof they are worth having.

| # | Action | Catches | Effort |
|---|---|---|---|
| 1.0 | **Fix the 12 pre-existing Biome errors before wiring CI**, or the pipeline is red from its first run and gets ignored. They are all mechanical (`pnpm biome check --write` plus two real lint fixes): unused vars and an optional-chain in `verticals/src/commerce/capabilities.ts:931,954,957`; formatting in `verticals/src/commerce/{capabilities,money}.ts`, `extensions/src/commerce/{cart,cart.test,orders-admin,orders-admin-api,product-catalog}.*`; import ordering in `server/src/domains/audiences/{ports,service,service.test}.ts`. Verified pre-existing on 2026-10-10 — `README.md:183` claims 0 errors and the 2026-09-14 baseline recorded a pass, so the gate regressed. | A red gate no one can run | S |
| 1.1 | **Add CI.** One workflow running `biome check`, `pnpm -r typecheck`, `pnpm test`. | The precondition for everything below; today none of these run automatically | S |
| 1.2 | **`packages/server/src/architecture.test.ts`** — walk `packages/*/src/**` and assert: no `service*.ts` imports `drizzle-orm`/`ioredis`/`@aws-sdk`/`@clickhouse`; cross-domain imports target only `ports`; no `packages/verticals` → `@noname/server`; no `packages/seeding` relative imports into other packages. | report 03 §2.2, §2.3, §4, §8 (fails today on all four) | M |
| 1.3 | **`packages/client/src/catalog-conventions.test.ts`** — five assertions: registry↔schema key parity per pack; transitive fetch ban in registry-mapped impls; `as never`/`as any` ban in `**/registry.ts`; `[execute` in `useEffect` deps; `props.(labels\|config).` regression guard. | report 04 §11 — items 1, 2, 3, 4, 5, 6, 8 all at once | M |
| 1.4 | **Biome `noRestrictedImports`** for `packages/client/src/editor/** → admin/*`, and `noRestrictedSyntax` for `as never`. | report 04 §8, §7 | S |
| 1.5 | **Widen `vitest.config.ts` coverage** beyond `packages/server/src`. | report 06 §7 — 11 of 12 packages report no coverage | S |
| 1.6 | **Boot-time env validation.** Declare the 66 variables in a Zod schema, fail fast on missing security-relevant ones, and generate `.env.example` from it. | report 06 §6 — 42 undocumented vars, zero validation | M |
| 1.7 | **Add a readiness probe and basic metrics** (`/ready` checking Postgres + ClickHouse + Redis; queue depth; analytics flush failures; pool saturation), and fix the `degraded` flag so it reflects actual client readiness rather than `publisher !== null`. | report 05 §12 — the health signal is structurally incapable of failing | M |
| 1.8 | **Add the missing retention jobs**: delete expired `capabilityIdempotency` and `providerEventReceipts` rows. | report 05 §4, §15 — both grow without bound | S |
| 1.9 | **Add the `document_ops` unique index** on `(org_id, document_id, server_version)` plus retry. | report 05 §4 — duplicate versions under concurrent edits | S |

**Exit criteria:** a PR that violates any documented pattern fails CI. The two convention tests are green because the corresponding code was fixed, not because they were weakened.

---

## Phase 2 — Pay down the architectural debt the rules expose

Now that violations fail CI, fix them in dependency order.

### 2A. Boundary debt

| # | Action | Evidence | Effort |
|---|---|---|---|
| 2.1 | Move cart routes/ownership/policy out of `machines/routes/instances.ts:25,68-221` into `packages/verticals/src/commerce` as a route contribution or injected machine access policy. | report 03 §2.4 | M |
| 2.2 | Move the commerce backend descriptor + Stripe event mapping out of `integrations/extension-dispatcher.ts:52-59` and `provider-event-worker.ts:82-115` into `verticals/commerce`, registered via the existing `backends`/`mappings` deps. | report 03 §2.4 | M |
| 2.3 | Remove provider-specific SQL from `documents/adapters/postgres.ts:92-93`. | report 03 §2.4 | S |
| 2.4 | Move `auth/scope/{collections,bindings,teams,helpers}.ts` table access behind a documents-owned port. | report 03 §2.3 — auth reads another domain's tables | M |
| 2.5 | Introduce an identity-provider port in `auth` and inject ZITADEL/Keto adapters; today `auth/service.ts:18-40` imports them directly, making auth untestable without a live ZITADEL. | report 03 §2.2 | L |
| 2.6 | Remove `verticals` → `@noname/server` from `package.json:16` and `tsconfig.json:5`. | report 03 §4 | S |
| 2.7 | Rework seeding to use package specifiers and injected ports; it currently makes 9 deep relative imports and opens its own Postgres connection. | report 03 §8 | L |
| 2.8 | Namespace capability names by vertical (`commerce.checkout.start`) so registration collisions are impossible. | report 02 D8 | S |

### 2B. UI skill debt

| # | Action | Evidence | Effort |
|---|---|---|---|
| 2.9 | Add the missing `TracesAdmin` props schema and add `traces` to the admin nav config/labels — the panel is implemented, routed, permissioned, and seeded but unreachable and unvalidated. | report 04 §5 | S |
| 2.10 | Fix or delete `EditorSaveBar` (registered, no schema, never referenced). | report 04 §5 | S |
| 2.11 | Derive `ADMIN_PALETTE_EXCLUDED_TYPES` from `adminComponents` keys instead of hand-maintaining it — it is stale by 5, making admin panels draggable into storefront layouts. | report 04 §5 | S |
| 2.12 | Move the 12 fetch-in-component sites onto catalog actions (`useMountAction` + `$state` for reads, `useCatalogSubmit`/`execute` for mutations). | report 04 §4 | L |
| 2.13 | Fix the 4 `execute`-in-deps mount loads (`AgentsAdminForm.tsx:156`, `AudiencesAdmin.tsx:184,216`, `TracesAdmin.tsx:121`). | report 04 §6 | S |
| 2.14 | Type the handler maps as `Actions<typeof catalog>` and drop `as never` at `platform/registry.ts:12` and `editor/registry.ts:44`; fix `core/actions/types.ts:9` (`Record<string, …>` makes `satisfies` check nothing). | report 04 §7 — this cast is what hid 2.9–2.13 | M |
| 2.15 | Move the ~45 label defaults out of `commerce/catalog-schemas.ts:31-87` into seeds, and clear the ~70 hardcoded literals in ~20 registry-reachable files, worst-first: `UsersAdminForm.tsx:204-235`, `LoginBrandingForm.tsx:80-148`, `PageTreeAdmin.tsx:101-114`, `RichTextTipTapEditor.tsx:297-379`. | report 04 §3 | L |
| 2.16 | Fix the seed↔reader `providers`/`providerList` desync and add `account_security` as a real `AdminRouteId` so it gets a permission rule. | report 04 §5 | S |
| 2.17 | Delete the 375-line orphan catalog and 5 dead modules; correct `ARCHITECTURE_DECISIONS.md:28`. | report 04 §9 | S |
| 2.18 | Remove the `core/actions/* → admin/*` layering inversion. | report 03 §3 | M |

### 2C. Data and durability debt

| # | Action | Evidence | Effort |
|---|---|---|---|
| 2.19 | **Replace the event bus with a durable fan-out** — Redis Streams or BullMQ with consumer groups, offsets/DLQ table, and no error swallowing. This is the single highest-value durability fix. | report 05 §2 — events are lost silently today | L |
| 2.20 | Move machine transition hooks off the request path onto a queue keyed by transition id; make them idempotent and retriable. | report 05 §4 | L |
| 2.21 | Collapse `machineDefinitions` and `machines` into one table with a migration; partition `machine_transitions` by month with retention. | report 02 D4 | M |
| 2.22 | Implement the recorded ClickHouse evaluation sink for `flag_evaluations` (or batch/sample in Postgres); stop emitting one analytics event per flag evaluation. | report 02 D9 | M |
| 2.23 | Partition `documents` by `org_id` hash or type; stop duplicating full payloads into `document_ops`. | report 02 D10 | L |
| 2.24 | Index `data->>'slug'` (partial index) and add a TTL cache with event-driven invalidation for tenant settings — both sit on the anonymous storefront hot path. | report 05 §6 | M |
| 2.25 | Add edge cache invalidation on publish (version key comparison or Cloudflare purge) and single-flight protection for slug/bot-schema/JWKS. | report 05 §6, report 02 D2 | M |
| 2.26 | Define Evidence retention/archival per record type and partition by month. | report 02 D13 | M |
| 2.27 | Fix `shared/redis.ts` to pass the URL through (TLS, username, db) and reserve `maxRetriesPerRequest: null` for BullMQ only. | report 05 §1 | S |
| 2.28 | Add PgBouncer and make the Postgres pool size env-tunable before scaling replicas. | report 05 §1 | M |

---

## Phase 3 — Structural and documentation health

| # | Action | Evidence | Effort |
|---|---|---|---|
| 3.1 | **Archive `docs/2026-05-*` through `docs/2026-08-*`** wholesale and fix `docs/README.md` so the index warns on stale entries. 58 of 248 files already carry a staleness banner. | report 06 §1, §2 | M |
| 3.2 | **Establish one entry point** for current truth and demote the other two "start here" pointers. | report 06 §2 | S |
| 3.3 | **Require ADRs in `apps/docs/docs/decisions/`** and back-fill the post-2026-09-14 decisions (audience/experience, order operations, inventory transactional locking). Reconcile the three `proposed` ADRs. | report 02 D15, report 06 §4 | M |
| 3.4 | Correct `docs/2026-07-04/ARCHITECTURE_DECISIONS.md` or retire it: it is wrong about packages (2 vs 12), domains (9 vs 17), rendering, the event bus, and the documents tables. | report 06 §3 | M |
| 3.5 | Bring `apps/docs` into the pnpm workspace and into the Biome `includes`. | report 06 §4 | S |
| 3.6 | Clean `apps/docs/.docusaurus` (16 decision artifacts for 11 ADRs) and gitignore it. | report 06 §1 | S |
| 3.7 | Delete or complete `packages/cli` (42 lines, referenced nowhere) and `packages/fixtures`' empty root. | report 03 §9 | S |
| 3.8 | Register `skills/` from the README so the ADRs and the UI skill are discoverable; fix the stale `Pressable` reference. | report 06 §8 | S |
| 3.9 | Split the largest files: `AudiencesAdmin.tsx` 865, `RichTextTipTapEditor.tsx` 678, `admin/schemas/components.ts` 647, `EditorCanvas.tsx` 555. | report 06 §10 | L |
| 3.10 | Add tests to `packages/browser-sdk` (15 source files, 0 tests) and to the commerce extension UI (838/520/496-line files untested). | report 03 §3, report 06 §7 | L |
| 3.11 | **Fix the entry README's wrong facts**, then add a docs test that derives them from code: domains 9→17, packages 5→12, infra services 6→13 (Keto missing), ClickHouse port 9000→9001, the dangling "step 7" reference (`README.md:39`), and the missing host-entry/hosts-file prerequisite. | report 06 §3, §9 | M |
| 3.12 | Delete or redirect `scripts/README.md` (documents a `scripts/seed/` tree that does not exist), remove `docs/aiagents.md` (a 7-line job ad), and make `skills/noname-dev/verify.sh` assert and exit non-zero instead of printing `PASS` for checks it cannot perform (lines 32-45, hardcoded org id at line 20). | report 06 §8, §3 | S |
| 3.13 | Collapse the duplicate skill trees — `skills/noname-dev` (98 lines) vs tracked `.dsh/skills/noname-dev` (171 lines, divergent), with `noname-test` existing only in `.dsh` — and list every skill in `skills/README.md`. | report 06 §8 | S |

---

## Phase 4 — Architectural revisions worth considering

These are genuine design changes, not debt. Each should become an ADR before implementation.

| # | Proposal | Rationale | Effort |
|---|---|---|---|
| 4.1 | **Fix Module Federation version skew structurally.** Generate shared-dependency versions from one source used by both `tenant/adapters/bundler.ts:53-60` and `packages/client/package.json`, and fail the tenant build when they diverge. Today tenant bundles pin 0.19 while the host runs 0.20 with `singleton: true`. | report 05 §14 #14 — production-only, tenant-specific breakage | M |
| 4.2 | **Make the tenant component isolation model honest.** The current model is a regex denylist over 100 KB of source (`bundler.ts:11-17`), not a sandbox. Either state that trust model in ADR-0012 or move tenant components into a Worker/iframe boundary. | report 02 D12 | L |
| 4.3 | **Extract a separate worker/build process.** `RUN_WORKERS` currently means one process hosts HTTP + 7 BullMQ workers + rspack build CPU on one event loop and one 10-connection pool. Split `createWorkers()` from `createRoutes()`. | report 05 §3, report 02 D1 | L |
| 4.4 | **Record the layout reconciliation invariant.** Two sources of truth exist (Postgres `documents` vs the Automerge chunk store); CRDT handles multi-editor conflicts while publish reads the relational row, and nothing documents who wins. | report 02 D11 | S |
| 4.5 | **Decide the anonymous-personalization boundary.** `audienceExperienceDecisions.verifiedUserId` is `notNull`, so signed-out visitors — the largest cohort — can never be targeted. Either publish anonymous-subject semantics or record this as a deliberate product boundary. | report 02 D14 | S |
| 4.6 | **Stop documenting "adding a flow = adding JSON".** The true contract is *JSON machine definition + a registered TypeScript capability handler*. Publishing the real contract prevents a repeat of the current mismatch. | report 02 D4 | S |
| 4.7 | **Extract HMAC signing/verification into `@noname/auth`.** The one contract both runtimes must agree on byte-for-byte is currently the one thing not shared; it is pinned only by a test and duplicated in two server files. | report 03 §6 | S |
| 4.8 | **Add signed timestamps/nonce and key ids to the HMAC payload** so headers cannot be replayed indefinitely and secrets can be rotated without a lockstep redeploy. | report 02 D3 | M |
| 4.9 | **Consolidate cross-boundary duplicated commerce logic** — the 10 duplicates in report 03 §7, starting with the cart-total divergence (server integer minor units vs client float major units). | report 03 §7 | M |
| 4.10 | **Decide the fate of the `x-role` HMAC claim.** The edge signs `orgId:userId:role` on every request (`workers/src/hmac.ts:27,38`), but `getRole(c)` is consumed **nowhere** in production — only in `hmac.contract.test.ts`. Authorization comes from the JWT's role claims. Either use it or drop it from the payload; a signed-but-unused claim invites someone to rely on it later, and it is a lossy *primary* role only. | verified 2026-10-10 | S |
| 4.11 | **Consider replacing JWT-as-identity with a server-minted signed session token** (`userId + permissions[] + orgId + exp + iat`, HMAC-signed) — the pattern already exists in `shared/agent-token.ts:6-66`. This is the only option that removes the edge+origin double verification while *strengthening* the model: the origin verifies one signature and never parses a JWT. It also lets `WORKER_SERVER_SECRET` be split from the SSE/collab ticket secrets, which currently share one key across three trust boundaries. Requires an ADR; not a Phase 0/1 item. | report 05 §8; `agent-token.ts` | L |
| 4.12 | **Drop or implement the residual `urn:zitadel:iam:org:projects:roles` wildcard claim** in `packages/auth/src/jwt/roles.ts:47-52`. It is no longer exploitable now that the origin verifies signatures, but it remains an unscoped privilege path (any project's roles are accepted when `projectId` is unset). | report 05 §7.3 | S |

---

## Suggested sequencing

```text
Week 1        Phase 0 complete (0.1 → 0.10)          ← security + correctness
Week 2-3      Phase 1 complete (1.1 → 1.9)          ← enforcement; CI is the keystone
Week 4-6      Phase 2A + 2B (boundaries + UI skill) ← the violations CI now catches
Week 7-10     Phase 2C (durability + data)          ← the scale work
Week 11-12    Phase 3 (docs + structure)
Ongoing       Phase 4 (design revisions, one ADR at a time)
```

**Two rules for the whole plan:**

1. **Do not add a new architectural rule until Phase 1 lands.** Every rule added before there is enforcement becomes another document that drifts.
2. **When a decision changes, change the ADR in the same PR.** The two abandoned decisions in report 02 (D5, D6) were both deliberate improvements that were never written back — and that single habit is responsible for most of the documentation drift found in report 06.

---

## What is already good (do not rebuild)

Worth stating explicitly, so remediation does not erase working design:

- The **spec-driven UI pipeline** is real and used for every org-facing surface. No react-router, no `pages/` tree.
- The **flat-props migration genuinely completed** — zero live `config`/`labels` reads.
- The **editor → admin import boundary is clean** (zero violations), and the editor exception is a defensible, documented choice.
- The **Evidence kernel**, the **documents type registry**, and the **audience/experience replacement of `contextHash`** are well-designed and were executed to their recorded decisions.
- The **edge worker has no database access** and uses only WebCrypto — the boundary holds.
- **`packages/documents`, `packages/auth`, and `packages/shared` are genuinely pure** and safe for all consumers.
- The **`spec-driven-ui` skill is the best architectural document in the repository** — precise, honest about its own gaps, and correct.
- The **test suite (150 files) is real**, and the documented "tests import seeds" problem is genuinely fixed.
