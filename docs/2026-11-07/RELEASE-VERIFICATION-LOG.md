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

## 2026-11-07 — D3: tenant channels

**Scope.** A channel is a tenant ring owned by the release context. Moving a ring is one row; the tenant pointer
stores a channel; the catalog resolves channel → release. Promote/rollback reuse the ready check, the D16
migration gate, and Evidence.

**Code.** `release/schema.ts` (`release_channels`, `tenant_release_pointers.channel`), `ports.ts`,
`adapters/postgres.ts` (`ChannelStore`, channel-aware pointer), `channel-service.ts`, `pointer-service.ts`
(resolve/assign/clear), `retention.ts` (protect ring + pin), `api.ts` (5 routes), `index.ts`, migration `0005`,
`channel-service.test.ts`, retention/pointer test updates.

### Verification

| Check | Command | Observed |
|---|---|---|
| Types | `pnpm --filter @noname/server typecheck` | clean |
| Release tests | `pnpm vitest run packages/server/src/domains/release` | **50/50** (channel service 5, retention 4) |
| Migration | `db:migrate` | `release_channels` + `tenant_release_pointers.channel` applied |
| Live — ring to r1 | `POST /channels/canary/activate` | 200; tenant assigned via `POST /pointer/channel`; catalog URL `…/releases/r_e2e_1/remoteEntry.js` |
| Live — move ring to r2 | same channel route | 200; catalog URL `…/r_e2e_2/…` **without touching the pointer** |
| Live — rollback ring | `POST /channels/canary/rollback` | 200; catalog URL back to `…/r_e2e_1/…` |
| DB | `release_channels` / `tenant_release_pointers` | `canary → r_e2e_1, previous r_e2e_2`; pointer `channel=canary` |
| Evidence | `platform.release.channel_moved` | 3 rows: r1, r1→r2, rollback r2→r1 |
| Retention — unit | new retention test | a channel-referenced release **and** the pointer pin are protected from `prune` |
| Retention — live | `POST /releases/prune {keep:1}` after the fix | **200**, deleted 3 old releases; channel/pointer rows and catalog `…/r_e2e_1/…` survived |

**Retention bug found and fixed.** The first live `prune` returned 500: a channel-set pointer still has a
`previousReleaseId`, and deleting that release violated a foreign key. Retention now protects both the pin
(`releaseId`, `previousReleaseId`) and the ring (active + previous); the unit test covers the combination, and
the live prune now returns 200 with the ring and pin intact.

**Limits.** No channel UI; a ring move is one write but the catalog re-reads the pointer per request (as D1); no
percentage traffic split — a request never sees two bundles.

## 2026-11-07 — release moves write audit, not business records

**Scope.** Fix the earlier mistake: pointer, environment and channel moves now write `evidence_audit_events` with a
structured actor and a `releaseId` reference; the release `evidence_records` write is removed.

**Code.** `audit-actor.ts`, `pointer-service.ts`, `environment-service.ts`, `channel-service.ts`, plus their tests.

### Verification

| Check | Command | Observed |
|---|---|---|
| Unit | `pnpm vitest run packages/server/src/domains/release` | **50/50** |
| Full suite | `pnpm vitest run packages/server` | **639/639**, 143 files |
| Typecheck | `pnpm --filter @noname/server typecheck` | clean |
| Promote | live promote of a new release | **200** |
| Records | `select count(*) from evidence_records where type like 'platform.release.%'` | **16 before, 16 after** (no new record) |
| Audit | `select count(*) from evidence_audit_events where action like 'platform.release.%'` | **0 before, 1 after** |
| Row shape | `action, actor_type, actor_id, subject_type, subject_id, metadata->>'from', metadata->>'to'` | `tenant_promoted \| user \| admin@… \| tenant.storefront \| <org> \| <from> \| <to>` |
| Rollback | `POST /api/releases/pointer/rollback` | `platform.release.tenant_rolled_back` row written |
| Historical | legacy rows | untouched; no backfill/delete |

**Limit recorded.** Actor type is `user`/`system` until the operator guard passes `service`; `requestId` waits for
the middleware. Both are the next block.

## 2026-11-07 — request id + tenant audit read

**Scope.** Every request gets an `x-request-id` (upstream id or UUID), services can read it through
AsyncLocalStorage, release audit rows carry it, and `/api/evidence/audit` requires `AUDIT_READ`.

**Code.** `shared/request-context.ts`, `shared/request-id.ts`, bootstrap middleware order, `AUDIT_READ`,
`evidence/routes.ts` `auditPermission`, release service metadata.

### Verification

