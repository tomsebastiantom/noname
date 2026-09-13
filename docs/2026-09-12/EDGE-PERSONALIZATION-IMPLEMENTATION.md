# Edge Personalization Implementation

## Scope

Implemented the next non-Stripe roadmap item: wire the edge personalization result into the storefront bot/request path.

## Implementation

- The worker now resolves the tenant organization before calling personalization.
- `personalizeSchema()` now accepts separate `siteId` and `orgId` values:
  - `siteId` is sent in the API request body.
  - `orgId` signs the worker-to-origin HMAC request.
- Bot storefront requests call `POST /api/edge/personalize` with the original request headers.
- Device, referral, geography, cookie tier, and time signals can now reach the server personalization service.
- If personalization returns a layout, it is used for SEO extraction and React streaming.
- If personalization fails or returns no layout, the worker falls back to the existing schema endpoint.
- The existing R2 shell path for normal browser requests remains unchanged.

## Live edge scenarios

The running edge worker was exercised with three bot requests:

| Scenario | Request signals | Result |
|---|---|---|
| Desktop direct | Googlebot, no cookie | HTTP 200, personalized path completed |
| Mobile premium | Mobile user agent, `tier=premium` cookie | HTTP 200, personalized path completed |
| Tablet free | Tablet viewport, `tier=free` cookie | HTTP 200, personalized path completed |

All responses returned the resolved storefront title and content. The local demo currently resolves the same layout for these segments because no distinct segment layout variant is configured; the request path and signal forwarding are verified.

## Browser MCP verification

Persistent Browser MCP scenarios passed:

- Desktop viewport: 1440×900
- Mobile viewport: 390×844 with `tier=premium`
- Tablet viewport: 768×1024 with `tier=free`
- Storefront rendered the seeded `Blue Sneakers` product in every scenario.
- Browser console errors: 0.

## Automated verification

- Worker Biome checks — PASS
- Worker typecheck — PASS
- Worker SEO tests — PASS, 7 tests
- Full typecheck — PASS
- Full test suite — PASS, 147 files / 521 tests
- Full build — PASS

The next edge roadmap item is deployment through Wrangler/Cloudflare Workers.
