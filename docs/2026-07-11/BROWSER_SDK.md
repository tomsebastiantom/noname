# Browser SDK — Unified Frontend Observability

> **Decision (2026-07-11):** Replace `@noname/analytics-sdk` with `@noname/browser-sdk`. One `init()` call wires analytics, session replay, error monitoring, W3C trace context propagation, and feature flags. Every module shares a single session ID, single trace context, single flush lifecycle.

---

## Why Unify

Five separate SDKs mean five network connections, five config objects, five unload handlers, and zero correlation between them. The concerns are deeply intertwined:

| Concern A | Concern B | Shared state |
|-----------|-----------|-------------|
| Session replay | Analytics | `sessionId` — link recordings to events by session |
| Error monitoring | Tracing | `traceId` — correlate backend errors with frontend stack traces |
| Feature flags | Analytics | Flag state attached to every analytics event for A/B attribution |
| Tracing | All modules | Every SDK network call propagates W3C `traceparent` to the server |

A unified SDK collapses five initialization calls into one. It shares a single session ID, a single W3C trace context, a single batch/flush transport layer, and a single `visibilitychange`/`beforeunload` handler.

---

## Architecture

```
                     init({ tenantId, modules, transport })
                                    │
                    ┌───────────────┴───────────────┐
                    │          SDK Core              │
                    │  ─ session (uuid + storage)    │
                    │  ─ trace (w3c context manager) │
                    │  ─ transport (batcher + fetch) │
                    │  ─ privacy (consent + mask)    │
                    │  ─ lifecycle (unload + visible) │
                    │  ─ logger (debug/warn/error)   │
                    └───────┬───────┬───────┬───────┘
                            │       │       │
              ┌─────────────┤       │       ├─────────────┐
              │             │       │       │             │
        ┌─────▼─────┐ ┌─────▼──┐ ┌──▼────┐ ┌▼──────┐ ┌─────▼─────┐
        │ Analytics │ │ Replay │ │Errors │ │Trace  │ │  Flags    │
        │ ─ track   │ │(rrweb) │ │       │ │(w3c)  │ │ ─ get     │
        │ ─ pageView│ │─ start │ │─ onErr│ │─ span  │ │ ─ onUpdate│
        │ ─ identify│ │─ stop  │ │─ bread│ │─ fetch │ │ ─ evaluate│
        │ ─ context │ │─ mask  │ │─ dedup│ │─ inject│ │ ─ cache   │
        └─────┬─────┘ └────┬───┘ └──┬────┘ └───┬───┘ └─────┬─────┘
              │             │        │          │           │
              └─────────────┴────────┴──────────┴───────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │         Transport             │
                    │  ─ batcher (ring buffer)       │
                    │  ─ sender (fetch + sendBeacon) │
                    │  ─ retry (1 attempt, backoff)  │
                    │  ─ traceparent auto-injected   │
                    └───────────────┬───────────────┘
                                    │
        POST /api/analytics/track   ── analytics events (batch)
        POST /api/analytics/replay  ── rrweb event chunks
        POST /api/analytics/error   ── error reports (deduplicated)
        GET  /api/flags/evaluate    ── feature flag payload
```

---

## Session Lifecycle

A session is a 30-minute window of user activity identified by a UUID. It is the correlation key across all five modules.

```
Page load → sessionId from sessionStorage (reuse) or generate new
                │
                ├─ If existing sessionId AND lastActivity < 30 min ago → reuse
                ├─ If existing sessionId AND lastActivity > 30 min ago → expire, generate new
                └─ If no sessionId → generate new (crypto.randomUUID())

Session stored as:
  sessionStorage.setItem("noname_session", JSON.stringify({
    id: "uuid",
    startedAt: 1234567890,
    lastActivity: 1234567890,
  }));

On every analytics event / pageView / error → update lastActivity
On beforeunload → flush all pending buffers, persist session snapshot

Session expires: 30 minutes of inactivity. Expired session data is NOT deleted — old sessions
remain in sessionStorage until N sessions accumulate, then oldest is evicted (max 5 stored).
```

**Why `sessionStorage` over `localStorage`?** Tabs are independent sessions. Opening a new tab starts a new session. We do NOT want cross-tab session sharing — it breaks replay correlation and inflates session duration.

---

## Module 1: Analytics

> Migrated verbatim from the existing `packages/analytics-sdk`.

### Public API

| Method | Signature | Description |
|--------|-----------|-------------|
| `track` | `(eventType: string, meta?: Record<string, unknown>) => void` | Enqueue any event with attribution context |
| `pageView` | `() => void` | Auto-captures `window.location.href` and `document.referrer` |
| `identify` | `(sessionId: string) => void` | Override session ID (called from core, not user) |
| `setContext` | `(schemaId: string, variantId: string, contextHash: string) => void` | Set attribution context for all subsequent events |
| `flush` | `() => Promise<void>` | Force-flush the buffer |

### Event shape

```typescript
interface AnalyticsEvent {
  eventType: string;
  sessionId: string;
  schemaId: string | null;
  variantId: string | null;
  contextHash: string | null;
  meta: Record<string, unknown>;
  timestamp: number;
}
```

### Batching

| Parameter | Default | Description |
|-----------|---------|-------------|
| `batchSize` | 50 | Flush when buffer reaches this many events |
| `flushIntervalMs` | 5000 | Flush when this much time has passed since last flush |
| `maxRetries` | 1 | Retry count on fetch failure |

Buffer is a ring buffer capped at `batchSize`. If the buffer is full and a new event arrives before flush, the oldest event is dropped (FIFO). This prevents memory leaks on offline devices.

### Transport

- **Normal path:** `fetch(POST, batch JSON, keepalive: true)` → retry once on failure → drop on second failure
- **Unload path:** `navigator.sendBeacon(endpoint, batch JSON)` — no retry, fire-and-forget
- **Visibility path:** When `visibilitychange` fires `hidden`, treat as unload → `sendBeacon`

### Router integration (SPA support)

The SDK does NOT depend on any router. Instead, the host app calls `sdk.analytics.pageView()` manually on route change:

```typescript
// React Router example
useEffect(() => { sdk.analytics.pageView(); }, [location.pathname]);
```

For History API auto-capture (Phase 2), monkeypatch `history.pushState` / `replaceState` and `popstate`.

---

