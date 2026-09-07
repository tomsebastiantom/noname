# External Providers via Nango Only

> **Date:** 2026-09-07
> **Status:** Active — binding rule, no exceptions
> **Read first:** [`SCOPED-PUBLIC-ENDPOINTS.md`](./SCOPED-PUBLIC-ENDPOINTS.md) · roadmap Phase I-b/I-d/I-f

---

## Rule in one line

**Every third-party provider integration goes through Nango.** Never add provider-specific code to the webhooks domain (or any other domain) to talk to an outside provider.

---

## Direction split (not duplication)

| Direction | Path | Example |
|---|---|---|
| Outbound (us → provider) | `integrations` port `proxy()` → Nango `client.proxy()` with the store's connection | Stripe Checkout Session with merchant's account |
| Inbound (provider → us) | Nango-forwarded webhooks → integrations-side ingress | `checkout.session.completed`, attributed to a connection |
| Nango lifecycle only | `integrations` OAuth routes | Connect session, `connectionId` save |

## Why not provider code in webhooks/

* **Scale**: 100 providers × verify + normalize + attribution, hand-deployed per provider, is unshippable. Nango absorbs registration quirks, retries, and per-provider differences once.
* **Attribution**: Nango attributes each forwarded event to a connection (which merchant, which account) generically. Hand-rolled adapters dig org ids out of provider-specific payload fields — fragile and forgeable.
* **Secrets**: proxy keeps merchant credentials inside Nango; our process never sees them (roadmap: "never merchant secrets").
* **One signature**: verify Nango's forwarding signature once instead of implementing 100 provider signature schemes.

## Webhooks domain scope (corrected)

Outbound merchant webhooks (subscriptions/deliveries/retries) + platform-private and domain-specific async events ONLY. Provider inbound is not its job — the direct-Stripe subscriber, canonical payment mapper, platform-key resolver, and direct-REST adapter built on 2026-09-07 were all **deleted** for violating this rule. Do not reintroduce.

## Verification gates (open)

* Nango proxy code exists (port/adapter/service) but is UNVERIFIED live — Nango is a dev placeholder, no merchant connection exists.
* Provider-forwarded ingress endpoint does not exist yet — build it when Nango is real, not before.
* Checkout sessions stay deferred to the hosted-checkout roadmap regardless.

---

## References

* `integrations/ports.ts` (`IntegrationOAuthPort.proxy`), `integrations/service.ts` (`proxyProvider`), `integrations/adapters/nango.ts`
* Roadmap lines 60/87/88/212/249/281/365
