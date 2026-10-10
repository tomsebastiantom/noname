# 06 — Maintainability, Documentation & Developer Experience

**Question answered:** what does a new contributor hit, what is objectively rotted, and what is missing that would have prevented the drift the other reports describe?

Counts in this report are from the git index and direct file inspection (938 tracked `.ts`/`.tsx` files under `packages/`, 167 tracked test files).

---

## 1. Documentation inventory

| Measure | Value |
|---|---|
| Markdown files under `docs/` | **248** (excluding `docs/archive/`); 255 counting the 7 files this audit added |
| Dated documentation directories | **30** (`2026-05-23` … `2026-10-10`) |
| Files carrying the exact `Stale-needs-correction` banner | **59** |
| Files carrying **any** staleness vocabulary (stale / superseded / historical / not current status / obsolete / not authoritative) | **163 of 248 — 64%** |
| Files with no staleness vocabulary at all | 65 |
| Links in `docs/README.md` | **27** — an index coverage of **~11%** |
| ADR files in `docs/` | **0** |
| ADR files in `apps/docs/docs/decisions/` | **11** (ADR-0001 … ADR-0011) |
| Docusaurus source pages | **55 content pages** (+README = 59 md) |
| ADR build artifacts in `apps/docs/.docusaurus/` | **16 decision doctypes for 11 ADRs** |

The largest dated directories are `2026-07-25` (33 files), `2026-08-06` (22), `2026-09-14` (16), `2026-08-03` (14), `2026-08-04` (13).

**63% of the documentation corpus is self-declared stale.** The 2026-09-14 audit fleet (`AUDIT-ROADMAP-ADMIN`, `AUDIT-EARLY-FOUNDATIONS`, `AUDIT-RECENT-IMPLEMENTATION`, `AUDIT-COLLAB-ARCHITECTURE`, …) is genuinely useful work, but it deliberately annotates rather than retires — so the stale documents remain, each carrying a banner that the index does not surface.

The build-artifact row is a real signal: `apps/docs/.docusaurus/` contains two `ADR-0001`s (`domain-vs-extension` and `platform-as-contract`), two `ADR-0002`s, two `ADR-0005`s, two `ADR-0006`s, and two `ADR-0007`s — **stale artifacts from an ADR renumbering that was never cleaned**. Numbering churn is visible to anyone who greps the build output, which undermines the registry's authority.

---

## 2. The "single source of truth" problem

`docs/README.md` names **three** authorities with no precedence rule:

- `:5` — `docs/2026-09-14/AUTHORITATIVE-ROADMAP-CURRENT.md`, "**Read this first.**"
- `:4` — the new Docusaurus site, `apps/docs`
- `:7` — `docs/2026-09-26/PERSONALIZATION-IMPLEMENTATION-PLAN.md`, "**Authoritative** implementation and verification plan"

Is the "authoritative" roadmap still authoritative? **Stale in place, not superseded.** It self-reports a 2026-10-03 update (`:4`) with inline 2026-10-03/10-04 patches (`:19,:21,:301`). But it is contradicted by its own successors and by merged code:

| Roadmap claim | Reality |
|---|---|
| `:245-252` "Orders admin is read-only. Deferred: Cancellation, Refund actions, … Inventory reservation/decrement, Customer order history" | refund (`bd36bd1`), inventory reserve/release + customer history (`afce2b8`), live verification (`a14e12b`) are merged, with plans in `docs/2026-10-08/` |
| `:107-119` edge personalization "verified" | `packages/workers/src/renderer.ts:1` is a 3-line stub stating the request-signal path "was removed"; `POST /api/edge/personalize` does not exist |

**ADR governance gap.** 11 numbered ADRs exist — all in `apps/docs/docs/decisions/`, all stamped `last_verified: 2026-09-14`, none verified since. Meanwhile later decisions were filed as *dated* documents that are unnumbered and unlinked from the registry: `docs/2026-10-08/INVENTORY-TRANSACTIONAL-LOCK-ADR.md`, and four `docs/2026-09-09/DECISION-*.md` files. Nothing states where a decision must live.

