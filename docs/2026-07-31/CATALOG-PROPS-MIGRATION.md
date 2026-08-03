# Catalog props migration — config + labels

> **Date:** 2026-07-31  
> **Contract:** [skills/spec-driven-ui/props-contract.md](../../skills/spec-driven-ui/props-contract.md)

All platform catalog components now use **`props.config`** (behavior) + **`props.labels`** (copy). No flat `title`, `saveLabel`, `label`, or `value` at the props root.

Re-seed after deploy: `pnpm seed:demo` (updates published layout documents).

---

## Core components

| Component | Old (flat) | New `config` | New `labels` |
|-----------|------------|--------------|--------------|
| **Grid** | `columns`, `gap` | `columns`, `gap` | `{}` |
| **Stack** | `direction`, `gap`, `align` | same | `{}` |
| **Text** | `value`, `variant`, `align` | `variant`, `align` | `content` |
| **Button** | `label`, `variant`, `action` | `variant`, `action` | `text` |
| **Image** | `src`, `alt`, `fit`, `width`, `height` | `src`, `fit`, `width`, `height` | `alt` |
| **MountAction** | `action`, `params` | `action`, `params` | `{}` |
| **AuthLayout** | `layout`, `brandTitle`, `brandSubtitle` | `layout` | `brandTitle`, `brandSubtitle` |
| **LoginForm** | `title`, `subtitle`, … | `redirectPath`, `logoUrl`, … | `views.{view}.{title,description,fields.*}`, `messages.*`, `providers.{id}` |

**LoginForm notes:** View chrome comes from `labels.views[view]`. OAuth button text: `labels.providers.google` (spec) merged with CMS/API `providerLabels` at runtime.

---

## Admin components

| Component | New `config` | New `labels` (highlights) |
|-----------|--------------|---------------------------|
| **AdminShell** | `activeNav`, `navItems[{id,href}]`, `settingsItems`, `accountSecurityHref`, `storefrontHref` | `title`, `description`, `sidebarTitle`, `productName`, `nav.{id}`, `settings.{id}`, `accountSecurity`, `storefront`, `signOut`, `signIn` |
| **AdminHome** | `links[{id,href}]` | `title`, `description`, `links.{id}.{label,description}` |
| **AuthSettingsForm** | `{}` | `title`, `description`, all former `*Label` / `*Message` keys |
| **LoginBrandingForm** | `segment` | panel + draft/publish labels |
| **AccountSecurityForm** | `{}` | `title`, `description` |
| **UsersAdminForm** | `{}` | panel + table/invite labels |
| **FeatureFlagsAdmin** | `{}` | panel + `empty` (was `emptyLabel`), `onLabel`, `offLabel`, … |
| **SessionReplayAdmin** | `{}` | panel + table/replay labels; `empty` (was `emptyLabel`) |
| **ContentEntryAdmin** | `locale` | panel + draft/publish + media + CMS action labels |
| **LayoutEntryAdmin** | `segment` | panel + draft/publish labels |
| **PageRoutingAdmin** | `locale` | panel + page/tree labels (delegates subsets to children) |
| **PageTreeAdmin** | `locale` | panel + tree labels |
| **PageEntryAdmin** | `{}` | panel + page doc labels |

---

## Files changed

### Schemas
- `packages/client/src/schemas/shared.ts` — `catalogProps()`, label bundles
- `packages/client/src/core/catalog-schemas.ts`
- `packages/client/src/admin/schemas/components.ts`
- `packages/client/src/admin/schemas/shared.ts` — re-exports

### Core UI
- `packages/client/src/core/components.tsx`
- `packages/client/src/core/components/AuthLayout.tsx`
- `packages/client/src/core/components/LoginForm.tsx`
- `packages/client/src/core/components/MountAction.tsx`
- `packages/client/src/core/components/login-form-types.ts` — removed `LOGIN_VIEW_TITLES`

### Admin UI
- `packages/client/src/admin/components/shell/AdminShell.tsx`
- `packages/client/src/admin/components/shell/AdminHome.tsx`
- `packages/client/src/admin/components/shell/nav-utils.ts` (new)
- `packages/client/src/admin/components/auth-settings/AuthSettingsForm.tsx`
- `packages/client/src/admin/components/layout/LoginBrandingForm.tsx`
- `packages/client/src/admin/components/layout/LayoutEntryAdmin.tsx`
- `packages/client/src/admin/components/team/AccountSecurityForm.tsx`
- `packages/client/src/admin/components/team/UsersAdminForm.tsx`
- `packages/client/src/admin/components/flags/FeatureFlagsAdmin.tsx`
- `packages/client/src/admin/components/replay/SessionReplayAdmin.tsx`
- `packages/client/src/admin/components/content/ContentEntryAdmin.tsx`
- `packages/client/src/admin/components/content/content-entry-*.tsx`
- `packages/client/src/admin/components/pages/PageRoutingAdmin.tsx`
- `packages/client/src/admin/components/pages/PageTreeAdmin.tsx`
- `packages/client/src/admin/components/pages/PageEntryAdmin.tsx`
- `packages/client/src/admin/login-branding.ts`
- `packages/client/src/admin/login-branding.test.ts`

### Seed
- `scripts/seed/demo.ts` — all layout specs use `catalogProps()` / `panelProps()`

## Commerce extension

| Component | `config` | `labels` |
|-----------|----------|----------|
| **Hero** | `image`, `ctaAction` | `title`, `subtitle`, `ctaText`, `imageAlt` |
| **ProductCard** | `productId`, `title`, `price`, `image`, `description` (CMS `$state`) | `addToCart`, `adding`, `addedToCart`, `addFailed` |

---

| Area | Action |
|------|--------|
| **Published layouts in DB** | Run `pnpm seed:demo` and `pnpm seed:demo:commerce` |
| **Login field copy defaults** | `packages/client/src/core/login-form-labels.ts` → seed imports `DEFAULT_*` |

---

## Seed helpers

```typescript
catalogProps(config, labels)  // generic node
panelProps(config, title, description, labels)  // admin panels
adminShellProps(activeNav, title, description?)  // shell chrome
```

---

## Example (login layout)

```json
{
  "type": "LoginForm",
  "props": {
    "config": {
      "redirectPath": "/",
      "logoUrl": null,
      "showPasswordToggle": true,
      "providers": ["google"]
    },
    "labels": {
      "views": {
        "login": { "title": "Welcome back", "description": "Sign in to continue" },
        "forgot": { "title": "Forgot password", "description": "Enter your email…" }
      },
      "footerText": null,
      "providers": { "google": "Continue with Google" }
    }
  }
}
```
