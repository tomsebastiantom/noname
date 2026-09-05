# Add Domain vs Add Extension — Guide

> **Date:** 2026-09-05
> **Status:** Active
> **Read first:** [`ARCHITECTURE-MAP.md`](../2026-07-25/ARCHITECTURE-MAP.md) · [`EXTENSIONS.md`](../2026-07-25/EXTENSIONS.md) · [`ARCHITECTURE.md`](../2026-08-07/ARCHITECTURE.md)

---

## Rule in one line

**Server `domains/` = platform capability, shared by all verticals. `extensions/` = vertical UI bundle, enabled per org.**

Do not create a server domain per vertical. You will not need 1000 domains. You need ~15 platform domains (done) + N extensions (cheap).

| Concept | Path | Example | API |
|---|---|---|---|
| **Domain** | `packages/server/src/domains/{name}/` | `documents`, `machines`, `webhooks`, `integrations` | Generic: `/api/documents`, `/api/machines`, `/api/webhooks/inbound/:provider` |
| **Extension** | `packages/extensions/src/{name}/` | `commerce`, `booking` | No new routes. Uses machines API + documents + webhooks |

Reference: [`EXTENSIONS.md`](../2026-07-25/EXTENSIONS.md) § naming — `Domain` rejected for verticals, collides with server `domains/`.

---

## When to add what

**Add a server domain only if:** new platform primitive (storage, protocol, external system) used by 2+ verticals. Example: `secrets` (Vault), `notifications` (Resend/Twilio), `webhooks` (Stripe verify + fan-out).

**Add an extension if:** new vertical (commerce, booking, membership). Example: `ProductCard + addToCart + cart.json`, `BookingCalendar + bookSlot + appointment.json`.

Commerce is the first extension, not the first of 1000 domains. See [`CLIENT-CATALOG-LAYERS.md`](../2026-07-25/CLIENT-CATALOG-LAYERS.md) § framing: Noname is not e-commerce, commerce is first extension for validation.

---

## How to add a server domain (platform)

Mirror `domains/auth` + `adapters/` per [`INTEGRATIONS-VAULT-NANGO-AGENTS-ROADMAP.md`](../2026-08-04/INTEGRATIONS-VAULT-NANGO-AGENTS-ROADMAP.md) § domain layout.

1. `ports.ts` — interfaces only, no imports from other domains internals.
2. `service.ts` — `createXService(deps): XService`, pure logic, calls other domains via ports only.
3. `adapters/*.ts` — Drizzle / Vault / Nango SDK isolated here.
4. `routes/*.ts` + `api.ts` — thin Hono adapters, Zod validate, call `service.ts`.
5. `index.ts` — `createXDomain(deps): { routes, service, worker? }`.
6. Wire in `packages/server/src/bootstrap.ts` `createApp()` + `app.route("/api/x", x.routes)`.
7. Background work: `queue.ts` + `worker.ts` with `workersEnabled()` + `workerConcurrency()` per [`worker-runtime.ts`](../../packages/server/src/shared/worker-runtime.ts).
8. Events via `shared/event-bus`, never direct import of another domain service internals.

---

## How to add an extension (vertical)

Full bundle per [`EXTENSION-LIFECYCLE.md`](../2026-07-25/EXTENSION-LIFECYCLE.md), not JSON alone.

1. `packages/extensions/src/{name}/catalog-schemas.ts` — component props + action params Zod.
2. `components.tsx` — React UI only, no fetch, no secrets.
3. `actions.ts` — side effects via `POST /api/machines/*` or existing domain API.
4. `registry.ts` — `defineRegistry(schemas, components, actions)`.
5. `machines/*.json` — workflow defs (`cart.json`, `appointment.json`).
6. Register in `packages/extensions/src/index.ts` `extensionLoaders`.
7. Enable: `PUT /api/tenants/:slug/catalog { extensions: ["{name}"] }`.
8. Seed layout spec using only types from core + that extension.

Booking example, same checklist as commerce — see `EXTENSION-LIFECYCLE.md` § hypothetical second vision.

---

## Dependency proof — what commerce reuses (do not rebuild)

Per [`ARCHITECTURE.md`](../2026-08-07/ARCHITECTURE.md): 8+ domains depend on `docs.service.tenantSettings / content`. `documents` is hidden platform layer, not peer.

| Need | Reuse, not rebuild |
|---|---|
| Products | `documents` content type + variants schema, edge `$state` resolve per `CONTENT-RENDER-PIPELINE.md` |
| Cart / orders state | `machines` engine `POST /api/machines/start`, `/:id/:event`, `machine_instances` + Redis |
| Stripe payment success → `paid` | `webhooks` inbound `POST /api/webhooks/inbound/stripe` → BullMQ → `eventBus` → machine transition |
| Shopify products / cart | `integrations.service.triggerOAuthAction` + Nango `connectionId` in `tenant_settings`, no raw SDK |
| LLM / comms keys | `secrets.service.resolveLLMProvider / resolveComms`, Vault only |
| Emails / SMS | `notifications.service.notify(trigger)` + CMS template |
| Org scope, tenant config | `docs.service.tenantSettings`, `tenant_settings` flags + `connectionId` |

Agents / machines call **domain ports only** — never Vault, Nango SDK, or merchant secrets in context. See roadmap § rules.

---

## Anti-patterns

* No `packages/server/src/domains/commerce/` with `/api/commerce/*`. Cart/checkout = machines + JSONB context per `EXTENSIONS.md` § what an extension is.
* No cross-domain deep imports (`agent/index.ts` → `auth/adapters/zitadel/*`). Route through port. See `ARCHITECTURE.md` § cross-domain imports.
* No `org_secrets` table, no LLM keys in Nango, no per-tenant webhook hostnames. See roadmap § what we are NOT building.
* No extension with only layout JSON and no package (renderer will not find types).

---

## References

* [`EXTENSIONS.md`](../2026-07-25/EXTENSIONS.md) — naming + three layers
* [`EXTENSION-LIFECYCLE.md`](../2026-07-25/EXTENSION-LIFECYCLE.md) — full bundle + booking example
* [`CLIENT-CATALOG-LAYERS.md`](../2026-07-25/CLIENT-CATALOG-LAYERS.md) — core vs extension code layout
* [`ARCHITECTURE.md`](../2026-08-07/ARCHITECTURE.md) — god-wiring, hub-and-spoke, what is good to keep
* [`INTEGRATIONS-VAULT-NANGO-AGENTS-ROADMAP.md`](../2026-08-04/INTEGRATIONS-VAULT-NANGO-AGENTS-ROADMAP.md) — domain layout, secret homes, Phase I-a→I-f
* [`COMMERCE_ENGINE_GAP_ANALYSIS.md`](../2026-08-22/COMMERCE_ENGINE_GAP_ANALYSIS.md) — what commerce reuses vs what is new
* [`CURRENT_STATUS.md`](../2026-08-21/CURRENT_STATUS.md) — authoritative build status