**The worst instance of the discoverability trap:** `docs/README.md:31` lists `docs/2026-07-04/ARCHITECTURE_DECISIONS.md` under "Architecture & Technical" with **no warning**, while that file's line 3 is the `Stale-needs-correction` banner. The most discoverable architecture document is the least trustworthy one, and the index hides that fact.

---

## 3. Contradictions between documents (verified)

In **every** case below the code is right and the document is wrong.

| Claim A | Claim B / code | Verdict |
|---|---|---|
| `README.md:131,208` "9 DDD domains" (repeated 7× across docs) | **17** directories in `packages/server/src/domains/` | Code wins |
| `ARCHITECTURE_DECISIONS.md:208` "Two packages: server + cli" | **12** packages + `apps/docs` | Stale |
| `ARCHITECTURE_DECISIONS.md:42-43` "React … not on the API server" | `notifications/email-template.ts:2` imports `@json-render/react-email`; `tenant/adapters/bundler.ts:5-6` imports rspack/`ModuleFederationPlugin` | Stale |
| `ARCHITECTURE_DECISIONS.md:94` "`content_entries` + `layouts` tables" | `documents/schema.ts:15-30` — one `documents` table + type registry | Stale; the merge lives only in a code comment |
| `ARCHITECTURE_DECISIONS.md:206` "In-memory event bus for Phase 0" | `shared/event-bus.ts:1-2,28-55` — Redis pub/sub fan-out | Stale |
| `README.md:121` ClickHouse "8123/**9000**" | `docker-compose.yml:38` maps `9001:9000`; **9000 is the S3 emulator** (`:146`) | README wrong |
| `README.md:27` infra = 6 services (Postgres, Redis, ClickHouse, ZITADEL, S3, Jaeger) | compose defines **13**; **Keto is omitted** even though `.env.example:30` says it must run and `skills/noname-dev/verify.sh:13` health-checks it | README incomplete |
| `README.md:39` "requires API running — do step 7 terminal 1 first" | the One-time setup list ends at step 6; no step 7 exists | Dangling reference |
| `README.md:68` "`zitadel_keys/` … will break `init:zitadel` if left behind" | `README.md:20,:75,:81` — "script refreshes automatically" | Two mutually exclusive remedies |
| `scripts/README.md` documents `scripts/seed/{demo,demo-commerce,demo-users,keto-tuples}.ts` | `scripts/seed/` does not exist; seeding lives in `packages/seeding` | Stale |
| `FLAT_PROPS_MIGRATION.md:41` "`scripts/seed/demo-specs.ts`" | same missing directory | Stale |
| `docs/2026-09-12/EDGE-PERSONALIZATION-IMPLEMENTATION.md:16` "bot requests call `POST /api/edge/personalize`" | `workers/src/renderer.ts` stub; zero `personalize` hits in workers/server | Stale |
| `FLAT_PROPS_MIGRATION.md:18` "fixed LoginForm `providerList`" | renderer fixed; seed still passes `providers: ["google"]` (`demo-specs.ts:53`) vs reader `providerList` (`LoginForm.tsx:52,78`) | Partially fixed |
| `docs/2026-08-07/MAINTAINABILITY.md:113` "no typecheck/lint/test; unused chalk" | `packages/cli/package.json:12-18` has typecheck; root has all three | Stale |

Note the direction of every error: the documents are not a design record that drifted from an ideal — they are a record that was **never reconciled after deliberate changes**.

---

## 4. `apps/docs` (Docusaurus) reality

**It is real and well-built, not a scaffold.**

```text
architecture/  (13)   concepts/ (13)   decisions/ (11 ADRs)
get-started/   (3)    how-to/   (2)    operations/ (4)
reference/     (8)    history/  (3)    + index
```

