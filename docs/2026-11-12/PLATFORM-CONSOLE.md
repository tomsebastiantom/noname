# Platform operator console

> **Status:** **implemented** 2026-11-14 · Admin panel + reserved `platform` host slug
> **Related:** [`TENANT-PROVISIONING-RFC.md`](./TENANT-PROVISIONING-RFC.md) · [`CREDENTIAL-LIFECYCLE-AUDIT.md`](./CREDENTIAL-LIFECYCLE-AUDIT.md) · `skills/spec-driven-ui`

---

## 1. Who it is for, and how it is reached

```
http://platform.localhost:5173/admin/platform
```

The console is **not a tenant**. It has no settings document and no storefront. `platform` is a **reserved slug**:
`resolveSiteIdToOrgId` maps it straight to `PLATFORM_ORG_ID`, and `POST /api/platform/tenants` refuses to create a
tenant with that slug.

Before this, reaching the console required hand-inserting a `tenant_settings` row for the platform org — a fixture that
made a platform surface look like customer data. That row is gone; resolution now comes from configuration:

```
GET /api/tenants/resolve/platform
→ 200 { orgId: <PLATFORM_ORG_ID>, slug: "platform", platform: true }
```

Access requires a **human** in the platform org holding `platform_operator`. Until 2026-11-14 the platform org held
three machine accounts and no person, so the console would have been a locked room.

## 2. What it does

| Control | Endpoint | Guard |
|---|---|---|
| Tenant table (slug, status, provisioning, verdict) | `GET /api/platform/tenants`, `…/:orgId/provisioning`, `…/:orgId/verdict` | `RELEASES_PLATFORM_READ` |
| Create tenant (slug) | `POST /api/platform/tenants` → **202** | `RELEASES_PLATFORM_WRITE` |
| Backfill existing tenants | `POST /api/platform/tenants/backfill` | `RELEASES_PLATFORM_WRITE` |
| Invite admin (email) | `POST /api/platform/tenants/:orgId/invite` | `RELEASES_PLATFORM_WRITE` |
| Acknowledge an `unverified` verdict | `POST /api/platform/tenants/:orgId/verdict/ack` | `RELEASES_PLATFORM_WRITE` |

The screen holds **no authority of its own**: every call is guarded server-side by `requirePlatformOperator` plus a
permission. On 401/403 the panel says “Platform operator rights are required” rather than showing an empty table.

**Acknowledgement never promotes.** The verdict stays `unverified` and a wave still skips the tenant; the ack records
*who accepted which gap* in the audit stream. Turning it into a pass would delete D9's fail-closed rule.

## 3. Shape — it follows `spec-driven-ui`

The page is a **layout document**, not a hand-written route:

```
/admin/platform → templateFromPath → admin_platform layout → GET /api/edge/schema → <Renderer/>
```

| Piece | File |
|---|---|
| Panel component | `packages/client/src/admin/components/platform/PlatformTenantsAdmin.tsx` |
| Component registration | `packages/client/src/admin/registry.ts` |
| Layout spec | `packages/seeding/src/profiles/platform/demo-specs.ts` (`adminPlatformSpec`) |
| Layout seed | `packages/seeding/src/profiles/platform/index.ts` → `upsertLayout("admin_platform", …, { renderAs: "panel", shellRef: "admin_shell" })` |
| Route | `packages/client/src/platform-routes.ts` → `/admin/platform` |
| Access rule | `packages/client/src/auth/admin-routes.ts` → `platform: RELEASES_PLATFORM_READ` |

## 4. Verification

Live, on the local stack:

```
POST /api/platform/tenants/backfill → { examined: 5, created: 5 }
GET  /api/tenants/resolve/platform  → 200, platform: true      (no tenant_settings row exists)
deep link /admin/platform           → 200 text/html (SPA serves it)
```

Browser (Playwright + Chromium), signed in as a **tenant** editor — the negative case:

```
GET /api/platform/tenants → 403 {"error":"Forbidden"}
rendered text             → "Platform operator rights are required."
screenshot                → evidence/platform-console-guard.png
```

So the panel mounts, calls the API, and honours the server's refusal. Getting the panel to mount at all required a
catalog entry — `defineRegistry` only exposes components declared in `@noname/catalog`, so a React component added to
`admin/registry.ts` alone is silently skipped. That is the trap this document exists to record.

Not yet verified: the **positive** case (a platform operator seeing the tenant table), because platform-org humans
cannot authenticate — see §5.

Tests: `site-id`, `tenant`, `auth` — **76/76**. Typecheck clean for `@noname/server`, `@noname/client`,
`@noname/catalog`, `@noname/seeding`.

## 5. Limits

- **Platform-org humans cannot log in yet.** `POST /api/auth/platform/login` answers `401 Errors.User.NotFound`
  because the login adapter resolves the user through the **demo project's** org. The operator exists, holds
  `platform_operator`, and has a password — the OIDC client is simply bound to another project. Fix is architectural:
  a second login client in the platform project, or an explicit project grant for the platform org.

- **Create/invite from the UI are thin wrappers.** They surface the API's `202` and errors verbatim; there is no
  optimistic state or progress poller yet — refresh shows the steps.
- **No key rotation or offboarding controls.** Offboarding is still RFC-only.
- **Local operator account** was created with a password (`operator2@noname.local`), not by invite: ZITADEL refuses to
  set a password on an uninitialised invited user. Production flow should use the invite + activation link.
