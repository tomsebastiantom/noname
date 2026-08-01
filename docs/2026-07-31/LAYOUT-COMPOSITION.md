# Layout Composition — Full Page vs Shell + Panel

> **Date:** 2026-07-31  
> **Status:** Implemented — `renderAs` + `shellRef` on layout documents; edge returns shell + panel; client composes via `AdminPlatformView`  
> **Related:** [`CONTENT-RENDER-PIPELINE.md`](../2026-07-25/CONTENT-RENDER-PIPELINE.md), [`PAGE-ROUTING.md`](../2026-07-25/PAGE-ROUTING.md), [`SPEC-DRIVEN-UI.md`](../2026-07-25/SPEC-DRIVEN-UI.md), [`CATALOG-PROPS-MIGRATION.md`](./CATALOG-PROPS-MIGRATION.md)

---

## Problem

Without an explicit compose mode, **page**, **layout**, **shell**, and **route** blur together:

- Public URLs use `page_tree` → page doc → `layoutRef` + `contentRef`
- Admin URLs use platform routes → two layout fetches (`admin_shell` + panel)
- Some layouts are full screens; some are inner panels only

Every new screen raises the same questions: *Does this need a shell? A page doc? A content entry? Another layout inside the layout?*

---

## Decision: two compose modes

Every layout document declares **how it is rendered** via `renderAs`. Three values cover all cases.

| Mode | `renderAs` | Meaning | Example |
|------|------------|---------|---------|
| **Full page** | `standalone` | One layout = whole screen | `login`, `home`, `account_security` |
| **Shell + panel** | `shell` / `panel` | Chrome and inner UI are separate layouts | `admin_shell` + `admin_pages` |

No third path. No client-side “extract shell from combined spec.”

---

## Document roles (what each type is for)

| Document | Role | Used in |
|----------|------|---------|
| **page_tree** | URL → page id | Public site only |
| **page** | Pointer: `layoutRef` + `contentRef` | Public site only |
| **content entry** | Business data (title, price, body…) | Merged into **full** layouts via edge |
| **layout (`standalone`)** | Entire UI tree | Storefront, login, account |
| **layout (`shell`)** | Shared chrome (sidebar, nav) | Admin — never routed alone |
| **layout (`panel`)** | One screen’s inner UI + `shellRef` | Admin — one per menu screen |

**Rule:** A **page** doc always points at a **standalone** layout. Admin screens do **not** use page docs — they use **panel** layouts + a shared **shell**.

---

## Mode A — Full page

### Flow

```
URL
  → page_tree (public) OR platform route (login, account)
  → page doc: layoutRef + contentRef   (public only)
  → edge: load layout spec
  → edge: mergeContentIntoSpec (content → $state → literals)
  → client: render one spec
```

### Example: homepage

**page_tree:** `/` → page id `home`

**page doc:**

```json
{
  "layoutRef": "home",
  "contentRef": "page:abc123"
}
```

**content entry** (`page`, id `abc123`):

```json
{ "title": "Welcome", "body": "Edit in Admin → Content." }
```

**layout `home`** (spec excerpt):

```json
"header": {
  "type": "Text",
  "props": {
    "labels": { "content": "Welcome to Noname" }
  }
}
```

Static copy lives in layout `labels`. Dynamic fields use `$state` slots merged on edge (see [`CONTENT-RENDER-PIPELINE.md`](../2026-07-25/CONTENT-RENDER-PIPELINE.md)).

**Composition happens on the server:** `packages/server/src/domains/edge/service.ts` → `mergeContentIntoSpec`.

---

## Mode B — Shell + panel

### Flow

```
URL → platform-routes.ts → panel template (e.g. admin_pages)
  → load shell layout (admin_shell) — once per session
  → load panel layout (admin_pages) — per navigation
  → merge panel labels.title into shell header
  → client: stable AdminShell + keyed panel CatalogUiShell
```

### Example: admin Pages

**Shell layout `admin_shell`** (nav + sidebar copy in spec):

```json
{
  "root": "shell",
  "elements": {
    "shell": {
      "type": "AdminShell",
      "props": {
        "config": { "navItems": […], "settingsItems": […] },
        "labels": { "sidebarTitle": "Admin", "nav": { "pages": "Pages" } }
      },
      "children": []
    }
  }
}
```

**Panel layout `admin_pages`** (no AdminShell inside):

```json
{
  "root": "panel",
  "elements": {
    "panel": {
      "type": "Stack",
      "children": ["loadPages", "pagesAdmin"]
    },
    "pagesAdmin": {
      "type": "PageRoutingAdmin",
      "props": {
        "labels": {
          "title": "Pages",
          "description": "Routing page documents…"
        }
      }
    }
  }
}
```

