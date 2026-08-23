# Current User Experience Audit
## What a Visitor Actually Sees Today (Live Stack Inspection)
### As of 2026-08-22

---

## How This Was Audited

Inspected the **live running stack** (API :3000 healthy, tenant `yogastore` resolves) via direct HTTP checks against the same endpoints the browser client uses:

| Check | Endpoint | Result |
|-------|----------|--------|
| API health | `GET /health` | ✅ ok v0.0.1, Redis subsystems up |
| Tenant resolve | `GET /api/tenants/resolve/yogastore` | ✅ orgId `387316114289393674` |
| Storefront schema | `GET /api/edge/schema/yogastore?segment=default&url=/` | ⚠️ Demo page only |
| Tenant catalog manifest | `GET /api/tenants/yogastore/catalog` | ❌ **`extensions: []` — no commerce extension enabled** |

---

## What The Visitor Sees On `/` Right Now

The edge schema returns this layout (`templateName: "home"`, `renderAs: "standalone"`):

```
┌─────────────────────────────────────────────┐
│   Welcome to Nona COLLAB-TEST-456me         │   ← h1 header (test artifact name)
│                                             │
│   Summer sale — 20% off yoga mats           │   ← flag-gated promo
│   this week!                    [flag: ON]  │     (visible: $state /flags/show_summer_sale)
│                                             │
│   Platform demo — core layout components    │   ← h3 intro text explaining that only
│   only. Enable an extension via catalog     │     core layout components exist
│   manifest for domain-specific UI.          │
│                                             │
│        [ Lol ]      [ Lol3 ]                │   ← two test buttons, action: null
│                                             │
└─────────────────────────────────────────────┘
```

### Findings

1. **Zero commerce on the live storefront.** No Hero component, no ProductCard — despite both existing in `packages/extensions/src/commerce/`. The page is built from platform primitives only (`Stack`, `Text`, `Button`).
2. **Commerce extension is not enabled for the tenant.** The catalog manifest returns `"extensions": []`. The extension system works end-to-end (manifest → loadCatalogs → registry swap) but no tenant has commerce turned on.
3. **Feature flags work in production paths.** The summer-sale line is gated by `$state "/flags/show_summer_sale"` and the flags payload arrives with the schema — the flag→layout pipeline is real.
4. **Test artifacts are live**: "COLLAB-TEST-456me" title, buttons labeled "Lol"/"Lol3" with `action: null`. Seed data needs a cleanup pass before any demo.
5. **The intro text itself says it**: *"Enable an extension via catalog manifest for domain-specific UI"* — the platform is waiting for its commerce vertical.

## What Works When Clicking Around (Client Capabilities Confirmed From Code)

From `packages/client/src/main.tsx` and editor sources, these flows are wired today:

| Flow | Status | Notes |
|------|--------|-------|
| Storefront render from JSON spec | ✅ | Edge schema → `CatalogUiShell` renders platform components |
| Multi-tenant by hostname | ✅ | `{slug}.localhost` → storeSlug → scoped schema fetch |
| Login (`/login`) | ✅ | Zitadel-backed, redirect flow with `?redirect=` return path |
| Admin (`/admin/*`) | ✅ | Panel/shell composition, cached panel prefetch on soft nav |
| Visual editor (`/?edit=true`) | ✅ | Lazy-loaded editor chunk, permission-gated (`sessionCanDraft`), MFA gate supported |
| Flag-driven layout refresh | ✅ | `subscribeFlagLayoutRefresh` reloads layout when flags change |
| Collab presence/cursors | ✅ | Yjs/Automerge rooms server-side |
| Cart button click | 🟡 | `addToCart` action calls `/api/machines/start` + machine transitions — but no cart UI exists to view items; sessionStorage-scoped |
| Checkout | ❌ | Action sets `window.location.href = "/checkout"` — no route, no Stripe session |

## Gap Summary (What Stands Between Today and "Real Store")

1. **Enable + wire commerce extension** into tenant manifests (plumbing exists).
2. **Server commerce domain** — products, cart persistence, checkout, orders (0%).
3. **Commerce components** — 2 of 50 planned exist (15 core + 21 commerce expansion in the commerce extension, 12 domain-neutral site sections); none rendered on live pages yet.
4. **Seed/demo content** — replace test artifacts with a believable yoga store.
5. **Checkout destination** — `/checkout` route + Stripe session creation.

## Recommended Demo Acceptance Walk (Post-Build Verification Script)

When Phase 0 commerce lands, this exact walk should pass on this same stack:

1. Visitor opens `yogastore.localhost:5173/` → sees hero + featured ProductGrid (real seeded products).
2. Clicks product → PDP renders gallery, variants, price, AddToCart.
3. Adds to cart → CartDrawer opens showing server-persisted item.
4. Clicks Checkout → redirected to Stripe hosted checkout with correct total.
5. Test payment → webhook fires → order appears in admin with status paid, inventory decremented.
6. Second visit logged-in → cart merged, order history visible.
7. Merchant opens `?edit=true` → edits PDP layout → publishes → visitor sees change.
8. Agent task "optimize homepage for mobile" → generates variant → merchant approves → variant goes live behind a flag.
