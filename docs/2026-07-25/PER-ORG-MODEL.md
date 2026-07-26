# Per-Org Model — Who Owns What

> **Date:** 2026-07-25  
> **Status:** Active — conceptual overview (multi-tenant storefront model)  
> **Related:** [`ARCHITECTURE-MAP.md`](./ARCHITECTURE-MAP.md), [`PAGE-ROUTING.md`](./PAGE-ROUTING.md), [`SPEC-DRIVEN-UI.md`](./SPEC-DRIVEN-UI.md)

---

## One sentence

**Platform = shared engine, components, and admin shell.**  
**Each org = its own URLs, layouts, content, and auth config in Postgres.**  
**The browser always renders a layout spec — it never hardcodes “this path means home page.”**

Think Shopify: one engine, many stores.

---

## Big picture

```
┌─────────────────────────────────────────────────────────────┐
│  PLATFORM (Noname — one codebase, ships once)               │
│  • React components (Hero, ProductCard, AdminShell, …)      │
│  • Actions (login, save content, add to cart)               │
│  • Fixed routes (/login, /admin/*)                          │
│  • ZITADEL auth, Postgres, API                              │
└─────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
   Org A: yogastore     Org B: shoeshop     Org C: …
   own URLs             own URLs             own URLs
   own products         own products         own products
   own Google on/off    own auth config      …
```

### How the browser knows which org

| Phase | Dev URL | Resolution |
|-------|---------|------------|
| **Today** | `{orgId}.localhost:5173` | Subdomain = ZITADEL org id |
| **Phase 3** | `{slug}.localhost:5173` | Subdomain = store slug → lookup org id |

See [`PHASE-3-STORE-SLUG.md`](./PHASE-3-STORE-SLUG.md).

---

## Who owns what

| Thing | Owner | Storage | Example |
|-------|-------|---------|---------|
| **Which org am I?** | Platform | Hostname → slug → org id | `yogastore.localhost` |
| **Storefront URLs** (`/`, `/about`, `/products/…`) | **Merchant (per org)** | `page_tree` document | Org A: `/` → home; Org B: `/` → different page |
| **Layout + content for a URL** | **Merchant (per org)** | `page` document | `layoutRef: "home"`, `contentRef: "product:uuid"` |
| **Page structure** (Hero, grid, ProductCard) | **Merchant (per org)** | `layout` document | Org A home layout ≠ Org B home layout |
| **Copy / product fields** (title, price, body) | **Merchant (per org)** | `content` document | Org A: “Blue Sneakers $99” |
| **Google login on/off** | **Merchant (per org)** | `tenant_settings.auth` | Org A has Google; Org B password only |
| **Admin UI** (`/admin/*`) | **Platform** | Code + layout templates | Same admin shell for every org |
| **Login page structure** | **Platform** | `login` layout template | Same LoginForm component everywhere |
| **Login providers / copy props** | **Merchant config** | Layout props + `tenant_settings.auth` | Org A shows Google; Org B does not |
| **UI components** (Hero, Button, …) | **Platform** | `packages/client/src/core/` | Shared — not duplicated per org |
| **Extensions** (commerce, …) | **Platform ships**, **merchant enables** | Catalog manifest per org | Org A enables `commerce`; Org B does not |

**Rule of thumb:** if a merchant should change it without a deploy → **Postgres documents scoped by `org_id`**. If it is product infrastructure → **platform code**.

---

## Two stores (concrete example)

### Org A — Yoga Store

```
URL:  yogastore.localhost:5173/     (today: {orgId}.localhost:5173/)
Auth: Google + password
Extensions: none (core only)

page_tree:
  "/" → page "home"

page "home":
  layoutRef: "home"
  contentRef: "page:abc-111"

content (page entry):
  title: "Welcome to Yoga Store"
  body: "Classes every Monday"

layout "home":
  Stack → Hero(title from $state) + Text(body from $state)
```

### Org B — Shoe Shop

```
URL:  shoeshop.localhost:5173/
Auth: password only
Extensions: commerce

page_tree:
  "/" → page "home"
  "/products/demo-sneakers" → page "product-demo"

page "product-demo":
  layoutRef: "home"
  contentRef: "product:xyz-999"

content (product):
  title: "Blue Sneakers"
  price: 99.99

layout "home":
  Hero + ProductCard(title/price from $state)
```

