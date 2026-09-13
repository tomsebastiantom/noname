# Checkout Reliability — Live Verification and Commit Gate

> **Date:** 2026-09-12  
> **Status:** Code milestone implemented; commit intentionally blocked pending live browser MCP verification.

## Scope verified in code

The current milestone includes:

- Documentation-first execution plan and tracker.
- Deterministic local event-bus delivery with Redis cross-replica fan-out.
- XState machine-definition normalization and ephemeral actor regression tests.
- Durable capability idempotency schema, request hashing, replay, conflict, and retry handling.
- Durable provider-event receipts and duplicate callback suppression.
- `checkout_started` cart transition.
- Commerce success/failure provider mappings.
- Checkout pricing and in-memory flow contract tests.

## Automated verification completed

- `pnpm typecheck` — PASS
- `pnpm test` — PASS, 147 test files / 520 tests
- `pnpm build` — PASS
- Targeted Biome checks for changed implementation files — PASS
- Focused capability, machine, provider receipt, and commerce flow tests — PASS

Repository-wide `pnpm check` still reports pre-existing formatting/import issues outside this milestone. The changed implementation files pass targeted checks.

## Live verification required before commit

The commit gate is deliberately not satisfied until the running stack is tested through Browser MCP.

Required health checks:

```text
GET http://localhost:3000/health
GET http://localhost:8080/.well-known/openid-configuration
GET http://localhost:3000/api/tenants/resolve/yogastore
```

Required Browser MCP checks:

1. Navigate to `http://yogastore.localhost:5173/` and confirm storefront rendering.
2. Navigate to `/login` and confirm login form rendering.
3. Log in as the seeded admin user.
4. Navigate to `/admin` and confirm the admin dashboard.
5. Navigate to `/?edit=true` and confirm the visual editor.
6. Exercise commerce checkout with a seeded product.
7. Confirm server-derived pricing and `awaiting_payment` state.
8. Submit a provider callback through the configured Nango path.
9. Confirm the final `paid` state.
10. Replay the callback and confirm no duplicate transition.
11. Reload the machine instance and confirm persisted state/context.
12. Check browser console output for new errors.

## Verification attempt on 2026-09-12

The health-check command was attempted, but the local services were unavailable. No API, ZITADEL, or tenant response was returned. Therefore Browser MCP verification could not be truthfully performed.

The repository currently reports Podman unavailable as well, so the new database schemas have not yet been applied with `db:push`. A follow-up `podman machine list` timed out and Docker is not installed in this environment. A retry of `podman compose up -d` still failed because the configured socket at `127.0.0.1:59525` refused the connection; `podman machine start` also timed out.

### Recovery attempt

Podman subsequently became available. The following live checks now pass:

- `podman compose up -d` — PASS
- `pnpm --filter @noname/server db:push` — PASS; capability and provider receipt schemas applied
- `http://localhost:8080/.well-known/openid-configuration` — HTTP 200
- `http://localhost:3003/health` — HTTP 200 (`{"result":"ok"}`)
- `http://localhost:3000/health` — HTTP 200
- `http://localhost:8787/health` — HTTP 200
- `http://localhost:5173/` — HTTP 200
- `pnpm init:nango` — PASS; admin, environment secret, Stripe integration, provider webhook URL, and HMAC signing key provisioned idempotently
- `pnpm init:zitadel` — PASS
- `pnpm seed:demo` and `pnpm seed:demo:commerce` — PASS
- Edge tenant resolution for `yogastore` — HTTP 200

### Browser MCP evidence

A live Playwright MCP session was started on `http://localhost:8931` using the Chrome browser channel. The MCP tools were called through JSON-RPC and produced these results:

- Storefront `/` — PASS after sign-in; rendered the seeded commerce layout and `$99.99` product.
- `/login` — PASS; email/password form rendered and admin sign-in completed.
- `/admin` — PASS; dashboard and navigation rendered.
- `/?edit=true` — PASS; visual editor rendered with connected editor state.
- Add to Cart — PASS; cart changed to `1 item`, `99.99 CAD`, and enabled Checkout.
- Checkout capability — PASS after registering the existing Nango connection through `pnpm init:nango:connect`; Stripe Checkout opened in Sandbox at `checkout.stripe.com` for `CA$99.99`.
- Stripe test payment — PASS with test card `4242 4242 4242 4242`, expiration `12/34`, CVC `123`, and postal code `M5V 3A8`; Browser MCP returned to `/?checkout=success`.
- Browser console — no application errors in the Stripe checkout session. A favicon 404 remains.

The first live checkout attempt exposed a real migration defect: `drizzle.config.ts` did not include the newly added capability and provider-receipt schemas. The config was corrected and `db:push` rerun successfully. The existing Nango connection was then registered through the authenticated Noname tenant-settings API; no credential was copied into the app database.

The success redirect is not treated as authoritative payment confirmation. The callback gate was then exercised with a signed local Nango-boundary simulation using the real `yogastore-stripe-test` connection ID:

- Signed `checkout.session.completed` callback — PASS; API returned `received: true`.
- Normal BullMQ/provider-event path — PASS; machine `1095319b-49b3-4324-8aeb-e46bfc1b399d` transitioned from `awaiting_payment` to `paid` with `paymentRef=pi_local_test`.
- Duplicate callback replay — PASS; machine stayed `paid` and exactly one completed durable receipt remained.

The first callback simulation exposed another real defect: BullMQ custom job IDs cannot contain `:`. The provider enqueue ID is now URI-encoded while durable receipt identity remains unchanged.

### Local callback testing strategy

A local browser cannot receive a real Stripe webhook from the public Stripe service unless a public tunnel or Stripe CLI forwarding endpoint is configured. For deterministic local testing, mock the event at the **Nango-to-Noname boundary**, not at the browser redirect:

1. Keep the real Browser MCP checkout and Stripe Sandbox payment test.
2. Capture the checkout machine instance ID from the server-authoritative checkout request/session metadata.
3. Inject a Stripe-shaped `checkout.session.completed` event through a local Nango/provider-event test harness with the real connection ID.
4. Let the normal receipt claim, BullMQ job, provider normalization, and XState transition run — completed.
5. Inject the same event again and verify the durable receipt suppresses the duplicate — completed.
6. Query/reload the persisted machine and verify it is `paid` — completed at the database state; browser reload confirmation remains a final UI check.

This is explicitly a provider-callback simulation; it is reported separately from a real Stripe webhook delivery. A real external callback can be added later with Stripe CLI/tunnel forwarding without changing the application path.

## Commit rule

Do not create the milestone commit until:

- Podman/infrastructure is running.
- `db:push` succeeds for the new capability and provider receipt tables.
- Browser MCP storefront/login/admin/editor smoke checks pass.
- Checkout callback-to-`paid` verification passes.
- Duplicate callback and reload checks pass.
- A final `pnpm typecheck`, `pnpm test`, and `pnpm build` pass is recorded.

After those checks, update this document with the exact Browser MCP evidence and create one focused commit containing the milestone.
