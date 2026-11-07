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

## Next blocks

1. **D16** — expand/contract migration policy and migration-set semantics.
2. **D15** — preview + blue/green selector.
3. **D1** — `tenant_release_pointers` + `ReleasePointerPort` + catalog projection.

