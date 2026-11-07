# Release block D14 — release record and artifact binding

> **Status:** **implemented and verified 2026-11-07** · **Date:** 2026-11-07
> **Decision:** D14 option **B** — one release id binds client bundle + server image + worker image + migration set
> + config. **Context:** C1 — a release **bounded context** in the monolith, not a separate deployable.
> **Scope guard:** this block does **not** add the tenant pointer (D1) or the server selector (D15). It creates the
> thing those will point at.

---

## 1. What this block builds

A release is a first-class record:

```
r_17: { platformVersion: v12, checksVersion: 9f2a1c, state: ready }
  ├── client_bundle  ref: tenants/…/releases/r_17/remoteEntry.js  digest: sha256:3f…
  ├── server_image   ref: registry/…/api:r17                      digest: sha256:9c…
  ├── worker_image   ref: registry/…/workers:r17                  digest: sha256:71…
  ├── migration_set  ref: drizzle/0042-0043                       digest: sha256:0a…
  └── config         ref: config/v12                              digest: sha256:bd…
```

What it enables next: a gate verdict can name `r_17`; a tenant pointer can select `r_17`; a selector can serve
`r_17`. None of those exist yet — this is the identity the rest of the release work depends on.

## 2. What the existing architecture already gives us

| Concern | Existing pattern | What D14 reuses |
|---|---|---|
| Bounded context | `createFlagDomain({ db })` builds storage → service → routes | same factory shape for `createReleaseDomain` |
| Ports/adapters | `FlagStorage` + `createPostgresFlagStorage` | `ReleaseStore` + `createPostgresReleaseStore` |
| Errors | `ValidationError` / `NotFoundError` / `ConflictError` mapped by `app.onError` | identical |
| Auth | `denyUnless(c, PERMISSIONS.X)` | new `RELEASES_READ` / `RELEASES_WRITE` keys; admin inherits via `ALL_PERMISSIONS` |
| Persistence | Drizzle schema file listed in `drizzle.config.ts`; generated migration | same; migration is generated, not hand-written |
| Tests | colocated `*.test.ts` with an in-memory store | service tests; no DB needed |

Deliberately **not** reused: the tenant manifest store (a cache projection) and the eval domain. The release
domain imports neither; this is the dependency direction that makes C1 worth doing.

## 3. Recommendation

**Build C1 now, C2 later.** Specifically:

- `domains/release` owns `releases` and `release_artifacts`; it imports no tenant, eval or gate code.
- Callers get a port (`ReleaseStore` today; `ReleasePointerPort` arrives with D1).
- API is thin: create, read, list, mark ready.
- The record is immutable after creation; only `state` moves (`building → ready → retired`).

Why not put `release_id` on the tenant document: it makes the tenant the owner of release state, and every later
RFC depends on tenant internals. Why not a separate deployable yet: a network hop to read one row, a distributed
write with the catalog cache, and another failure mode — for no scaling benefit at this stage.

## 4. Data model

```sql
releases(id uuid pk, org_id text, platform_version text, checks_version text,
         state release_state, created_by text, created_at, updated_at)

release_artifacts(id uuid pk, release_id uuid fk cascade, kind release_artifact_kind,
                  ref text, digest text, created_at,
                  unique(release_id, kind))
```

- `state`: `building` (default) → `ready` (artifacts complete, may be promoted) → `retired`.
- `kind`: `client_bundle | server_image | worker_image | migration_set | config`.
- `digest`: content digest, so the artifact can be proven from storage rather than trusted from the ref.
- One artifact per kind per release; the unique index enforces it.

## 5. API contract

All routes require an org-scoped identity; permissions are checked server-side.

| Method | Path | Permission | Body | Response |
|---|---|---|---|---|
| POST | `/api/releases` | `releases:write` | `{ platformVersion, checksVersion, artifacts[] }` | `201 { data: release }` |
| POST | `/api/releases/:id/ready` | `releases:write` | — | `200 { data: release }` |
| GET | `/api/releases/:id` | `releases:read` | — | `200 { data: release }` |
| GET | `/api/releases` | `releases:read` | — | `200 { data: release[] }` |

