# Scoped Public Endpoints + Guest Commerce

> **Date:** 2026-09-07
> **Status:** SUPERSEDED — kept for history. The anonymous-grant mechanism described
> here (no-auth-header guest lane) is replaced by publishable-key verification.
> Follow [`PUBLIC-ACCESS-MODEL.md`](./PUBLIC-ACCESS-MODEL.md) instead. Explicit
> narrow paths + edge listing + per-call scope checks remain valid as layers.
> **Read first:** [`ADD-DOMAIN-VS-EXTENSION.md`](../2026-09-05/ADD-DOMAIN-VS-EXTENSION.md) · [`GLOBAL-ADMIN.md`](./GLOBAL-ADMIN.md)

---

## Rule in one line

Anonymous access is declared as **explicit narrow paths per use case** — never broad regexes over generic resources. Cart is the first user, not a special case.

---

## Why not broad patterns (what we tried and removed)

Opening `POST /api/machines/start`, `POST /api/machines/:id/:event`, `GET /api/machines/instances/:id` to anonymous at edge lets anyone start/signal ANY machine (agents, approvals) without a token. Server-side checks mitigated it, but the edge perimeter — whose whole job is early reject — was bypassed for every machine. One missed server check = full anonymous machine control. Security risk, correctly rejected in review.

## The pattern (follow this for new domains)

1. **Explicit paths** in the domain router, registered before generic routes:
   `POST /api/machines/cart/start`, `GET /api/machines/cart/:id`, `POST /api/machines/cart/:id/:event`.
2. **Edge lists those exact paths** in `PUBLIC_ROUTES` (`workers/.../public-routes.ts`). Nothing else opens.
3. **Server re-verifies scope per call** (`machines/routes/instances.ts`): loaded instance must belong to the scoped machine (`machineName === "cart"`), else 404 (no oracle — same response for missing/non-cart).
4. **Sensitive transitions always require JWT**, even on scoped paths (`claim` → `denyUnless`, single-claim 409).
5. **Org isolation unchanged**: edge-signed `x-org-id` (orgMiddleware) on every call.

New domain needing anonymous access (e.g. public booking lookup): copy these 5 steps with its own prefix. No new packages, no ticket crypto, no edge body inspection.

## Guest cart + claim (why this shape)

* Instances have no owner column — ownership lives in `context` (`guest: true`, `ownerUserId`). No migration, no new tables.
* **Claim, not copy**: first attempt copied guest items into a new user cart (multi-call, non-atomic). Post-login navigation unloaded the page mid-merge (proven by transition timestamps: cart created, zero signals), leaving duplicate/empty carts. `claim` stamps `ownerUserId` in ONE transition — atomic, idempotent, retry-safe; the guest flag clears only after success so interruption retries via the lazy path.
* **Merge triggers twice**: `noname:login` event (fired by `setSessionToken`) for the fast path + lazy check in `getOrStartCart` (covers logins on pages without the commerce registry). Same-tab only — guest id + token share `sessionStorage`.

## Client pattern (extension boundary rules)

* Extension code (`@noname/extensions`) **cannot import client code** (package has no client dep) — so it uses raw `fetch`, not `lib/api.ts` (4.8's apiFetch rule covers `packages/client` only). JWT passes through when present; edge forwards `Authorization` on public routes.
* Extension lifecycle hooks are **platform-owned** -- decided separately in [EXTENSION-LIFECYCLE-HOOKS.md](./EXTENSION-LIFECYCLE-HOOKS.md).
* Storage keys (`noname:cart_instance_id`, `noname:cart_guest`) live next to their logic in `cart.ts`. Auth-owned keys stay in `session.ts`.
* `actions.ts` stays the only json-render entry (`addToCart`, `checkout`) — components never call `cart.ts` directly.

## Provider integrations (decided separately)

See [EXTERNAL-PROVIDERS-VIA-NANGO.md](./EXTERNAL-PROVIDERS-VIA-NANGO.md) — Nango proxy only, no platform keys, webhooks domain corrected to outbound + platform-private.

---

## References

* `packages/server/src/domains/machines/routes/instances.ts` — scoped cart lane + generic JWT-only routes
* `packages/workers/src/routes/public-routes.ts` — exact public cart patterns
* `packages/extensions/src/commerce/cart.ts` — guest flag, claim merge, event + lazy triggers
* `packages/extensions/src/commerce/machines/cart.json` — `addToCart` / `clear` / `checkout` / `claim`
* `packages/server/src/domains/integrations/adapters/nango.ts` — OAuth + triggerAction + proxy