## Module 2: Session Replay (rrweb)

> Records DOM mutations, mouse movements, scrolls, and input interactions into a compact, replayable event stream.

### Dependencies

| Package | Version | Gzipped | License |
|---------|---------|---------|---------|
| `rrweb` | `^2.x` | ~30KB | MIT |

`rrweb` is NOT bundled into the SDK by default. It is dynamically imported via `import("rrweb")` only when `replay.enabled === true`. If replay is disabled, rrweb is never fetched — the SDK ships without it.

### Public API

| Method | Signature | Description |
|--------|-----------|-------------|
| `start` | `() => void` | Begin recording. Idempotent — calling twice is a no-op |
| `stop` | `() => void` | Pause recording. Flushes the current buffer |
| `mask` | `(selector: string) => void` | Add a CSS selector to the mask list. Elements matching this selector are replaced with a gray box in the replay |
| `unmask` | `(selector: string) => void` | Remove a selector from the mask list |
| `getSessionId` | `() => string` | Return the replay session ID (same as SDK session ID) |

### Recording strategy

```
rrweb.record() → emits IncrementalSnapshot events
                        │
              ┌─────────▼─────────┐
              │   Replay Buffer    │  ── Ring buffer, 60 seconds
              │   (circular)       │  ── Max ~5MB uncompressed
              │   Keeps last N     │  ── Events older than 60s are dropped
              │   events in mem    │
              └─────────┬─────────┘
                        │
              Flush trigger (whichever comes first):
              ── Buffer reaches 30 seconds of events
              ── Buffer reaches 2MB in size
              ── visibilitychange → hidden
              ── beforeunload
              ── stop() called
                        │
              ┌─────────▼─────────┐
              │   Compress         │  ── JSON.stringify → gzip? (Phase 2)
              │   (plain JSON)     │  ── Keep it simple for Phase 1
              └─────────┬─────────┘
                        │
              ┌─────────▼─────────┐
              │   sendBeacon /     │
              │   fetch POST       │
              │   → /api/analytics/replay
              └───────────────────┘
```

### Sampling

Replay is NOT recorded for every session. Sampling happens at `init()` time based on `sampleRate`:

```typescript
if (Math.random() < sampleRate) {
  await import("rrweb");
  replay.start();
}
```

Default: 5% (`sampleRate: 0.05`). Configurable per tenant via the init options or a remote config.

### Masking (PII Protection)

Default mask list (applied as rrweb `maskAllInputs: true` plus CSS selectors):

| Default mask | Rationale |
|-------------|-----------|
| `input[type="password"]` | Passwords |
| `input[type="email"]` | Email fields |
| `[data-mask]` | Explicitly marked elements |
| `.credit-card` | Custom convention |

Custom mask via `replay.mask(".checkout-form")`.

Masked elements appear as gray boxes in the replay. Text content is replaced with `*` characters.

### Checkout / sensitive page handling

```typescript
// Host app calls this when entering a sensitive page
sdk.replay.stop();

// And restarts when leaving
sdk.replay.start();
```

The `stop()` call flushes any pending buffer before pausing. `start()` after `stop()` creates a new recording chunk — the gap is visible in the replay as a "paused" overlay.

### Replay → Analytics correlation

Every replay chunk is tagged with the session ID. In the replay viewer, scrubbing to a timestamp loads the analytics events for that session at that time window:

```
GET /api/analytics/events?sessionId=X&from=T1&to=T2
```

This enables the "Show me what the user was doing when they hit this error" workflow.

---

## Module 3: Error Monitoring

> Captures unhandled errors and unhandled promise rejections. Deduplicates. Attaches session context, trace context, and user breadcrumbs.

### Public API

| Method | Signature | Description |
|--------|-----------|-------------|
| `capture` | `(error: Error, context?: Record<string, unknown>) => void` | Manually capture a handled error |
| `breadcrumb` | `(message: string, data?: Record<string, unknown>) => void` | Add a breadcrumb for the next error |
| `setUser` | `(user: { id: string, email?: string, name?: string }) => void` | Attach user identity to subsequent errors |

### Capture scope

| Source | Mechanism | Description |
|--------|-----------|-------------|
| `window.onerror` | Event listener | Unhandled exceptions with stack trace |
| `window.onunhandledrejection` | Event listener | Unhandled promise rejections |
| `console.error` | Monkeypatch | All `console.error()` calls become structured errors |

**IMPORTANT:** The `console.error` monkeypatch MUST preserve the original `console.error` behavior. It wraps, does not replace:

```typescript
const orig = console.error;
console.error = (...args: unknown[]) => {
  orig.apply(console, args);       // Original behavior preserved
  sdk.errors.capture(new Error(formatArgs(args)));
};
```

### Error payload

```typescript
interface ErrorReport {
  errorId: string;           // UUID, used for dedup
  sessionId: string;         // SDK session ID
  traceId: string;           // W3C trace ID at time of error
  spanId: string;            // W3C span ID at time of error
  timestamp: number;         // Unix ms
  message: string;           // error.message
  stack: string;             // error.stack (raw, not source-mapped yet)
  type: "unhandled" | "unhandledrejection" | "console" | "manual";
  breadcrumbs: Array<{       // Last 20 breadcrumbs before error
    message: string;
    data?: Record<string, unknown>;
    timestamp: number;
  }>;
  url: string;               // window.location.href
  userAgent: string;         // navigator.userAgent
  user?: {                   // If setUser() was called
    id: string;
    email?: string;
    name?: string;
  };
  tags: Record<string, string>;  // Arbitrary tags
}
```

### Deduplication

Errors are deduplicated by `message + stack[0:3]` (message + first 3 stack frames). If the same error fires again within 60 seconds, it is counted but NOT sent. After 60 seconds, the counter resets.

```
errorMap: Map<string, { count: number, lastSent: number }>

on error:
  key = sha256(error.message + error.stack.split("\n").slice(0,3).join(""))
  if key in map AND (now - map[key].lastSent) < 60s:
    map[key].count++
    return (skip)
  map.set(key, { count: 1, lastSent: now })
  send error with count = map[key].count
```

This prevents 10,000 identical errors from a broken event loop from flooding the server.

### Breadcrumb ring buffer

Last 20 breadcrumbs are kept in memory. On error capture, they are attached to the error payload and then cleared. This gives the engineer 20 context clues leading up to the crash.

