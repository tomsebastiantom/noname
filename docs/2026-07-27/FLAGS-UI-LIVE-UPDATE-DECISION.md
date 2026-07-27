# Flags → Live UI — Decision & Analysis

> **Status:** **Implemented** (2026-07-27) — hybrid Phases 1–2 shipped. See [`BROWSER-SDK-INTEGRATION.md`](./BROWSER-SDK-INTEGRATION.md).  
> **Date:** 2026-07-27  
> **Related:** [`BROWSER-SDK-INTEGRATION.md`](./BROWSER-SDK-INTEGRATION.md), [`flags-domain.md`](../2026-07-04/flags-domain.md), [`BROWSER_SDK.md`](../2026-07-11/BROWSER_SDK.md)

---

## The question

Today, when an admin toggles a flag:

- The **browser SDK** hears about it (SSE → re-evaluate → cache updates) ✅  
- The **page the visitor sees** does not change until reload or navigation ❌  

We want flags to affect what’s on screen, instantly, without a full page refresh.

**Where should that logic live — `@noname/browser-sdk` or `packages/client`?**

---

## Plain-language summary (read this first)

**Recommendation: split by responsibility.**

| Layer | Owns | Does not own |
|-------|------|--------------|
| **`@noname/browser-sdk`** | Fetch flags, cache them, SSE push, `onUpdate` callbacks, analytics context | React, json-render, layout re-fetch, DOM |
| **`packages/client`** | Wire flags into json-render (`$flags`), decide when to re-fetch edge schema, re-render | Flag evaluation rules, Postgres, SSE server |

The SDK is a **Datadog-style observability + data client**. It should stay framework-agnostic.

The client is the **host app** that knows it renders json-render specs from the edge API. Only the client can say “this flag change means re-fetch the layout” or “this flag change means hide the promo banner.”

**Best UX (Apple bar):** use **two tiers**, not one hammer:

1. **Small UI toggles** (show/hide a block, swap copy) → inject flag values into json-render as `$flags` — instant, no network.
2. **Layout / variant changes** (different hero, whole section swap) → re-fetch `GET /api/edge/schema` when SDK fires `onUpdate` — one round-trip, then re-render.

Trying to solve everything with full schema re-fetch on every flag flip is slow and flickery. Trying to solve everything with client-only `$flags` cannot change server-resolved layout variants.

---

## What we have today

```
Admin saves flag
       ↓
Postgres + eventBus("flag.updated")
       ↓
SSE broadcast { key: "hero-variant" }  →  all open tabs for that org
       ↓
browser-sdk: evaluate([key])  →  cache updated  →  onUpdate callbacks fire
       ↓
(nothing subscribed in client — UI frozen)
```

Separately, on each navigation/load:

```
GET /api/edge/schema/:slug
       ↓
Server evaluates flags + resolves layout  →  { layout, flags, segment }
       ↓
Client renders layout only (ignores flags field)
       ↓
syncBrowserObservabilityContext(segment)  →  analytics + SDK flags aligned
```

So we have **two copies** of flag state (edge response + SDK cache) and **zero consumers** of either for rendering.

---

## Two kinds of “flag affects UI”

Not all flag changes are equal. Mixing them up is why teams either over-fetch or under-update.

### Type A — Expression-level (client-side)

**Examples:** hide social proof, show Apple Pay button, change button label variant.

**Spec shape (future):**

```json
{
  "type": "PromoBanner",
  "condition": "{{$flags.show_summer_sale}}"
}
```

**Needs:** flag values in json-render’s expression context.  
**Does not need:** new edge round-trip if the spec tree already contains both branches.  
**Latency:** instant after SDK cache updates.

### Type B — Layout-level (server-side)

**Examples:** multivariate flag picks layout segment `"variant_b"`, different template entirely, content ref changes.

**Needs:** edge `getSchema()` re-run — server picks variant, merges content, returns new `layout` spec.  
**Cannot** be done with `$flags` alone if the alternate layout was never in the spec.  
**Latency:** one `GET /api/edge/schema` (~same as SPA nav today).

### Decision

| Flag effect | Mechanism | Code home |
|-------------|-----------|-----------|
| Show/hide / conditional props | `$flags` namespace in json-render context | **Client** (`catalog-ui-shell` or provider wrapper) |
| Different layout / variant / segment | Re-fetch edge schema + replace `spec` | **Client** (`main.tsx` / `browser-observability` bridge) |
| Fetch, cache, SSE, evaluate | Already built | **SDK** (no change) |
| Which flags are layout-bound | `schemaId` / `variantId` on flag definition (server) | **Server** (future metadata) |

