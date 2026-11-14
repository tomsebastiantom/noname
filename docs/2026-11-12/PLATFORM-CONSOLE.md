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

Browser (Playwright + Chromium), signing in as a platform operator at `http://platform.localhost:5173`:

```
POST /api/auth/platform/login   → 200, token stored, no session clear
GET  /admin/platform            → page stays put (no login bounce)
GET  /api/platform/tenants      → 200, four tenants
GET  …/:orgId/provisioning      → 200, state ready (backfilled)
GET  …/:orgId/verdict           → 200, block / pass / missing
```

Rendered console, verbatim:

```
Tenants — Every tenant the control plane knows about, with its provisioning and verdict state.
Slug | Status | Provisioning | Verdict | Invite admin
blocked-demo    active     ready  block
noverdict-demo  active     ready  pass
suspended-demo  suspended  ready  missing
yogastore       active     ready  pass
```

Actions exercised from the UI:

| Action | Result |
|---|---|
| **Create** (`console-check`) | `POST /api/platform/tenants → 202`, row appears, notice “Provisioning console-check — steps will complete shortly.” Tenant removed afterwards. |
| **Backfill existing** | notice “Backfill: examined 5, created 0.” — idempotent, proven in the browser |
| **Acknowledge** (API) | `200 {acknowledged:true}`, evidence row `platform.verdict.acknowledged` for `999000111` |

### Invite from the console — verified

Clicking **Invite** on the `yogastore` row with `invited@noname.local`:

```
POST /api/platform/tenants/398655937176469540/invite → 200
notice                                               → "Invited invited@noname.local."
tenant_provisioning.steps.invite                     → { status: "done", at: … }
```

The user is created in the tenant org and granted `ORG_OWNER`; ZITADEL leaves them `USER_STATE_INITIAL` on purpose.

### Activation — deliberately out of our scope

The invited account becomes usable only after the person follows ZITADEL's activation link and sets a password. That
flow is **ZITADEL's**, not ours: the console's responsibility ends at "user created, role granted, invite step done".

Two practical notes from trying to drive it locally:

- with no SMTP, the init code appears in the ZITADEL log (`msg="missing translation" … Code:XXXXXX`), so activation is
  reachable without email;
- the `/ui/login/password/init` page rejected the codes we pulled from the log (`Code is invalid`), so completing the
  flow by script needs the link exactly as ZITADEL generates it, not a reconstructed URL. That is a dev-tooling gap,
  not a defect in the console.

The test account was deleted afterwards.

The negative case still holds: a tenant editor receives `403` and “Platform operator rights are required.”

### Why it needed a fix in the edge

The console's token is issued by the **platform** client, so its `aud` lists the platform client and project rather than
the tenant client. The edge verified against `env.ZITADEL_CLIENT_ID` alone, treated the token as anonymous, and the API
answered 401 — which made the app clear the session and bounce back to `/login`. The edge now selects whichever of our
identifiers the token actually carries (`ZITADEL_CLIENT_ID`, `ZITADEL_PROJECT_ID`, `ZITADEL_PLATFORM_PROJECT_ID`,
`ZITADEL_PLATFORM_CLIENT_ID`), and still fails closed when none match.

A second, quieter defect: the platform org's copies of `login`, `admin_shell` and `admin_platform` were stale, so the
page loaded the shell with an empty panel. Refreshing them from the seeded demo org made the console render.

Tests: `site-id`, `tenant`, `auth` — **76/76**; `workers` — **64/64**. Typecheck clean for server, client, catalog,
seeding and workers.

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