`sidebars.ts` declares 55 ids and **all 55 resolve** — no broken sidebar. `docusaurus.config.ts` sets `onBrokenLinks: "throw"`, and all footer targets exist. Content quality is materially better than `docs/`: `architecture/package-boundaries.md`, `data-flow.md`, and `control-planes.md` are coherent and internally consistent, and the ADRs are short, well-typed (`status`, `owner`, `recorded`, `last_verified`, `source_documents`, `implementation_evidence`).

Findings:

- **Every ADR carries `last_verified: 2026-09-14`** — no verification since, despite substantial 2026-09-26 and 2026-10 work.
- **Three ADRs remain `status: proposed`** (ADR-0002, ADR-0003, ADR-0008) with the work partly built. ADR-0008 states its own revisit condition — "Accept this ADR only after the review workflow, permissions, audit trail, and rollback behavior are implemented and verified" — and the loop is implemented but has not been re-decided.
- **`apps/docs` is outside the pnpm workspace** (`pnpm-workspace.yaml` lists only `packages/*`), so it has its own lockfile and is never installed by root `pnpm install`. Consequence: `pnpm docs:dev` **fails on a fresh clone** until `pnpm install --ignore-workspace` is run inside `apps/docs` — documented only in `apps/docs/README.md`, not in `docs/README.md:4`, which is the file that tells you to run it.
- **Port collision:** `--ignore-workspace start` runs `docusaurus start`, which defaults to **port 3000** — the same port as `pnpm dev` (the API). Nothing declares this.
- **`apps/docs` is not linted by the root gate.** `biome.json` `files.includes` is `["packages/**/*.{ts,tsx,js,jsx,json}"]`, so `scripts/`, `apps/docs/`, `skills/`, and root configs are never linted. `apps/docs/package.json` declares its own `lint: biome lint` but has no local biome config.
- Root `README.md` never mentions `docs:dev` or `apps/docs` (0 hits), so the two documentation entry points do not reference each other.
- `apps/docs/.docusaurus/` and `build/` are gitignored but present (last build 2026-10-03), carrying the stale ADR numbering artifacts from §1.
- Corrected earlier suspicion: `--ignore-workspace start` is **not** a bug — `--ignore-workspace` is a genuine pnpm option and `start` is the correct Docusaurus dev command.

---

## 5. Repository hygiene

**Tracked files that should not be tracked:**

| Path | Status | Issue |
|---|---|---|
| `packages/workers/.dev.vars` | **tracked, in HEAD** (blob `ee47970`, commit `147b900`) | Contains a **real 32-char `WORKER_SERVER_SECRET`** — the entire edge→origin HMAC trust boundary. See report 05 §8. |
| `docs/2026-07-13/AUTH.md` lines 72, 81, 112 | tracked | Prints the same real secret value in a code block. |
| `.dsh/skills/noname-dev/SKILL.md`, `.dsh/skills/noname-test/SKILL.md` | tracked | Agent-harness state committed as source, in a directory that is **not** in `.gitignore`. |
| `kilo.json` | tracked | Editor config containing an absolute machine path (`C:\Workspace\noname\node_modules\@playwright\mcp\cli.js`). |

**Untracked but unignored (staging risk):**

| Path | Size | Issue |
|---|---|---|
| `.kilo/` | **~12 MB, 2472 files** | **Not gitignored**, and contains **two full repo worktrees including 3 copies of `.env` / `.dev.vars`** (`.kilo/worktrees/*/.env`, `.kilo/worktrees/*/packages/workers/.dev.vars`). Git currently skips it because the worktrees carry their own `.git` markers — but that is incidental protection, not intent. Combined with §5 row 1, this is a second path by which the leaked secret can be revived. |

**Untracked and correctly ignored (but noisy at the root):**

