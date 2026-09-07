# API-Key Intake Through Our UI

> **Date:** 2026-09-07
> **Status:** Active — decision recorded, implementation following
> **Read first:** [`EXTERNAL-PROVIDERS-VIA-NANGO.md`](./EXTERNAL-PROVIDERS-VIA-NANGO.md)

---

## Rule in one line

Merchants enter provider keys in **our** UI; keys travel to Nango and never rest anywhere else. The merchant never hears the word "Nango".

---

## Why this exists

* OAuth providers show the provider's own approval screen (unavoidable, familiar). API-key providers (Stripe, Resend, Twilio) have no approval screen — the key must be collected somewhere. Collecting it in Nango's dashboard would expose Nango to merchants and split the admin experience in two.
* Our integrations page already owns connection state display ("connected / not connected"). Intake in the same page keeps one mental model: everything about a store's providers lives in one place.
* Security: the key passes through backend memory once, straight into Nango's vault. Never logged, never persisted by us (asserted by test, not intent). A leaked database reveals connectionIds only — useless without Nango access.

## Why generic, not Stripe-specific

Every API-key provider needs exactly the same flow: form → server route → Nango connection-create → persist connectionId. Building it per provider repeats four layers per key. The generic path (`connectApiKeyCredential(orgId, integrationId, apiKey)`) serves Stripe today, Resend/Twilio tomorrow, with the provider name as the only variable. Admin UI adds one form per provider reusing the same route shape.

## What it is not

* Not credential storage — we keep `connectionId` only, same as OAuth Connect results.
* Not a replacement for Connect sessions — OAuth flows keep using them; intake covers API-key auth only.
* Not a reason to touch the proxy/dispatcher contracts — created connections work through the existing `proxy()` and forwarded-webhook paths unchanged.

## Open gates

* Nango Stripe integration record must exist before connections attach (one-time setup).
* Live verification needs a real test key; plumbing verifies with a placeholder key (Nango stores without validating on create).