---

## Options considered

### Option 1 — SDK owns everything including re-fetch

SDK exposes `onFlagChange(() => refetchLayout())` and calls edge internally.

**Pros:** One import for app authors.  
**Cons:** SDK would need to know edge URL shape, auth headers, json-render spec type — wrong abstraction, breaks mobile/other hosts, hard to test.

**Verdict:** ❌ Reject. SDK stays host-agnostic.

---

### Option 2 — Client always re-fetches edge schema on any flag change

```typescript
// conceptual — not implemented
sdk.flags.onUpdate("*", () => loadPage());
```

**Pros:** Simple mental model; always correct for Type B.  
**Cons:** Network + re-render on every toggle; flicker on admin experiments; wasteful for Type A (boolean hide/show); duplicate work (edge evaluates flags server-side again).

**Verdict:** ⚠️ Acceptable as **Phase 1 fallback**, not final UX.

---

### Option 3 — Client-only `$flags`, never re-fetch

Pass `sdk.flags.get()` into json-render; components react via conditions.

**Pros:** Instant; no extra requests.  
**Cons:** Layout variants resolved at edge never update; admin can’t swap hero layout live; `$flags` namespace not implemented yet.

**Verdict:** ⚠️ Required for Type A; **insufficient alone** for Type B.

---

### Option 4 — Hybrid (recommended)

**Phase 1 (ship first):** Re-fetch edge schema on SDK `onUpdate` — debounced, storefront tabs only.  
**Phase 2:** Add `$flags` to json-render expression context sourced from SDK cache — Type A without re-fetch.  
**Phase 3:** Server marks flags with `affectsLayout: true`; client re-fetches only for those keys.

**Pros:** Correct for both types; progressive; matches existing architecture docs.  
**Cons:** Two integration points in client (small, cohesive).

**Verdict:** ✅ **Recommended.**

---

