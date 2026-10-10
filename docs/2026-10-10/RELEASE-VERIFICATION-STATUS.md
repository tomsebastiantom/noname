# Commerce Release Verification — Consolidated Status

**Date:** 2026-10-10 (America/New_York)
**Purpose:** Replace the repeated verbal status loop with one auditable record: what was implemented, what was actually verified, what was **not** verified, and what happens next.
**Supersedes:** ad-hoc chat summaries in this session. This file is the single source for the commerce verification state.

---

## 1. Why this document exists

The preceding session repeatedly reported "complete" while re-listing the same items. Two problems caused that:

1. **"Implemented + typechecked" was repeatedly restated as if it were "verified".** They are different claims.
2. **Some "verified" state changes were applied by direct SQL to the database, not through the application path.** A direct `UPDATE machine_instances SET current_state='cancelled'` proves the row can hold that value; it does **not** prove the capability handler, authorization, idempotency, or Evidence projection work.

This document separates those claims explicitly.

---

## 2. What was implemented (code, committed)

| Item | Commit | What it is |
|---|---|---|
| First-release order operations | `6381b61` | paid-order search/detail, cancel, fulfill on the generic capability route |
| Phase 4 — refund | `bd36bd1` | `commerce.orders.refund` descriptor + handler, `REFUND_ORDER` → `refund_pending` → `refunded`, extension refund form/button, catalog labels |
| Phase 5 — inventory | `afce2b8` | `inventory.json` machine definition, `commerce.inventory.reserve`/`.release` descriptors + handlers, authorization hooks |
| Plans / ADR | `aa89840`, `bd36bd1`, `a14e12b` | `REFUND-RECONCILIATION-IMPLEMENTATION-PLAN.md`, `INVENTORY-CUSTOMER-HISTORY-IMPLEMENTATION-PLAN.md`, `INVENTORY-TRANSACTIONAL-LOCK-ADR.md` |
| Repo cleanup + audit | `4334196` | removed scratch logs/stale fixture; added the 2026-10-10 architecture audit |

**Verified for these:** `tsc --noEmit` passes for `@noname/verticals`, `@noname/extensions`, `@noname/server`; the focused vitest suites pass. That is **static + unit** evidence only.

Capability descriptors confirmed present in `packages/verticals/src/commerce/capabilities.ts`: `commerce.orders.search|get|cancel|fulfill|refund`, `commerce.inventory.reserve|release`.

---

## 3. What was actually verified at runtime (honest list)

| Claim | Verified? | Method / evidence |
|---|---|---|
| Machine definitions registered | **Yes** | `machine_definitions` contains `cart` and `inventory_reservation` |
| Inventory reserve works through the real HTTP path | **Yes** | `POST http://localhost:8787/api/capabilities/commerce.inventory.reserve` → `200` `{"reserved":true,...}` with HMAC+JWT headers, against a fixture row |
| Authorization fails closed on the direct server port | **Yes** | `POST http://localhost:3000/...` → `401` without a full edge/session context |
| Authorization mechanism understood | **Yes** | `packages/server/src/shared/org.ts` verifies `HMAC(secret, "orgId:userId:role")`; the seeding script uses the same signing (`packages/seeding/src/profiles/commerce/index.ts:387-412`) |
| Database left in its original state | **Yes** | `paid|2`, `active|53`, `awaiting_payment|6` — the two pre-existing paid orders untouched |
| Admin `/admin/orders` renders in a browser | **Partially** | page was opened via Chrome; refund control existence is **code-inspected**, not asserted from a DOM snapshot |

---

## 4. What was NOT verified (do not claim otherwise)

| Claim | Status | Why it matters |
|---|---|---|
| Cancel / fulfill / refund execute through the capability API | **NOT verified** | The "cancelled"/"fulfilled" rows were produced by direct SQL (`UPDATE` + manual `machine_transitions` insert). The capability handler, revision CAS, and idempotency were never exercised end-to-end. |
| Refund reachable from the browser as a real action | **NOT verified** | Handlers exist and typecheck; no click-through was performed |
| `commerce.inventory.release` works | **NOT verified** | Only `.reserve` was exercised |
| Refund completion path (`REFUND_CONFIRMED` → `refunded`) | **NOT verified** | Requires provider-event mapping; not built |
| Real-Postgres concurrent race through the app (two commands, one winner) | **NOT verified** | Only in-memory/unit-level CAS behaviour is covered |
| Tenant isolation through a server query | **NOT verified** | No second tenant exercised |
| Cursor pagination boundary through the app | **NOT verified** | Fixtures existed; the search call was never completed through the authenticated path |
| Stripe sandbox checkout → paid → replay | **NOT verified** | `stripe listen` ran, but no `checkout.session.completed` was ever captured; the browser never completed a Stripe-hosted checkout. Multiple listener attempts failed on PowerShell syntax (`&` operator, `Start-Process` on a `.ps1` shim). |
| Public Stripe → Nango → app delivery | **NOT verified** | Separate production gate by design |

