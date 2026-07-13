# Mobile App — Architecture & Build Plan

## Status: Design (2026-07-11)

## Stack: React Native + Expo

Expo managed workflow — OTA updates via EAS Update, iOS/Android builds via EAS Build, push notifications built-in, no native config needed for dev.

---

## The Goal

A single app serving two personas from the same binary:

| Persona | What they see | JWT role |
|---------|--------------|----------|
| **End user / visitor** | Storefront — browse, cart, checkout | `customer` |
| **Admin / merchant** | Analytics, feature flags, error logs, AI page builder | `admin` |

Role dispatch happens at the app root — check JWT `role` claim, mount either `AdminShell` or `StoreShell`.

---

## What We Already Have (No Server Changes Needed)

| Capability | API | Status |
|-----------|-----|--------|
| JSON spec delivery | `GET /api/edge/schema/:siteId` | ✅ |
| Personalized layout | `POST /api/edge/personalize` | ✅ |
| AI agent (generate pages) | `POST /api/agents/tasks` → poll | ✅ |
| Analytics events | `POST /api/analytics/track` | ✅ |
| Analytics queries | `GET /api/analytics/aggregations` + `/conversions` | ✅ |
| Feature flags | `GET/PUT /api/flags` | ✅ |
| Error logging | `POST /api/analytics/error` | ✅ |
| Auth (Logto) | JWT validation | Planned |
| Catalog manifest | `GET /api/tenants/:id/catalog` | ✅ (just built) |

---

## Telemetry — `packages/mobile-sdk` (Planned)

The browser SDK (`packages/browser-sdk`) has 5 modules, 4 core utilities, and a shared type system. The mobile app needs the same observability layer, but React Native has no `window`, `sessionStorage`, `crypto.getRandomValues`, or `document`. A separate package mirrors the same structure with RN-native replacements.

### Shared Pattern — browser-sdk vs mobile-sdk

