# Public Access Model (Platform Pattern)

> **Date:** 2026-09-07
> **Status:** Active — binding pattern for anonymous/storefront access at scale
> **Read first:** [`SCOPED-PUBLIC-ENDPOINTS.md`](./SCOPED-PUBLIC-ENDPOINTS.md) · [`EXTERNAL-PROVIDERS-VIA-NANGO.md`](./EXTERNAL-PROVIDERS-VIA-NANGO.md)

---

## Rule in one line

**Explicit narrow paths per use case + publishable-key grant, enforced at edge AND server.** Anonymous access = exact path AND valid key bound to the exact org.

---

## Options evaluated

| # | Model (who uses it) | Mechanism | Verdict |
|---|---|---|---|
| 1 | **Scoped paths + publishable key** | Explicit paths (`/api/machines/cart/*`) PLUS `x-publishable-key` verified against the edge-resolved org (`requirePublicActor`, generic helper any domain reuses); edge admits any key-bearing request without per-domain patterns (general bypass, server is the real gate); sensitive transitions JWT-only. | **Chosen — implemented, verified live** |
| 2 | Paths alone, no key (no-auth-header guest lane) | Any anonymous edge traffic touches scoped paths. | Rejected — no per-store grant or revocation; cutting abuse means code/manifest changes affecting all stores |
| 3 | Keto anonymous subject (OpenFGA, we run Keto) | Public = tuple for `anonymous`; same routes. | Rejected for now — heaviest design, per-check latency, auth-model work upfront; future option if fine-grained public permissions ever needed |
| 4 | Declarative opt-out (NestJS `@Public()`) | Global default-deny + per-handler marker. | Rejected — same sprawl, different shape |

## Why key + paths (final)

* **Two jobs, two mechanisms**: org id (edge-signed) answers WHICH store; publishable key answers MAY this anonymous caller use the storefront (revocable per store, no deploy). Address vs door code.
* **Generic, not commerce-coupled**: key lives in `tenant_settings`, verification is `shared/requirePublicActor` (any domain), distribution is the public catalog manifest, rotation is a tenant route. Cart is the first consumer.
* **Exact-org binding**: presented key must equal the edge-resolved org's key (timing-safe compare) — cross-org replay impossible.
* **Industry-aligned naming**: `publishableKey`, `pk_test_/pk_live_`, `x-publishable-key` — Stripe/Ghost language, domain-independent (a `storeKey` prototype was renamed for exactly this reason).
* **1000-domain scaling**: new anonymous surface = explicit paths + one `requirePublicActor` call (~10 lines), no new credential types ever again.

## Capability routes

Capability paths may be admitted by the edge as anonymous transport routes, but the origin must call `requirePublicActor` for each explicitly public capability. `PUBLIC_ROUTES` is a JWT-bypass list, not an authorization list. Authenticated capability calls continue through JWT/permission checks.

## Gateway rule (absolute)

Every client — browser, mobile app, server-to-server — talks through the edge
gateway. **Nobody calls the backend directly, ever.**

## Open gates

* Fine-grained public permissions — if they arrive, reopen option 3 (Keto).

---

## References

* Medusa v2 Store vs Admin API + publishable keys; Stripe `pk_`/`sk_` capability keys; Ghost Content/Admin split; Shopify storefront tokens; Supabase RLS key roles
* `packages/workers/src/routes/public-routes.ts`, `packages/server/src/domains/machines/routes/instances.ts` (interim cart lane)
