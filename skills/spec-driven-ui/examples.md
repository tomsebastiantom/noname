# Spec-Driven UI — Examples

Shipped references in this repo. Copy the pattern, not the commerce-specific fields.

---

## Example 1: Admin auth settings

**Component:** `AuthSettingsForm`  
**Action:** `saveAuthConfig`  
**Layout:** `admin_dashboard` in `scripts/seed-demo.ts`

```
AdminShell (activeNav: "auth")
  └── AuthSettingsForm (title, description from layout props)
        └── executeAction("saveAuthConfig", { providers, allowPassword, googleOAuth })
              └── core/actions/auth.ts → server auth domain → ZITADEL + Postgres
```

**Route:** `/admin/settings/auth` → template `admin_dashboard` (no extra main.tsx line — `/admin*` matches).

**Files:**
- `packages/client/src/core/catalog-schemas.ts` — `AuthSettingsForm`, `saveAuthConfig`
- `packages/client/src/core/components/AuthSettingsForm.tsx`
- `packages/client/src/core/actions/auth.ts`
- `scripts/seed-demo.ts` — `adminDashboardSpec`

---

## Example 2: Generic content CMS

**Component:** `ContentEntryAdmin`  
**Actions:** `saveContentEntry`, `publishContentEntry`  
**Layout:** `admin_content`

```
AdminShell (activeNav: "content")
  └── ContentEntryAdmin (locale from layout props)
        └── loads content types + entries via admin helpers (inside component)
        └── executeAction("saveContentEntry" | "publishContentEntry", …)
```

**Route:** `/admin/content`, `/admin/content/:type` → template `admin_content`.

**Why not a ProductAdmin:** Content type schema drives fields — works for `page`, `product`, any type.

**Files:**
- `packages/client/src/core/components/ContentEntryAdmin.tsx`
- `packages/client/src/admin/content-entries.ts` — API helpers (not a route)
- `packages/client/src/core/actions/content.ts`
- `scripts/seed-demo.ts` — `adminContentSpec`, `pageContentType`

---

## Example 3: Login page

**Components:** `AuthLayout` → `LoginForm`  
**Actions:** `login`, `idpLogin`  
**Layout:** `login`

Copy (title, subtitle, logo) in **layout spec props**. Provider list merged from `GET /api/tenants/:orgId/auth/config`.

**Not CMS content** — see `docs/2026-07-25/ARCHITECTURE-MAP.md` § two page types.

---

## Example 4: Extension storefront widget

**Extension:** `commerce` — `ProductCard`, `addToCart`

```
layout home spec
  └── ProductCard (contentRef → CMS $state at edge)
        └── Button action: "addToCart"
```

Extension files only — no new client route. Enabled via catalog manifest `"extensions": ["commerce"]`.

**Files:**
- `packages/extensions/src/commerce/catalog-schemas.ts`
- `packages/extensions/src/commerce/components.tsx`
- `packages/extensions/src/commerce/actions.ts`
- `packages/extensions/src/commerce/registry.ts`

---

## Minimal new admin panel (template)

### catalog-schemas.ts

```typescript
MySettingsPanel: {
  props: z.object({
    title: z.string(),
    description: z.string().nullable(),
    saveLabel: z.string().optional(),
    publishLabel: z.string().optional(),
  }),
  description: "Example settings panel",
},
saveMySettings: {
  params: z.object({ enabled: z.boolean() }),
  description: "Save example settings",
},
```

### seed layout snippet

```typescript
const adminMySpec = {
  root: "shell",
  elements: {
    shell: {
      type: "AdminShell",
      props: { title: "My settings", activeNav: "my" },
      children: ["panel"],
    },
    panel: {
      type: "MySettingsPanel",
      props: {
        title: "My settings",
        description: null,
        saveLabel: "Save draft",
        publishLabel: "Save & publish",
      },
    },
  },
};
```

### main.tsx (only if new template name)

```typescript
if (pathname.startsWith("/admin/my")) return "admin_my";
```

Then `await upsertLayout("admin_my", adminMySpec)` in seed.