```typescript
// Usage in host app
sdk.errors.breadcrumb("User clicked checkout button", { cartTotal: 49.99 });
sdk.errors.breadcrumb("Checkout API called");
// ... error fires → breadcrumbs attached to error report
```

### Transport

Errors are sent IMMEDIATELY — not batched. Errors are too important to wait for a batch window. The error module has its own `sendBeacon` handler on unload for any queued-but-unsent errors.

---

## Module 4: W3C Trace Context (Lightweight, No OTel SDK)

> Propagates W3C `traceparent` and `tracestate` headers on all SDK-initiated HTTP requests. Creates spans for page lifecycle events. Under 2KB — no `@opentelemetry/sdk-trace-web` dependency.

### Why NOT `@opentelemetry/sdk-trace-web`?

| Property | OTel SDK Web | Hand-rolled |
|----------|-------------|-------------|
| Bundle size | 80KB+ gzipped | ~2KB |
| Span export | OTLP/JSON → collector | W3C header propagation only |
| API surface | Full OTel API | 3 methods |
| Dependencies | 15+ transitive | 0 |
| What we need | `traceparent` header on fetch calls | Exactly that |

The server already has full OpenTelemetry instrumentation (`@opentelemetry/auto-instrumentations-node`). All we need in the browser is to generate valid W3C trace context and attach it to outgoing requests. The server picks it up and continues the trace.

### W3C traceparent format

```
version-traceId-spanId-traceFlags

00-{32 hex chars}-{16 hex chars}-01
```

```typescript
function generateTraceId(): string {
  // 32 hex chars = 16 random bytes
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateSpanId(): string {
  // 16 hex chars = 8 random bytes
  return Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}
```

### Public API

| Method | Signature | Description |
|--------|-----------|-------------|
| `startSpan` | `(name: string, attributes?: Record<string, string>) => SpanContext` | Start a new span. Returns the span context with `spanId` and `traceId`. The span is auto-ended on the next microtask tick or when `span.end()` is called |
| `getTraceHeaders` | `() => { traceparent: string, tracestate?: string }` | Return the current trace context as HTTP headers. Use this for manual `fetch()` calls |
| `inject` | `(headers: Record<string, string>) => Record<string, string>` | Inject trace context into an existing headers object |

### Span lifecycle

```typescript
interface SpanContext {
  traceId: string;
  spanId: string;
  end: () => void;          // End the span
  setAttribute: (key: string, value: string) => void;
}

const span = sdk.trace.startSpan("page_view", { url: window.location.href });
// ... page renders ...
span.setAttribute("component", "ProductPage");
span.end();   // Span duration = end - start
```

Spans are NOT exported to a collector. They are only used for W3C context propagation. The server's OpenTelemetry auto-instrumentation will export the full trace to Jaeger.

### Auto-injected spans

The SDK creates spans automatically for these lifecycle events:

| Event | Span name | Attributes |
|-------|-----------|------------|
| SDK `init()` | `browser.init` | `service.name`, `tenant.id` |
| Analytics flush | `analytics.flush` | `event.count` |
| Error capture | `error.capture` | `error.type`, `error.message` |
| Flag evaluate | `flag.evaluate` | `flag.count` |
| Replay chunk flush | `replay.flush` | `chunk.size_bytes` |

### fetch() interception

The trace module monkeypatches `window.fetch` to auto-inject `traceparent`:

```typescript
const origFetch = window.fetch;
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const headers = new Headers(init?.headers);
  const traceHeaders = trace.getTraceHeaders();
  if (!headers.has("traceparent")) {
    headers.set("traceparent", traceHeaders.traceparent);
  }
  return origFetch(input, { ...init, headers });
};
```

This is opt-in via `trace.propagateFetch: true`. It does NOT intercept XMLHttpRequest (Phase 2).

### Trace → Error correlation

When an error fires, the current `traceId` and `spanId` are attached to the error payload. This links the frontend error to the backend trace. In Jaeger, searching for the `traceId` from the error report shows the full distributed trace that led to the crash.

---

## Module 5: Feature Flags

> Client-side flag evaluation. Fetches flag values from the server. Caches locally. Provides synchronous read access. Fires callbacks on flag value changes.

### Public API

| Method | Signature | Description |
|--------|-----------|-------------|
| `get` | `(key: string) => FlagValue \| undefined` | Get current flag value. Synchronous — reads from local cache. Returns `undefined` if not yet fetched |
| `onUpdate` | `(key: string, callback: (value: FlagValue) => void) => () => void` | Subscribe to flag value changes. Returns unsubscribe function |
| `evaluate` | `(context?: Record<string, unknown>) => Promise<Record<string, FlagValue>>` | Force re-fetch all flags. Returns the full flag map |
| `isReady` | `() => boolean` | Whether the initial flag fetch has completed |

### Flag evaluation flow

```
init()
  └→ flags.evaluate()
       │
       ▼
  GET /api/flags/evaluate?tenantId=store-123&contextHash=abc123
       │
       ▼
  Server: ContextEngine.resolve(headers) → segment hash
          FlagService.evaluate(tenantId, segment)
          → { "new-checkout": true, "hero-variant": "b", "dark-mode": false }
       │
       ▼
  Client: flagsCache = response
          Compare old cache → fire onUpdate callbacks for changed keys
          Auto-track "flag.evaluated" analytics event per key
```

### Caching and staleness

| Parameter | Default | Description |
|-----------|---------|-------------|
| `pollIntervalMs` | 30_000 | Re-fetch interval. `0` = no polling (fetch once on init) |
| `staleTimeoutMs` | 300_000 | If a cached value is older than this, `get()` returns `undefined` and triggers a re-fetch. Prevents serving stale flags after long idle periods |

### Flag → Analytics integration

Flag evaluations are auto-tracked as analytics events. Every analytics event carries the current flag snapshot as context:

```typescript
// In analytics event meta:
{
  flags: {
    "new-checkout": true,
    "hero-variant": "b",
    "dark-mode": false,
  },
}
```

This enables A/B analysis: "Of the `conversion` events, what percentage had `new-checkout: true`?"

### Flag → Replay integration

When replay is active, flag changes during the session are recorded as custom rrweb events. This makes it possible to see exactly which variant the user was seeing at any point in the replay.

---

## Module 6: Performance & Web Vitals

