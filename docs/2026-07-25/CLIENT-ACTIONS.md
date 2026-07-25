# Client Actions — Architecture at Scale

> **Date:** 2026-07-25  
> **Status:** Target architecture (platform split now; MF merge next)  
> **Related:** [`MODULE_FEDERATION.md`](../2026-07-11/MODULE_FEDERATION.md), [`catalog-loader.ts`](../../packages/client/src/catalog-loader.ts)

---

## Problem

If every action lives in one `registry.ts`, it becomes huge. Worse: if every tenant’s custom actions ship in the host bundle, **store A loads store B’s code**. That does not scale to 100 tenants × 100 actions.

---

## Principle

| Rule | Meaning |
|------|---------|
| **Spec names actions** | Layout JSON says `"action": "addToCart"` — data only |
| **Catalog declares schemas** | Zod params per action (platform + tenant catalog) |
| **Registry executes** | Impl lives in code modules, merged at runtime |
| **Load only what this store needs** | Platform bundle + **this tenant’s** MF remote(s) |

Client stays a **runtime**: evaluate spec → resolve action by name → run handler from merged registry.

---

## Three layers of actions

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Core platform actions (src/core/actions/)                │
│    navigate, login, logout … — every org                      │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│ 2. Extension actions (packages/extensions/src/{name}/actions.ts) │
│    commerce: addToCart, checkout — only if extension enabled │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│ 3. Tenant / marketplace (MF remote)                       │
│    Custom per org — see MODULE_FEDERATION.md                │
└─────────────────────────────────────────────────────────────┘
```

See [`CLIENT-CATALOG-LAYERS.md`](./CLIENT-CATALOG-LAYERS.md) and [`EXTENSIONS.md`](./EXTENSIONS.md) for core vs extension layout.

---

## File layout (platform — avoid one giant file)

Split by domain; compose in `registry.ts`:

```
packages/client/src/
├── core/actions/navigation.ts
├── platform/registry.ts      ← merges core only
└── catalog-loader.ts         ← merges @noname/extensions + MF remotes

packages/extensions/src/
└── commerce/actions.ts
```

```typescript
// registry.ts (thin)
import { platformActionHandlers } from "./actions";
import { catalog } from "./catalog";

export const { registry, handlers, executeAction: platformExecuteAction } =
  defineRegistry(catalog, {
    components: { /* ... */ },
    actions: platformActionHandlers,
  });
```

```typescript
// actions/auth.ts
import { exchangePassword, clearSession } from "../auth/login";

export const authActions = {
  login: async (params) => { /* ZITADEL → token */ },
  logout: async () => { clearSession(); window.location.href = "/"; },
};
```

**Catalog schemas** stay in `catalog.ts` (or `catalog/actions.ts`) so specs validate. **Handlers** stay in `actions/*`. Same split as components: schema vs impl.

---

## Tenant actions (Module Federation)

Already planned in [`MODULE_FEDERATION.md`](../2026-07-11/MODULE_FEDERATION.md). Tenant build exports:

```typescript
export const { registry, executeAction } = defineRegistry(tenantCatalog, {
  components: { YTClassSchedule, ... },
  actions: { bookClass: async (params) => { ... } },
});
```

**Today:** `catalog-loader.ts` merges **component registries** only.  
**Next:** also merge `executeAction` (or full handlers map) from each remote:

```typescript
// Target API in catalog-loader.ts
const platform = platformExecuteAction;
const remote = await loadRemote(`${name}/catalog`);
const executeAction = (name, params, ctx) =>
  remote?.executeAction?.(name, params, ctx) ?? platform(name, params, ctx);
```

Resolution order: **tenant remote → marketplace remote → platform** (or platform first for core auth — policy choice; auth should stay platform-only).

---

## What NOT to do

| Anti-pattern | Why |
|--------------|-----|
| All actions in one 5000-line `registry.ts` | Unmaintainable |
| Tenant actions in host bundle | Every client loads every tenant |
| Action logic inside spec JSON | Not data; security nightmare |
| Action logic duplicated in every component | Use `executeAction("name", params)` |
| 100 separate `defineRegistry` calls in main | One composed registry per loaded scope |

---

## Auth actions (platform-only)

`login`, `idpLogin`, `logout` stay in **platform** `core/actions/auth.ts` + `auth/` helpers. Tenants do not override auth execution — they only style `LoginForm` via spec props. Edge still validates JWT the same way.

### Canonical pattern (do not duplicate)

One path for every side effect — same as commerce `ProductCard` → `addToCart` action → API:

```
Layout spec (props only)
  → catalog component (UI + user input)
  → executeAction("name", params)
  → core/actions/*.ts
  → auth/*.ts or fetch("/api/...")
```

| Do | Don't |
|----|-------|
| `LoginForm` → `executeAction("login", …)` | Import `auth/login.ts` in components |
| `SocialLoginButtons` → `executeAction("idpLogin", …)` | Call `startIdpLogin` from components |
| Put HTTP/token logic in `auth/*.ts` once | Copy login fetch into each component |
| Change behavior in **one** action handler | Add a second shortcut path “for now” |

When auth behavior changes (new provider, MFA step, token storage), edit **`actions/auth.ts`** and **`auth/*.ts`** only — components and layout specs stay stable.

---

## Lazy loading (optional, later)

If a single tenant has hundreds of actions, split tenant remote into multiple MF entries (e.g. `actions-commerce`, `actions-booking`) and load only remotes referenced in manifest. Spec/action names stay stable; loading is manifest-driven.

---

## Checklist

- [x] Split platform handlers → `actions/{auth,navigation}.ts` (+ extension actions stay in `@noname/extensions`)
- [x] Keep `registry.ts` thin
- [x] Add `login` / `logout` / `idpLogin` to catalog schemas + auth handlers
- [ ] Extend `catalog-loader` to merge remote `executeAction`
- [ ] Tenant bundler exposes actions in MF catalog export
- [ ] Document allowed action names per layout template (optional guard)

---

## References

- `packages/client/src/catalog.ts` — action schemas today
- `packages/client/src/registry.ts` — handlers today (to split)
- `packages/client/src/catalog-loader.ts` — remote registry merge
- [`LOGIN-UI.md`](./LOGIN-UI.md) — login UI + social scaffold
