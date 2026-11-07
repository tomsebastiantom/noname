# Release mechanism verification log

> Evidence for the release mechanism blocks (D14, D16, D15, D1, D2). Design lives in
> [`RELEASE-D14-DESIGN.md`](./RELEASE-D14-DESIGN.md) and the decisions in
> [`PENDING-DECISIONS.md`](./PENDING-DECISIONS.md). The eval-service log is separate:
> [`VERIFICATION-LOG.md`](./VERIFICATION-LOG.md).

## 2026-11-07 — D14: release record and artifact binding

**Scope.** Give a release a durable identity: one row binding platform version, checks version and digest-bound
artifacts (client bundle, server image, worker image, migration set, config). No pointer, no selector, no
promotion — those are later blocks.

**Code.** `domains/release/{schema,ports,validation,service,api,index}` + `adapters/postgres.ts`;
`drizzle/0001_low_alex_wilder.sql`; `RELEASES_READ` / `RELEASES_WRITE` in `@noname/auth`; route registration in
`bootstrap.ts`.

### Verification

| Check | Command | Observed |
|---|---|---|
| Types | `pnpm --filter @noname/server typecheck` | clean |
| Unit | `pnpm vitest run packages/server/src/domains/release` | **7/7 passed** |
| Full suite | `pnpm vitest run packages/server` | **595/595 passed**, 136 files |
| Migration | `pnpm --filter @noname/server db:migrate` | applied; `releases`, `release_artifacts` exist |
| Create | `POST /api/releases` (service token, `releases:write`) | **201**, `building`, 3 artifacts |
| Ready | `POST /api/releases/:id/ready` | **200**, `ready` |
| Read | `GET /api/releases/:id` | **200**, `ready` |
| List | `GET /api/releases` | **200**, 1 release |
| Bad digest | create with `digest: "short"` | **400** |
| Double ready | second `:id/ready` | **409** |
| DB row | `psql … from releases` | `ready \| v12 \| 9f2a1c \| 3 artifacts` |
| Artifacts | `psql … from release_artifacts` | `client_bundle`, `server_image`, `migration_set` with digests |
| Dependency direction | grep imports in `domains/release` | none from tenant/eval/gate |

**Operational note.** Adding the domain changed `bootstrap.ts`; `tsx watch` reloaded a build before the import
line was complete and the process died. A restart fixed it; no code issue. Recorded so the next person does not
read the crash as a domain bug.

**Limits recorded.**

- Release management is admin-only (`admin` gets all permissions); there is no `release_manager` role yet.
- The record is immutable except `state`; artifacts cannot be edited after creation.
- A release can be `ready` with only one artifact — the *required set* per change class is a D15/gate policy, not
  a D14 invariant.
- No Evidence row on creation yet; promotion/rollback records are part of the next block.

## 2026-11-07 — D2: definition versions and instance pinning

**Scope.** An instance must keep the definition version it started on. Chosen option A (append-only versions +
pinned instance). Design: [`RELEASE-D2-DESIGN.md`](./RELEASE-D2-DESIGN.md).

**Code.** `domains/machines/schema.ts` (`version`, `definition_version`, `machine_definition_versions`),
`ports.ts`, `engine.ts`, `adapters/postgres.ts`, `drizzle/0002_freezing_invaders.sql`,
`engine-versioning.test.ts`.

### Verification

| Check | Command | Observed |
|---|---|---|
| Types | `pnpm --filter @noname/server typecheck` | clean |
| Unit | `pnpm vitest run packages/server/src/domains/machines` | **25/25** (including 1 new pinning test) |
| Migration | `pnpm --filter @noname/server db:migrate` | applied; columns/table present |
| Backfill | `psql … from machine_definition_versions` | `cart\|1`, `inventory_reservation\|1` |
| E2E — pin | define v1, start, define v2 | old instance `definitionVersion=1`; new `2` |
| E2E — reject | old instance + `v2only` (v2-only event) | **400** |
| E2E — accept | new instance + `v2only` | **200**, state `done` |
| E2E — old rules | old instance + `advance` | **200**, state `done` |
| Eval M4 | `noname eval --tenant yogastore --token …` | `M4.machines` **pass** (cart 9 states, inventory 5) |
| Cleanup | SQL delete by machine name | 0 leftovers |

**Limits.** No version-listing UI yet; legacy instances fall back to the current definition until the next save;
no definition-rollback endpoint (the correct action is a new version); simultaneous saves can race on
`nextVersion` (unique index makes one insert lose; definitions are low-frequency).

## 2026-11-07 — D16: migration policy (expand / contract)

**Scope.** Make a release’s migration set classifiable, and make a destructive change fail the check by default.
No migrations are written or applied by this block.

**Code.** `domains/release/migrations/classify.ts` (pure classifier), its 15 tests,
`scripts/classify-migrations.ts` (CLI), `migrations:classify` script.

### Verification

| Check | Command | Observed |
|---|---|---|
| Types | `pnpm --filter @noname/server typecheck` | clean |
| Unit | `pnpm vitest run packages/server/src/domains/release` | **22/22** (15 classifier + 7 service) |
| Real migrations | `pnpm migrations:classify` | **137 statements, 0 destructive → PROMOTABLE**, exit 0 |
| Backfill recognition | real `0002_freezing_invaders.sql` | `INSERT … SELECT` → `backfill` |
| Destructive block | temp fixture `ALTER TABLE … DROP COLUMN` + `--block-destructive` | **BLOCKED**, exit **1** |
| JSON | `--json` on `0001_low_alex_wilder.sql` | `{"promotable":true,"destructive":0}` |
| Unknown is not a pass | `COMMENT ON …` | `unknown` |