> Captures Google Core Web Vitals (LCP, INP, CLS) and navigation timing (TTFB, DOM interactive, load complete). Uses the official `web-vitals` library (Google, MIT, ~2KB gzipped) for accurate metric measurement across all browser quirks.

### Why `web-vitals` and not hand-rolled

LCP has known measurement bugs: cross-origin iframe images aren't reported, `background` CSS images have no `PerformanceEntry`, and Safari reports LCP differently from Chrome. INP (Interaction to Next Paint) requires tracking all click/keyboard/tap events within a 5-second window and picking the worst one — non-trivial logic. CLS (Cumulative Layout Shift) requires computing a running windowed maximum from individual shift scores.

Rolling our own would be 200+ lines of edge cases that Google already solved. The `web-vitals` library is 2KB gzipped, MIT licensed, and maintained by the Chrome team. It calls `report()` callbacks when each metric stabilizes.

### Public API

| Method | Purpose |
|--------|---------|
| `performance.report(callback)` | Receive Web Vital reports as they stabilize. Callback fires at most once per metric per page load |

### Metrics captured

| Metric | Description | Thresholds (Good / Needs Improvement / Poor) |
|--------|-------------|----------------------------------------------|
| **LCP** | Largest Contentful Paint — when the largest visible element renders | <2.5s / <4.0s / ≥4.0s |
| **INP** | Interaction to Next Paint — worst interaction latency | <200ms / <500ms / ≥500ms |
| **CLS** | Cumulative Layout Shift — visual stability | <0.1 / <0.25 / ≥0.25 |
| **TTFB** | Time to First Byte — server response time | <800ms / <1800ms / ≥1800ms |
| **FCP** | First Contentful Paint — first visible element | <1.8s / <3.0s / ≥3.0s |

### How it works

```typescript
import { onLCP, onINP, onCLS, onTTFB, onFCP } from "web-vitals";

onLCP((metric) => sdk.analytics.track("web_vital", {
  name: "LCP",
  value: metric.value,
  rating: metric.rating,  // "good" | "needs-improvement" | "poor"
}));

onINP((metric) => sdk.analytics.track("web_vital", {
  name: "INP",
  value: metric.value,
  rating: metric.rating,
}));

// ... same pattern for CLS, TTFB, FCP
```

Each metric is reported exactly once per page load (when it stabilizes). The `web_vital` analytics event includes:
- `name` — LCP, INP, CLS, TTFB, FCP
- `value` — numeric value (ms for timing, unitless for CLS)
- `rating` — "good", "needs-improvement", or "poor"
- `delta` — difference from previous report (for SPA navigations)

### Navigation timing auto-capture

In addition to Web Vitals, the module captures the Navigation Timing API for every page load:

```typescript
// Captured once on load via PerformanceNavigationTiming
{
  dns: timing.domainLookupEnd - timing.domainLookupStart,
  tcp: timing.connectEnd - timing.connectStart,
  ttfb: timing.responseStart - timing.requestStart,
  download: timing.responseEnd - timing.responseStart,
  domInteractive: timing.domInteractive - timing.fetchStart,
  domComplete: timing.domComplete - timing.fetchStart,
  loadComplete: timing.loadEventEnd - timing.fetchStart,
}
```

This is reported as a single `navigation_timing` analytics event.

### SPA support

In single-page apps, the `web-vitals` library provides a `delta` property on each report — the difference from the previous metric value for the same page. For SPA soft navigations, the module supports:

```typescript
// Host app calls this on route change
sdk.performance.reportNavigation();

// This:
// 1. Resets the web-vitals observer for new metric readings
// 2. Captures a new navigation timing entry if available
// 3. Fires web_vital events with updated deltas
```

### Integration with other modules

- **Errors:** When a Web Vital metric is "poor," the performance module fires a breadcrumb: `sdk.errors.breadcrumb("Poor LCP", { value: 4200, rating: "poor" })`
- **Analytics:** All metrics are `web_vital` analytics events. Dashboard filters: "Show me sessions with LCP > 4s"
- **Replay:** In Phase 2, poor Web Vitals during recording trigger a marker on the replay timeline

### Dependencies

| Package | Size | License | Purpose |
|---------|------|---------|---------|
| `web-vitals` | ~2KB gzipped | MIT (Google) | LCP, INP, CLS, TTFB, FCP measurement |

---

## Unload & Visibility Lifecycle

All modules share a single unload handler. The order matters:

```
1. visibilitychange → hidden  OR  beforeunload  OR  pagehide
2. Stop active rrweb recording (take final snapshot)
3. Flush analytics buffer → sendBeacon
4. Flush replay buffer → sendBeacon
5. Flush any queued errors → sendBeacon
6. Persist session snapshot to sessionStorage
```

**Why `visibilitychange` over `beforeunload`?** `beforeunload` does NOT fire reliably on mobile (iOS Safari). `visibilitychange` to `hidden` fires consistently. `pagehide` is the most reliable but not supported everywhere. We use all three.

---

## Privacy & Consent

### Data categories

| Data | Category | Default | Opt-out |
|------|----------|---------|---------|
| Session ID | Anonymous | UUID, no PII | Can't opt out — required for core function |
| Analytics events | Behavioral | Page views, clicks, conversions | `analytics.enabled: false` |
| Replay recordings | Behavioral | DOM + mouse + scroll | `replay.enabled: false` OR `replay.sampleRate: 0` |
| Error reports | Diagnostic | Stack traces, URLs | `errors.enabled: false` |
| IP address | Network | Server-side, not stored | N/A — server doesn't log IP |

### GDPR/CCPA compliance

| Requirement | Implementation |
|-------------|---------------|
| **Consent** | SDK respects `navigator.doNotTrack` and `navigator.globalPrivacyControl`. If either is set, only errors are captured (no analytics, no replay). Host app can override via `init({ privacy: { respectDNT: false } })` |
| **Data access** | Session data is ephemeral (sessionStorage). Replay data stored server-side, retrievable by session ID |
| **Data deletion** | Host app calls `sdk.destroy()` → clears all local state, stops all modules, expires server-side session |
| **Cookie consent** | SDK uses no cookies. Session ID is in `sessionStorage` — no consent required |

### destroy()

```typescript
sdk.destroy();
// → stops all modules
// → flushes remaining buffers
// → clears sessionStorage
// → removes all event listeners
// → restores monkeypatched functions (console.error, fetch)
// → resolves
```

