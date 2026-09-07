# Extension Backends (Model C, Simple Form)

> **Date:** 2026-09-07
> **Status:** Active — implementing simple form now
> **Read first:** [`VERTICAL-SERVER-EFFECTS.md`](./VERTICAL-SERVER-EFFECTS.md) · [`EXTERNAL-PROVIDERS-VIA-NANGO.md`](./EXTERNAL-PROVIDERS-VIA-NANGO.md)

---

## Rule in one line

Vertical server effects run in extension backends; the platform routes canonical events to them and authenticates every crossing. Backend URL is per-extension (declared once), never per-tenant.

---

## Decisions

* **URL placement**: per-extension config (env for platform-hosted, install record for remote later) — NOT tenant_settings. One backend serves all stores; per-tenant duplication would rot on move.
* **Install state**: manifest `extensions[]` (exists). No new per-tenant storage.
* **Auth both directions**: platform→backend via HMAC signature (derived secret, Stripe-style `t=`/`v1=`); backend→platform via derived app token (HMAC of platform secret + org + extension — no token storage). Zero-trust between processes even in-cluster.
* **Delivery**: BullMQ queue per dispatch (retries on 5xx/timeout, drop on 4xx — Saleor contract). Never work in the ingress request path.
* **Events**: canonical only (`payment.completed`). Provider shapes stop at the mapper; subscribers/backends never see them.

## Open gates

* Remote (author-hosted) backends: install endpoint + stored tokens + versioned subscriptions. Same contract, new transport registration.
* High-frequency verticals: batch APIs if hop count ever matters (measured, not assumed).

## Config layers (per-extension vs per-tenant)

* **Per-extension (code/config, same for all stores):** backend URL + supported events. Declared once with the extension (env for platform-hosted). Never duplicated per tenant — a backend move updates one place.
* **Per-tenant (install state):** manifest extensions[] (installed or not) + optional event allowlist subset + app token for that org. Store A can subscribe payment.completed while store B skips it, both served by the same backend URL.

## Live verification (2026-09-07)

Self-signed Nango forward (HMAC-SHA256, x-nango-hmac-sha256) → POST /integrations/nango/incoming → attributed → canonical payment.completed → dispatcher → BullMQ → signed POST to stub backend. Stub receipt asserted: valid 1 signature, fresh timestamp, correct orderRef/cart/amount. Found + fixed along the way: server loads packages/server/.env (not root), edge must forward the Nango signature header, pre-existing untyped jsonb_build_object param (cast added). Scaffolding removed after proof.

## Install registry: the catalog manifest (deliberate)

The dispatcher checks installs via the tenant catalog manifest (extensions[]) injected as a callback from bootstrap — not a second store. Rationale: the manifest already IS the per-org 'what is installed here' record (UI loader consumes it for components, dispatcher for backends). One source of truth beats two stores that can disagree; adding a separate backend-subscription store would duplicate install state and need its own sync. If install semantics ever diverge from UI composition (e.g. headless backends with no UI), split then — not before.

## Cross-domain wiring (injected callbacks, not imports)

The dispatcher never imports tenant (or any domain) code. Bootstrap injects isExtensionInstalled as a callback — the same pattern as notifications receiving docs.service.content. Consequences: unit tests mock one function signature; no import graph between domains; per-event check means install/uninstall takes effect immediately with no propagation delay or sync to maintain.
