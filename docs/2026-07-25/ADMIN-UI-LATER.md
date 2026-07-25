# Admin UI — Later (load & manage)

> **Date:** 2026-07-25  
> **Status:** Planned — **after login UI**  
> **Start with:** [`LOGIN-UI-PLAN.md`](./LOGIN-UI-PLAN.md)  
> **Related:** [`VISUAL_EDITOR.md`](../2026-07-11/VISUAL_EDITOR.md), [`MODULE_FEDERATION.md`](../2026-07-11/MODULE_FEDERATION.md)

---

## When

Build this **after** embedded login works. Admin is for **loading and managing** layouts, content, settings — not sign-in.

---

## Goal

Merchant dashboard inside `packages/client` (no separate package):

- **Admin shell** — sidebar, header (shadcn)
- **Layout templates** — `admin_dashboard`, `admin_store` in documents domain
- **Lists & forms** — products, pages, flags (json-render + shadcn `DataTable`, etc.)
- **Visual editor** — `?edit=true` on live storefront ([`VISUAL_EDITOR.md`](../2026-07-11/VISUAL_EDITOR.md))
- **Page-specific JS** — Module Federation remotes from catalog manifest ([`MODULE_FEDERATION.md`](../2026-07-11/MODULE_FEDERATION.md))

---

## Components (later catalog entries)

| Component | Purpose |
|-----------|---------|
| `AdminShell` | Sidebar + main slot |
| `AdminNav` | Navigation |
| `AdminPageHeader` | Title, breadcrumbs |
| `DataTable` | CRUD lists |
| `PropsPanel` | Visual editor side panel |

`LoginForm` lives in login phase — not part of admin shell.

---

## Page load (admin routes)

Same pipeline as storefront, different layout template:

```
GET /admin  (or admin.{slug}.localhost)
  → JWT required (admin role)
  → GET /api/edge/schema/{orgId}?template=admin_dashboard
  → GET /api/tenants/{orgId}/catalog  (+ MF remotes if any)
  → Renderer
```

---

## Phases (after login)

1. shadcn `AdminShell` + seed `admin_dashboard` layout
2. Protected `/admin` route + edge role gate
3. **Auth settings** — per-org social login, MFA, login branding ([`ORG-AUTH-CONFIG.md`](./ORG-AUTH-CONFIG.md))
4. Visual editor lazy chunk (`editor/`)
5. Tenant catalog bundler + MF remotes

---

## References

- [`docs/2026-07-04/ARCHITECTURE_DECISIONS.md`](../2026-07-04/ARCHITECTURE_DECISIONS.md) — admin as layout templates
- [`docs/2026-07-11/CLIENT_BUNDLE.md`](../2026-07-11/CLIENT_BUNDLE.md) — client + edge flow
