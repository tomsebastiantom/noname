# Extension Lifecycle Hooks (Client)

> **Date:** 2026-09-07
> **Status:** Active
> **Read first:** [`ADD-DOMAIN-VS-EXTENSION.md`](../2026-09-05/ADD-DOMAIN-VS-EXTENSION.md)

---

## Rule in one line

Lifecycle mechanisms are **platform-owned**; domains declare callbacks only. No `window` code in domain modules.

---

## Decision

Options evaluated for login-triggered extension work (guest cart merge):

* **(A) Loader-wired lifecycle — chosen.** `ExtensionLifecycle` interface in `@noname/extensions` index; `client/catalog-loader.ts` subscribes `onLogin` once per loaded extension. Single mechanism, side-effect-free domain imports (testable, SSR-safe), any future extension reuses it. `noname:login` defined exactly once (`client/auth/session.ts`, imported by the loader); extensions never name the event.
* **(B) Module-level listener in domain — rejected.** Side effect on import (runs in tests, SSR, any importer); each new extension would copy its own window wiring.
* **(C) Auth-driven hook registry — rejected.** Wrong layer — auth must not know extensions exist.

Scope: local extensions only (federated remotes export `{registry}`); revisit if a remote needs lifecycle. Lazy merge in `getOrStartCart` stays regardless — data-path robustness for logins on pages without the commerce registry, not architecture.

---

## Contract

* Extension module: `{ registry, lifecycle?: { onLogin?: () => void } }` (`extensions/src/index.ts`, `commerce/lifecycle.ts`, re-exported from `commerce/registry.ts`).
* Declared action `mergeGuestCart` in `actions.ts` + `catalog-schemas.ts` — invocable by name; the loader hook is its trigger.
* Loader dedups subscriptions per extension across manifest reloads.

---

## References

* `packages/extensions/src/index.ts`, `packages/extensions/src/commerce/lifecycle.ts`
* `packages/client/src/catalog-loader.ts`, `packages/client/src/auth/session.ts`
* `packages/extensions/src/commerce/cart.ts` (logic only, no listeners)