---

## Package Structure

```
packages/browser-sdk/
├── package.json
├── tsconfig.json
├── vite.config.ts              # Library mode build (ESM + IIFE)
└── src/
    ├── index.ts              # init() — unified entry point
    ├── types.ts              # All public types exported
    ├── core/
    │   ├── session.ts        # Session lifecycle (generate, store, expire)
    │   ├── transport.ts      # Batcher + sender + sendBeacon
    │   ├── lifecycle.ts      # Unload/visibility handler
    │   ├── privacy.ts        # DNT/GPC detection, consent model
    │   └── logger.ts         # Debug logging (disabled in prod)
    ├── modules/
    │   ├── analytics.ts      # Migrated from analytics-sdk + flag awareness
    │   ├── replay.ts         # rrweb wrapper + buffer + mask
    │   ├── errors.ts         # Error capture + dedup + breadcrumbs
    │   ├── trace.ts          # W3C trace context + fetch interceptor
    │   └── flags.ts          # Flag evaluation + cache + polling
    └── __tests__/
        ├── analytics.test.ts
        ├── replay.test.ts
        ├── errors.test.ts
        ├── trace.test.ts
        ├── flags.test.ts
        └── session.test.ts
```

### Build outputs

| Format | File | Use case |
|--------|------|----------|
| ESM | `dist/index.js` | Bundler import (Vite, webpack, Next.js) |
| IIFE | `dist/noname.js` | Script tag: `<script src="noname.js">` |
| Types | `dist/index.d.ts` | TypeScript consumers |

### Build config

```typescript
// vite.config.ts
export default defineConfig({
  build: {
    lib: {
      entry: "src/index.ts",
      name: "Noname",
      formats: ["es", "iife"],
      fileName: (format) => format === "iife" ? "noname.js" : "index.js",
    },
    outDir: "dist",
    sourcemap: true,
    minify: "esbuild",
  },
});
```

---

## Dependencies

| Package | Version | Gzipped | Bundled? | Purpose |
|---------|---------|---------|----------|---------|
| `rrweb` | `^2.x` | ~30KB | No — dynamic `import()` | Session replay |
| None else | — | — | — | — |

**Total static bundle (analytics + errors + trace + flags):** ~5KB gzipped.
**Dynamic import (when replay enabled + sampled):** +30KB gzipped.
**Worst case (all modules):** ~35KB gzipped.

---

## Initialization API (Complete)

```typescript
import { init } from "@noname/browser-sdk";

const sdk = await init({
  tenantId: "store-123",

  analytics: {
    enabled: true,
    endpoint: "https://api.example.com/api/analytics/track",
    batchSize: 50,
    flushIntervalMs: 5000,
  },

  replay: {
    enabled: true,
    sampleRate: 0.05,
    maskAllInputs: true,
    maxDurationMs: 600_000,
    endpoint: "https://api.example.com/api/analytics/replay",
  },

  errors: {
    enabled: true,
    captureConsoleError: true,
    breadcrumbsEnabled: true,
    dedupWindowMs: 60_000,
    endpoint: "https://api.example.com/api/analytics/error",
  },

  flags: {
    enabled: true,
    endpoint: "https://api.example.com/api/flags/evaluate",
    pollIntervalMs: 30_000,
    staleTimeoutMs: 300_000,
  },

  trace: {
    enabled: true,
    serviceName: "yoga-store",
    propagateFetch: true,
  },

  privacy: {
    respectDNT: true,
    respectGPC: true,
  },

  debug: false,  // Enable console logging for development
});

// Usage
sdk.analytics.pageView();
sdk.analytics.track("add_to_cart", { productId: "p123", quantity: 2 });
sdk.flags.get("new-checkout");              // true
sdk.errors.breadcrumb("Starting checkout");
sdk.replay.start();
sdk.trace.startSpan("checkout.flow");

// Clean up
sdk.destroy();
```

---

## Server Endpoints Required

| Endpoint | Method | Module | Payload | Purpose |
|----------|--------|--------|---------|---------|
| `/api/analytics/track` | POST | Analytics | `TrackingEvent[]` (batch JSON) | Ingest analytics events into ClickHouse |
| `/api/analytics/replay` | POST | Replay | `{ sessionId, events: rrwebEvent[] }` | Store replay chunks (S3 or ClickHouse) |
| `/api/analytics/error` | POST | Errors | `ErrorReport` (single) | Ingest error report |
| `/api/flags/evaluate` | GET | Flags | Query: `?tenantId=X&contextHash=Y` | Return `{ [flagKey]: value }` map |

All endpoints MUST accept `traceparent` header for W3C trace context propagation.

---

## Implementation Phases

### Phase 1 (Now) — Core + Analytics + Errors + Trace

| Step | What | Dependencies |
|------|------|-------------|
| 1.1 | Rename `analytics-sdk` → `browser-sdk` | None |
| 1.2 | Extract shared transport (batcher, sender, lifecycle) | Step 1.1 |
| 1.3 | Add session lifecycle (`core/session.ts`) | Step 1.2 |
| 1.4 | Add errors module (`modules/errors.ts`) | Step 1.2, 1.3 |
| 1.5 | Add trace module (`modules/trace.ts`) | Step 1.2, 1.3 |
| 1.6 | Create `init()` unified entry point | Steps 1.2–1.5 |
| 1.7 | Wire Vite library build | Step 1.6 |
| 1.8 | Delete old `analytics-sdk` package.json entry | Step 1.7 |

**Deliverable:** `@noname/browser-sdk` with analytics, errors, and trace modules.

### Phase 2 — Flags + Replay

| Step | What | Dependencies |
|------|------|-------------|
| 2.1 | Add flags module (`modules/flags.ts`) | Phase 1 |
| 2.2 | Add replay module (`modules/replay.ts`) + rrweb dep | Phase 1 |
| 2.3 | Add `destroy()` implementation | Steps 2.1–2.2 |
| 2.4 | Add server endpoints for `/replay` and `/error` | Steps 2.1–2.2 |
| 2.5 | Integration tests | Phase 2 |

**Deliverable:** Full SDK. All five modules.

### Phase 3 — Advanced

