# Browser verification — 2026-11-11

> **Scope:** confirm the freshly rebuilt local stack (Rancher infra + host app + seeded data) renders the
> storefront, the login flow, the admin, and the visual editor.
> **Method:** headless Chrome (`playwright-core`, channel `chrome`) with
> `--host-resolver-rules=MAP yogastore.localhost 127.0.0.1`. Assertions are DOM/text based; screenshots are
> saved next to this file as artifacts.

---

## 1. Stack under test

| Component | State |
|---|---|
| Cluster | Rancher Desktop, k3s v1.37.2, node Ready |
| Infra | postgres, redis, clickhouse, vault, keto, s3, zitadel, jaeger, nango |
| Host app | API `:3000`, client `:5173` |
| Identity | Zitadel org `398655937176469540`, project `399159787020877870` |
| Data | `pnpm seed:demo:full` completed (`full/commerce`) |

## 2. Results

| Flow | URL | Result |
|---|---|---|
| Storefront | `/` | **200**, renders 7 blocks, "Signed in Sign out", featured product |
| Login page | `/login` | **200**, `AuthLayout` + `LoginForm`, email + password inputs |
| Sign in | form submit | **success** — lands on `/` as a signed-in user |
| Admin dashboard | `/admin` | **200**, `AdminHome`; full nav (Pages, Content, Layouts, Orders, Settings…) |
| Admin orders | `/admin/orders` | **200**, `OrdersAdmin` block |
| Admin agents | `/admin/settings/agents` | **200**, `AgentsAdminForm` block |
| Product page | `/products/demo-sneakers` | **200**, "Blue Sneakers CAD 99.99", `ProductInfo` + `CartSummary` |
| Visual editor | `/?edit=true` | **200**, toolbar "Edit page · Published · Save draft · Publish"; blocks `StackBase, Hero, TextBase, ProductGrid, ProductCard, CartSummary, CartDrawer` |

Console errors: **none**. Failed network requests: **none**.

## 3. Notes worth keeping

- **The visual editor needs ~5–10 s on first load.** It is a lazy `Suspense` chunk
  (`EditorGate`); a 2.5 s snapshot shows only `Loading editor…`. That is a timing artifact of the check, not a
  failure — with a longer wait all editor blocks render.
- **`/admin/agents` is not a route.** The registered path is `/admin/settings/agents`
  (`packages/client/src/platform-routes.ts`); an unknown `/admin/*` falls back to `AdminHome`, which is why the
  first pass showed `AdminHome` there.
- **Login inputs have no `name` attribute** (`input[type="email"]` / `input[type="password"]`, ids only).
  Selectors must use the type, not `input[name="email"]`.
- The storefront page is public; `/admin` redirects an unauthenticated visitor to the login form, which is the
  expected guard.

## 4. Scripts used

| Script | Purpose |
|---|---|
| `.tools/inspect-pages.mjs` | DOM/text dump of `/`, `/login`, `/admin`, product page |
| `.tools/verify-login.mjs` | form login + admin dashboard assertion |
| `.tools/probe-editor.mjs` | waits for the lazy editor chunk; reports blocks + failures |
| `.tools/verify-pages.mjs` | editor, admin home/orders/agents, product — with screenshots |

Screenshots: `docs/2026-11-11/evidence/{storefront,login,admin-unauth,editor,admin-home,admin-orders,admin-agents,product}.png`