## Recommended architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     @noname/browser-sdk                          │
│  evaluate · cache · SSE · onUpdate(key, cb) · get(key)            │
│  (no React, no json-render, no edge URLs)                        │
└────────────────────────────┬────────────────────────────────────┘
                             │ onUpdate / get
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                     packages/client                              │
│                                                                  │
│  browser-observability.ts                                        │
│    subscribeFlagDrivenRefresh(onLayoutFlagChange → loadPage)     │
│                                                                  │
│  catalog-ui-shell.tsx                                            │
│    JSONUIProvider + flags snapshot in expression context ($flags)│
│    re-render when SDK notifies (React state / external store)     │
│                                                                  │
│  main.tsx                                                        │
│    loadPage() unchanged — still source of truth for layout spec  │
└────────────────────────────┬────────────────────────────────────┘
                             │ GET /api/edge/schema
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                     server / edge                                │
│  getSchema → flags.evaluate → layout.resolve → { layout, flags } │
└─────────────────────────────────────────────────────────────────┘
```

---

## Instant flip — what the visitor should experience

**Target behavior (approve before build):**

| Scenario | Expected UX |
|----------|-------------|
| Admin toggles boolean “show promo” (Type A) | Banner appears/disappears within ~100ms, no loading spinner |
| Admin changes multivariate “hero layout” (Type B) | Soft overlay “Updating…” ≤500ms, new layout cross-fades in |
| Admin toggles flag while no storefront tab open | Next visit gets correct layout (unchanged) |
| Storefront + admin open in same browser | Storefront updates via SSE; admin UI uses API response (no loop) |
| SSE disconnect | SDK reconnects + full flag refetch; client re-syncs `$flags` and optionally re-fetches schema |
| Rapid toggles in admin | Client debounces re-fetch (300–500ms) — one update, not five |

**Anti-patterns to avoid:**

- Full white flash / unmount entire app on every flag change  
- Polling `/api/flags/evaluate` every 30s (SSE already exists)  
- Duplicating evaluation logic in client (always trust server evaluate endpoint)  

---

## Implementation phases (for approval)

### Phase 1 — Live layout refresh (Type B, minimal)

**Client only. No SDK changes.**

1. Export a helper from `browser-observability.ts`: subscribe to **all** flag updates via existing `onUpdate` pattern (may need SDK small addition: `onAnyUpdate` or register per-key from edge `flags` map on load).
2. Debounced callback → `loadPage()` in `main.tsx`.
3. Use existing soft admin nav overlay during re-fetch (already in `main.tsx`).

**Files:** `browser-observability.ts`, `main.tsx`  
**SDK change:** Optional — `flags.onAnyUpdate(cb)` if we don’t want to register N keys manually. Small, still framework-agnostic.

**Acceptance:** Toggle flag in admin API → open storefront tab updates without manual reload.

---

### Phase 2 — `$flags` expression context (Type A)

**Client + possible json-render provider extension.**

1. On SDK init + each flag update, mirror cache into React state: `Record<string, unknown>`.
2. Pass into `JSONUIProvider` / `Renderer` as expression context namespace `$flags` (per json-render API — verify against `@json-render/react` version in use).
3. Layout specs use `condition: "{{$flags.key}}"` for show/hide.

**Files:** `catalog-ui-shell.tsx`, `browser-observability.ts`, example layout in seed/demo  
**SDK change:** None.

**Acceptance:** Boolean flag flip hides component with no edge re-fetch.

---

### Phase 3 — Smart re-fetch (polish)

**Client + server metadata.**

1. Flag model: optional `affectsLayout: boolean` or bind to `schemaId` / `variantId` (already on flag entity).
2. Client re-fetches edge schema **only** when an updated flag is layout-bound.
3. Type A flags update `$flags` only — instant.

**Files:** `flags` domain, `browser-observability.ts`, `main.tsx`  
**SDK change:** None.

---

## SDK vs client — concrete checklist

| Task | SDK | Client | Server |
|------|:---:|:------:|:------:|
| SSE listen + cache | ✅ exists | | |
| `onUpdate(key, cb)` | ✅ exists | | |
| Subscribe + debounce + trigger refresh | | ✅ | |
| Pass `$flags` to json-render | | ✅ | |
| Edge schema re-fetch | | ✅ | |
| Flag evaluation rules | | | ✅ |
| SSE broadcast on save | | | ✅ |
| `$flags` in spec conditions | | ✅ (context) | |
| `affectsLayout` metadata | | consume | ✅ store |

---

## Open questions (need product call)

1. **Phase 1 scope:** Re-fetch on *any* flag change OK for v1, or wait for Phase 3 smart filtering?  
   - *Recommendation:* Phase 1 any-flag re-fetch is fine for dev/demo; Phase 3 before production traffic.

2. **`onAnyUpdate` in SDK:** Add to SDK vs client registers keys from initial edge `flags` object?  
   - *Recommendation:* Add `onAnyUpdate` to SDK — 15 lines, cleaner host API.

3. **Edge response `flags` field:** Keep as SSR snapshot for first paint, or client-only SDK cache?  
   - *Recommendation:* First paint: use edge `flags` to seed SDK cache (avoid flash of wrong state). Live updates: SDK only.

4. **Admin tabs:** Should admin preview use same live pipeline or explicit “Preview as visitor” mode?  
   - *Recommendation:* Separate preview route that mounts storefront shell with SDK — avoids admin json-render accidentally subscribing.

---

## Decision record

| ID | Decision | Rationale |
|----|----------|-----------|
| D1 | **Client owns UI reactivity; SDK owns flag transport** | Framework-agnostic SDK; json-render is client-specific |
| D2 | **Hybrid Type A + Type B** | One mechanism cannot cover layout variants and instant toggles |
| D3 | **Phase 1 = debounced edge re-fetch on flag change** | Smallest shippable live update; unblocks demos |
| D4 | **Phase 2 = `$flags` namespace** | Matches flags-domain.md and ARCHITECTURE_DECISIONS.md |
| D5 | **No SDK json-render coupling** | Mobile app and future hosts reuse SDK without json-render |
| D6 | **No code until this doc is approved** | Avoid throwaway re-fetch logic if product prefers Phase 3 first |

---

## Approval

- [x] Approve Phase 1 (debounced re-fetch on layout-bound flag change)  
- [x] Approve Phase 2 (`$flags` via `/flags/{key}` json-render state)  
- [x] Approve SDK `onAnyUpdate` + `getAll` + `seed` helpers  
- [ ] Defer Phase 3 until flag volume / layout-bound metadata needed  

---

## Related docs

- [`BROWSER-SDK-INTEGRATION.md`](./BROWSER-SDK-INTEGRATION.md) — current wiring status  
- [`flags-domain.md`](../2026-07-04/flags-domain.md) — evaluation, SSE, `$flags` spec  
- [`ARCHITECTURE_DECISIONS.md`](../2026-07-04/ARCHITECTURE_DECISIONS.md) — native flags, no LaunchDarkly  