- `key` — a 102-line scratch file whose first line is `const key='<74-char token>'`, followed by an OpenRouter `fetch(… Authorization: Bearer …)` script. It **is** gitignored (`.gitignore:85`) and untracked, so this is a hygiene issue rather than a leak — but a live-looking credential sitting at the repo root invites accidental commits. Remove and rotate.
- `commerce-console.log`, `console-*-20261003.log` (5), `stripe_events.log`, `stripe_events_final.log` — all `*.log`, all ignored; **two contain `sk_live`/`sk_test`/`whsec_`/`Bearer` pattern matches**.
- `tsconfig.tsbuildinfo` (ignored; the `*.tsbuildinfo` rule is duplicated at `.gitignore:11` and `:61`), `.tools/` (120 MB), `.playwright-mcp/` (28 MB) — correctly ignored.

**Uncommitted work in the tree:** `git status --short` reports ` D temp_inventory_fixture.sql` — a tracked file deleted in the worktree whose deletion was never committed.

**Misfiled document:** `docs/aiagents.md` is **7 lines of R&D job-requirement text** (Rust/Tokio/PyO3/OpenTelemetry wishlist) sitting in the documentation tree.

---

## 6. Configuration drift

| Measure | Value |
|---|---|
| Distinct `process.env.*` variables read across `packages/*/src`, `scripts`, `config` | **99** |
| Active keys in root `.env.example` | 25 |
| Active keys in `packages/server/.env.example` | 12 |
| Keys in `packages/workers/.dev.vars` | 1 (**tracked**) |
| Variables read by code and documented nowhere | **~66** |
| (Scoped to `packages/server/src` + `packages/workers/src` only) | 66 read → 42 undocumented |

**`cp .env.example .env` does not produce a working config** (`README.md:23`). Five keys exist only in `.env` (`OPENAI_BASE_URL`, `MASTRA_PLANNER_MODEL`, `MASTRA_ORCHESTRATE_MOCK`, `ZITADEL_PROJECT_ID`, `COMMERCE_BACKEND_URL`) and three only in `.env.example` (`ZITADEL_GOOGLE_IDP_ID`, `NANGO_ENCRYPTION_KEY`, `NANGO_HOST`).

Highest-impact undocumented variables: `ZITADEL_PROJECT_ID`, `ZITADEL_MACHINE_KEY_PATH` / `_JSON`, `ZITADEL_LOGIN_CLIENT_PAT`; `PORT`, `CLIENT_DEV_PORT`, `API_BASE`, `STORE_PUBLIC_BASE_URL` / `_ORIGIN`, `STORE_SLUG`, `ASSET_PUBLIC_BASE_URL`; `CLICKHOUSE_USER` / `_PASSWORD` / `_DB`, `OTEL_*` ×3, `JAEGER_QUERY_URL`; `MANIFEST_STORE`, `RUN_WORKERS`, `TEST_WORKER_CONCURRENCY`, `SECRETS_LLM_CACHE_TTL_SEC`, `AGENT_MAX_STEPS`, `AGENT_ORCHESTRATE_ENABLED`; nine notification-provider secrets (SendGrid/Mailgun/Postmark/Brevo/Resend/Twilio); `NANGO_ADMIN_*` ×3, `EXTENSION_DISPATCH_SECRET`, `COMMERCE_BACKEND_URL`, `ENV_FILE`, `DEPLOY_R2_LOCAL`; ~14 `ZITADEL_DEMO_*` pairs.

Combined with **zero boot-time env validation** (report 05 §12), a production deployment missing `REDIS_URL` silently connects to localhost, and several webhook signing secrets silently fall back to dev behaviour.

---

## 7. Quality gates and CI

