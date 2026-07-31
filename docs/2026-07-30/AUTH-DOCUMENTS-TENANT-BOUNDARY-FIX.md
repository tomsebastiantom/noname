# Auth ⇄ Documents ⇄ Tenant Boundary Fix

Date: 2026-07-30
Status: **Implemented** (2026-07-31)

Related: audit priority 8 — [`CODEBASE-AUDIT-FIXED.md`](../archive/2026-07-30/CODEBASE-AUDIT-FIXED.md).

## Problem

`auth`, `documents`, and `tenant` are supposed to be consumed only through each
domain's `index.ts` public surface. Four sites were reaching past that into
internal files (all fixed — see below).

| Consumer | Was reaching into | Fix |
|---|---|---|
| `auth/providers/publish.ts` | `documents/content-types/auth-provider`, `documents/tenant/auth-config` | ✅ imports from `documents` barrel (`contracts.ts`) |
| `documents/refs/resolve.ts` | `auth/asset-url` | ✅ `iconUrlFromAsset` moved to `documents/assets/icon-url.ts`; sibling import |
| `tenant/adapters/r2.ts` | `documents/assets/r2` | ✅ imports from `documents` barrel |
| `documents/content-types/auth-provider/runtime.test.ts` | `documents/tenant/auth-config` | ✅ imports `DEFAULT_TENANT_AUTH` from `documents/index` |

Also fixed (same pattern):

| Consumer | Was reaching into | Fix |
|---|---|---|
| `auth/service.ts`, `auth/api.ts` | internal auth-config / auth-provider paths | ✅ `documents` barrel |
| `auth/idp-registry.test.ts`, `auth/account-flows.test.ts` | `documents/tenant/auth-config` | ✅ `documents` barrel |
| `auth/index.ts`, `auth/idp-registry.ts`, `auth/asset-url.ts` | `documents/ports` | ✅ `documents` barrel |
| `tenant/index.ts`, `tenant/api.ts` | `documents/ports` | ✅ `documents` barrel |
| `edge/index.ts`, `edge/api.ts`, `edge/service.ts` | `documents/ports` | ✅ `documents` barrel |
| `analytics/replay-storage.ts` | `documents/assets/r2` | ✅ `documents` barrel |
| `shared/site-id.ts` | `documents/ports` | ✅ `documents` barrel |

## Public surface

Cross-domain consumers import from `documents/index.ts`, which re-exports
`documents/contracts.ts` (no dependency on `api.ts` / `service.ts`, so auth
does not pull the documents HTTP stack when importing helpers).

`createDocumentsDomain` lives in `documents/domain.ts` and is re-exported from
`index.ts` for server bootstrap only.

### Exported from `documents/contracts.ts`

- **Assets:** `iconUrlFromAsset`, `R2Config`, `r2ConfigFromEnv`, `createR2AssetStorage`
- **Auth config:** `normalizeAuthConfig`, `mergeAuthConfig`, `enabledProviders`, `idpIdForProvider`, `DEFAULT_TENANT_AUTH`
- **Auth provider CMS:** `AUTH_PROVIDER_CONTENT_TYPE`, `buildGenericOAuthPayload`, `customProviderId`, `parseAuthProviderEntryData`, `parseAuthProviderDisplayData`, `parseIconAssetId`, `isSupportedLoginProvider`, `listPublishedAuthProviders`, `resolveLoginProviders`, …
- **Types:** `TenantAuthConfig`, `TenantSettingsService`, `DocumentStorage`, `MediaRef`, …

## `iconUrlFromAsset` placement

- **Source:** `documents/assets/icon-url.ts`
- **Auth:** `auth/asset-url.ts` keeps `resolveProviderIconUrls` only; imports `iconUrlFromAsset` from `../documents`
- **Documents:** `documents/refs/resolve.ts` imports sibling `../assets/icon-url` (intra-domain)

## Intentionally unchanged (intra-domain)

Same-domain imports still use internal paths — not routed through the barrel
(avoid self-referential cycles through `documents/index.ts` → `service.ts`):

- `documents/adapters/postgres.ts` → `../tenant/auth-config`
- `documents/api.ts` → `../tenant/auth-config`
- `documents/tenant/auth-config.ts` → `../content-types/auth-provider`

## Verification

```bash
pnpm vitest run --config vitest.config.ts \
  packages/server/src/domains/auth/account-flows.test.ts \
  packages/server/src/domains/auth/idp-registry.test.ts \
  packages/server/src/domains/documents/refs/resolve.test.ts \
  packages/server/src/domains/documents/content-types/auth-provider/runtime.test.ts
```

All pass (2026-07-31).

## Remaining / out of scope

| Item | Status |
|---|---|
| `documents/service.ts` split (894 lines) | **Separate PR** — not part of boundary fix |
| `documents/api.ts` → `auth/guards` | **OK** — documents HTTP layer legitimately uses auth permission guards; opposite direction from the leaks we fixed |
| `TenantAuthConfig` in new `shared/` module | **Declined** — documents remains owner |

## Non-goals (unchanged)

- Not moving `TenantAuthConfig` normalization out of `documents` into a new
  `shared/auth-provider-contract.ts` — `documents` is already the natural
  owner (it owns `TenantAuthConfig` and the `auth_provider` content type).
- Not touching `documents/service.ts` in this pass (separate PR).
