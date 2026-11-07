# D2 — Machine-definition versions and in-flight pinning

> **Status:** **Implemented and verified** · **Date:** 2026-11-07 (America/Toronto)
> **Decision:** D2 option **A** — append-only definition versions + a version pinned on each instance.
> **Why:** a definition edit currently changes the behaviour of carts already in flight. This is the original
> incident the progressive-delivery RFC was written for.
> **Scope:** `packages/server/src/domains/machines` + one migration. No API shape removed; no release-domain
> coupling (a release binds `checksVersion`/`platformVersion`, not machine definitions).
> **Related:** [`PENDING-DECISIONS.md`](./PENDING-DECISIONS.md) D2 · [`RELEASE-VERIFICATION-LOG.md`](./RELEASE-VERIFICATION-LOG.md) · [`RFC-PROGRESSIVE-DELIVERY.md`](../2026-10-24/RFC-PROGRESSIVE-DELIVERY.md) V1

---

## 1. Before

```
machine_definitions: (org_id, name, definition, created_at, updated_at)   unique(org_id, name)
machine_instances:   (…, current_state, context, revision, …)

define(cart, v2) → UPDATE the only row
transition(instance) → load definition by name → uses v2
```

A cart that started under the 4-state definition is evaluated by the 9-state definition after an edit. There is
no history and no way back.

## 2. Design

Two changes, one new table:

```
machine_definitions            current pointer: one row per (org, name), now with `version`
machine_definition_versions    append-only: (org, name, version) → definition JSON
machine_instances              new `definition_version`, set at start
```

Rules:

1. **Current row stays the pointer.** `findDefinition(org, name)` returns the current row, so every existing
   caller (API, seed, M4) is unchanged.
2. **Writes are versioned.** `saveDefinition` compares the incoming definition with the current one; identical
   writes return the current row (seed re-runs do not create a version per run). A real change inserts
   `version + 1` into the history and moves the current row to it.
3. **Instances pin at start.** `engine.start` writes `definition.version` onto the instance.
4. **Transitions load the pin.** `engine.transition` calls `findDefinition(org, name, instance.definitionVersion)`
   rather than “latest”.
5. **Legacy fallback.** If a pinned version row is missing (instances created before the backfill), the adapter
   falls back to the current definition instead of refusing the transition. The pin starts holding as soon as
   the definition is next saved.
6. **History is append-only.** No update/delete path exists for `machine_definition_versions`.

```
define(cart, v2) → versions(cart, 2); definitions.version = 2
old instance (definition_version=1) → transition loads version 1 → v2only rejected
new instance                       → definition_version=2 → v2only accepted
```

## 3. What breaks (and what does not)

| Surface | Effect | Action |
|---|---|---|
| `machine_definitions` insert/update | now also inserts a history row and bumps `version` | migration + adapter change (done) |
| `machine_instances` insert | requires `definition_version` | engine passes it; column defaults to 1 |
| `MachineDefinition` DTO | gains optional `version` (metadata, not stored in JSON) | additive; M4 compares `states` only |
| `MachineInstanceDTO` | gains optional `definitionVersion` | additive; API responses include it |
| `MachineStorage` port | `findDefinition` and `createInstance` gain optional/required parameters | fake storages compile because extra parameters are optional at call sites; the new unit test uses an explicit versioned fake |
| Seed (`seed:demo`) | re-saving the same JSON creates **no** version | idempotent by comparison |
| Eval `M4.machines` | compares stored current definition with the file | unchanged; verified `pass` after migration |

**No API route removed or reshaped.** The only visible addition is `definitionVersion` in instance responses and
`version` in definition responses.

## 4. Migration

`drizzle/0002_freezing_invaders.sql` (generated, with a backfill appended):

```sql
CREATE TABLE machine_definition_versions (…, unique (org_id, name, version));
ALTER TABLE machine_definitions ADD COLUMN version integer DEFAULT 1 NOT NULL;
ALTER TABLE machine_instances  ADD COLUMN definition_version integer DEFAULT 1 NOT NULL;
INSERT INTO machine_definition_versions (id, org_id, name, version, definition)
SELECT gen_random_uuid(), org_id, name, version, definition
FROM machine_definitions
ON CONFLICT (org_id, name, version) DO NOTHING;
```

Applied with `pnpm --filter @noname/server db:migrate`. Observed backfill: `cart|1`, `inventory_reservation|1`.

**Rollback.** Code rollback is safe: the old code ignores the new columns/table. Data rollback is not needed
(the history is append-only). Reverting the migration drops the pins/history; do that only if the feature is
abandoned, never to “fix” a bad definition — the correct action is a new version.

## 5. Verification (observed)

| Check | Command | Result |
|---|---|---|
| Types | `pnpm --filter @noname/server typecheck` | clean |
| Unit — pinning | `pnpm vitest run …/engine-versioning.test.ts` | **1/1**: old instance rejects a v2-only event, new instance accepts it, old instance still advances |
| Machine domain | `pnpm vitest run packages/server/src/domains/machines` | **25/25** |
| Migration | `db:migrate` | applied; columns + table present; history backfilled |
| E2E — define v1 | `POST /api/machines/definitions` | **201** |
| E2E — start old | `POST /api/machines/start` | **201**, `definitionVersion: 1` |
| E2E — define v2 | same route, adds `v2only` | **201** |
| E2E — old gets v2 event | `POST /api/machines/:old/v2only` | **400** (rejected under v1) |
| E2E — start new | `POST /api/machines/start` | **201**, `definitionVersion: 2` |
| E2E — new gets v2 event | `POST /api/machines/:new/v2only` | **200**, state `done` |
| E2E — old still works | `POST /api/machines/:old/advance` | **200**, state `done` |
| Eval M4 | `noname eval --tenant yogastore --token …` | `M4.machines` **pass** for `cart` (9 states) and `inventory_reservation` (5 states) |
| Cleanup | SQL delete by machine name | 0 leftovers (probe rows removed) |

## 6. Limits recorded

- **No version-listing API yet.** The history is queryable in SQL; an admin UI/endpoint is a follow-up.
- **Legacy fallback is weaker than a pin.** Instances created before the backfill resolve to the current
  definition until the next save. In this environment the backfill covered every existing definition.
- **No definition rollback endpoint.** The correct recovery is “save the previous JSON as a new version” — which
  follows from append-only history.
- **Concurrency.** Two simultaneous saves can compute the same `nextVersion`; the unique index makes one insert
  lose (the current-row update still wins). Definitions are low-frequency; a transaction with a row lock is the
  future hardening if that changes.
- **The unused `machines` table** (with `version`/`status`) is legacy and untouched; `machine_definitions` is the
  table the engine uses.
