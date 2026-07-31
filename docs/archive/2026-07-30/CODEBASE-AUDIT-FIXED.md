# Codebase Audit — Fixed Items

> **Archived from:** [`CODEBASE-AUDIT-CLEANUP.md`](../../2026-07-30/CODEBASE-AUDIT-CLEANUP.md)

| Priority | Fix | Area | Done |
|---|---|---|---|
| 1 | Edge fetch timeouts; delete dead `renderer.ts` | Workers | 2026-07-30 |
| 2 | MF per-remote error isolation + parallel marketplace loads | Client | 2026-07-30 |
| 3 | JWKS KV cache; HMAC key cache; public-route JWT skip; conditional POST body buffer | Workers | 2026-07-30 |
| 4 | Stale doc banners + archive 2026-05-23 build docs; delete LOGIN-UI stubs | Docs | 2026-07-30 |
| 5 | `apiFetch` helper + admin/auth migration (`useAsyncForm` deferred) | Client | 2026-07-30 |
| 6 | `shared/pagination.ts` + analytics routes | Server | 2026-07-31 |
| 7 | Split `documents/service.ts` → `documents/services/*` | Server | 2026-07-31 |
| 8 | Auth/documents/tenant cross-imports via `contracts.ts` | Server | 2026-07-31 — [`AUTH-DOCUMENTS-TENANT-BOUNDARY-FIX.md`](../../2026-07-30/AUTH-DOCUMENTS-TENANT-BOUNDARY-FIX.md) |
| 9 | Error-handling convention doc | Server | 2026-07-31 — [`ERROR-HANDLING.md`](../../2026-07-31/ERROR-HANDLING.md) |
| 10 | Product docs → `docs/product/` | Docs | 2026-07-31 |
| 11 | Fail-closed edge HMAC | Server / security | 2026-07-31 |
| 12 | Redis pub/sub for `event-bus` + `sse-manager` | Server | 2026-07-31 |
| 13 | Redis-backed `ManifestStore` (Dragonfly) | Server | 2026-07-31 |
| 14 | CI workflow (`.github/workflows/ci.yml`); bundler validation tests | Server / CI | 2026-07-31 |
| 15 | Catalog build timeout + `validateComponentSource` | Server | 2026-07-31 |
| 16 | Permission checks on flags/machines/tenant/agent APIs | Server / security | 2026-07-31 |
| 17 | `fetchUserinfo` timeout + response size cap | Auth package | 2026-07-31 |

**Also fixed (2026-07-31):** ClickHouse creds fail-loud in production; shared `denyUnless`; new permissions (`flags:write`, `tenant:manage`, `agent:manage`, `machines:define`); CLI `dev`/`status` wired; guards exported from `auth/index.ts`.

**Intentional deferral:** `documents/api.ts` → `auth/guards` (optional: already exported from `auth/index.ts`).

---

## 2026-07-31 batch

See [`docs/archive/2026-07-31/AUDIT-FIXED.md`](../2026-07-31/AUDIT-FIXED.md) for documents dedupe, flags/agent/edge/analytics/auth/machines cleanup, deprecated removal, S3358 fixes, and docs.
