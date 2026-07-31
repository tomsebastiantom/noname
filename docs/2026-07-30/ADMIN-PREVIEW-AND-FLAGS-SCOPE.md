# Admin preview, segments, and flags — scope decision

> **Status:** **Decision recorded** — not implemented yet (preview / impersonation)  
> **Date:** 2026-07-30  
> **Related:** [`FLAGS-UI-LIVE-UPDATE-DECISION.md`](../2026-07-27/FLAGS-UI-LIVE-UPDATE-DECISION.md), [`FLAGS-PER-USER-TARGETING.md`](../2026-07-27/FLAGS-PER-USER-TARGETING.md), [`context-domain.md`](../2026-07-04/context-domain.md), [`documents-domain.md`](../2026-07-10/documents-domain.md)

---

## Plain-language summary

After shipping live flag toggles (Type A) and verifying SSE + admin UI, we clarified **what flags are for vs what segments are for**, and **how admins will test different visitor experiences**.

**Do not build two layout-swap systems.** Layout variants per visitor bucket = **segments**. Merchant on/off toggles inside a layout = **flags (Type A)**. Admin “what would X see?” = **preview mode** (segment picker, later impersonation) — **not** Type B flag re-fetch.

---

## What we shipped (2026-07-27)

| Item | Status |
|------|--------|
| SDK flags + SSE + `onAnyUpdate` / `seed` / `getAll` | ✅ |
| Client mirrors flags → json-render `/flags/{key}` | ✅ |
| Live banner toggle (`show_summer_sale`) without reload | ✅ Verified (API + two-tab browser) |
| Admin `/admin/settings/flags` boolean toggle | ✅ |
| Debounced layout re-fetch when flag has `schemaId` / `variantId` | ✅ Wired in client (best-effort) |
| Type B demo (flag swaps whole layout) | ❌ **Not building** — see decision below |

---

## Decision: three channels, one job each

| Channel | Question it answers | Mechanism | Cached? |
|---------|---------------------|-----------|---------|
| **Segment** | Which **layout variant** for this visitor bucket? | `layout.resolve(template, segment)` | Yes (KV / edge) |
| **Flag (Type A)** | What did the **merchant** turn on/off in this layout? | SDK cache → `$state: "/flags/key"` | SDK + SSE |
| **Admin preview** | What would segment **X** or user **Y** see? | Admin-only query / toolbar / iframe | No (dev tool) |

Per-user DOM data (cart, name, recommendations) stays in **`$state`** at render time — not flags, not segments. See [`documents-domain.md`](../2026-07-10/documents-domain.md) § per-segment vs per-user.

---

## Type B flags — defer / do not duplicate segments

### Original Type B idea

When a flag with `schemaId` / `variantId` changes, client re-fetches `GET /api/edge/schema` so the **whole page layout** updates live.

### Why we are not pursuing it as a product path

1. **Segments already own layout swap** — `documents` `layout.resolve(orgId, template, segment)` merges default + segment overrides. That is the platform primitive for “VIP home vs default home.”
2. **Client always requests `segment=default` today** — Type B re-fetch would not change layout until segment is wired on the storefront anyway.
3. **Admin testing is a different problem** — merchants need “preview as VIP,” not “toggle a flag to fake a layout swap.”
4. **Two systems for one outcome** — flag-driven layout swap + segment-driven layout swap = confusion, double edge work, unclear source of truth.

### What we keep from Type B wiring

The client **may** still re-fetch edge schema when a layout-scoped flag changes — harmless if rare. We do **not** invest in a Type B demo seed, docs, or admin flows that treat flags as the primary layout-switch lever.

| Use case | Use instead |
|----------|-------------|
| Different hero for mobile / VIP / returning | **Segment** + layout variant |
| Hide promo banner site-wide | **Flag Type A** |
| Admin sees VIP layout before publish | **Segment preview** (below) |
| Kill switch / % rollout / experiment bucket | **Flag** (evaluate rules on `contextHash`) |

---

## How admins test today vs target

### Today

| Action | Works? |
|--------|--------|
| Toggle boolean flag → live storefront update (SSE) | ✅ |
| Edit layout variants per segment in admin | ✅ |
| View storefront as a specific **segment** | ❌ (`segment=default` hardcoded in `main.tsx`) |
| View storefront as a specific **user** (impersonation) | ❌ |
| Per-user flag rules (`property_match`) | ❌ Server supports; SDK sends `contextProperties: {}` |

### Target: admin preview (build later, not flags Type B)

**Principle:** Preview is an **admin-only dev/QA surface**. Real visitors use segments + flags; admins **override** context temporarily to inspect outcomes.

