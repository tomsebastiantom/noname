# Codebase Audit — Fixed Items

> **Archived from:** [`CODEBASE-AUDIT-CLEANUP.md`](../../2026-07-30/CODEBASE-AUDIT-CLEANUP.md)  
> **Date:** 2026-07-30 audit · fixes through 2026-07-31

Completed work from the full audit. See linked docs for detail.

| Priority | Fix | Area | Done |
|---|---|---|---|
| 1 | Edge fetch timeouts; delete dead `renderer.ts` | Workers | 2026-07-30 |
| 2 | MF per-remote error isolation + parallel marketplace loads | Client | 2026-07-30 |
| 3 | JWKS KV cache; HMAC key cache; public-route JWT skip; conditional POST body buffer | Workers | 2026-07-30 |
| 4 | Stale doc banners + archive 2026-05-23 build docs; delete LOGIN-UI stubs | Docs | 2026-07-30 |
| 5 | `apiFetch` helper + admin/auth migration (`useAsyncForm` deferred) | Client | 2026-07-30 |
| 7 | Split `documents/service.ts` → `documents/services/*` composer | Server | 2026-07-31 |
| 8 | Auth/documents/tenant cross-imports via `contracts.ts` / barrel | Server | 2026-07-31 — [`AUTH-DOCUMENTS-TENANT-BOUNDARY-FIX.md`](../../2026-07-30/AUTH-DOCUMENTS-TENANT-BOUNDARY-FIX.md) |
| 11 | Fail-closed edge HMAC when `WORKER_SERVER_SECRET` set | Server / security | 2026-07-31 |

**Also fixed (not in priority table):** PKCE dedup, `FeatureFlagsAdmin` → `admin/flags.ts`, MF catalog memoization + collision warnings, extension loader isolation.

**Intentional deferral:** `documents/api.ts` → `auth/guards` (reverse import; optional: export guards from `auth/index.ts`).