| Step | What |
|------|------|
| 3.1 | History API auto-capture for SPA pageView |
| 3.2 | Server-Sent Events for flag push (replace polling) |
| 3.3 | Source map upload + error stack deobfuscation |
| 3.4 | Replay gzip compression |
| 3.5 | XHR interceptor for trace propagation |
| 3.6 | Custom rrweb plugins (canvas recording, network timeline) |

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Package name** | `@noname/browser-sdk` | Covers all frontend observability, not just analytics |
| **Single `init()`** | One async call wires everything | Shared session, shared trace context, shared flush lifecycle |
| **Trace: hand-rolled** | 2KB W3C, not 80KB OTel SDK | We only need context propagation, not span export |
| **Replay: rrweb, dynamic import** | rrweb `^2.x`, `import("rrweb")` | Industry standard. Never bundled — only loaded when sampled |
| **Errors: immediate send** | No batching, `sendBeacon` | Errors are too critical to batch |
| **Flags: polling** | 30s interval, not SSE (Phase 2) | Simple, reliable, sufficient for low-churn flags |
| **Session: sessionStorage** | Tab-scoped sessions | Cross-tab sharing breaks replay correlation |
| **Deduplication: hash-based** | SHA-256 of `message + top 3 frames` | Prevents error storms without server-side logic |
| **Mask-by-default** | All inputs masked | GDPR/CCPA compliance out of the box |
| **Build: Vite library mode** | ESM + IIFE outputs | Works with bundlers AND `<script>` tags |
| **Privacy: DNT/GPC respected** | Auto-detected, opt-out via `init()` | Browser-native privacy signals honored by default |
| **destroy()** | Clean teardown, no leaks | Required for SPA navigation and testing |

---

## Patterns to Copy from Highlight SDK

Highlight.io (`highlight.run` v9.16.0) is the best-in-class open-source browser observability SDK. It bundles analytics, session replay (rrweb), error monitoring, console capture, network recording, and OpenTelemetry into a unified browser SDK. We should copy these specific patterns:

### 1. Two-Phase Initialization

Highlight captures errors/console DURING the async import of the main client bundle. Without this, errors thrown between `<script>` load and `init()` promise resolution are lost forever.

```
Phase 1 (synchronous):
  ─ Register window.onerror, onunhandledrejection, console.error monkeypatch
  ─ Store captured events in a temporary buffer
  ─ Start lazy-loading the main client bundle

Phase 2 (async, after dynamic import):
  ─ Client class initializes
  ─ Flushes Phase 1 buffer into real processing pipeline
  ─ Replaces Phase 1 listeners with permanent ones
```

**Our implementation:**

```typescript
// src/index.ts
export async function init(options: BrowserSDKOptions): Promise<BrowserSDK> {
  // Phase 1: Immediate error + console capture
  const preBuffer: PreBufferEvent[] = [];
  setupPreLoadListeners(options, preBuffer);

  // Phase 2: Build SDK
  const sdk = buildSDK(options);

  // Flush pre-buffer into real pipeline
  for (const event of preBuffer) {
    sdk.errors.handle(event);
  }
  preBuffer.length = 0;

  return sdk;
}
```

### 2. Ready-State Queue (`onReady`)

Lazy-loaded modules (replay with rrweb) are not immediately available. Public API methods that depend on those modules must wait. Highlight solves this with a polling queue:

```typescript
// Pattern: Queue calls until module is ready
const readyQueue: Array<{ fn: () => void }> = [];

function onReady(fn: () => void) {
  if (module.ready) { fn(); return; }
  readyQueue.push({ fn });
}

// When module becomes ready (e.g., after dynamic import resolves):
module.ready = true;
for (const entry of readyQueue) entry.fn();
readyQueue.length = 0;

// Usage — every public method:
function track(eventType: string, meta: Record<string, unknown>) {
  onReady(() => analyticsModule.track(eventType, meta));
}
```

**Our implementation:** The `onReady` pattern applies to `replay.start()`, `replay.stop()`, `replay.mask()`, and `flags.get()` — all methods that depend on lazily-loaded modules.

### 3. Slice-Based Payload Management

Do NOT clear arrays after sending. Clear by slicing past the sent items:

```typescript
// WRONG: Race condition — rrweb may push during send
this.events = [];
this.errors = [];

// RIGHT: Only remove what was sent
const sentEventCount = batch.length;
this.events = this.events.slice(sentEventCount);
this.errors = this.errors.slice(sentErrorCount);
```

This ensures events pushed during the async `fetch()` call are preserved.

**Our implementation:** All buffer management (`analytics buffer`, `replay buffer`, `error queue`) uses the slice pattern. The `batcher.ts` transport abstraction enforces this.

### 4. Error Filtering — Exact + Pattern Blacklists

Known noise errors must be filtered before sending. Use BOTH exact-match and regex-pattern matching:

```typescript
const EXACT_IGNORE = [
  '"Script error."',           // Cross-origin scripts
  '"Load failed."',            // Network starvation
  '"Network request failed."',
  '{"isTrusted":true}',        // Cross-origin generic
];

const PATTERN_IGNORE = [
  /ResizeObserver loop/,       // Harmless, fires millions
  /websocket error/i,          // Transient
  /chrome-extension:\/\//,     // Extensions
  /moz-extension:\/\//,
  /safari-extension:\/\//,
];

function shouldCapture(error: Error): boolean {
  const msg = `${error.message}`;
  if (EXACT_IGNORE.includes(msg)) return false;
  if (PATTERN_IGNORE.some((p) => p.test(msg))) return false;
  return true;
}
```

**Our implementation:** `modules/errors.ts` exports `EXACT_IGNORE` and `PATTERN_IGNORE` arrays. Host apps can append via `init({ errors: { ignorePatterns: [/my-noise/] } })`.

### 5. SDK Frame Removal from Error Stacks

Error stack traces include the SDK's own frames. These must be sanitized before sending, or every error will appear to originate from the SDK itself:

```typescript
function sanitizeStack(stack: string | undefined): string | undefined {
  if (!stack) return stack;
  return stack
    .split("\n")
    .filter((line) =>
      !line.includes("/noname/browser-sdk") &&
      !line.includes("noname.js"),
    )
    .join("\n");
}
```

**Our implementation:** Applied in `errors.ts` before sending. Uses a configurable list of filter patterns.

### 6. Periodic Full Snapshots (Replay)

