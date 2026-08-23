# Catalog props contract

**Status:** Target architecture — flat props everywhere. No `config`/`labels` split.  
**Rule:** Layout spec is the **only** source for copy and static behavior. No user-visible string literals in components (except host shell loading/errors).

---

## Top-level shape (every component)

Every node in a layout spec uses **flat props** — all copy and behavior at the top level:

```json
{
  "type": "MyPanel",
  "props": {
    "title": "Feature flags",
    "description": "Toggle flags for this org.",
    "saveLabel": "Save draft",
    "empty": "No flags yet."
  }
}
```

| Field | Contains |
|-------|----------|
| Copy fields | **All** user-visible strings (`title`, `saveLabel`, `empty`, …) |
| Behavior fields | Behavior, layout, URLs, enums, numbers, booleans, actions, ids, structure |

**No nested `config` or `labels` buckets.** `title`, `description`, `saveLabel`, `label`, `value` live at the top level.

**Runtime data** (user lists, flag values, replay rows, auth toggles from API) → **`$state` + actions only** — never in props.

---

## Copy naming

### Single-screen panels (admin, AuthLayout)

Flat keys at the top level:

```json
"props": {
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
"props": {
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

Component reads: `props.views[view].title`.

### Keyed structure + display names (nav, links)

Structure array and display-name record are **both** top-level props:

```json
"props": {
  "activeNav": "flags",
  "navItems": [{ "id": "flags", "href": "/admin/flags" }],
  "nav": {
    "flags": "Feature flags",
    "replay": "Session replay"
  }
}
```

### Naming patterns

Use descriptive camelCase at the top level:

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

| Component | Props |
|-----------|-------|
| **Button** | `label`, `variant`, `action` |
| **Text** | `value`, `variant`, `align` |
| **Image** | `src`, `alt`, `fit`, `width`, `height` |
| **Grid** | `columns`, `gap` |
| **Stack** | `direction`, `gap`, `align` |
| **MountAction** | `action`, `params` |

---

## Behavior naming

| Kind | Examples |
|------|----------|
| Enums | `variant`, `layout`, `direction`, `align`, `fit` |
| Paths / URLs | `redirectPath`, `logoUrl`, `src`, `href` |
| Booleans | `showPasswordToggle` |
| Arrays (facts) | `providerList`, `links`, `navItems` |
| Scope | `locale`, `segment`, `activeNav` |
| Actions | `action`, `params` |

---

## Zod (when implementing schemas)

Use a **flat** `z.object` — never `catalogProps`/split:

```typescript
props: z.object({
  title: z.string(),
  description: z.string().nullable(),
  saveLabel: z.string(),
  empty: z.string(),
  defaultOpen: z.boolean().default(false),
}),
```

Reuse label bundles (`draftPublishLabelsSchema`, `mediaFieldLabelsSchema`) by **spreading `.shape`** directly into the flat object:

```typescript
props: z.object({
  ...panelLabels,
  ...mediaFieldLabelsSchema.shape,
  locale: z.string(),
}),
```

---

## Component usage

```tsx
// Single-screen admin
<h1>{props.title}</h1>
<p>{props.description}</p>
<Button>{pending ? props.savingLabel : props.saveLabel}</Button>

// Multi-view login
const viewLabels = props.views[view];
<h1>{viewLabels.title}</h1>

// Primitive
<Button>{props.label}</Button>
```

**Wrong:** hardcoded `"Save & publish"` in TSX, or `LOGIN_VIEW_TITLES` as fallback when spec should own copy.  
**Wrong:** `props.labels.title` / `props.config.action` — the `config`/`labels` split is removed.

---

## Checklist (new or touched component)

```
- [ ] Props schema: flat z.object — no catalogProps / config+labels split
- [ ] All copy read from top-level props — no TSX literals
- [ ] Multi-view copy under props.views.{view}
- [ ] Nav/links: structure array + display-name record as sibling top-level props
- [ ] Seed / layout JSON updated to match
- [ ] Runtime lists/settings from $state or actions — not props
```
