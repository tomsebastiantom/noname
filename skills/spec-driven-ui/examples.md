# Spec-Driven UI — Examples

Shipped references in this repo. Copy the pattern, not the commerce-specific fields.

---

## Example 1: Editable draft panel (auth settings)

**Component:** `AuthSettingsForm` (`admin/components/auth-settings/`)  
**Action:** `saveAuthConfig`  
**Layout:** `admin_dashboard` in `scripts/seed-demo.ts`

```
AdminShell (activeNav: "auth")
  └── AuthSettingsForm (title, description from layout props)
        └── useMountAction("loadAuthSettings") → $state loaded + loadedAt
        └── AuthSettingsFields key={loaded.loadedAt}
              └── useCatalogSubmit().submit({ action: "saveAuthConfig", params: { … } })
                    └── ActionProvider → handlers() → core/actions/auth.ts
```

**Route:** `/admin/settings/auth` → template `admin_dashboard` (no extra main.tsx line — `/admin*` matches).

**Files:**
- `packages/client/src/admin/schemas/actions.ts` — `saveAuthConfig` params
- `packages/client/src/admin/components/auth-settings/AuthSettingsForm.tsx`
- `packages/client/src/core/use-catalog-submit.ts`
- `packages/client/src/core/actions/auth.ts` — `AuthSettingsLoaded` + `loadedAt`
- `packages/client/src/admin/registry.ts`
- `scripts/seed-demo.ts` — `adminDashboardSpec`

---

## Example 2: Editable draft panel (content CMS)

**Component:** `ContentEntryAdmin` (`admin/components/content/`)  
**Actions:** `loadContentAdmin`, `createContentEntry`, `saveContentEntry`, `publishContentEntry`  
**Layout:** `admin_content`

```
AdminShell (activeNav: "content")
  └── ContentEntryAdmin
        └── useMountAction("loadContentAdmin", { contentType, locale })
        └── ContentEntryEntriesPanel key={loaded.loadedAt}
              └── useCatalogSubmit + use-content-entry-actions.ts
```

**Route:** `/admin/content`, `/admin/content/:type` → template `admin_content`.

**Why not a ProductAdmin:** Content type schema drives fields — works for `page`, `product`, any type.

**Files:**
- `packages/client/src/admin/components/content/ContentEntryAdmin.tsx`
- `packages/client/src/admin/components/content/use-content-entry-actions.ts`
- `packages/client/src/admin/content-entries.ts` — API helpers (called from action handlers)
- `packages/client/src/core/actions/content.ts` — `ContentAdminLoaded` + `loadedAt`
- `scripts/seed-demo.ts` — `adminContentSpec`, `pageContentType`

---

## Example 3: Single-shot action (login)

**Components:** `AuthLayout` → `LoginForm`  
**Actions:** `login`, `idpLogin` — **`execute` directly**, no `useCatalogSubmit`  
**Layout:** `login`

```
LoginForm (props from layout spec)
  └── execute({ action: "login", params: { email, password, redirectPath } })
        └── core/actions/auth.ts
```

Copy in layout **props**. Providers from `GET /api/auth/:orgId/config`.

---

## Example 4: Read-only list (team members)

**Components:** `MountAction` (spec) + `UsersAdminForm` (display only)  
**Action:** `listTeamUsers` → writes `$state` at `/admin/team/users`  
**Layout:** `admin_users` in `scripts/seed-demo.ts`

```json
"shell": { "children": ["loadTeam", "usersAdmin"] },
"loadTeam": { "type": "MountAction", "props": { "action": "listTeamUsers" } },
"usersAdmin": { "type": "UsersAdminForm", "props": { … } }
```

```
MountAction → useMountAction → listTeamUsers handler → setState("/admin/team/users", rows)
UsersAdminForm → useStateValue("/admin/team/users") → table
```

**Dynamic loads** (URL-dependent): `useMountAction` inside the panel — see `PageEntryAdmin.tsx` (`useMemo` for params).

**No editable draft** — table reads `$state`; invite uses `useCatalogSubmit`.

**Files:**
- `packages/client/src/core/components/MountAction.tsx`
- `packages/client/src/admin/components/team/UsersAdminForm.tsx`
- `packages/client/src/core/actions/team.ts`
- `scripts/seed-demo.ts` — `adminUsersSpec`

---

## Example 5: Extension widget (storefront)

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

## Minimal new panel (template)

Use **`useCatalogSubmit` + `loadedAt`/`key`** when the component matches [editable draft panels](SKILL.md#editable-draft-panels). Otherwise `execute` directly.

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

### component (save via useCatalogSubmit)

```typescript
import { mergeCatalogError, useCatalogSubmit } from "../core/use-catalog-submit";

function MySettingsFields({ loaded, props, loadError }: { loaded: MySettingsLoaded; … }) {
  const { submit, pending, error, success } = useCatalogSubmit();
  const [enabled, setEnabled] = useState(loaded.enabled);

  async function handleSave() {
    await submit({
      action: "saveMySettings",
      params: { enabled },
      successMessage: props.savedMessage,
    });
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); void handleSave(); }}>
      {/* fields */}
      <Button type="submit" disabled={pending}>{pending ? props.savingLabel : props.saveLabel}</Button>
      {mergeCatalogError(error, loadError) && <Alert … />}
    </form>
  );
}

// Parent after load:
<MySettingsFields key={loaded.loadedAt} loaded={loaded} … />
```

Load handler must attach `loadedAt: Date.now()` when writing `$state`. Handler lives in `core/actions/…`, registered via `coreActionHandlers` → `platform/registry.ts`.

### main.tsx (only if new template name)

```typescript
if (pathname.startsWith("/admin/my")) return "admin_my";
```

Then `await upsertLayout("admin_my", adminMySpec)` in seed.
