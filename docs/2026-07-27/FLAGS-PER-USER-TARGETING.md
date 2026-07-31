# Feature flags — current setup & per-user targeting

> **Date:** 2026-07-27  
> **Status:** Segment/layout targeting works today; **per-user targeting is supported on the server but not wired in the client SDK yet.**  
> **Related:** [`flags-domain.md`](../2026-07-04/flags-domain.md), [`BROWSER-SDK-INTEGRATION.md`](./BROWSER-SDK-INTEGRATION.md), [`ADMIN-PREVIEW-AND-FLAGS-SCOPE.md`](../2026-07-30/ADMIN-PREVIEW-AND-FLAGS-SCOPE.md)

---

## TL;DR

| Question | Answer |
|----------|--------|
| Does concurrent flag fetch work? | Yes — one `POST /api/flags/evaluate` on load (+ re-fetch on SSE / layout refresh). |
| Is it per-user today? | **No** — same `contextHash` + empty `contextProperties` for anonymous and logged-in users. |
| Can we add per-user later? | **Yes** — server already has `property_match` rules; client only needs to send `userId` / `role` in `contextProperties` and re-evaluate after login. |
| Do you need it for most storefront flags? | **Usually no** — segment + percentage + layout scope is enough (e.g. `show_summer_sale`). |

---

## Current flow (what runs today)

```text
Browser (@noname/browser-sdk)
  │
  ├─ init() → createFlagsModule()
  │     └─ evaluate() on startup (async, non-blocking)
  │           POST /api/flags/evaluate
  │           body: { context: { contextHash, schemaId, variantId, contextProperties: {} }, flagKeys? }
  │
  ├─ EventSource /api/flags/stream (SSE) → re-evaluate single flag on change
  │
  └─ Client host (packages/client)
        syncBrowserObservabilityContext() after edge schema load:
          analytics.setContext(schemaId, variantId, contextHash)
          flags.seed(edgeFlags)        // optional bootstrap from edge
          flags.evaluate()             // full re-fetch
          analytics.pageView()

Edge (:8787)
  └─ Public route — no JWT required
  └─ Adds x-org-id from Host (yogastore.localhost → org id)
  └─ Proxies to API :3000

API (packages/server/src/domains/flags)
  └─ service.evaluate(orgId, context, flagKeys)
  └─ For each active flag: match targeting rules → record evaluation in Postgres → return value
  └─ Client cache updated; json-render reads /flags/{key} via CatalogUiShell state mirror
```

### Context sent on every evaluate

| Field | Source today | Used for |
|-------|----------------|----------|
| `contextHash` | Edge segment (`"default"` until `setContext`) | `segment`, `segment_group`, `percentage` rules |
| `schemaId` / `variantId` | Edge layout / personalization | Flag scope + `scope_mismatch` |
| `contextProperties` | **Always `{}` in SDK** | **`property_match` rules (unused today)** |
| `orgId` | Edge header (not in JSON body) | Tenant isolation |

Login / `sdk.setUser()` affects **analytics + errors only** (`user_identified`, `meta.userId`). It does **not** change flag evaluation context.

---

## Code map

### Browser SDK — flag context is segment-only

```typescript
// packages/browser-sdk/src/index.ts
const flags = createFlagsModule(
  options.flags?.endpoint ?? DEFAULT_FLAGS_ENDPOINT,
  () => ({
    contextHash: contextHash ?? "default",
    schemaId,
    variantId,
    contextProperties: {},  // ← not populated; per-user hooks go here
  }),
  getHeaders,
);
```

```typescript
// packages/browser-sdk/src/modules/flags.ts
body: JSON.stringify({
  context: {
    contextHash: ctx.contextHash,
    schemaId: ctx.schemaId,
    variantId: ctx.variantId,
    contextProperties: ctx.contextProperties,
  },
  flagKeys,
}),
```

### Client host — when flags re-evaluate

```typescript
// packages/client/src/platform/browser-observability.ts
export async function syncBrowserObservabilityContext(context, edgeFlags?) {
  sdk.analytics.setContext(...);
  sdk.flags.seed(edgeFlags);
  await sdk.flags.evaluate();  // after every schema/segment load
  sdk.analytics.pageView();
}

export function syncObservabilityUserFromSession() {
  sdk.setUser({ id, email });  // analytics/errors only — no flags.evaluate()
}
```

### Server — targeting rules (per-user capable)

```typescript
// packages/server/src/domains/flags/ports.ts
export type Condition =
  | { type: "segment"; hash: string }
  | { type: "segment_group"; hashes: string[] }
  | { type: "percentage"; percent: number; seed?: string }
  | { type: "property_match"; property: string; operator: string; value: unknown }
  | { type: "always" }
  | { type: "expression"; expr: string };
```

