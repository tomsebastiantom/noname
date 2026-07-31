# Auth ⇄ Documents ⇄ Tenant Boundary Fix

Date: 2026-07-30
Status: Plan — not yet implemented

Related: `docs/2026-07-30/CODEBASE-AUDIT-CLEANUP.md` §1.2 ("Domains reaching into each other's internals").

## Problem

`auth`, `documents`, and `tenant` are supposed to be consumed only through each
domain's `index.ts` public surface. Today four sites reach past that into
internal files:

| Consumer | Reaches into | Why |
|---|---|---|
| `auth/providers/publish.ts` | `documents/content-types/auth-provider`, `documents/ports`, `documents/tenant/auth-config` | needs to read/write `TenantAuthConfig` after a CMS publish event |
| `documents/refs/resolve.ts` | `auth/asset-url` | needs `iconUrlFromAsset` to build asset previews |
| `tenant/adapters/r2.ts` | `documents/assets/r2` | re-exports the R2 config helper, no real need for a separate copy |
| `documents/content-types/auth-provider/runtime.test.ts` | `documents/tenant/auth-config` | test-only, same pattern |

`auth/service.ts`, `auth/api.ts`, `auth/idp-registry.test.ts`, and
`auth/account-flows.test.ts` also import `documents/tenant/auth-config` /
`documents/content-types/auth-provider` directly — not named in the audit but
the same issue, and fixed by the same change.

This is a boundary leak, not a god-file problem. The `documents/service.ts`
split (894 lines) is unrelated and should be a separate PR — doing the file
split first without fixing this leaves the circular coupling in place.

## Why "just fix the import path" is a real fix, not cosmetic

`documents` and `auth` genuinely need to share `TenantAuthConfig`
normalization and asset-icon-URL logic — that dependency is real and isn't
going away. What's wrong today is *how* they get it: by reaching into each
other's private files instead of a declared public export.

Re-pointing imports to `index.ts` doesn't remove the coupling — it makes it
explicit and enforceable. Once every consumer imports only from `index.ts`,
the internals of `documents/tenant/auth-config.ts` can be renamed or
restructured without breaking `auth` or `tenant`, because they never saw the
internal path. That's the actual value of the fix.

## One real misplacement: `iconUrlFromAsset`

`auth/asset-url.ts` exports two things:

- `iconUrlFromAsset(asset)` — takes an `AssetDTO`, returns a URL. Touches zero
  auth concepts (no tokens, no ZITADEL, no sessions). This is asset logic
  that happens to live under `auth/` for no structural reason.
- `resolveProviderIconUrls(...)` — this **is** auth logic (resolving login
  provider icons for `GET /auth/config`), and it calls `iconUrlFromAsset`
  internally.

So beyond the barrel-export fix, `iconUrlFromAsset` should move to
`documents/assets/` where it belongs. Once moved, `documents/refs/resolve.ts`
importing it is an intra-domain import, not a cross-domain one — the leak
disappears structurally instead of being routed through a barrel.

## Fix order

1. **Move `iconUrlFromAsset`** from `auth/asset-url.ts` to
   `documents/assets/icon-url.ts` (new file). Export it from
   `documents/index.ts`.
   - `auth/asset-url.ts` keeps `resolveProviderIconUrls`, importing
     `iconUrlFromAsset` from `../documents`.
   - `documents/refs/resolve.ts` imports `iconUrlFromAsset` from the sibling
     `../assets/icon-url` — same domain now, not a boundary crossing.

2. **Export the auth-config contract from `documents/index.ts`.**
   `normalizeAuthConfig`, `mergeAuthConfig`, `enabledProviders`,
   `idpIdForProvider` (in `documents/tenant/auth-config.ts`) and
   `AUTH_PROVIDER_CONTENT_TYPE`, `buildGenericOAuthPayload`,
   `customProviderId`, `parseAuthProviderEntryData`,
   `isSupportedLoginProvider`, `parseIconAssetId` (in
   `documents/content-types/auth-provider/`) get added to
   `documents/index.ts`'s exports. No files move — `documents` already owns
   `TenantAuthConfig` in `ports.ts`, this just gives it a public door.

3. **Re-point every cross-domain import to the barrel:**
   - `auth/providers/publish.ts` → import from `../../documents` instead of
     three separate internal paths.
   - `auth/service.ts`, `auth/api.ts` → import from `../documents` instead of
     `../documents/tenant/auth-config` / `../documents/content-types/auth-provider`.
   - `auth/idp-registry.test.ts`, `auth/account-flows.test.ts` → same swap.
   - `documents/content-types/auth-provider/runtime.test.ts` → import
     `DEFAULT_TENANT_AUTH` from `../../index` instead of
     `../../tenant/auth-config`.
   - `tenant/adapters/r2.ts` → import `R2Config`/`r2ConfigFromEnv` from
     `../../documents` instead of `../../documents/assets/r2`.

4. **Leave same-domain internal imports alone.** `documents/adapters/postgres.ts`
   importing `normalizeAuthConfig` from the sibling `../tenant/auth-config` is
   an intra-domain import, not a boundary violation — don't route it through
   the barrel (risk of a self-referential import cycle through
   `documents/index.ts`). Only fix imports that cross a domain line.

5. **Verify:** `pnpm --filter @noname/server typecheck`, plus the affected
   test files (`account-flows.test.ts`, `idp-registry.test.ts`,
   `resolve.test.ts`, `runtime.test.ts`).

6. **Then, separately:** split `documents/service.ts` into
   `content-types.service.ts` / `layouts.service.ts` / `pages.service.ts` /
   `assets.service.ts` / `tenant-settings.service.ts` behind one barrel — no
   behavior change, separate PR, per the audit's own recommendation.

## Non-goals for this pass

- Not moving `TenantAuthConfig` normalization out of `documents` into a new
  `shared/auth-provider-contract.ts` — `documents` is already the natural
  owner (it owns `TenantAuthConfig` and the `auth_provider` content type), so
  a new shared module would just be an extra indirection layer with no
  ownership benefit.
- Not touching `documents/service.ts` in this pass (separate PR, see above).