rrweb replays grow linearly with DOM mutations. To keep replay file sizes manageable, force a full DOM snapshot periodically:

```
After 10MB of incremental events OR 4 minutes of recording:
  1. Take full rrweb snapshot (type: 2 — FullSnapshot)
  2. Reset the incremental event counter
  3. Discard all incremental events before the full snapshot

This compacts the replay: instead of replaying 1000 DOM mutations from the start,
the player jumps to the latest full snapshot and replays from there.
```

**Our implementation:** `modules/replay.ts` tracks `bytesSinceFullSnapshot` and `timeSinceFullSnapshot`. When either threshold is exceeded, it calls `rrweb.record().takeFullSnapshot()` and truncates the buffer.

### 7. Bot Detection

Don't record bots. Skip `init()` if the user agent indicates a bot:

```typescript
if (navigator.webdriver && !window.Cypress) return; // Selenium, Puppeteer
if (/Googlebot|AdsBot|bingbot|Baiduspider|YandexBot/i.test(navigator.userAgent)) return;
if (navigator.userAgent.includes("HeadlessChrome")) return;
```

Exception: allow test frameworks (`window.Cypress`, `window.Playwright`) through.

**Our implementation:** `core/privacy.ts` checks on `init()`. Configurable via `init({ privacy: { blockBots: false } })`.

### 8. Session Soft Reset

Sessions expire after N hours of recording. When a session expires, reset the session ID BUT preserve the user identity and flag state across the reset:

```typescript
async function resetSession(forceNew: boolean) {
  const oldUserId = this.userId;
  const oldFlags = this.flags;

  this.sessionId = generateUUID();
  this.sessionStartedAt = Date.now();
  this.userId = oldUserId;       // Preserve identity
  this.flags = oldFlags;         // Preserve flag state

  // Restart recording
  this.replay.stop();
  this.replay.start();
}
```

**Our implementation:** `core/session.ts` handles session lifecycle. The `resetSession()` method preserves `userId`, `flagCache`, and `attributionContext` across resets.

### 9. Console.error → Error Conversion

`console.error()` calls with stack traces should become structured errors:

```typescript
const orig = console.error;
console.error = (...args: unknown[]) => {
  orig.apply(console, args); // Preserve original

  for (const arg of args) {
    if (arg instanceof Error) {
      errors.capture(arg);
    } else {
      // Convert non-Error to Error with synthetic stack
      const err = new Error(typeof arg === "string" ? arg : JSON.stringify(arg));
      errors.capture(err);
    }
  }
};
```

**Our implementation:** `modules/errors.ts` wraps `console.error`. Opt-in via `init({ errors: { captureConsoleError: true } })`.

### 10. Visibility-Based Recording Pause

Pause rrweb recording when the tab is hidden, resume when visible:

```typescript
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    replay.stop(); // Flush buffer, pause recording
  } else {
    replay.start(); // Resume recording
  }
});
```

This saves CPU and reduces payload size during idle tabs.

**Our implementation:** `core/lifecycle.ts` manages visibility. The replay module registers its own handlers.

---

## Revised Error Monitoring Module

Based on Highlight's patterns, the error module needs these additions beyond the original design:

| Feature | Why |
|---------|-----|
| `EXACT_IGNORE` list | Skip known cross-origin/extension noise |
| `PATTERN_IGNORE` list | Skip pattern-based noise (ResizeObserver, websocket) |
| Stack frame sanitization | Remove SDK frames from stacks |
| Promise rejection stack capture | Capture the stack at Promise creation time (via patching) |
| `consumeError(error)` API | Existing errors from try/catch blocks |
| Bot detection | Skip init entirely for bot UAs |

---

## Revised Replay Module

Based on Highlight's rrweb usage patterns:

| Feature | Why |
|---------|-----|
| Periodic full snapshot | Compact replay files (10MB or 4 minutes) |
| Slice-based buffer management | Race-condition-safe event clearing |
| Cross-origin iframe recording | Optional, off by default |
| `blockClass` / `ignoreClass` | CSS class-based opt-out for users |
| Canvas recording | Optional, off by default (expensive) |
| Web Worker for compression | Move gzip to Worker thread (Phase 2) |

---

## Key Differences from Highlight

| Aspect | Highlight | Our SDK |
|--------|-----------|---------|
| **Transport** | GraphQL via Web Worker | REST via `fetch` / `sendBeacon` (simpler, fewer deps) |
| **Error reporting** | GraphQL `PushPayloadCompressed` | `POST /api/analytics/error` (JSON) |
| **Replay storage** | Backend handles storage | Our own ClickHouse/S3 via `/api/analytics/replay` |
| **Tracing** | Full `@opentelemetry/*` stack (80KB+) | Hand-rolled 2KB W3C context propagation |
| **Build** | Vite lib mode (ES + UMD) | Same — Vite lib mode (ES + IIFE) |
| **Compression** | `fflate` in Web Worker | Phase 1: uncompressed. Phase 2: `fflate` |
| **Promise tracing** | Patches `window.Promise` (when zone.js absent) | Phase 1 — 1KB cost, solves async debugging |
| **Network body recording** | XHR + fetch interception with body/header capture | Skipped — see below |

---

## Network Body Recording — Skipped (Future: FullStory Model)

### What we skip

Highlight and LogRocket capture XHR/fetch request and response bodies so you can see API payloads inside the session replay timeline:

```
14:32:01  [GET /api/products]  → 200, 2.3KB: [{ id: "p1", name: "Yoga Mat" }]
14:32:05  [POST /api/cart]     → 201: { cartId: "c42" }
14:32:12  [POST /api/checkout] → 500: { error: "card declined" }
```

### Why we skip it

Request bodies contain PII (credit cards, passwords, addresses). Response bodies contain customer data (order history, emails). A blocklist-based sanitization layer is fragile — one refactored field name silently fails open and captures PII.

### What the industry does

| Platform | Captures bodies? | Model |
|----------|-----------------|-------|
| **Sentry** | No | Metadata only: URL, method, status. Intentionally narrow. |
| **Datadog RUM** | No | Metadata + timing. GraphQL query is opt-in, limited to 32KB. |
| **LogRocket** | Yes, on by default | Opt-out via `requestSanitizer`/`responseSanitizer`. Blocklist model. Risky. |
| **FullStory** | Yes, off by default | **Allowlist-only.** Gold standard. |