Errors: `400` validation, `404` unknown release, `409` `ready` called twice, `401/403` from `denyUnless`.

## 6. Validation rules

1. `platformVersion` and `checksVersion` are non-empty.
2. At least one artifact.
3. Each artifact: known `kind`, non-empty `ref`, digest at least 8 characters.
4. No duplicate `kind` in one request.
5. `ready` only from `building`; a second call is a conflict, not a silent success.

## 7. Test and e2e plan

| Level | What | Command |
|---|---|---|
| Types | server package | `pnpm --filter @noname/server typecheck` |
| Unit | service + validation with an in-memory store: create, duplicate kind, empty artifacts, unknown id, ready transition twice | `pnpm vitest run packages/server/src/domains/release` |
| Schema | generate + apply migration to the local Postgres | `pnpm --filter @noname/server db:generate` then `db:migrate` |
| e2e | create via HTTP with an admin token, mark ready, read it back, list it | curl + `psql` check |
| Negative | missing digest → 400; second `ready` → 409 | curl |
| Regression | full server test suite | `pnpm vitest run packages/server` |

Acceptance is the D1 validation subset that applies here:

- release row + artifact rows exist in Postgres, one per kind;
- `ready` is one-way and visible on read;
- no import from tenant/eval/gate in `domains/release` (dependency direction);
- the API rejects an incomplete release before it can be promoted.

## 8. Out of scope (next blocks)

| Next | Depends on D14 |
|---|---|
| D1 C1 remainder: `tenant_release_pointers`, `ReleasePointerPort`, catalog projection | needs release rows to point at |
| D16 expand/contract rule + migration set semantics | release record already has `migration_set` |
| D15 selector + preview | needs a release id to select |
| Promotion/rollback commands + Evidence | need release state and identity |

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Adding permission keys silently grants nobody (except admin) | intended: release management is admin-only until a release role exists; documented in the permission comment |
| Migration generated against a long-lived local DB | generate only; apply on a clean DB in CI; local apply is idempotent |
| Release record drifts from what was actually built | artifacts carry digests; later the build job must be the only creator |
| Someone promotes a `building` release | `ready` state required; promotion code (next block) checks it |

## 10. Implementation evidence (2026-11-07)

**Code**

| Path | Role |
|---|---|
| `packages/server/src/domains/release/schema.ts` | `releases`, `release_artifacts`, enums, indexes |
| `packages/server/src/domains/release/ports.ts` | `ReleaseStore`, `ReleaseService`, DTOs |
| `packages/server/src/domains/release/validation.ts` | version/artifact rules |
| `packages/server/src/domains/release/service.ts` | create/get/list/`building → ready` |
| `packages/server/src/domains/release/adapters/postgres.ts` | transactional create, batched list |
| `packages/server/src/domains/release/api.ts` | four routes, zod body, permission checks |
| `packages/server/src/domains/release/index.ts` | domain factory |
| `packages/server/drizzle/0001_low_alex_wilder.sql` | generated migration |
| `packages/auth/src/permissions.ts` | `releases:read`, `releases:write` |
| `packages/server/src/bootstrap.ts` | `app.route("/api/releases", …)` |

**Tests and e2e**

| Check | Result |
|---|---|
| Release unit tests | **7/7 passed** |
| Full server suite | **595/595 passed** (136 files) |
| Typecheck | clean |
| Migration | applied; `releases` + `release_artifacts` exist |
| `POST /api/releases` | **201**, `building`, 3 artifacts |
| `POST /api/releases/:id/ready` | **200**, `ready` |
| `GET /api/releases/:id` | **200**, `ready` |
| `GET /api/releases` | **200**, 1 release |
| Short digest | **400** |
| `ready` twice | **409** |
| DB row | `ready \| v12 \| 9f2a1c \| 3 artifacts` |
| Artifact kinds | `client_bundle`, `server_image`, `migration_set` |
| Dependency direction | `domains/release` imports no tenant/eval/gate code |

The runnable record is in [`RELEASE-VERIFICATION-LOG.md`](./RELEASE-VERIFICATION-LOG.md).
