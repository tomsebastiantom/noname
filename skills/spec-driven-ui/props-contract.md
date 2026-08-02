# Catalog props contract

**Status:** Target architecture — migrate existing flat props when touching a component.  
**Rule:** Layout spec is the **only** source for copy and static behavior. No user-visible string literals in components (except host shell loading/errors).

---

## Top-level shape (every component)

Every node in a layout spec uses **exactly two** prop buckets:

```json
{
  "type": "MyPanel",
  "props": {
    "config": { },
    "labels": { }
  }
}
```

| Bucket | Contains | Does not contain |
|--------|----------|------------------|
| **`config`** | Behavior, layout, URLs, enums, numbers, booleans, actions, ids, structure | User-visible copy |
| **`labels`** | **All** user-visible strings | Behavior knobs |

**No top-level `title`, `description`, `saveLabel`, `label`, or `value`.** Panel headings live in `labels` (see below).

**Runtime data** (user lists, flag values, replay rows, auth toggles from API) → **`$state` + actions only** — never in props.

---

## `labels` — copy naming

### Single-screen panels (admin, AuthLayout)

Put panel chrome in flat `labels` keys:

```json
"labels": {
  "title": "Feature flags",
  "description": "Toggle flags for this org.",
  "saveLabel": "Save draft",
  "publishLabel": "Publish",
  "empty": "No flags yet."
}
```

### Multi-view forms (LoginForm)

Nest by view — **no** duplicate top-level title:

```json
"labels": {
  "views": {
    "login": {
      "title": "Welcome back",
      "description": "Sign in to continue"
    },
    "forgot": {
      "title": "Forgot password",
      "description": "Enter your email and we will send reset instructions."
    },
    "mfa": {
      "title": "Verify your identity",
      "description": "Enter the code from your authenticator app."
    }
  },
  "providers": {
    "google": "Continue with Google",
    "github": "Continue with GitHub"
  }
}
```

Component reads: `props.labels.views[view].title`.

### Keyed to `config` (nav, providers, links)

Structure in `config`, display names in `labels` under the **same key**:

```json
"config": {
  "activeNav": "flags",
  "navItems": [{ "id": "flags", "href": "/admin/flags" }]
},
"labels": {
  "nav": {
    "flags": "Feature flags",
    "replay": "Session replay"
  }
}
```

### Flat form chrome (no config key)

Use descriptive camelCase in `labels`:

| Pattern | Example |
|---------|---------|
| `{verb}Label` | `saveLabel`, `publishLabel` |
| `{verb}ingLabel` | `savingLabel`, `loadingLabel` |
| `{noun}ColumnHeader` | `emailColumnHeader` |
| `{section}Title` / `{section}Description` | `inviteSectionTitle` |
| `{field}Placeholder` | `googleSecretPlaceholderNew` |
| `{event}Message` | `draftSavedMessage`, `pageSavedMessage` |
| Empty state | `empty` |

### Primitives

| Component | `labels` | `config` |
|-----------|----------|----------|
| **Button** | `text` | `variant`, `action` |
| **Text** | `content` | `variant`, `align` |
| **Image** | `alt` | `src`, `fit`, `width`, `height` |
| **Grid / Stack** | `{}` | layout fields (`columns`, `gap`, `direction`, …) |
| **MountAction** | `{}` | `action`, `params` |

---

## `config` — behavior naming

| Kind | Examples |
|------|----------|
| Enums | `variant`, `layout`, `direction`, `align`, `fit` |
| Paths / URLs | `redirectPath`, `logoUrl`, `src`, `href` |
| Booleans | `showPasswordToggle` |
| Arrays (facts) | `providers`, `columns` |
| Scope | `locale`, `segment`, `activeNav` |
| Actions | `action`, `params` |
| Structure | `navItems: [{ id, href }]` — labels in `labels.nav[id]` |

---

## Zod (when implementing schemas)

Target helper — `catalogProps(labelsShape, configShape)`:

```typescript
export function catalogProps<TLabels extends z.ZodRawShape, TConfig extends z.ZodRawShape>(
  labels: TLabels,
  config: TConfig,
) {
  return z.object({
    config: z.object(config),
    labels: z.object(labels),
  });
}
```

Reuse label bundles (`draftPublishLabelsSchema`, `mediaFieldLabelsSchema`) **inside** the `labels` object shape, not as flat merges on the root.

---

## Component usage

```tsx
// Single-screen admin
<h1>{props.labels.title}</h1>
<p>{props.labels.description}</p>
<Button>{pending ? props.labels.savingLabel : props.labels.saveLabel}</Button>

// Multi-view login
const viewLabels = props.labels.views[view];
<h1>{viewLabels.title}</h1>

// Primitive
<Button>{props.labels.text}</Button>
```

**Wrong:** hardcoded `"Save & publish"` in TSX, or `LOGIN_VIEW_TITLES` as fallback when spec should own copy.  
**Wrong:** top-level `props.title` / `props.saveLabel` (legacy — migrate away).

---

## Migration map (legacy → target)

| Legacy (flat props) | Target |
|---------------------|--------|
| `title`, `description` | `labels.title`, `labels.description` |
| `subtitle` | `labels.description` or `labels.views.login.description` |
| `saveLabel`, `*Label`, `*Message` | same keys under `labels` |
| `label` (Button) | `labels.text` |
| `value` (Text) | `labels.content` |
| `brandTitle`, `brandSubtitle` | `labels.brandTitle`, `labels.brandSubtitle` |
| `redirectPath`, `providers`, … | `config.*` |

---

## Checklist (new or touched component)

```
- [ ] Props schema: catalogProps(labelsShape, configShape) — config + labels only
- [ ] All copy read from props.labels — no TSX literals
- [ ] Multi-view copy under labels.views.{view}
- [ ] Nav/providers: config structure + labels.{nav|providers}[id]
- [ ] Seed / layout JSON updated to match
- [ ] Runtime lists/settings from $state or actions — not props
```
