# Expandability

> How much friction there is to add a new domain, feature, panel, field type, or integration. See [`README.md`](./README.md) for scope/method.

---

## Adding a new server domain requires touching ≥4 files by hand

There is no domain registry or plugin mechanism — a new domain means manually editing:

1. `src/index.ts` — import the factory, wire its deps, `app.route(...)` it, and get the dependency order right relative to `documents` (which most domains implicitly depend on).
2. `drizzle.config.ts` — add the schema path.
3. `src/drizzle.ts` — import and spread the new schema.
4. `src/domain-events.ts` — add to `DOMAIN_EVENT_SOURCES` if analytics should auto-ingest its events (already missed for `CommsEvents`/`WebhookEvents` — see `ARCHITECTURE.md`).

Webhook-emitting domains need a **5th** manual step: subscribing in `webhooks/outbound-router.ts`'s `WebhookPlatformEventTypes` list.

None of these are individually hard, but there's no test or compile-time check that catches a missed step — the `CommsEvents`/`WebhookEvents` omission from `domain-events.ts` is exactly this failure mode, already live in the codebase.

## Adding a new client admin panel requires ≥7 touch points, already out of sync in one case

1. React component under `admin/components/`.
2. Register in `admin/registry.ts`'s `adminComponents` map.
3. Zod schema added to `admin/schemas/components.ts` (already a 676-line monolith covering every panel).
4. Action(s) added to `admin/schemas/actions.ts` (297 lines) plus a handler in `core/actions/`.
5. Route mapping in `platform-routes.ts`'s `platformTemplateFromPath`.
6. Route id/path/permission entry in `auth/admin-routes.ts`.
7. Nav highlight logic in `adminActiveNavFromPath` (`platform-routes.ts`).
8. A matching server-side layout template/seed (outside the client package entirely).

**Concrete evidence this is already too manual to keep in sync:** the `traces` admin route exists in step 6 (`auth/admin-routes.ts`) but was never added to step 5 (`platform-routes.ts`), so navigating to `/admin/settings/traces` and hovering it for prefetch both resolve to the wrong template. This is not a hypothetical risk — it's a bug that exists today because the process has no single source of truth.

## New field types are an `if`-chain, not a plugin

```46:129:packages/client/src/admin/components/content/content-entry-field-input.tsx
if (field.type === "json") { /* ... */ }
if (field.type === "boolean") { /* ... */ }
if (field.type === "media") { /* ... */ }
if (field.type === "reference") { /* ... */ }
if (field.type === "longText") { /* ... */ }
if (field.type === "richText") { /* ... */ }
```

Plus a hardcoded special case for the `notification_email` content type at line 42. Adding a new field type means adding another branch here (and a new widget component) — workable at the current ~7 field types, but this pattern doesn't extend gracefully; there's no field-type registry that a package (or an extension) could contribute to without editing this file.

## Vendor lock-in with no swap layer

Several integrations that are conceptually "pluggable" (identity provider, authorization engine, storage) are hard-wired to one vendor at the code level, not just at the config level:

- **Keto (authorization) has no real alternative implementation wired in production.** `create-authorization.ts` always returns the Keto adapter; the only other adapter (`allow-all-in-org.ts`) is test-only.
  ```12:14:packages/server/src/domains/auth/create-authorization.ts
  /** Document scope checks — always Keto (requires Keto running). */
  export function createAuthorization(): AuthorizationPort {
    return ketoAdapter();
  }
  ```
- **Zitadel is imported directly from domains that shouldn't need to know about it**, e.g. the `agent` domain imports `zitadelIssuer`/`zitadelProjectIdOrNull` directly (`agent/index.ts:3-4`) rather than through an identity port. IdP templates are also Zitadel-shaped by name (`auth/idp-registry.ts:31-36`, `zitadelPath: "google"`).
- **ClickHouse is the only analytics storage adapter** (`analytics/adapters/clickhouse.ts`, 404 lines) — there's a `ports.ts` interface in principle, but no second implementation exists in the tree to prove the abstraction actually holds.
- **R2 (object storage) is called directly** from collab and analytics-replay code without going through a storage port at the domain level.
- **OAuth/integration provider list is hard-coded in SQL query strings**, not data-driven:
  ```84:92:packages/server/src/domains/documents/adapters/postgres.ts
  '$.integrations.nango.*.connectionId ? (@ == $cid)'
  OR ${documents.data}->'integrations'->'stripe'->>'connectionId' = ${trimmed}
  OR ${documents.data}->'integrations'->'googleMail'->>'connectionId' = ${trimmed}
  ```
  Every new integration provider requires a new `OR` branch in this query, in this exact file.
- Similarly, `secrets/service.ts:19` hard-codes `LLM_PROVIDERS = ["openai", "anthropic"] as const` — adding a third LLM provider means editing this list plus wherever else providers are enumerated (notifications' webhook adapter registry uses a `Map` keyed by provider, which is a better pattern and could be a model for the others).

None of this means the vendor choices are wrong — Keto/Zitadel/ClickHouse/R2 may well be the right calls. The issue is specifically that the code implies an abstraction (a `ports.ts` interface, a domain factory taking injectable deps) that in practice has exactly one implementation wired everywhere, so swapping any of these vendors later is a full-codebase change, not a new-adapter-plus-config-flag change.

---

## What's genuinely good for expandability (keep doing)

- The **domain-factory pattern** (`createXDomain(deps) → { routes, service }`) does make each domain unit-testable and its dependencies explicit, even though wiring a *new* one is manual.
- The **unified `documents` table** design means new CMS content types don't require a schema migration — this is a real, working extensibility win, documented in `documents/schema.ts`.
- The **notifications webhook adapter registry** (`Map` keyed by provider) is a better pattern than the hard-coded provider lists elsewhere and should be the template other "add a new X" registries copy.
- **Module Federation is already wired** for extension/marketplace remotes (`catalog-loader.ts`, `mf-init.ts`) — the mechanism for a genuinely pluggable catalog exists; it's just not yet used to make the *built-in* admin/editor registries (which are static imports) similarly pluggable.
