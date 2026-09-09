# Session Status — Continue Here Tomorrow

> **Date:** 2026-09-08 (covers work from 09-05 → 09-08)
> **Status:** Handoff — everything below is verified state, not aspiration

---

## What is DONE and verified

**Cleanup phases 1–4 (docs/2026-09-05/CLEANUP-PLAN.md, all checked):**
* Edge safety (HMAC unify, public routes merge, 401/400 fix, KV harden, bot SSR) + server safety (pagination caps, indexes, worker drain, N+1 batching) + cleanliness (ports canonical, cross-domain via ports, DomainError) + client (main.tsx split, orchestration split, remount fix, stringify→deep-equal, memo, ROUTE_TABLE, import reversal, apiFetch, code-split, tsc clean).

**Guest cart (live, all green):** scoped cart paths (`/api/machines/cart/*`) + publishable key (`requirePublicActor`, generic helper) + atomic `claim` + loader lifecycle hooks + lazy merge. Verified: guest add → login → owner stamped, zero dupes.

**Nango side:** container healthy, `pnpm init:nango` provisions admin + secret + Stripe integration with zero dashboard clicks; key intake via `pnpm init:nango:connect`; proxy read proven live against real Stripe test balance; forwarded-webhook ingress + signed dispatcher proven live against stub (scaffolding removed).

**Collab + login bugs found by testing:** LoginForm `providerList` crash fixed; stale-chunk spec overwrite fixed (converge-on-create + write-path guard) with live repro proof.

**Docs (one decision per doc):** `ADD-DOMAIN-VS-EXTENSION`, `GLOBAL-ADMIN`, `SCOPED-PUBLIC-ENDPOINTS` (superseded marker), `PUBLIC-ACCESS-MODEL` (current), `EXTERNAL-PROVIDERS-VIA-NANGO`, `EXTENSION-LIFECYCLE-HOOKS`, `VERTICAL-SERVER-EFFECTS`, `EXTENSION-BACKENDS`, `MACHINE-INVOKE-EFFECTS`, `API-KEY-INTAKE`, `RESPONSIVE-PLAN` (reverted experiment — see below).

**Implementation plan:** [`XSTATE-REUSE-MIGRATION-PLAN.md`](./XSTATE-REUSE-MIGRATION-PLAN.md) — current code gap, guard contract, phased implementation, and acceptance criteria.

**Reverted (do not redo):** responsive canvas work (frames/badges/drag/ruler/overflow) — reverted per call; storeKey prototype — renamed to generic `publishableKey` model; XState removal (2 edits) — reverted, see XState decision.

## Key decisions (binding)

1. **XState stays; reuse more.** Configs are JSON — store real XState per org, interpret per request with ephemeral actors. Our engine thins to storage + ports + API. No Temporal/Restate (code-first, wrong fit for per-client state-as-data).
2. **Vertical server effects:** slim in-process modules now → extension backends later; engine stays pure; providers only via Nango.
3. **Public access:** scoped paths + publishable key + absolute gateway rule (no direct backend, ever, including mobile).
4. **No platform Stripe keys; merchants use own accounts; platform provider later.**

## What is NOT done (tomorrow, in order)

1. **XState reuse migration:** normalize our machine JSON → real XState config at load; run transitions through ephemeral actor (`implementations: {guards}`); persist snapshot; keep storage/ports/API. Prove identical behavior via existing machine tests + live cart flow. (Do NOT extend our DSL meanwhile.)
2. **Checkout route** (`POST /cart/:id/checkout` via `proxyProvider`) — was built then deleted as domain-in-platform violation; rebuild ONLY as extension-backend consumer or slim commerce-effects module per decision 4 divide.
3. **Orders pipeline + admin UI:** order type, stock field, OrdersAdmin, nav, seed — paused behind Nango-forwarded ingress (now unblocked: ingress exists).
4. **Merchant Connect with real keys** (needs Stripe test keys from you) + Stripe dashboard forward URL.
5. **Commerce backend package** (`apps/commerce-backend`) when slim modules outgrow.

## Resume commands

```bash
podman compose up -d && podman compose --profile integrations up -d nango
pnpm init:zitadel          # if fresh DB
pnpm init:nango            # if fresh Nango
pnpm --filter @noname/server db:push
pnpm dev                   # API :3000 (background)
pnpm --filter @noname/workers dev   # edge :8787
pnpm --filter @noname/client dev    # :5173
pnpm seed:demo && pnpm seed:demo:commerce
```

Health: `:3000/health`, `:8787/health`, catalog shows `extensions: ["commerce"]` + `publishableKey`. Known flakes: wrangler dev dies periodically (restart), podman VM may stop (restart machine), Redis manifests wipe on infra restart (re-seed).