**Limits recorded.** Dynamic SQL inside functions is `unknown`, not destructive; `--block-destructive` is a CLI
exit code until the gate consumes it (D15); a contract release needs an explicit marker in the gate, which is a
later refinement.

## 2026-11-07 — D15: environment selector (preview + blue/green control plane)

**Scope.** Own which release each environment serves: active/previous per environment, preview activation,
blue/green switch, one-row rollback, one Evidence record per real move. No pods or ingress are touched.

**Code.** `release_environments` table, `environment-service.ts`, Postgres environment store, four routes,
8 tests, migration `0003_premium_green_goblin.sql`.

### Verification

| Check | Command | Observed |
|---|---|---|
| Types | `pnpm --filter @noname/server typecheck` | clean |
| Unit | `pnpm vitest run packages/server/src/domains/release` | **30/30** (8 environment + 7 release + 15 classifier) |
| Migration | `db:migrate` | `release_environments` exists |
| Activate A | `POST /api/releases/:id/activate {production}` | **200**, active A |
| Activate B | same | **200**, active B, previous A |
| List | `GET /api/releases/environments` | `production: B/A` |
| Rollback | `POST /api/releases/environments/production/rollback` | **200**, active A, previous B |
| Preview | `POST /api/releases/:id/preview` | **200**, preview B; production unchanged |
| Not ready | activate a `building` release | **409**, no Evidence |
| Evidence | `platform.release.switched` | 3 production moves + 1 preview, each with from/to/rollback |
| DB | `release_environments` | `preview: B`, `production: A/B` |

**Limits recorded.** Control plane only: deployment must read `active_release_id`; no ingress switch, no metrics
auto-halt, no percentage canary, no per-tenant server versions. Activation does not yet refuse a destructive
migration set — the D16 classifier is ready to become a precondition.

## 2026-11-07 — D1 C1: tenant release pointer and catalog projection

**Scope.** Which client bundle a tenant loads: a pointer row per org, promote/rollback, and a catalog projection
that returns the pointed release’s bundle URL. No waves, no UI, no caching change.

**Code.** `tenant_release_pointers` table, `pointer-service.ts`, Postgres pointer store, three routes,
`ClientBundleResolver` in the tenant catalog, migration `0004_high_doctor_octopus.sql`, 7 tests.

### Verification

| Check | Command | Observed |
|---|---|---|
| Types | `pnpm --filter @noname/server typecheck` | clean |
| Unit | `pnpm vitest run packages/server/src/domains/release` | **37/37** (7 pointer + 8 environment + 7 release + 15 classifier) |
| Full suite | `pnpm vitest run packages/server` | **626/626**, 140 files |
| Promote | `POST /api/releases/:id/promote` | **200**, pointer active |
| Catalog | `GET /api/tenants/yogastore/catalog` | `private.url` = `…/releases/r2/remoteEntry.js` |
| Rollback | `POST /api/releases/pointer/rollback` | **200**, active/previous swapped |
| Catalog back | same endpoint | `…/releases/r1/remoteEntry.js` |
| Not ready | promote a `building` release | **409**, no pointer |
| Fallback | delete pointer, fetch catalog | stored manifest unchanged (no `private`) |
| Evidence | `platform.release.tenant_promoted` | promote/rollback rows with from/to/rollback |
| Dependency | grep `domains/release` imports | none from tenant/eval/gate |

**Limits recorded.** Tenant-at-a-time promotion; waves/UI next; catalog still reads the manifest store and the
pointer per request; promotion does not require a `client_bundle` artifact yet (falls back instead); direct
catalog calls need the edge HMAC, so e2e used the same headers as the edge.

## 2026-11-07 — D1 continuation: cache key, promotion gate, retention

**Scope.** Three follow-ups to the pointer: make the client cache release-aware, refuse a destructive migration
set at promotion, and bound release growth.

**Code.** `catalog-loader.ts` (version in cache key, `number | string`), `migration-policy.ts` + tests,
`pointer-service`/`environment-service` call the assertion, `retention.ts` + `POST /api/releases/prune`,
`ReleaseStore.delete`.

### Verification

| Check | Command | Observed |
|---|---|---|
| Unit | `pnpm vitest run packages/server/src/domains/release` | **44/44** (7 pointer + 8 environment + 7 release + 15 classifier + 4 migration policy + 3 retention) |
| Full suite | `pnpm vitest run packages/server` | **633/633**, 142 files |
| Types | server + client | clean |
| Destructive promote | release with `migration_set` → temp `DROP COLUMN` file | **409**, details `["DROP COLUMN"]` |
| Additive promote | release with `ADD COLUMN` file | **200** |
| Prune | `POST /api/releases/prune {keep:2}` | **200**, deleted 4 |
| Protected | pointer release after prune | survives; catalog still projects it |
| Cache key | client `manifestCacheKey` | includes `private.version` (release id) |

**Limits recorded.** Unresolvable `migration_set` refs are not blocked (the classifier cannot see SQL); R2 objects
are not deleted by prune; promotion waves and the release admin UI are deferred — waves need a platform-operator
identity (cross-org escalation risk), and the app has no release admin surface yet.

## Next blocks

1. **Promotion waves** — requires a platform-admin role/permission first.
2. **Release admin UI** — tenant list, pointer history, promote/rollback buttons.
3. **R2 retention/GC** — object lifecycle for bundles whose release rows were pruned.
4. Gate wiring: classify the `migration_set` artifact at release creation rather than only at promotion.

