# Release block D1 — tenant release pointer and catalog projection (C1)

> **Status:** **implemented and verified 2026-11-07** · **Date:** 2026-11-07
> **Decision:** D1 option **C1** — a release bounded context owns the pointer; tenant catalog depends on it through
> a function/port, never the reverse.
> **Scope guard:** this is the **client bundle** pointer. It does not version the server (D15), and it does not
> implement promotion waves, auto-halt or a UI.

---

## 1. Why this exists

D14 records releases. D15 selects a server stack. Neither answers the client question:

> When a tenant loads `/api/tenants/:slug/catalog`, **which client bundle** should it get?

Today the catalog worker overwrites `tenants/<org>/<file>`, so every tenant implicitly gets the latest bundle and
there is no way to move one tenant forward or back. D1 C1 adds:

1. a **pointer row** per org: current release + previous release;
2. a **projection** in the catalog endpoint: if a pointer exists, `private.url` comes from that release’s
   `client_bundle` artifact;
3. **promote / rollback** commands with one Evidence record per move.

## 2. Dependency direction

```
domains/release  ──►  owns pointer + release artifacts
        ▲
        │  clientBundle(orgId)  (a function, not an import)
domains/tenant   ──►  catalog projection

bootstrap wires the function into the tenant domain; release imports nothing from tenant.
```

This is the C1 boundary: the tenant domain does not know what a release is, only how to ask for a bundle URL.

## 3. Data model

```sql
tenant_release_pointers(
  org_id text primary key,
  release_id uuid not null references releases(id),
  previous_release_id uuid references releases(id),
  updated_by text not null,
  updated_at timestamptz not null default now()
)
```

One row per org. `previous` exists so rollback is a single write, not a search.

## 4. Behaviour

| Operation | Rule |
|---|---|
| **promote** | release must be `ready`; if the pointer already points at it, no-op (no Evidence, no timestamp churn) |
| **promote** | writes `previous = current.active`, `active = release` |
| **rollback** | requires `previous`; swaps `active` and `previous` |
| **clientBundle** | pointer → release → artifact `kind = client_bundle`; returns `url = artifact.ref`, `hash = digest`, `version = releaseId`; no pointer/artifact → `null` |
| **Evidence** | one `platform.release.tenant_promoted` per real move; data: tenant org, from, to, actor, rollback flag |

## 5. Catalog projection

`GET /api/tenants/:slug/catalog` keeps returning the stored manifest (extensions, publishable key), but when the
pointer resolves:

```json
{
  "private": {
    "name": "release",
    "url": "tenants/<org>/releases/r_17/remoteEntry.js",
    "hash": "sha256:3f…",
    "version": "r_17"
  }
}
```

The client already loads `manifest.private.url`; **no client change is required**. If no pointer exists, the
stored manifest is returned unchanged — the old behaviour is the fallback.

## 6. API

| Method | Path | Permission | Effect |
|---|---|---|---|
| GET | `/api/releases/pointer` | `releases:read` | current + previous pointer |
| POST | `/api/releases/:id/promote` | `releases:write` | promote the release for the request org |
| POST | `/api/releases/pointer/rollback` | `releases:write` | swap active/previous |

## 7. Acceptance

1. Promote a `ready` release → pointer row; `GET /api/tenants/:slug/catalog` returns that release’s bundle URL.
2. Promote a `building` release → 409; no pointer, no Evidence.
3. Promote the same release twice → one Evidence row, pointer unchanged.
4. Promote r2 after r1, then rollback → catalog returns r1’s URL; pointer previous = r2.
5. Rollback with no previous → 409.
6. No pointer → catalog falls back to the stored manifest byte-for-byte.
7. Release domain still imports nothing from tenant/eval/gate.

## 8. Out of scope

| Not here | Where |
|---|---|
| Promotion waves / percentage cohorts | later D1 continuation |
| UI for promotion / release list | later |
| Auto-halt on eval regression | later gate wiring |
| Server image pointer | D15 selector (done) |
| Bundle retention/GC | later |

## 9. Risks

