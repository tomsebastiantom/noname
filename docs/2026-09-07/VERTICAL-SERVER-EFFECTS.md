# Where Vertical Server Effects Live

> **Date:** 2026-09-07
> **Status:** Active — binding; D now, C on horizon, A/B rejected
> **Read first:** [`ADD-DOMAIN-VS-EXTENSION.md`](../2026-09-05/ADD-DOMAIN-VS-EXTENSION.md) · [`EXTERNAL-PROVIDERS-VIA-NANGO.md`](./EXTERNAL-PROVIDERS-VIA-NANGO.md)

---

## Problem in one line

Extensions are UI-only and server domains are platform-only — so vertical server effects (write an order doc, decrement stock) have no vertical home, yet must live somewhere.

---

## Research: how others do it

### A. Server code inside extensions (Medusa v2 modules, Strapi v5 plugins)

* **Medusa:** `src/modules/<name>/` (models + `MedusaService` + workflows + subscribers + jobs), registered in `medusa-config.ts`, distributed as npm plugin packages. Full trust, same Node process, logical isolation only; versioning via npm + MikroORM migrations.
* **Strapi:** one npm package, two sides (`strapi-server.js` + `strapi-admin.js`) with `register/bootstrap/destroy` lifecycle, namespaced (`plugin::uid`) but full `strapi` object access. Trust = Marketplace review.
* **Pros:** vertical owns its full stack; community can extend; no platform bottleneck.
* **Cons:** breaks OUR decided boundaries (platform-only server, UI-only extensions); inverts the dependency (platform builds import verticals); zero isolation without a review pipeline we don't have; needs an un-designed versioning/migration story.

### B. Generic machine bridge + effects registry (Temporal/Inngest pattern)

* **Temporal/Inngest:** events trigger durable workflows; orchestration generic, activities carry the real work. Requires cluster/self-hosted runner, deterministic workflow rules, version discipline (`patch`, step-id hashing).
* **Pros:** uniform execution, retries/observability/idempotency from the platform.
* **Cons:** we already run BullMQ + eventBus covering this; a registry is per-vertical code under a framework name — framework without a second consumer.

### C. Outbound webhooks to extension backends (Saleor Apps, Shopify Functions/apps)

* **Saleor:** apps are separate services with a manifest (permissions, webhook subscriptions, mounts); platform emits `ORDER_CREATED` etc., apps act via gated GraphQL. Full process isolation, dual user/app scopes, identifier-stable versioning.
* **Shopify Functions:** WASM sandbox, declarative outputs, hard resource caps — maximum isolation, minimum expressiveness.
* **Pros:** cleanest separation; real isolation; independent deploy/version per vertical.
* **Cons:** needs an entire hosting story we don't have — extension runner, app tokens/APL, manifest permissions, install lifecycle. A platform epoch, not a task.

### D. Slim per-vertical effects in platform, on canonical events (chosen)

* Provider ingress (Nango-forwarded) → attributed internal event → one mapper function + one effects module per vertical, subscribed to provider-agnostic events, zero router changes, on existing BullMQ/eventBus.
* **Pros:** no new infrastructure, no trust-model change, new vertical = two small files, honest about where code lives.
* **Cons:** admits vertical code in platform (unavoidable given UI-only extensions); needs discipline to keep modules slim.

---

## Decision

**D now, C on the horizon, A and B rejected** (A on boundary grounds, B as framework-without-a-second-user). Forward-compatible: when C arrives, today's subscriber boundary becomes the outbound app contract — the canonical event is already the interface, so the cutover moves code without redesigning events.
