# Release block D15 — environment selector (preview + blue/green control plane)

> **Status:** **implemented and verified 2026-11-07** · **Date:** 2026-11-07
> **Decision:** D15 option **B + D** — preview verification, then a blue/green whole-stack switch; behaviour changes
> stay behind flags. Per-tenant server versions (option C) are out of scope.
> **Scope guard:** this block owns **which release each environment serves**. It does not create Kubernetes
> deployments, switch ingress, or run the preview. Those consume the selector; they are deployment-side.

---

## 1. Why this exists

D14 records what a release is. D16 says what may be inside its migration set. Neither says **which release is
live**. Without that:

- there is no “preview this candidate” step;
- “switch the server” is an undocumented manual action;
- rollback is a redeploy, not a state change.

D15 adds the missing state: one row per environment saying **active** and **previous** release.

## 2. What blue/green means here

The deployment runs two stacks (old and new). The selector row decides which one serves:

```
release_environments:
  production → active r_16, previous r_15
  preview    → active r_17 (candidate)
```

- **Preview** is an environment like any other; it never touches production.
- **Activate** writes `previous = active`, then `active = candidate`. One row, atomic.
- **Rollback** swaps them back. One row, seconds.
- The ingress/Service reads the selector; the release domain does not touch pods.

## 3. Data model

```sql
release_environments(
  id uuid pk,
  org_id text not null,
  name text not null,                 -- preview | staging | production
  active_release_id uuid references releases(id),
  previous_release_id uuid references releases(id),
  updated_by text not null,
  updated_at timestamptz not null default now(),
  unique(org_id, name)
)
```

Environments are org-scoped because releases are org-scoped. A release can be active in at most one environment
per org, and `previous` is what rollback returns to.

## 4. Commands and API

All routes require `releases:write` (activation) or `releases:read` (listing).

| Method | Path | Body | Effect |
|---|---|---|---|
| POST | `/api/releases/:id/preview` | — | activate the release in `preview` |
| POST | `/api/releases/:id/activate` | `{ environment?: "production" }` | blue/green switch in that environment |
| POST | `/api/environments/:name/rollback` | — | swap `active` and `previous` |
| GET | `/api/environments` | — | active + previous per environment |

Rules:

1. Only a `ready` release can be activated; `building` or `retired` is a **409**.
2. Activating the already-active release is an idempotent no-op (no Evidence row, no timestamp churn).
3. Rollback with no `previous` is a **409** — there is nothing to return to.
4. Every real move writes **one** Evidence record: `platform.release.switched`, `from` → `to`, environment, actor.
5. Rollback is the same operation in the other direction; no special path.

## 5. Example

```
r_17 ready, preview active r_17
activate r_17 in production:
  production: previous=r_16, active=r_17     Evidence: r_16 → r_17
something breaks:
  rollback production:
  production: previous=r_17, active=r_16     Evidence: r_17 → r_16
```

The old stack is still running; rollback only changes which one is selected.

## 6. Acceptance

1. Activating a `building` release returns 409 and writes no Evidence.
2. Activating a `ready` release sets `active`, keeps the old release as `previous`, writes one Evidence row.
3. Activating the same release twice changes nothing and writes no second row.
4. Rollback restores the previous release and swaps the pair.
5. Preview never changes the production row.
6. Listing environments is org-scoped.
7. A rollback with no previous release is a 409.

## 7. Out of scope

| Not here | Where |
|---|---|
| Creating the two deployments | deployment topology / manifests |
| Ingress or Service selector implementation | deployment |
| Preview environment provisioning and data snapshot | deployment / RFC §4 |
| Auto-halt on metrics, canary by percentage | later gate work |
| Refusing a destructive migration set at activation | next gate wiring (classifier already exists) |

## 8. Risks

| Risk | Mitigation |
|---|---|
| Selector row diverges from what is actually deployed | single writer is this API; deployment reads `active_release_id`; a conformance check can compare image digest to release artifact |
| Someone activates a release whose server image is not deployed | activation is a state change, not a deploy; the deployment step must precede it and is recorded in the release artifact |
| Environment names proliferate | free-form today; the UI/API constrains to preview/staging/production until a need appears |
| Rollback after a destructive migration | D16 forbids destructive migrations in a release that shares a window; the classifier is ready to be wired here |

## 9. Implementation evidence (2026-11-07)

**Code**

| Path | Role |
|---|---|
| `domains/release/schema.ts` | `release_environments` (org+name unique, active/previous FK) |
| `domains/release/environment-service.ts` | preview / activate / rollback, ready precondition, idempotent no-op |
| `domains/release/adapters/postgres.ts` | `createPostgresEnvironmentStore` (upsert selector) |
| `domains/release/api.ts` | `GET /environments`, `POST /environments/:name/rollback`, `POST /:id/preview`, `POST /:id/activate` |
| `domains/release/environment-service.test.ts` | 8 tests |
| `drizzle/0003_premium_green_goblin.sql` | migration |

**Verification**

| Check | Command | Observed |
|---|---|---|
| Types | `pnpm --filter @noname/server typecheck` | clean |
| Unit | `pnpm vitest run packages/server/src/domains/release` | **30/30** (8 environment + 7 service + 15 classifier) |
| Migration | `db:migrate` | `release_environments` exists |
| Activate A | `POST /:id/activate {production}` | **200**, active = A |
| Activate B | same | **200**, active = B, previous = A |
| List | `GET /environments` | `production: B/A` |
| Rollback | `POST /environments/production/rollback` | **200**, active = A, previous = B |
| Preview | `POST /:id/preview` | **200**, preview = B, production unchanged |
| Not ready | activate a `building` release | **409**, no Evidence row |
| Evidence | `platform.release.switched` rows | 3 production (A, B, rollback) + 1 preview, with from/to/rollback |
| DB | `release_environments` | `preview: B`, `production: A/B` |

The runnable record is in [`RELEASE-VERIFICATION-LOG.md`](./RELEASE-VERIFICATION-LOG.md).

**Limits recorded.**

- This is the **control plane**: deployment must read `release_environments.active_release_id`; no ingress or
  pod switching is done here.
- No auto-halt on metrics, no percentage canary, no per-tenant server versions (option C remains out of scope).
- Activation does not yet refuse a destructive migration set; the D16 classifier is ready to be wired as a
  precondition.