```typescript
// packages/server/src/domains/flags/service.ts
function conditionMatches(condition, ctx, flag) {
  case "property_match":
    return propertyMatches(condition, ctx.contextProperties);
  case "percentage":
    return deterministicPercentage(orgId, flag.key, ctx.contextHash, ...);
}
```

Public evaluate normalizes missing context (2026-07-27 fix):

- Missing/blank `contextHash` → `"default"`
- Empty `schemaId` / `variantId` strings → `null` (Postgres UUID columns)

---

## Targeting modes — when to use which

| Need | Mechanism | Per-user? |
|------|-----------|-----------|
| Flag on/off for whole site | `always` or inactive flag | No |
| A/B % of visitors in a segment | `percentage` + `contextHash` | Per **segment**, stable bucket within segment |
| Only on a layout variant | Flag `schemaId` / `variantId` + edge context | No |
| Only for admins / beta users / plan tier | `property_match` on `contextProperties` | **Yes** (once wired) |
| Allowlist one account | `property_match` `{ property: "userId", operator: "eq", value: "…" }` | **Yes** (once wired) |

**Do not** use `contextHash = userId` as a hack for per-user flags — it breaks segment semantics and percentage rollouts. Use `property_match` instead.

---

## Simplest clean way to add per-user targeting

Minimal, layered change (no new server concepts):

### 1. SDK — expose mutable `contextProperties`

In `packages/browser-sdk/src/index.ts`:

- Keep a `contextProperties` object alongside `contextHash` / `schemaId` / `variantId`.
- Add `setFlagContext(props: Record<string, string | number | boolean>)` (merge, don’t replace entire evaluate API).
- Pass merged props into `createFlagsModule` getter.

### 2. Client — sync user into flag context on login

In `packages/client/src/platform/browser-observability.ts`:

```typescript
export function syncObservabilityUserFromSession() {
  // existing setUser for analytics…
  const userId = sessionUserId();
  if (userId) {
    sdk.setFlagContext({ userId, /* role from JWT if available */ });
    void sdk.flags.evaluate();  // re-fetch flags for this user
  } else {
    sdk.setFlagContext({});     // clear user props
    void sdk.flags.evaluate();
  }
}
```

Call sites already invoke `syncObservabilityUserFromSession()` on page load and after auth — no new lifecycle hooks required.

### 3. Admin — define rules with `property_match`

Example targeting rule (stored in flag JSON):

```json
{
  "priority": 0,
  "condition": {
    "type": "property_match",
    "property": "userId",
    "operator": "eq",
    "value": "383698238353506312-user-sub"
  },
  "value": true
}
```

Or by role (once `role` is in `contextProperties` from JWT):

```json
{
  "condition": {
    "type": "property_match",
    "property": "role",
    "operator": "eq",
    "value": "admin"
  },
  "value": true
}
```

### 4. Optional — edge never needs JWT for public evaluate

Logged-in users still hit the same public `/api/flags/evaluate` path; `userId` in body is **advisory for targeting**, not auth. Sensitive flags should use server-side auth on **mutations**, not on evaluate.

---

## What you do **not** need for typical demo flags

For `show_summer_sale` and similar:

- Segment hash `"default"` + `always` / `percentage` is enough.
- Edge seeds initial flag snapshot in schema response; SDK re-evaluates for freshness.
- Login stitching (`setUser`) is unrelated unless the flag must differ by account.

---

## Checklist before shipping per-user flags

- [ ] SDK sends `contextProperties` (not hardcoded `{}`)
- [ ] Re-evaluate after login/logout (`syncObservabilityUserFromSession`)
- [ ] Document which properties are stable (`userId`, `role`, `plan`, …)
- [ ] Admin UI or seed docs for `property_match` rules
- [ ] Privacy: only send properties you’re willing to store in `flag_evaluations` Postgres rows

---

## Related files

| File | Role |
|------|------|
| `packages/browser-sdk/src/modules/flags.ts` | Evaluate POST + SSE |
| `packages/browser-sdk/src/index.ts` | Context getter (`contextProperties: {}`) |
| `packages/client/src/platform/browser-observability.ts` | Host sync: setContext, evaluate, setUser |
| `packages/server/src/domains/flags/service.ts` | Rule matching + evaluation records |
| `packages/server/src/domains/flags/api.ts` | `POST /evaluate`, `GET /stream` |
| `packages/workers/src/routes/public-routes.ts` | Public evaluate (no JWT) |