| Gate | State |
|---|---|
| `pnpm lint` / `format` / `check` (Biome, recommended preset) | Exists; `noExplicitAny: off` (`biome.json:26`); covers `packages/**` only — `scripts/`, `apps/docs/`, `skills/` never linted |
| `pnpm -r typecheck` | Exists; packages only (root `tsconfig.json` includes `scripts/**/*.ts` with no project references) |
| `pnpm test` | **167 tracked test files**; currently clean for the client (`tsc --noEmit` exit 0) |
| Coverage | Reporters configured, **no thresholds**; `coverage.include` = `./packages/server/src/**/*.ts` only → **11 of 12 packages report nothing** |
| Architecture / boundary tests | **none** |
| Convention tests (flat props, no-fetch-in-catalog, registry parity) | **none** — flat props is asserted once manually in `extensions/src/commerce/catalog-schemas.test.ts`; "no fetch in catalog components" is enforced nowhere |
| Boot-time env validation | **none** |
| CI (GitHub Actions / GitLab / CircleCI / Azure / Travis / Woodpecker / Jenkins / husky) | **NONE — no CI of any kind** |

A scan of test files for `readdirSync|readFileSync|import.meta.url|architecture|boundary|conformance` matches only two unrelated suites (`flags/evaluate-context.test.ts`, `machines/routes/instances.test.ts`).

**The absence of CI is the highest-leverage finding in this report.** Lint, typecheck, and 167 test files exist and work; nothing runs them automatically. Every violation documented in reports 03 and 04 reached `main` because no gate was in the path.

---

## 8. Skills

`skills/` = README + `noname-dev/` (SKILL.md 98 lines, reference.md, verify.sh) + `spec-driven-ui/` (SKILL.md, props-contract.md, reference.md, examples.md).

Findings:

1. **Duplicate, divergent skill trees.** A second tracked copy lives in `.dsh/skills/` (`noname-dev`, `noname-test`). The two `noname-dev` copies **disagree**: `.dsh` is 171 lines and adds a "kill node processes on 3000/8787/5173" step plus keto/vault/nango health checks; `skills/` is 98 lines and starts at `podman compose down -v`. `noname-test` exists **only** in `.dsh`.
2. **`skills/README.md` documents only `spec-driven-ui`** — `noname-dev` is invisible from its own README, and `.dsh/` is never mentioned.
3. **Nothing registers `skills/`.** Not referenced from root `README.md`, `docs/README.md`, `package.json`, or any config — discovery is entirely manual.
4. **Start-order contradiction.** `skills/noname-dev/SKILL.md:26-58` runs `init:zitadel` + `db:push` **before** starting the API and seeds last, while `README.md:39-52` requires the API running and orders API → edge → client first.
5. **`verify.sh` reports success it cannot verify.** It hardcodes a fallback org id (line 20) and prints `PASS` / `PASS (or WARN)` for the client, browser-MCP, and admin steps it cannot actually check (lines 32-45). It exits zero regardless.
6. **`skills/spec-driven-ui/SKILL.md:118`** lists `Pressable` as a primitive; it exists neither in the repo nor in `@json-render/shadcn@0.20.0`.
7. **Quality assessment:** `spec-driven-ui` is the **best-written architectural document in the repository** — precise, honest about its own gaps, and correct. It explicitly predicted its enforcement gap (`SKILL.md:78`, `:464`). Its problem is not quality; it is that nothing enforces it (report 04 §10).

---

## 9. Onboarding friction (README line-cited)

Walking `README.md:14-88` as written:

| # | Line | Problem |
|---|---|---|
| 1 | `:23-24` | `cp .env.example .env` is **incomplete by construction** (§6): ~66 read vars undocumented, and 3 example keys have no `.env` counterpart. |
| 2 | `:25` | Says `.dev.vars` "needs `WORKER_SERVER_SECRET` (same value as root `.env`)", but the **checked-in** file already holds a different real secret and is not gitignored → silent HMAC mismatch, or the reader re-introduces a secret into a tracked file. |
| 3 | `:27-28` | Infra list says 6 services; compose defines 13. Podman is the canonical command on a Docker-only machine. `nango` needs a `NANGO_ENCRYPTION_KEY` absent from the example. **Keto** is omitted entirely despite `.env.example:30` and `verify.sh:13` requiring it. |
| 4 | `:68` vs `:20,:75,:81` | Two mutually exclusive remedies for the same `zitadel_keys/` failure: "manually remove it" vs "the script auto-refreshes it". |
| 5 | `:39` | "Seed demo (requires API running — do step 7 terminal 1 first)" — the One-time list ends at step 6; no step 7 exists. |
| 6 | `:43-52,57` | Requires the hosts entry `yogastore.localhost`; only `skills/noname-dev/SKILL.md:48` and `verify.sh:33` mention editing `drivers\etc\hosts`. The README never does, so the printed URL fails to resolve. |
| 7 | `:121` | ClickHouse "9000" is the S3 emulator's port; the native port is published at 9001. |
| 8 | `:131,208` | "9 DDD domains" vs 17 actual — the reader's mental model of the server is wrong before their first test run. |
| 9 | `:137` | Points at `scripts/README.md`, which describes a `scripts/seed/` tree that does not exist. |
| 10 | `:181-189` | Lists lint/format/check/typecheck/test gates — **none of which run in CI**. |
| 11 | `:5-11` | Prerequisites omit **wrangler**, which `:45,:168` require on the host and which root `pnpm install` does not provide. |
| 12 | — | A `key` file containing a live-looking API credential sits at the repo root next to the README. |

`docs/README.md:4` adds a 13th: "Run `pnpm docs:dev`" needs a separate `--ignore-workspace` install and binds port 3000, colliding with the API. Root `README.md` never mentions the docs site at all.

**Net:** the quick-start is broadly accurate — better than most of the documentation — but it depends on a tracked secret file, contains a dangling step reference, and asserts counts that are wrong.

---

## 10. Structural / dead-code inventory

| Item | Size | Importers |
|---|---|---|
| `packages/client/src/catalog.ts` + `component-schemas.ts` + `components/index.tsx` | 375 lines | **0** (duplicates commerce `Hero`/`ProductCard`; contains `"Add to Cart"`) |
| 4 `@deprecated` re-export shims (`admin/layout-entries.ts`, `admin/content-entries.ts`, `editor/layout-entries.ts`, `editor/content-entries.ts`) | ~16 lines | 0 |
| `editor/collab/ws-bytes.ts` | 7 lines | 0 |
| `packages/cli` | 42 lines | 0 (not a root script, no dependents) |
| `packages/fixtures/src/index.ts` | `export {}` | 0 |
| `@noname/documents` subpath `"./richtext-html"` | — | 0 |
| `@noname/seeding` `exports` map | — | 0 (nothing imports the package) |
| `packages/verticals` → `@noname/server` dep + tsconfig alias | — | 0 (illegal *and* unused) |
| `packages/server/src/shared/tenant.ts` | ~55 lines | 0 in production (dead second HMAC verifier — report 05 §8) |

Largest source files (maintainability risk): `AudiencesAdmin.tsx` 865 lines, `RichTextTipTapEditor.tsx` 678, `admin/schemas/components.ts` 647, `EditorCanvas.tsx` 555, `editor/lib/spec-utils.ts` 437, `LayerTreePanel.tsx` 398, `PropsPanel.tsx` 392, `WebhookSubscriptionsAdmin.tsx` 367, `use-app-page-loader.ts` 366.

---

## 11. Top 14 maintainability issues, ranked