Panel data (page list, flags, team) loads at runtime via **actions → `$state`**, not via `page.contentRef`.

---

## Target layout document shape

Layout documents gain metadata beside `spec`:

```jsonc
// admin_shell
{
  "renderAs": "shell",
  "spec": { … }
}

// admin_pages
{
  "renderAs": "panel",
  "shellRef": "admin_shell",
  "spec": { … panel only … }
}

// home
{
  "renderAs": "standalone",
  "spec": { … },
  "contentRef": "product:demo-sneakers"   // optional default content
}
```

Edge (or client) reads `renderAs` and `shellRef` — no hardcoded shell template in `main.tsx`.

---

## What reuses what

| Reuse | Id | How many routes |
|-------|-----|-----------------|
| Admin chrome | `admin_shell` | All `/admin/*` panels |
| One admin screen | `admin_pages`, `admin_flags`, … | One platform route each |
| Storefront template | `home` | Many pages can share same layoutRef |
| Content | one entry per page (typical) | One `contentRef` on page doc |

You **reuse the shell layout id**, not “shell + full layout per route” duplicated in seed.

---

## Current implementation (2026-07-31)

| Piece | Status |
|-------|--------|
| Panel-only admin layouts in seed | ✅ |
| `admin_shell` layout in seed | ✅ |
| Client: stable shell + swap panel (`AdminPlatformView`) | ✅ |
| Client: `assertAdminPanelSpec` (reject AdminShell in panel) | ✅ |
| `renderAs` / `shellRef` on layout documents | ✅ |
| Edge compose shell + panel | ✅ |
| Client: `AdminPlatformView` reads edge `renderAs: panel` | ✅ |
| Layout admin UI for `renderAs` + shell picker | ❌ P3 |
| Legacy combined AdminShell+panel specs | ❌ Removed (intentionally) |

---

## Follow-up work (recommended order)

### P1 — Layout metadata (spec-driven link)

1. Add `renderAs` (`standalone` | `shell` | `panel`) and optional `shellRef` to layout document `data` in documents domain.
2. Validate on publish: `panel` requires `shellRef`; `shell` must not be routed as a standalone page template.
3. Seed: set metadata on all demo layouts.
4. Edge `getSchema`: when resolving a `panel` layout, return `{ shell, panel }` or compose server-side.

### P2 — Thin client

1. Remove `ADMIN_SHELL_TEMPLATE` hardcode from `main.tsx`.
2. Client reads compose mode from edge response; keep `AdminPlatformView` behavior.
3. Document in [`SPEC-DRIVEN-UI.md`](../2026-07-25/SPEC-DRIVEN-UI.md) § adding admin screens.

### P3 — Admin layout editor

1. Layout admin UI shows **Render as** (`standalone` / `shell` / `panel`) and shell picker for panel layouts.
2. Prevent publishing panel specs that include `AdminShell` (matches client assert).

### P4 — Optional

- Multiple shells (`vendor_shell`) via `shellRef` per panel — no client change if metadata-driven.
- Storefront pages that use shell+panel (unusual) — same `panel` + `shellRef` model.

---

## Adding a new screen (cheat sheet)

### Public page with CMS content

1. Create content entry (if needed).
2. Create or reuse **full** layout template.
3. Create **page** doc: `layoutRef` + `contentRef`.
4. Add **page_tree** entry for URL.

### Admin menu screen

1. Create **panel** layout (`admin_myfeature`) — panel components only.
2. Add platform route: `/admin/myfeature` → `admin_myfeature` in `platform-routes.ts`.
3. Add nav row in **`admin_shell`** spec (`config.navItems` + `labels.nav`).
4. Re-seed.

No new content type. No page doc. No shell inside panel spec.

---

## Anti-patterns

| Don't | Do instead |
|-------|------------|
| Put `AdminShell` inside every admin panel layout | One `admin_shell` + panel-only specs |
| Hardcode shell copy in client (`shell-config.ts`) | Shell copy in `admin_shell` layout spec |
| Nest layouts manually in client without metadata | `shellRef` on panel layout document |
| Use page doc for `/admin/*` | Platform route + panel layout |
| Combine shell + panel in one spec “for convenience” | Two layouts, explicit `renderAs` |

---

## Summary

- **Public site:** page machine — URL → page → **full** layout + **one** content entry → edge merge.
- **Admin:** panel machine — URL → **panel** layout + shared **shell** layout → compose once, swap panel on nav.
- **Best long-term:** declare `renderAs` + `shellRef` on layout documents so edge owns the link; client only renders the result.

This is the intended permanent model, not a temporary cache or client hack.
