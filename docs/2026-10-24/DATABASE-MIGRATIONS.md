# Database Migrations — baseline and workflow

**Date:** 2026-10-24 (America/New_York)
**Why this exists:** every schema change made during the 2026-10-15 → 2026-10-23 remediation work was
applied to the local database **by hand** (`psql` / `ALTER TABLE` / `CREATE INDEX`). The Drizzle schema files
were updated, but there was **no migrations directory at all** — so a fresh environment, a teammate, or CI
would get none of those changes. Pre-production is the right time to fix that, because the alternative is
discovering it during a deploy.

---

## 1. What now exists

```text
packages/server/drizzle/
  0000_baseline.sql          -- the full schema, 124 statements, 36 tables, 116 indexes
  meta/0000_snapshot.json    -- drizzle's schema snapshot
  meta/_journal.json         -- migration journal (tag: 0000_baseline)
```

Generated with `pnpm --filter @noname/server db:generate --name baseline`. It is a **baseline**, not a delta:
it creates the schema as it stands today, which includes every change from the remediation work:

| Change | From |
|---|---|
| `flag_evals_evaluated_at` | S12 retention |
| `documents_store_slug_unique` | S10 storefront slug |
| `machine_transitions.org_id`, `.revision`, `.published_at` + `machine_transitions_unpublished_idx` | S7 relay |
| `provider_event_receipts_created_at_idx` | S15 retention |
| `webhook_outbound_subscription_event_idx` | S14 webhook dedupe |
| `document_ops_server_version_unique` | roadmap 1.9 |
| `capability_idempotency.result` as **`json`** (was `jsonb`) | idempotent replay fidelity |
| `evidence_records_org_correlation_idx` | evidence workflow query |

Confirmed by reading the generated file, not by assumption — all ten names appear in it.

---

## 2. Proof that the baseline actually builds a database

Applying a migration to the database it was generated *from* proves nothing, so it was applied to a
throwaway database (`app_migrate_check`) via a temporary config:

```text
tables      : 36 (live) vs 36 (fresh)
columns     : 369 vs 369   — 0 differences
indexes     : 116 vs 116   — 0 differences
result type : json  (fresh)
session indexes present in the fresh DB: all 7 checked
```

The temporary config and the throwaway database were then removed. **A fresh environment built from
`db:migrate` is schema-identical to the live one.**

---

## 3. The existing database is baselined, not rebuilt

The live database already contains these objects, so replaying the baseline against it would fail on the
first `CREATE TABLE`. It was therefore marked as *having* the baseline, which is the standard way to adopt
migrations on an existing database:

- drizzle's bookkeeping table was created (`drizzle.__drizzle_migrations`) and seeded with the baseline's
  own record — `hash e98b066c…098d4`, `created_at 1792860558150` — captured from the throwaway run so the
  hash matches what drizzle itself computes.
- **Verified:** `drizzle-kit migrate` against the live database is now a no-op. It emitted only
  `schema "drizzle" already exists, skipping` / `relation "__drizzle_migrations" already exists, skipping`,
  reported success, and left `tables=36` and `machine_instances=87` unchanged.

No data was touched.

---

## 4. Workflow from here

```bash
# change a schema file, then:
pnpm --filter @noname/server db:generate --name describe_the_change
# review the generated .sql (drizzle will not always order things the way you expect,
# and it cannot express data backfills — write those by hand in the same file)
pnpm --filter @noname/server db:check      # journal/consistency
pnpm --filter @noname/server db:migrate    # apply
```

- **Fresh environment / CI:** `db:migrate`. That is now the only correct path.
- **`db:push`** still exists and is convenient for iterating on a schema locally, but it **records no
  history** — it cannot be replayed on another machine and it is not a deployment mechanism. Two developers
  using `push` on divergent schemas is how a repo ends up with a database nobody can reconstruct.
- A migration that needs data moved (backfill, rename) should contain the SQL explicitly; `generate` only
  knows schema diffs.

---

## 5. One known cosmetic issue

Applying the baseline emits:

```text
NOTICE: identifier "collab_automerge_chunks_org_id_layout_document_id_storage_key_pk"
        will be truncated to "collab_automerge_chunks_org_id_layout_document_id_storage_key_p"
```

Postgres truncates identifiers to 63 characters. Harmless — the name is consistent on both sides because
Postgres truncates deterministically — but it is worth shortening that constraint name eventually so it is
greppable.

---

## 6. Seeding had to match the schema too — and one machine was never seeded at all

A migration gets you the tables; the seed is what makes a fresh environment *usable*, so it was audited
against the same changes.

**Good news first:** the seeder talks to the **HTTP API**, not raw SQL, so the new constraints
(`(org_id, document_id, server_version)`, `(subscription_id, event_id)`, the partial slug index) are never
hit behind the application's back. Nothing there needed changing.

**But one machine definition was never seeded.** `machine_definitions` held `inventory_reservation` only
because it had been inserted by hand during verification — `packages/extensions/src/commerce/machines/inventory.json`
existed, and the commerce profile seeded `cart.json` and nothing else. Locally everything worked; a fresh
environment would have had **no inventory machine at all**, so `commerce.inventory.reserve` would fail there
while passing on the machine where it had been hand-patched. This is the class of bug that only shows up in
the environment you are not testing.

Fixed by making the seeded set explicit and self-checking:

- `SEEDED_MACHINE_FILES = ["cart.json", "inventory.json"]` is now the contract, seeded in a loop with the
  same read → POST → **verify-what-was-stored** check that already existed for the cart (that check is what
  previously caught a stored row with four states while the file declared nine).
- `seeded-machines.test.ts` asserts the list **equals the files on disk**, so adding a machine file without
  seeding it fails a test instead of a deploy. Falsified: removing `inventory.json` from the list fails it
  with `expected [ 'cart.json' ] to deeply equal [ 'cart.json', 'inventory.json' ]`.

Proven end-to-end rather than argued: `inventory_reservation` was **deleted** from the database, then
`pnpm seed:demo:commerce` recreated it —

```text
Definition "cart" verified against the stored row (9 states).
Machine definition seeded and verified (cart) from cart.json.
Definition "inventory_reservation" verified against the stored row (5 states).
Machine definition seeded and verified (inventory_reservation) from inventory.json.
```

The seed is re-runnable (it ran twice during verification with no duplication) and it left the data
baselines unchanged: cart `79/6/2`, `instances=87`, `evidence=5`, `transitions=32`.

So the fresh-environment recipe is: **`db:migrate` then `seed:demo:full`** — and both are now checks rather
than assumptions.

---

## 7. Verification commands

```bash
# the baseline applied to a fresh DB matches the live one (fresh DB, then compare)
podman exec noname-postgres-1 psql -U noname -d app -c "create database app_migrate_check"
DATABASE_URL=postgres://noname:noname_dev@localhost:5432/app_migrate_check \
  pnpm --filter @noname/server db:migrate
# then diff information_schema.columns / pg_indexes between app and app_migrate_check

# the live DB is a no-op for migrate
pnpm --filter @noname/server db:migrate     # expect "already exists, skipping" only
```