Sentry and Datadog — the two enterprise-first platforms — don't capture bodies at all. LogRocket is the outlier.

### Future plan: FullStory's allowlist model

When we need this, we implement FullStory's three-layer defense:

**Layer 1 — Global kill switch.** Network capture is OFF by default. Admin toggles it ON in settings. Off = nothing captured, not even URLs.

**Layer 2 — Metadata only until you write rules.** After toggling ON, the SDK captures only safe data:
- HTTP method, URL, status code, timing
- Safe headers (never `authorization`, `cookie`, `proxy-authorization`)
- Request/response size (same-origin only)

No bodies are captured until you explicitly write an allowlist rule.

**Layer 3 — Per-URL + per-field allowlist.** Each rule specifies:
```
URL Pattern (regex):  .*api\.example\.com/api/.*/login
Request body fields:  creds/user           ← only this path
Response body fields: success, error/msg   ← only these paths
```

| Field pattern | Matches |
|--------------|---------|
| `creds/user` | Exactly `user` inside `creds` |
| `action/*` | Any single field one level under `action` |
| `action/**` | Any field at any depth under `action` |

Everything else is `[redacted]`. Unknown fields are NEVER captured — an allowlist can't fail open.

**Intersection safety.** When a URL matches multiple rules, the most restrictive intersection applies:
```
Rule 1: allow foo/bar, baz
Rule 2: allow baz, qux
Result: ONLY baz is captured
```

**Why blocklists fail.** A field named `auth` could be a harmless method (`"simple"`) in one path and a password (`"s3kr!t"`) in another. A blocklist of `*/auth` loses the good data. A blocklist of `credentials/auth` silently fails when someone renames `credentials` → `creds`. An allowlist cannot fail open — unknown paths are always redacted.

**Non-retroactive.** Rules only apply to sessions captured AFTER configuration. Historical data is unaffected.

**Implementation trigger:** Ship this only when a real customer debugging workflow is blocked by not having API payloads in the replay timeline. Until then, server-side OpenTelemetry gives us the network timing data we need, and rrweb DOM recording shows what the user actually saw on screen.

---

## json-render Catalog Integration

The browser SDK doesn't just provide a public API for host apps — it integrates directly into the json-render component catalog so every rendered component auto-tracks analytics events. No fork of json-render required.

### Why no fork

json-render renders UI through component registries — you define a catalog of components, and `<Renderer>` resolves each element in the JSON spec to a React component. The catalog is entirely user-defined. Adding analytics tracking to catalog components is just another entry in `defineCatalog()` — no change to json-render core.

```
json-render responsibility:              Our responsibility:
  ─ Parse JSON spec                      ─ Define components in catalog
  ─ Resolve component names              ─ Each component imports SDK
  ─ Render tree with registry            ─ Auto-track on mount/interact
  ─ Handle visibility/actions            ─ Wire action handlers to SDK.track()
```

### Integration pattern

**1. SDK initialization happens once, before <Renderer> mounts:**

```typescript
// packages/client/src/main.tsx
import { init } from "@noname/browser-sdk";
import { Renderer } from "@json-render/react";

const sdk = await init({
  tenantId: "store-123",
  analytics: { endpoint: "/api/analytics/track" },
  // ...
});

// Expose SDK to catalog components via React context
<SDKContext.Provider value={sdk}>
  <Renderer spec={jsonSpec} registry={mergedRegistry} />
</SDKContext.Provider>
```

**2. Catalog components consume SDK via context and auto-track:**

```typescript
// packages/client/src/components/AddToCart.tsx
import { useSDK } from "../hooks/useSDK";
import type { ActionComponentProps } from "@json-render/react";

export default function AddToCart({ element, onAction }: ActionComponentProps) {
  const sdk = useSDK();

  useEffect(() => {
    // Auto-track impression on mount
    sdk.analytics.track("impression", {
      component: "AddToCart",
      productId: element.props.productId,
    });
  }, []);

  const handleClick = () => {
    // Auto-track click
    sdk.analytics.track("click", {
      target: "AddToCart",
      productId: element.props.productId,
    });
    // Then fire the json-render action
    onAction(element.actions?.onClick);
  };

  return <button onClick={handleClick}>Add to Cart</button>;
}
```

**3. Attribution context flows from page spec to SDK to every event:**

```typescript
// When a page loads with a specific layout variant:
sdk.analytics.setContext(
  spec.schemaId,      // "layout_product_page_v3"
  spec.variantId,     // "variant_b_hero_test"
  spec.contextHash,   // "mobile_new_visitor_segment"
);

// Every subsequent track() call automatically carries:
// { schemaId: "layout_product_page_v3", variantId: "variant_b_hero_test", contextHash: "mobile_new_visitor_segment" }
```

**4. json-render action bindings auto-track via the handler:**

```typescript
// In the catalog's executeAction handler:
function executeAction(action: ActionBinding) {
  sdk.analytics.track("action", {
    action: action.type,
    target: action.target,
    params: action.params,
  });
  // Then execute the actual action...
}
```

### Auto-tracked events (no manual code)

With this integration, the following events fire automatically for every page:

| Event | Trigger | Attribution |
|-------|---------|-------------|
| `page_view` | `<Renderer>` mounts with new spec | schemaId, variantId, contextHash |
| `impression` | Any catalog component mounts | component name + element props |
| `click` | Any catalog component with `onClick` action | component name + target |
| `action` | Any `executeAction` call (navigate, submit, API) | action type + params |
| `scroll` | Scroll depth milestones (25%, 50%, 75%, 100%) | schemaId, variantId |
| `error` | Any unhandled error in a catalog component | component name, error stack |

### What this unlocks

- **A/B testing works out of the box.** Every impression is tagged with `schemaId` + `variantId`. The conversion rates API groups by variant automatically. No manual `track()` calls needed.
- **Funnel analysis is automatic.** Checkout flows built as json-render state machines auto-track every transition. Add-to-cart → checkout-start → checkout-step → conversion.
- **Replay is time-aligned with events.** Scrubbing the replay to a specific second shows the analytics events that fired at that moment. Click an event in the dashboard → replay jumps to that timestamp.
- **Tenant components inherit tracking.** Any component a tenant uploads through the catalog system gets the same auto-tracking via the `useSDK()` hook. No extra code required.

(End of file)