| Risk | Mitigation |
|---|---|
| Catalog cache staleness after a move | the projection reads the pointer every request; the manifest cache key can include releaseId (next) |
| Pointer to a release with no `client_bundle` | `clientBundle` returns null → catalog falls back; promote should eventually require the artifact (gate wiring) |
| Tenant slug ↔ org confusion | pointer is keyed by `orgId`; promote uses the request org, catalog resolves slug → org first |
| Evidence written after the move | single-writer API; a failed Evidence write is a 500 after a committed move — acceptable and visible |

## 10. Implementation evidence (2026-11-07)

**Code**

| Path | Role |
|---|---|
| `domains/release/schema.ts` | `tenant_release_pointers` (org PK, active/previous FK) |
| `domains/release/pointer-service.ts` | promote / rollback / clientBundle, ready precondition, no-op, Evidence |
| `domains/release/adapters/postgres.ts` | `createPostgresPointerStore` (upsert) |
| `domains/release/api.ts` | `GET /pointer`, `POST /:id/promote`, `POST /pointer/rollback` |
| `domains/tenant/routes/{deps,catalog}.ts` | `ClientBundleResolver` + catalog projection |
| `domains/tenant/{api,index}.ts`, `bootstrap.ts` | wiring: tenant → release through a function, not an import |
| `drizzle/0004_high_doctor_octopus.sql` | migration |
| `pointer-service.test.ts` | 7 tests |

**Verification**

| Check | Command | Observed |
|---|---|---|
| Types | `pnpm --filter @noname/server typecheck` | clean |
| Unit | `pnpm vitest run packages/server/src/domains/release` | **37/37** (7 pointer + 8 environment + 7 release + 15 classifier) |
| Full suite | `pnpm vitest run packages/server` | **626/626**, 140 files |
| Migration | `db:migrate` | `tenant_release_pointers` exists |
| Promote | `POST /:id/promote` | **200**, pointer active |
| Catalog | `GET /api/tenants/yogastore/catalog` | `private.url = tenants/<org>/releases/r2/remoteEntry.js` |
| Rollback | `POST /pointer/rollback` | **200**, previous swapped |
| Catalog back | same endpoint | returns `r1`’s URL |
| Not ready | promote a `building` release | **409**, no pointer write |
| Fallback | delete pointer, fetch catalog | stored manifest returned unchanged (no `private`) |
| Evidence | `platform.release.tenant_promoted` | promote/rollback rows with from/to/rollback |
| Dependency | grep imports in `domains/release` | none from tenant/eval/gate |

**Limits recorded.** Promotion is tenant-at-a-time (waves/UI are next); catalog caching still uses the manifest
store and the projection re-reads the pointer per request; promotion does not yet require a `client_bundle`
artifact (it falls back instead); the catalog requires the edge HMAC when called directly, so e2e used the same
headers as the edge.

The runnable record is in [`RELEASE-VERIFICATION-LOG.md`](./RELEASE-VERIFICATION-LOG.md).

## 11. Continuation — cache key, promotion gate, retention (2026-11-07)

**Implemented**

| Piece | What changed |
|---|---|
| **Cache key** | `CatalogManifestRemote.version` is `number | string`; the client cache key now includes `private.version`, so a pointer move invalidates the catalog cache even if a digest is reused |
| **Promotion gate** | `assertMigrationsPromotable(release)` runs before a tenant promote and before an environment activate. It resolves `migration_set` refs (comma-separated paths) to files, classifies them with D16, and returns **409** on a destructive set. Refs that cannot be resolved to files are allowed and recorded as unverifiable |
| **Retention** | `POST /api/releases/prune { keep }` (default 3) keeps the newest N releases plus anything referenced by the tenant pointer or an environment, and deletes the rest; artifacts cascade. R2 objects are **not** deleted — object lifecycle is separate |

**Deferred, with reasons**

| Piece | Why not now |
|---|---|
| **Promotion waves** | A wave promotes across orgs. The platform has no platform-operator identity/permission: every org admin is `admin`, so a cross-org batch endpoint would be a tenant-escalation hole. Needs a platform-admin role or an operator CLI with its own auth |
| **Tenant list UI** | There is no release admin surface in the app yet; building one is a UI project, not a release-domain change. The API is complete (`GET /environments`, `GET /pointer`, `GET /releases`) |

**Validation**

- destructive set → 409 `[DROP COLUMN]`; additive set → 200;
- prune → 200, deletes older releases, pointer/environment releases survive;
- catalog still projects the pointed release after prune;
- 44 release-domain tests, 633 full server tests.
