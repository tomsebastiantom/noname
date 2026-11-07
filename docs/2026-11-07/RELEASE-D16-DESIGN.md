# Release block D16 — migration policy (expand / contract)

> **Status:** **implemented and verified 2026-11-07** · **Date:** 2026-11-07
> **Decision:** D16 option **A** — expand/contract is mandatory. Destructive schema changes are forbidden in a
> release that still needs to be rolled back.
> **Scope guard:** this block is a **policy + classifier**, not a migration engine. It does not write migrations,
> apply them, or switch blue/green. It makes a release’s migration set **classifiable and blockable**.

---

## 1. Why this exists

D15 will run two server versions against **one database** during a blue/green window:

```
old API r_16 ──┐
               ├──►  one schema
new API r_17 ──┘
```

If `r_17` renames or drops a column in the same release, `r_16` breaks the moment the migration runs, and
rollback is impossible — the old code expects a column that no longer exists. The only recovery is restore.

The release record (D14) already carries a `migration_set` artifact. D16 defines what may be inside it and adds a
checker so a destructive set cannot silently ship.

## 2. The rule

A schema change that removes or renames something ships in **three releases**, never one:

| Release | Migration | Code | Why |
|---|---|---|---|
| **expand** | add the new column/table (nullable), add indexes/types | write both old and new; read old | old and new servers both work |
| **backfill / switch** | backfill data; no destructive DDL | read new; still write both | both versions still work |
| **contract** | drop/rename the old thing | old path removed | only after no running version needs it |

Consequences:

1. A `DROP`, `RENAME`, `ALTER TYPE`, `TRUNCATE`, or `DELETE` is a **contract** step and must not share a release
   with the code that stops using the old shape.
2. A backfill is data movement, not DDL; it may run in the expand or switch release.
3. The contract release is allowed to be destructive **only** when the previous release no longer writes or
   reads the old shape.

## 3. What gets classified

Every statement in a generated migration file gets one class:

| Class | Examples | Gate effect |
|---|---|---|
| `expand` | `CREATE TABLE`, `CREATE TYPE`, `CREATE INDEX`, `ADD COLUMN`, `ADD CONSTRAINT` | promotable |
| `backfill` | `INSERT INTO … SELECT`, `UPDATE … SET` | promotable |
| `destructive` | `DROP TABLE`, `DROP COLUMN`, `RENAME COLUMN`, `ALTER COLUMN … TYPE`, `DROP TYPE`, `TRUNCATE`, `DELETE FROM` | **blocked** unless it is an explicit contract release |
| `unknown` | anything the classifier cannot name | reported; not treated as a pass |

`promotable = destructive === 0`.

## 4. Tooling

**Pure classifier** — `packages/server/src/domains/release/migrations/classify.ts`

- splits Drizzle output on `--> statement-breakpoint`;
- strips SQL comments;
- classifies each statement;
- returns `{ statements, destructive, promotable }`.

**CLI** — `scripts/classify-migrations.ts`

```
pnpm migrations:classify packages/server/drizzle/0001_*.sql
pnpm migrations:classify packages/server/drizzle/*.sql --block-destructive
pnpm migrations:classify ... --json
```

- default: print a table and exit `0` (report only);
- `--block-destructive`: exit `1` when any statement is destructive (the gate uses this form later);
- `--json`: machine-readable output for the gate.

**Where it plugs in later**

| Consumer | Use |
|---|---|
| release gate | `migration_set` artifact must be `promotable`; a contract release is marked explicitly |
| CI | run over the generated migration set before build |
| `db:check` | classify, not just syntax-check |

## 5. Example

**Blocked:**

```sql
ALTER TABLE "flags" DROP COLUMN "description";
```

```
0003_drop_description.sql: destructive (DROP COLUMN) — BLOCKED
```

**Allowed as three releases:**

```sql
-- r_20 expand
ALTER TABLE "flags" ADD COLUMN "summary" text;

-- r_21 backfill
UPDATE "flags" SET "summary" = "description" WHERE "summary" IS NULL;

-- r_22 contract (explicit)
ALTER TABLE "flags" DROP COLUMN "description";
```

## 6. Acceptance

1. An `ADD COLUMN` migration classifies as `expand` and is promotable.
2. A `DROP COLUMN`, `RENAME COLUMN`, `ALTER TYPE`, `TRUNCATE`, or `DELETE` classifies as `destructive`.
3. A mixed migration file reports each statement and is blocked if any is destructive.
4. `--block-destructive` exits `1` on destructive input, `0` otherwise.
5. The real `0001` and `0002` migrations classify as expand/backfill and are promotable.
6. The classified result is available as JSON for the release gate.

## 7. Out of scope

| Not here | Where |
|---|---|
| Applying or rolling back migrations | `drizzle-kit` / deployment |
| Blue/green selector and preview | D15 |
| Contract-release approval flow | D9 / gate |
| Data retention and backups | `DATABASE-MIGRATIONS.md` |

## 8. Risks

| Risk | Mitigation |
|---|---|
| Classifier misses a destructive form and gives false confidence | conservative patterns + `unknown` is not a pass; tests enumerate the common forms |
| A real backfill is blocked as destructive | `UPDATE`/`INSERT` are backfill; only `DELETE` is destructive, and it can be split |
| People bypass the CLI | it is a gate input later; policy states the rule |
| Contract releases become permanent | each contract names the expand release it retires; review can check it |

## 9. Implementation evidence (2026-11-07)

**Code**

| Path | Role |
|---|---|
| `packages/server/src/domains/release/migrations/classify.ts` | pure classifier: split, strip comments, classify, report |
| `packages/server/src/domains/release/migrations/classify.test.ts` | 15 tests (expand, backfill, destructive forms, mixed, unknown) |
| `scripts/classify-migrations.ts` | CLI: report, `--block-destructive`, `--json` |
| `package.json` | `migrations:classify` script |

**Verification**

| Check | Command | Observed |
|---|---|---|
| Types | `pnpm --filter @noname/server typecheck` | clean |
| Unit | `pnpm vitest run packages/server/src/domains/release` | **22/22** (15 classifier + 7 service) |
| Real migrations | `pnpm migrations:classify` | **137 statements, 0 destructive → PROMOTABLE** (exit 0) |
| Destructive fixture | `--block-destructive` on `ALTER TABLE … DROP COLUMN` | **BLOCKED**, exit **1** |
| JSON | `--json` on `0001` | `{"promotable":true,"destructive":0}` |
| Backfill | real `0002` | `INSERT … SELECT` classified `backfill` |
| Unknown | `COMMENT ON …` | `unknown`, not treated as pass |

The runnable record is in [`RELEASE-VERIFICATION-LOG.md`](./RELEASE-VERIFICATION-LOG.md).

**Limits recorded.**

- The classifier reads SQL text; a dynamic `EXECUTE` inside a function is `unknown`, not destructive — review
  still owns those.
- `--block-destructive` is a report/exit code today; wiring it into the release gate happens with D15.
- A contract release is not specially allowed yet: the rule is “destructive is blocked by default”; an explicit
  contract marker is the next gate refinement.