#### Option A — Segment preview (build first)

```
Admin selects segment: vip_customer
    ↓
Open preview URL (admin JWT required):
  /?previewSegment=vip_customer
    ↓
main.tsx uses previewSegment instead of "default" in edge fetch:
  GET /api/edge/schema/:slug?segment=vip_customer&url=/
    ↓
layout.resolve("home", "vip_customer")
```

- **UI:** Dropdown on admin shell or “View site as…” next to `← Site`.
- **Auth:** Require admin (or `layout:publish` / `auth:manage`); ignore preview params for anonymous visitors.
- **SSE:** Optional — disable flag SSE in preview iframe or accept live updates (document choice when building).

#### Option B — Preview as user (later)

For beta flags and logged-in personalization:

```
Admin picks user (or “preview as me”)
    ↓
Preview session sets contextProperties: { userId, role }
    ↓
flags.evaluate() with property_match rules
    ↓
Same layout segment; different flag values + $state if impersonation JWT provided
```

- **Not full ZITADEL impersonation on day one** — can start with `contextProperties` override in preview mode only.
- **Full impersonation** (issue token as user X) is a separate security-sensitive feature — defer until preview toolbar proves the UX.

#### Option C — Side-by-side (what we already do for flags)

Two browser tabs: admin flags + storefront. Good for **site-wide** flag toggles only. Does not replace segment or user preview.

---

## Recommended build order

| # | Feature | Why |
|---|---------|-----|
| 1 | **Segment preview** (`previewSegment` query + admin gate) | Unblocks layout variant QA; uses existing `layout.resolve` |
| 2 | **Per-user flag context** in SDK + re-evaluate on login | Real personalization; see [`FLAGS-PER-USER-TARGETING.md`](../2026-07-27/FLAGS-PER-USER-TARGETING.md) |
| 3 | **Preview-as-user** toolbar (contextProperties override) | Admin tests beta without impersonation tokens |
| 4 | **Impersonation** (optional, hardened) | Support / debug; audit log; time-limited token |
| — | ~~Type B flag layout demo~~ | **Skipped** — redundant with segments |

---

## Flags vs analytics vs preview (do not conflate)

| System | Purpose |
|--------|---------|
| **Flags** | Control runtime behavior merchant toggles (show/hide, rollouts) |
| **Analytics SDK** | Record what happened (`pageView`, errors, replay) with `schemaId` / `variantId` / `contextHash` |
| **Preview** | Admin tool to simulate segment/user — **not** stored in ClickHouse as visitor truth |

Analytics context tags events; it does not drive layout selection. Preview overrides must not pollute production analytics (use a `preview: true` meta flag or separate session when implementing).

---

## Open questions (when building preview)

1. **Preview URL shape:** `?previewSegment=` vs `/admin/preview?segment=` vs dedicated subdomain?
2. **SSE in preview:** Subscribe (live flag test) or frozen snapshot?
3. **Analytics:** Suppress or tag preview sessions?
4. **Edge cache:** Bypass KV for preview requests?

*Recommendation:* `?previewSegment=` on storefront + admin JWT check in client gate; tag analytics with `meta.preview = true`; bypass edge cache for preview query param.

---

## Decision record

| ID | Decision | Rationale |
|----|----------|-----------|
| D1 | **Layout variants = segments, not flags** | Single source of truth; matches documents domain |
| D2 | **Flags Type A = shipped path** for show/hide and merchant toggles | Proven E2E; instant; no edge round-trip |
| D3 | **Do not build Type B demo or productize flag-driven layout swap** | Redundant with segments; client uses `segment=default` anyway |
| D4 | **Admin QA = preview mode** (segment first, user/impersonation later) | Solves “mock various users” without duplicating layout pipeline |
| D5 | **Impersonation is optional phase 4** — not required for segment/layout testing | Start with segment picker + `contextProperties` override |
| D6 | **Do not try both Type B and segment for the same layout outcome** | Avoid two ways to swap whole page |

---

## Related docs to update when preview ships

- [`FLAGS-UI-LIVE-UPDATE-DECISION.md`](../2026-07-27/FLAGS-UI-LIVE-UPDATE-DECISION.md) — note Type B deferred; link here
- [`PLATFORM-STATUS.md`](../2026-07-25/PLATFORM-STATUS.md) — add preview under “not done yet”
- [`BROWSER-SDK-INTEGRATION.md`](../2026-07-27/BROWSER-SDK-INTEGRATION.md) — preview analytics tagging

---

*Recorded after team discussion 2026-07-30: segments for layout, flags for toggles, preview for admin testing — not Type B.*