| Check | Command | Observed |
|---|---|---|
| Unit | `pnpm vitest run …request-id.test.ts …release` | **54/54** |
| Full suite | `pnpm vitest run packages/server` | **643/643**, 144 files |
| Typecheck | `pnpm --filter @noname/server typecheck` | clean |
| Response header | promote with `x-request-id` | echoed `req-live-12345678` |
| Audit metadata | `evidence_audit_events.metadata->>'requestId'` | `req-live-12345678` |
| Audit read | `GET /api/evidence/audit` with `audit:read` | **200**, 3 rows |
| Missing permission | same route with `machines:read` | **403** |

**Limit recorded.** The audit route accepts an explicit machine `audit:read`; tenant admins get it through
`admin`. Access logs still do not exist, but the join key (`requestId`) is now present.

## 2026-11-07 — platform accounts provisioning

**Scope.** Create the platform org, platform project, `platform_operator` / `eval_operator` roles, and the
`release-operator` / `eval-runner` service accounts with keys and grants. Tenant project/roles untouched.

**Code.** `scripts/init/platform-accounts.ts`, `init:platform-accounts` script, env keys in `.env.example`.

### Verification

| Check | Result |
|---|---|
| First run | org, project, 2 roles, 2 accounts, 2 keys, 2 grants created |
| Second run | all reused/exists — **no duplicates** |
| Token exchange | both keys → `/oauth/v2/token` **200**, `sub` = service-account id |
| Grants | `ListUserGrants`: `platform_operator` and `eval_operator` on the platform project |
| Keys | `zitadel_keys/*.json`, mode 0600, gitignored |
| Role claim in token | **absent** — ZITADEL does not put machine-user project roles in the access token |

**Consequence recorded.** The step-3 guard must resolve roles **server-side** via `ListUserGrants` (filtered to
the platform project) and cache briefly; it cannot trust a role claim. See
[`PLATFORM-ACCOUNTS-PROVISIONING.md`](./PLATFORM-ACCOUNTS-PROVISIONING.md) §4.

## 2026-11-07 — operator guard + dry-run rollout

**Scope.** Enforce the platform-operator boundary and expose a dry-run rollout over an explicit org list. No write
path.

**Code.** `domains/release/platform-guard.ts`, platform-only permissions + exclusion in `@noname/auth`,
`servicePermissionsForRoles`, `ReleaseService.getAnyOrg`, `POST /:id/rollout`, platform-project audience in
`verified-token.ts`.

### Verification

| Check | Observed |
|---|---|
| Guard unit | **4/4**: platform role accepted; tenant org 403; missing role 403; unset env 503 |
| Permission exclusion | `admin` has no platform-only permission; service-role map correct |
| Release/auth targeted | **67/67** |
| Full server suite | **660/660**, 147 files |
| Live dry-run | **200**, demo org `eligible`, platform org `skipped: platform_org`, duplicate deduped |
| No token | **401** |
| Write path | `dryRun:false` rejected (400) |

**Limits.** No tenant-catalog existence check; role lookup is uncached; only platform-owned releases are eligible;
write path disabled.

## 2026-11-07 — eval identity: `nsv.` retired

**Scope.** Move eval to per-tenant ZITADEL service accounts, switch CLI/worker, delete the custom credential.

**Code.** `scripts/init/tenant-eval-account.ts`, `packages/eval/src/service-account.ts`,
`domains/auth/guards.ts` grant resolution, CLI `--tenant` flow, worker key exchange; deleted
`scripts/mint-service-token.ts`, `shared/service-token.ts`, its tests, and the machine-token branch.

### Verification

| Check | Observed |
|---|---|
| Tenant account | `eval_reader` role, `eval-runner-<org>` account, key, grant created |
| Context read | `GET /api/eval/context` with the tenant token → **200** |
| CLI | `noname eval --tenant yogastore --mode dev` → **60 pass, 0 fail, 9 skip** |
| Typecheck | server, CLI, eval clean |
| Server tests | **652/652**, 147 files |
| Removed | `nsv.` signer/verifier/mint script gone; no code references |

**Limit recorded.** Per-tenant keys live under `zitadel_keys/tenants/<org>/` (gitignored); production secret
storage (Vault) is the follow-up. Browser checks skipped because no CDP endpoint was supplied.

## Next blocks

1. **Request-id + `AUDIT_READ`** — middleware, `requestId`/`traceId` in audit metadata, tenant audit route.
2. **D17 platform operator** — platform org + `platform_operator` role + service account (private-key JWT); guard + dry-run rollout.
3. **Release admin UI** — tenant list, pointer history, channel assignment, promote/rollback buttons.
4. **R2 retention/GC** — object lifecycle for bundles whose release rows were pruned.
5. Gate wiring: classify the `migration_set` artifact at release creation rather than only at promotion.