Same platform code. Different documents in Postgres, filtered by `org_id`.

---

## What happens when someone visits a URL

### Storefront — merchant-owned URL

```
Visitor → yogastore.localhost:5173/products/demo-sneakers

1. Client knows org from hostname; sends pathname to API
2. Server (scoped to that org only):
     page_tree  → which page id?
     page doc   → layoutRef + contentRef
     layout     → json-render spec with $state slots
     content    → title, price, body, …
     merge      → resolved spec (copy filled in)
3. Client renders spec via json-render <Renderer>
```

Merchant adds `/products/demo-sneakers` in **Admin → Pages → URL tree**. No code change.

Client fetch shape:

```
GET /api/edge/schema/{orgId}?url=/products/demo-sneakers
```

See [`PAGE-ROUTING.md`](./PAGE-ROUTING.md).

### Platform — fixed URL (login / admin)

```
Merchant → yogastore.localhost:5173/admin/content

1. Client maps path in platform-routes.ts → template admin_content
2. Server loads layout admin_content for this org
3. Client renders AdminShell + ContentEntryAdmin
```

Same admin UI for every org. Edits **that org’s** content only.

Client fetch shape:

```
GET /api/edge/schema/{orgId}?template=admin_content
```

Platform paths stay in code because they are finite and not merchant CMS. See [`SPEC-DRIVEN-UI.md`](./SPEC-DRIVEN-UI.md).

---

## Why two query params (`?url=` vs `?template=`)

| URL type | Query | Because |
|----------|-------|---------|
| **Storefront** | `?url=` | URL meaning lives in **documents** (merchant-editable) |
| **Platform** | `?template=` | URL meaning lives in **code** (fixed product routes) |

Both return the same thing: a layout spec for `<Renderer>`. Only the resolution path differs.

---

## Admin surface (per org)

Every org gets the same admin shell. Each screen edits **that org’s data only**:

| Admin route | Edits |
|-------------|-------|
| `/admin/pages` | Routing page docs (`layoutRef`, `contentRef`) |
| `/admin/pages/tree` | `page_tree` URL → pageId map |
| `/admin/content` | CMS entries (page, product, …) |
| `/admin/layout` | json-render layout templates |
| `/admin/settings/auth` | Sign-in providers per org |

Code: `packages/client/src/platform-routes.ts` (platform paths), admin components under `packages/client/src/core/components/`.

---

## Vertical slice (what we are building)

One complete path per org:

```
1. Hostname     → org id
2. URL          → page_tree
3. Page doc     → layoutRef + contentRef
4. Layout       → structure ($state slots)
5. Content      → merchant copy
6. Renderer     → pixels on screen
7. Admin        → edit 2–6 without redeploy
8. Auth         → per-org login (ZITADEL + tenant_settings)
```

The API/edge layer is where steps 2–5 run server-side before JSON reaches the browser. The mental model is **documents per org + one renderer**, not “a React page per route.”

---

## Do not mix these

| Wrong | Right |
|-------|-------|
| Hardcode `/about` in client routing | Add `page_tree` entry |
| Bake product title into layout JSON | `content` entry + `$state` on layout |
| Put `/admin/content` in `page_tree` | Platform template in `platform-routes.ts` |
| One global `.env` Google IdP for all orgs | `tenant_settings.auth` per org |
| `packages/client/src/pages/About.tsx` | Layout spec + catalog component |

---

## References

| Doc | Topic |
|-----|-------|
| [`ARCHITECTURE-MAP.md`](./ARCHITECTURE-MAP.md) | Master index, build order |
| [`PAGE-ROUTING.md`](./PAGE-ROUTING.md) | URL → page_tree → spec |
| [`CONTENT-RENDER-PIPELINE.md`](./CONTENT-RENDER-PIPELINE.md) | `$state` + content merge |
| [`SPEC-DRIVEN-UI.md`](./SPEC-DRIVEN-UI.md) | How to add UI without drift |
| [`ORG-AUTH-CONFIG.md`](./ORG-AUTH-CONFIG.md) | Per-org auth providers |
| [`PHASE-3-STORE-SLUG.md`](./PHASE-3-STORE-SLUG.md) | Friendly hostnames |
| [`documents-domain.md`](../2026-07-10/documents-domain.md) | Full CMS data model |