| Module | browser-sdk | mobile-sdk |
|--------|------------|------------|
| **Analytics** | `modules/analytics.ts` — batches events via `fetch`, uses `sessionStorage` for queue | Same API, `AsyncStorage` for queue, same `POST /api/analytics/track` endpoint |
| **Errors** | `modules/errors.ts` — `window.onerror` + `unhandledrejection` listeners, browser URL + UA | Same API, `ErrorUtils.setGlobalHandler` for RN errors, `Platform.OS` + version instead of URL/UA |
| **Trace** | `modules/trace.ts` — `crypto.getRandomValues` for IDs, patches `window.fetch` | `expo-crypto` for IDs, no fetch patching (RN's global `fetch` is already available, trace headers injected per-request manually) |
| **Session** | `core/session.ts` — `sessionStorage` | `AsyncStorage` with TTL |
| **Privacy** | `core/privacy.ts` — DNT/GPC check via `navigator` | Skipped (no DNT in mobile) |
| **Logger** | `core/logger.ts` — `console.debug` gated by debug flag | Identical — same pattern |
| **Transport** | `core/transport.ts` — `fetch` with retry + backoff | Identical — `fetch` works in RN |

### What's skipped on mobile

| Module | Reason |
|--------|--------|
| **Performance** (`PerformanceModule`) | Web Vitals (LCP, INP, CLS) are browser-specific. RN uses native profilers instead. |
| **Flags** (`FlagsModule`) | Feature flags are evaluated server-side in the edge domain. Mobile reads resolved flag values from `GET /api/edge/schema` response. No client-side evaluation needed. |

### package structure (planned)

```
packages/mobile-sdk/
├── package.json              # @noname/mobile-sdk, deps: expo-crypto, @react-native-async-storage/async-storage
├── tsconfig.json
├── vite.config.ts              # Same build tool as browser-sdk
├── src/
│   ├── index.ts              # init() → MSDK { analytics, errors, trace }
│   ├── types.ts              # Shared types: MobileSDK, AnalyticsEvent, ErrorReport, SpanContext
│   ├── core/
│   │   ├── logger.ts         # Copied from browser-sdk
│   │   ├── session.ts        # AsyncStorage-backed session
│   │   └── transport.ts      # Copied from browser-sdk
│   └── modules/
│       ├── analytics.ts      # Batched event tracking → /api/analytics/track
│       ├── errors.ts         # ErrorUtils global handler + manual capture
│       └── trace.ts          # expo-crypto IDs, manual traceparent injection
```

### API (identical to browser-sdk)

```typescript
import { init } from "@noname/mobile-sdk";

const msdk = await init({
  tenantId: "yogastore",
  analytics: { enabled: true, batchSize: 20 },
  errors: { enabled: true },
  trace: { enabled: true, serviceName: "noname-mobile" },
});

// Same API surface as browser-sdk
msdk.analytics.track("product_viewed", { productId: "abc" });
msdk.errors.capture(error, { screen: "ProductPage" });
msdk.trace.startSpan("checkout", { step: "payment" });
```

### Why a separate package, not a one-off `telemetry.ts`

- Same module structure as browser-sdk — one mental model for both platforms
- Testable, versioned, published independently
- Can be used by multiple RN apps (merchant app, customer app, admin)
- Not tied to `packages/mobile` — reusable if we build a separate admin-only app later

---

## New Package: `packages/mobile`

### files Created

```
packages/mobile/
├── app.json                    # Expo config (name, slug, splash, plugins)
├── eas.json                    # EAS Build + Update profiles
├── package.json                # RN + Expo deps
├── tsconfig.json               # strict, jsx: react-jsx
├── App.tsx                     # Root — auth check, role dispatch
├── src/
│   ├── catalog.ts              # Copied from packages/client/src/catalog.ts (same Zod definitions)
│   ├── catalog-loader.ts       # Copied from web — MF runtime + manifest fetch + loadRemote
│   ├── mf-init.ts              # Copied from web — MF runtime init with shared deps
│   ├── registry.ts             # RN component implementations (View/Text/Touchable)
│   ├── auth.ts                 # JWT decode + secure storage (expo-secure-store)
│   ├── api.ts                  # Fetch wrapper — base URL, auth headers, error handling
│   ├── components/
│   │   └── index.tsx           # RN implementations: Hero, ProductCard, Grid, Stack, Text, Button, Image
│   ├── screens/
│   │   ├── admin/
│   │   │   ├── Dashboard.tsx   # Analytics overview (calls /api/analytics/aggregations)
│   │   │   ├── FeatureFlags.tsx# Flag list + editor (calls /api/flags)
│   │   │   ├── ErrorLogs.tsx   # Error event viewer (calls /api/analytics/events?type=error)
│   │   │   ├── AgentChat.tsx   # AI chat + spec preview + approve/reject
│   │   │   └── SiteStats.tsx   # Conversion rates, page views (calls /api/analytics/*)
│   │   └── store/
│   │       └── StoreShell.tsx   # json-render <Renderer> with spec from /api/edge/schema
│   └── navigation/
│       └── index.tsx           # React Navigation — stack per role
```

### Dependencies

```json
{
  "expo": "~52.0.0",
  "react": "19.2.7",
  "react-native": "0.78.x",
  "@json-render/core": "^0.19.0",
  "@json-render/react": "^0.19.0",
  "@module-federation/runtime": "^2.7.0",
  "@noname/mobile-sdk": "workspace:*",
  "zod": "^4.4.3",
  "@react-navigation/native": "^7.x",
  "@react-navigation/bottom-tabs": "^7.x",
  "@react-navigation/native-stack": "^7.x",
  "react-native-screens": "~4.x",
  "react-native-safe-area-context": "~5.x",
  "expo-secure-store": "~14.x",
  "expo-constants": "~17.x",
  "expo-linking": "~7.x"
}
```

---

## Catalog Sharing — Web vs Mobile

Same catalog definitions, different component implementations:

```
packages/client/src/catalog.ts          ← Zod schemas (shared logic)
packages/mobile/src/catalog.ts          ← Copy of the same file
packages/client/src/components/index.tsx ← <section>, <h1>, <div>, <img>
packages/mobile/src/components/index.tsx ← <View>, <Text>, <Image>
```

Example — same catalog entry, two renderers:

```tsx
// Web: HTML elements
function Hero({ props, children }) {
  return <section style={{ padding: 64 }}><h1>{props.title}</h1>{children}</section>
}

// Mobile: RN native elements
function Hero({ props, children }) {
  return <View style={{ padding: 64 }}><Text style={{ fontSize: 40 }}>{props.title}</Text>{children}</View>
}
```

The `<Renderer>` from `@json-render/react` works on both platforms — it renders whatever components are in the registry passed to it. React Native has its own `View`, `Text`, `Image`, `ScrollView`, etc. that replace HTML elements.

---

## Telemetry — RN Adapter

The existing `packages/browser-sdk` uses browser-only APIs (`crypto.getRandomValues`, `window.fetch` patching). For React Native, we create a lightweight adapter (`src/telemetry.ts`) that:

- Uses `expo-crypto` for `getRandomBytes` (replaces `crypto.getRandomValues`)
- Wraps `fetch` without patching the global (React Native has global `fetch`, no `window`)
- Stores session ID in `AsyncStorage` instead of `sessionStorage`
- Sends analytics events to the same `POST /api/analytics/track` endpoint
- Propagates `traceparent` headers matching the server's OpenTelemetry format

No need to fork `browser-sdk` — the adapter is ~60 lines and covers the 3 things mobile needs: analytics events, error capture, trace propagation.

---

## Auth Flow

```
App launch
  → expo-secure-store: getItem("jwt")
  → No token?
    → Logto sign-in (WebBrowser.openAuthSessionAsync)
    → Exchange code for token
    → Store JWT in expo-secure-store
  → Token exists?
    → Decode payload (atob + JSON.parse)
    → Check exp (expired?) → refresh or re-login
    → Check role
      → role=admin → AdminTabs (Dashboard, Flags, Agent, Errors, Stats)
      → role=customer → StoreStack (browse → product → cart → checkout)
```

Logto provides OAuth/OIDC — Expo's `AuthSession` handles the redirect flow. The mobile app uses a custom URL scheme (`noname://`) for the redirect.

---

## AI Agent in Mobile

The agent is already HTTP-based. The mobile app just needs a chat UI:

```
1. Admin types: "Create a summer sale page with hero and product grid"
2. POST /api/agents/tasks { type: "generate_layout", prompt, tenantId }
   → 201 { data: { id: "task-abc", status: "pending" } }
3. Poll GET /api/agents/tasks/task-abc every 2s
   → status: "running" → keep polling
   → status: "completed" → output { spec: { root, elements } }
4. Render spec in <Renderer spec={output.spec} registry={adminRegistry} />
5. Admin previews → taps Approve
6. PUT /api/agents/tasks/task-abc/approve
   → Spec published, live on storefront
```

Same flow as the web admin would use. The mobile app just renders the chat UI + spec preview differently (native components instead of HTML).

---

## Build & Deploy

| Stage | Tool | What |
|-------|------|------|
| **Dev** | `expo start` | QR code, instant reload on device |
| **Preview** | EAS Update | OTA update to testers, no app store |
| **Build** | EAS Build | iOS IPA + Android AAB |
| **Submit** | EAS Submit | Push to App Store + Google Play |
| **Updates** | EAS Update | Push JS bundles without app store review |

---

## Phase Plan

### Phase 1 — App Shell + Storefront (MVP)

| What | Creates |
|------|---------|
| Expo project scaffold | `packages/mobile/` with `app.json`, `package.json`, `tsconfig.json` |
| Auth check + role dispatch | `App.tsx`, `src/auth.ts` |
| Store shell with json-render | `src/screens/store/StoreShell.tsx`, `src/catalog.ts`, `src/registry.ts`, `src/components/index.tsx` |
| MF runtime + catalog loading | Copy `mf-init.ts` + `catalog-loader.ts` from web, adjust for RN |
| API client | `src/api.ts` — fetch wrapper with base URL + auth headers |
| Telemetry adapter | `src/telemetry.ts` — analytics events + error capture |

### Phase 2 — Admin Dashboard

| What | Creates |
|------|---------|
| Admin navigation shell | `src/navigation/index.tsx` — bottom tabs (Dashboard, Flags, Errors, Agent, Stats) |
| Analytics dashboard | `src/screens/admin/Dashboard.tsx` — charts from aggregation API |
| Feature flags | `src/screens/admin/FeatureFlags.tsx` — list + toggle |
| Error logs | `src/screens/admin/ErrorLogs.tsx` — event feed |
| Site stats | `src/screens/admin/SiteStats.tsx` — conversion rates, page views |

### Phase 3 — AI Agent + Page Builder

| What | Creates |
|------|---------|
| Agent chat UI | `src/screens/admin/AgentChat.tsx` — prompt input, status polling, spec preview |
| Approve/reject flow | `PUT /api/agents/tasks/:id/(approve|reject)` in chat UI |
| Page preview | `<Renderer spec={output.spec} registry={adminRegistry} />` in chat UI |

### Phase 4 — Native Features + Ship

| What | Creates |
|------|---------|
| Push notifications | `expo-notifications` — agent task complete, build done |
| Biometric auth | `expo-local-authentication` — secure unlock |
| Camera | `expo-image-picker` — product photos from admin |
| EAS Build + Submit | `eas.json` profiles → App Store + Google Play |

---

## Key Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| **Framework** | React Native + Expo | Managed workflow, OTA updates, TypeScript, shares json-render catalog |
| **One app, two roles** | Role-based dispatch at root | One binary, one App Store listing, simpler CI |
| **Catalog** | Copy from web, no shared package yet | Avoids premature abstraction; extract to `packages/shared-catalog` later |
| **Telemetry** | `@noname/mobile-sdk` — separate package mirroring browser-sdk | Same module structure, RN-native replacements (AsyncStorage, expo-crypto), reusable |
| **MF on mobile** | Same `@module-federation/runtime` as web | Tenant custom components load on mobile via same `loadRemote()` |
| **json-render renderer** | `@json-render/react` with RN component catalog | Same `Renderer` component, different registry (native elements vs HTML) |
