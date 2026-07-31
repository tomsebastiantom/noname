# Context Domain — Implementation Plan

> ⚠️ **Historical plan (2026-07-04)** — context engine is **implemented**. For current behavior see [`../2026-07-11/STATUS.md`](../2026-07-11/STATUS.md) and server `packages/server/src/domains/context/`.

> **Framing — "commerce" is an example vertical, not the product.** The storefront/e-commerce scenario below illustrates the general personalization pattern. The platform is **identity-agnostic** and the same context engine powers any vertical (booking, membership, SaaS, content).

## User-Facing Scenario

This is a headless CMS/platform that powers multi-tenant storefronts/sites.

### The Story

You run a multi-tenant platform (the example below uses commerce storefronts, but this applies to any site). Each tenant wants to show different layouts, content, and offers to different visitors.

**Without context/segmentation:** every visitor sees the same site. A shopper in Tokyo on mobile, a returning VIP, and a first-time visitor in Berlin all get the same homepage. No personalization.

**With context:** the platform silently reads signals about each visitor and routes them to the right version of the site.

### How It Works (End-to-End)

1. A visitor lands on a storefront. Their browser sends HTTP headers — IP address, User-Agent (device/browser), language preferences, cookies with visitor ID, referral URL.

2. The Edge domain's `/personalize` endpoint takes those headers and hands them to the Context Engine: "Tell me who this person is."

3. Context Engine resolves signals from the headers into categories:
   - `geography` → "region=JP" (from IP)
   - `device` → "type=mobile" (from User-Agent)
   - `referral` → "source=instagram" (from referrer header)
   - `user` → "tier=returning" (from visitor cookie → cached segment history)
   - `time` → "hour=evening" (from server time)

   It hashes this signal set into a deterministic segment ID, e.g. `seg_a3f2b1`. If this visitor came before, it pulls the cached segment from `context_cache` — no recomputation needed.

4. Edge receives the segment hash and queries the documents domain (the `layout` document-type): "Give me the layout for template 'homepage' with segment 'seg_a3f2b1'."

5. documents domain returns the variant layout designed for that segment — maybe a mobile-optimized homepage with a Japan-specific hero banner and an Instagram-referred discount banner.

6. The visitor sees a personalized storefront tailored to their geography, device, referral source, and visit history.

### Business Value

- Content team creates one homepage template in the documents domain (as a `layout` type), then variants per segment (e.g. "mobile-JP", "desktop-US", "instagram-referred"). No code changes.
- Marketing team runs campaigns knowing Instagram referrals automatically see matching layouts.
- Merchants get region-specific pricing/promotions surfaced automatically.
- Analytics domain listens to context events to track which segments convert best.

---

## What Currently Exists vs. What's Missing

| Layer | Defined? | Implemented? |
|-------|----------|-------------|
| Signal categories (7 types) | ✅ `ports.ts` | ❌ |
| Signal extraction from headers | ❌ | ❌ |
| Segment hashing/resolution | ✅ `ContextEngine` interface | ❌ |
| Segment cache (visitor → hash) | ✅ `context_cache` schema | ❌ |
| Segment-tagged layouts | ✅ `spec/schema.ts` `segment` column | ❌ |
| Edge personalization endpoint | ✅ stub route | ❌ returns `{}` |
| Adapter (Postgres) | ❌ empty dir | ❌ |

---

## Implementation Tasks (Deferred)

Following the same DDD + Adapter pattern as the `content` domain:

1. **`signal-extraction.ts`** — Extract `ContextSignal[]` from HTTP headers
   - Geo: IP → region via header or `x-forwarded-for`
   - Device: User-Agent → mobile/desktop/tablet
   - Referral: Referer header → source
   - User: Visitor cookie → tier/status
   - Network: Connection info
   - Time: Server time → hour/day part
   - Business: Tenant-specific overrides from headers

2. **`engine.ts`** — `ContextEngine` implementation
   - `resolve(signals)`: Sort signals by category+key, serialize, SHA-256 hash → deterministic segment ID
   - `segmentForRequest(tenantId, headers)`: Extract signals → check cache → resolve → cache result → publish event

3. **`service.ts`** — Context service layer
   - Orchestrates engine + storage + eventBus
   - Publishes `context.segment_resolved` events for analytics

4. **`adapters/postgres.ts`** — Postgres adapter
   - Implements `ContextStorage` interface for `segments` and `context_cache` tables
   - Follows same pattern as `content/adapters/postgres.ts`

5. **`api.ts`** — Replace stubs with real routes
   - `POST /resolve` — accept signals, return segment
   - `GET /segments` — list segments for tenant
   - `POST /segment-from-request` — resolve segment from current request headers

6. **`index.ts`** — Wire context domain
   - Replace `createContextRoutes(null)` with proper engine + adapter

---

## Domain Connections

```
Visitor Request
     │
     ▼
edge/api.ts  /personalize
     │
     ▼
context/service.ts  segmentForRequest()
     │  extracts signals from headers
     │  hashes → deterministic segment ID
     │  caches visitor→segment mapping
     │  publishes context.segment_resolved event
     │
     ▼
spec/schema.ts  layouts.segment column
     │  queries layouts WHERE segment = hash
     │  returns variant layout for this visitor
     │
     ▼
Edge returns personalized schema
```