# Edge SEO Prerender Implementation

## Scope

Implemented the next non-Stripe edge-worker roadmap item: React 19 streaming SEO HTML for bot requests.

## Implementation

- Added `react` and `react-dom` to `@noname/workers`.
- Added React type definitions for worker typechecking.
- Switched the worker renderer to `react-dom/server.edge`, which is compatible with the Workers runtime.
- Added `renderBotStream()` to stream the resolved SEO document with React 19.
- Preserved the existing string renderer as an error fallback.
- Kept rich-text HTML restricted to output from the existing `richTextToHtml` sanitizer and documented the narrow `dangerouslySetInnerHTML` suppression.
- Added a streaming renderer unit test.
- Updated the edge-worker roadmap: personalization wiring is now the next item.

## Live verification

A Googlebot user agent request was sent through the running edge worker with the tenant host:

```text
GET http://localhost:8787/
Host: yogastore.localhost
User-Agent: Googlebot/2.1
```

Observed:

- HTTP 200
- `Content-Type: text/html; charset=UTF-8`
- `Cache-Control: public, max-age=300`
- Streamed HTML contained the resolved storefront title and rich-text content.
- The Workers runtime remained healthy after switching from `server.browser` to `server.edge`.

## Verification

- Worker Biome checks — PASS
- Worker typecheck — PASS
- SEO renderer tests — PASS, 7 tests
- Live bot response — PASS

The existing non-bot request path remains the R2 client shell path. The next edge roadmap item is wiring the personalization result into `api.ts`.