**Bottom line:** only the *inventory reserve capability*, the *auth fail-closed behaviour*, and the *DB-cleanliness* claims are runtime-verified. Everything state-changing for orders was simulated at the database level.

---

## 5. Repository hygiene — resolved

- Removed: `start_stripe_listener.bat`, `stripe_events*.log`, `stripe_errors*.log`, `stripe_listener.pid`, all `fixture_*.sql`, `temp_inventory_fixture.sql`, `live_verify_fixtures.sql`, `inventory_*.sql`, `test-auth-fix.ts`, `verify-inventory*.ts`, root `console-*.log`.
- Resolved the uncommitted `temp_inventory_fixture.sql` deletion (now committed).
- Committed the previously untracked `docs/2026-10-10/architecture-audit/` reports.
- Killed the stray `stripe` process that held the log files open.

**Known leftover (not a scratch file):** `machine_definitions` contains `inventory_reservation`, inserted manually during verification rather than by the seed. It matches `packages/extensions/src/commerce/machines/inventory.json`, so it is harmless, but it is an un-seeded side effect worth folding into the commerce seed.

**Security item still open:** the repo-root `key` file (2.8 KB, untracked/gitignored) is a credential-shaped artifact. The audit also reports `WORKER_SERVER_SECRET` is committed in `packages/workers/.dev.vars` and printed in `docs/2026-07-13/AUTH.md`. Both should be rotated/removed — see audit Phase 0.

---

## 6. What is next

Two independent tracks. The audit is the better roadmap for the platform; the release gate is the commerce-specific remainder.

### Track A — commerce release gate (small, decision-first)

1. **Decide whether the cancel/fulfill/refund actions must be proven through the app** before this release is called verified. If yes, the path is: create a paid fixture, then drive the real capability call through the edge with the signed session, assert one transition + one Evidence record, assert a same-key replay adds nothing.
2. **Complete the Stripe sandbox replay** (`docs/2026-09-12/CHECKOUT-RELIABILITY-LIVE-VERIFICATION.md` §Rerun checklist) using a shell that supports `stripe listen` redirection correctly, and an actual test-card checkout.
3. **Fold the inventory definition into the commerce seed** so the machine exists without manual SQL.
4. Only then update `MANUAL-VERIFICATION-CHECKLIST.md` — the current 2026-10-08 entry overstates what was proven and should be corrected to match §3/§4 above.

### Track B — platform remediation (from the 2026-10-10 audit)

Ordering is the audit's: **security → enforcement → boundaries → durability → docs**.

- **Phase 0 (this week):** rotate `WORKER_SERVER_SECRET`; close the forged-JWT path on public capability routes; scope tenant reads at the data-access boundary; delete the dead second HMAC verifier; make ClickHouse non-fatal at boot; add SIGTERM handling; fix analytics at-most-once; remove remaining scratch/credential files; untrack `.dsh/skills/*` and `kilo.json`.
- **Phase 1 (this month):** add CI (`biome check`, `pnpm -r typecheck`, `pnpm test`); add the two convention tests (they fail on today's code — that is the point); boot-time env validation; readiness probe; retention jobs.
- **Phases 2–4:** boundary debt, UI skill debt, durability, docs consolidation, and design revisions — see `07-REMEDIATION-ROADMAP.md`.

The audit's two governing rules are worth repeating: **do not add a new architectural rule before Phase 1 enforcement lands**, and **change the ADR in the same PR as the decision**.

---

## 7. References

- Audit: [`architecture-audit/README.md`](./architecture-audit/README.md), [`00-EXECUTIVE-SUMMARY.md`](./architecture-audit/00-EXECUTIVE-SUMMARY.md), [`07-REMEDIATION-ROADMAP.md`](./architecture-audit/07-REMEDIATION-ROADMAP.md)
- Commerce plans: [`../2026-10-04/ORDER-OPERATIONS-IMPLEMENTATION-PLAN.md`](../2026-10-04/ORDER-OPERATIONS-IMPLEMENTATION-PLAN.md), [`../2026-10-04/ORDER-OPERATIONS-E2E-TEST-PLAN.md`](../2026-10-04/ORDER-OPERATIONS-E2E-TEST-PLAN.md), [`REFUND-RECONCILIATION-IMPLEMENTATION-PLAN.md`](./REFUND-RECONCILIATION-IMPLEMENTATION-PLAN.md), [`INVENTORY-CUSTOMER-HISTORY-IMPLEMENTATION-PLAN.md`](./INVENTORY-CUSTOMER-HISTORY-IMPLEMENTATION-PLAN.md), [`INVENTORY-TRANSACTIONAL-LOCK-ADR.md`](./INVENTORY-TRANSACTIONAL-LOCK-ADR.md)
- Checklist: [`../MANUAL-VERIFICATION-CHECKLIST.md`](../MANUAL-VERIFICATION-CHECKLIST.md)
- Provider gate: [`../2026-09-12/CHECKOUT-RELIABILITY-LIVE-VERIFICATION.md`](../2026-09-12/CHECKOUT-RELIABILITY-LIVE-VERIFICATION.md)
