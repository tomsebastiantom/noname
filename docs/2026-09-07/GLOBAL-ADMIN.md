# Global Admin vs Store Admin

> **Date:** 2026-09-07
> **Status:** Active — keep simple, no global UI in MVP
> **Read first:** [`ADD-DOMAIN-VS-EXTENSION.md`](../2026-09-05/ADD-DOMAIN-VS-EXTENSION.md)

---

## Rule in one line

**One admin shell, two scopes.** Store admin is scoped by the store's manifest; global admin is scoped by the platform org. Never build a second admin system.

| Scope | Who | Sees | Decides |
|---|---|---|---|
| **Store** (`:slug.localhost/admin`) | Merchant | Only `manifest.extensions` entries (products, orders, …) | Day-to-day selling |
| **Global** (platform org) | Operator | All stores + platform settings | Which store gets which extension |

---

## How store views stay scoped (already built)

1. Manifest per org: `tenant/settings.extensions`, e.g. yogastore `["commerce"]`, blog `[]` (`tenant/ports.ts:10`, manifest stores default `[]`).
2. Client `catalog-loader.ts:35,84-109` imports only `manifest.extensions` registries (code-split) — disabled extensions never download, never render.
3. Server enforces `orgId` on every row; catalog endpoint serves only enabled entries.

OrdersAdmin lives in `packages/extensions/src/commerce/` — it appears in commerce-enabled stores and nowhere else, by absence, not by permission checks.

---

## Global side (minimal, later)

No UI now. Provisioning works today without it:

```bash
PUT /api/tenants/:slug/catalog { "extensions": ["commerce"] }
```

Secrets already split correctly: per-store provider keys in `tenant_settings`, platform secrets in Vault (`secrets` domain).

When needed: one **Stores** list + per-store extension toggles + one platform settings page, all inside the existing shell scoped to the platform org.

---

## Anti-patterns

* No parallel `/super-admin` app, routes, or auth model.
* No cross-store queries from store scope — cross-store reads belong to global scope only.
* No global UI before the MVP needs it — seed/API provisioning covers setup.