| # | Issue | Evidence | Fix |
|---|---|---|---|
| 1 | **No CI whatsoever** | no `.github/`, `.gitlab-ci.yml`, `.circleci`, `azure-pipelines.yml`, `.woodpecker.yml`, `Jenkinsfile`, husky/lefthook | One workflow: `pnpm install --frozen-lockfile && pnpm check && pnpm -r typecheck && pnpm test`. Nothing else here matters until this exists. |
| 2 | **Real secret tracked in git** | `packages/workers/.dev.vars` (commit `147b900`), `docs/2026-07-13/AUTH.md:72,81,112` | Rotate, remove, gitignore + `.dev.vars.example`, implement `SHARED-SECRET-STRATEGY.md`, purge history |
| 3 | **`.kilo/` is unignored and holds 3 copies of `.env`/`.dev.vars`** | 2472 files, ~12 MB, `git check-ignore` returns nothing | Add `.kilo/` to `.gitignore`; delete the worktrees |
| 4 | **No enforcement of any documented architectural rule** | reports 03 §11, 04 §10 | Add `architecture.test.ts` + `catalog-conventions.test.ts` (both fail today — that is the point) |
| 5 | **Env drift: 99 read / 25 documented / ~66 undocumented; template cannot boot** | §6 | Boot-time Zod schema + a test asserting every `process.env.*` key appears in a template; generate `.env.example` |
| 6 | **64% of docs bannered; index covers ~11% and hides the banner on the most discoverable architecture doc** | `docs/README.md:31` vs `ARCHITECTURE_DECISIONS.md:3` | Archive `docs/2026-05..08` wholesale; generate the index from frontmatter and surface status per link |
| 7 | **ADR registry stopped at 2026-09-14** | 11 ADRs, all `last_verified: 2026-09-14`; new ADRs filed in dated folders | Require ADRs in `apps/docs/docs/decisions/`; back-fill the 2026-09-26/10-* decisions |
| 8 | **Three competing "authoritative" docs with no precedence rule** | `docs/README.md:4,5,7` | One entry point; everything else links from it |
| 9 | **Verified-wrong numbers in the entry README** | domains 9→17, packages 5→12, ClickHouse 9000→9001, dangling "step 7", 6→13 services, Keto missing | Derive counts and ports from code in a docs test; fail on drift |
| 10 | **Duplicate divergent skill trees; `skills/` registered nowhere; `verify.sh` prints PASS for unperformed checks** | `.dsh/skills/noname-dev` 171 lines vs `skills/noname-dev` 98 lines | Single source under `skills/`; ignore `.dsh/`; make `verify.sh` assert and exit non-zero |
| 11 | **Coverage reported for 1 of 12 packages, no thresholds** | `vitest.config.ts` `coverage.include` | Widen to `packages/*/src`; set thresholds |
| 12 | **`apps/docs` outside the workspace, outside lint, colliding on port 3000** | `pnpm-workspace.yaml`, `biome.json` includes, Docusaurus default port | Add `apps/*` to the workspace and to biome `includes`; pin a distinct port |
| 13 | **375 lines of orphan duplicate catalog that looks canonical** | `client/src/catalog.ts` + 2 files; `ARCHITECTURE_DECISIONS.md:28` points at it | Delete; fix the doc pointer |
| 14 | **Repo-root scratch files and an uncommitted deletion** | `key` (live-looking credential), 7 `console-*.log`, `stripe_events*.log`, ` D temp_inventory_fixture.sql` | Delete; rotate; commit or revert the deletion |

**Honourable mentions:** `kilo.json` tracked with an absolute machine path; 16 ADR build artifacts for 11 ADRs; `docs/aiagents.md` is a 7-line job ad; `tsconfig.tsbuildinfo` ignore rule duplicated in `.gitignore`.

---

## 12. The common thread

Reports 01–05 all end at the same cause, and this report names it: **the project writes its rules down and then does not enforce them.**

The skill predicted this, the ADR registry has no update discipline, the quality gates exist but never run, `verify.sh` reports success it cannot verify, and the documentation of record has been wrong for months without anything noticing.

None of that is an architectural flaw. Every finding in this report is fixable with a CI file, two convention tests, a documentation archive, and a `.gitignore` edit — small, mechanical work with an outsized return.
