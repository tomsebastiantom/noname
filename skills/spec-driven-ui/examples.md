# Spec-Driven UI — Examples

Pattern recipes. Copy the **shape**, not domain-specific field names.

---

## Example 1: Editable draft panel (settings)

**Component:** `AuthSettingsForm` (admin catalog)  
**Action:** `saveAuthConfig`  
**Layout template:** `admin_dashboard`

```
AdminShell (activeNav: "auth")
  └── AuthSettingsForm (labels from layout props)
        └── useMountAction("loadAuthSettings") → $state loaded + loadedAt
        └── AuthSettingsFields key={loaded.loadedAt}
              └── useCatalogSubmit().submit({ action: "saveAuthConfig", params: { … } })
                    └── handler → setState after save
```

**Route:** `/admin/settings/auth` → existing `admin_dashboard` template.

**Build:** catalog schema (props + action params) → component + registry → load handler writes `$state` with `loadedAt` → layout JSON with labels → action handler for save.

---

## Example 2: Editable draft panel (CMS)

**Component:** `ContentEntryAdmin`  
**Actions:** `loadContentAdmin`, `createContentEntry`, `saveContentEntry`, `publishContentEntry`  
**Layout template:** `admin_content`

```
AdminShell (activeNav: "content")
  └── ContentEntryAdmin
        └── useMountAction("loadContentAdmin", { contentType, locale })
        └── ContentEntryEntriesPanel key={loaded.loadedAt}
              └── useCatalogSubmit + entry action helpers
```

**Route:** `/admin/content`, `/admin/content/:type` → `admin_content`.

**Why not a per-type admin page:** Content type schema drives fields — one panel for `page`, `product`, any type.

---

## Example 3: Single-shot action (login)

**Components:** `AuthLayout` → `LoginForm`  
**Actions:** `login`, `idpLogin` — **`execute` directly**, no `useCatalogSubmit`  
**Layout template:** `login`

```
LoginForm (props.config + props.labels from layout spec)
  └── execute({ action: "login", params: { email, password, redirectPath } })
```

Copy in layout **`props.labels`**. Which providers show comes from API → `$state`; button **text** still from spec `labels.providers.*`.

---

## Example 4: Read-only list (team)

**Components:** `MountAction` (in spec) + `UsersAdminForm`  
**Action:** `listTeamUsers` → writes `$state` at `/admin/team/users`  
**Layout template:** `admin_users`

```json
"shell": { "children": ["loadTeam", "usersAdmin"] },
"loadTeam": { "type": "MountAction", "props": { "action": "listTeamUsers" } },
"usersAdmin": { "type": "UsersAdminForm", "props": { … } }
```

```
MountAction → handler → setState("/admin/team/users", rows)
UsersAdminForm → useStateValue("/admin/team/users") → table
```

**Dynamic loads** (URL-dependent): `useMountAction` in the panel with **stable** `useMemo` params.

**No editable draft** for the table — invite/submit actions use `useCatalogSubmit` where needed.

---

## Example 5: Extension widget (storefront)

**Extension:** `commerce` — `ProductCard`, `addToCart`

```
layout home spec
  └── ProductCard (contentRef → CMS $state at edge)
        └── Button action: "addToCart"
```

Extension catalog only — **no new client route**. Enable via tenant catalog manifest.

**Build:** extension schema + components + actions + registry + manifest entry + block in layout spec.

---

## Minimal new panel (template)

Use **`useCatalogSubmit` + `loadedAt`/`key`** for [editable draft panels](SKILL.md#editable-draft-panels). Otherwise `execute` directly.

### Catalog schema

`config` + `labels` only ([props-contract.md](props-contract.md)):

```typescript
MySettingsPanel: {
  props: catalogProps(
    {
      title: z.string(),
      description: z.string().nullable(),
      saveLabel: z.string(),
      publishLabel: z.string(),
    },
    { locale: z.string().default("en") },
  ),
},
```

### Layout snippet

```typescript
{
  root: "shell",
  elements: {
    shell: {
      type: "AdminShell",
      props: {
        config: { activeNav: "my" },
        labels: { title: "My settings", nav: { my: "My settings" } },
      },
      children: ["panel"],
    },
    panel: {
      type: "MySettingsPanel",
      props: {
        config: { locale: "en" },
        labels: {
          title: "My settings",
          description: null,
          saveLabel: "Save draft",
          publishLabel: "Save & publish",
        },
      },
    },
  },
}
```

### Component (save via useCatalogSubmit)

```typescript
function MySettingsFields({ loaded, props, loadError }) {
  const { submit, pending, error } = useCatalogSubmit();
  const [enabled, setEnabled] = useState(loaded.enabled);

  async function handleSave() {
    await submit({
      action: "saveMySettings",
      params: { enabled },
      successMessage: props.labels.savedMessage,
    });
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); void handleSave(); }}>
      <Button type="submit" disabled={pending}>
        {pending ? props.labels.savingLabel : props.labels.saveLabel}
      </Button>
    </form>
  );
}

<MySettingsFields key={loaded.loadedAt} loaded={loaded} … />
```

Load handler attaches `loadedAt` when writing `$state`. Register handler in catalog registry.

### New template (only if needed)

Extend host template map with a new layout name, then upsert that layout document in seed/bootstrap.
