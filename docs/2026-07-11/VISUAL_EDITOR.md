# Visual Editor — Inline Page Editing on the Live Storefront

## Date: 2026-07-11

---

## What It Is

An **inline visual editing mode** deployed as part of the client bundle (`packages/client`). A merchant navigates to their live page with `?edit=true`, clicks any rendered component, edits its props in a slide-out panel, and saves/publishes. The editor is the same json-render runtime used by visitors — plus an editing overlay that is lazy-loaded and code-split.

**This is NOT a separate admin dashboard.** The merchant edits the exact page visitors see. Same URL. Same components. Same catalog. Same deployment (R2 + CDN).

Modeled after: Shopify Theme Editor (inline click-to-edit), Webflow (visual canvas), builder.io (inline prop panels).

---

## Architecture Decision: No Separate Package

The visual editor is a **mode of `packages/client`**, not a separate package.

| Consideration | Separate `packages/admin` | Inside `packages/client` (chosen) |
|---|---|---|
| Component catalog | Must import from client — coupling | Source of truth already in client |
| Component implementations | Must duplicate or re-import render code | Same components rendered in edit mode |
| Deployment | Separate R2 bundle, separate route | Same R2 bundle, code-split chunk |
| Visitor bundle size | Admin overhead never touches visitor | Edit layer is lazy `import()`, zero visitor bytes |
| Consistency | Editor renders different components than visitor | Same catalog, same render, no drift |
| Auth | Separate admin login route needed | Edge worker checks JWT; `?edit=true` → admin role required |

**Decision: `packages/client` gets an `editor/` directory. No new package.**

---

## How It Works

### Mode Switching

```
Normal mode (visitor):
  GET https://store.com/products/blue-sneakers
  → Edge worker serves client bundle
  → json-render <Renderer spec={...} catalog={...} />
  → Read-only DOM. Zero edit overhead.

Edit mode (merchant):
  GET https://store.com/products/blue-sneakers?edit=true
  → Edge worker checks JWT for admin role
  → ADMIN? → Serve client bundle + lazy-load editor chunk
  → json-render <EditRenderer spec={...} catalog={...} />
  → Every component wrapped with click-to-edit overlay
  → NOT ADMIN? → Redirect to ZITADEL login
```

### Per-Component Editing

Every component in the commerce catalog defines `edit` metadata alongside its Zod props schema:

```typescript
// packages/client/src/catalog.ts

export const commerceCatalog = defineCatalog(schema, {
  components: {
    ProductCard: {
      props: z.object({
        productId: z.string(),
        variant: z.enum(["default", "compact", "detailed"]),
        showPrice: z.boolean().default(true),
        showRating: z.boolean().default(true),
      }),
      description: "Display a product with image, title, price, and rating",
      edit: {
        label: "Product Card",
        category: "Commerce",
        icon: "shopping-bag",
        fields: {
          productId: { type: "product-picker", label: "Product" },
          variant:    { type: "select", label: "Layout", options: ["default", "compact", "detailed"] },
          showPrice:  { type: "toggle", label: "Show Price" },
          showRating: { type: "toggle", label: "Show Rating" },
        },
      },
    },
    Hero: {
      props: z.object({
        image: z.object({ src: z.string(), alt: z.string() }),
        title: z.string(),
        ctaText: z.string(),
      }),
      edit: {
        label: "Hero Banner",
        category: "Hero",
        icon: "image",
        fields: {
          image:   { type: "image-picker", label: "Background Image" },
          title:   { type: "text", label: "Title" },
          ctaText: { type: "text", label: "Button Text" },
        },
      },
    },
    AddToCart: {
      props: z.object({
        variant: z.enum(["default", "sticky-mobile", "inline"]),
        cta: z.string(),
        enableApplePay: z.boolean().default(true),
        enableGooglePay: z.boolean().default(true),
      }),
      edit: {
        label: "Add to Cart",
        category: "Commerce",
        fields: {
          variant:         { type: "select", label: "Style", options: ["default", "sticky-mobile", "inline"] },
          cta:             { type: "text", label: "Button Text" },
          enableApplePay:  { type: "toggle", label: "Apple Pay" },
          enableGooglePay: { type: "toggle", label: "Google Pay" },
        },
      },
    },
    // ... every component gets edit metadata
  },
});
```

### Edit Overlay Wrapper

A HOC wraps each component in edit mode. This is NOT in the visitor bundle — lazy loaded via `import("./editor")`.

```typescript
// packages/client/src/editor/withEditing.tsx

function withEditing<P extends Record<string, unknown>>(
  Component: React.ComponentType<P>,
  blockDef: BlockDefinition,
): React.FC<P & EditContext> {

  return function EditableComponent(props) {
    const [hovered, setHovered] = useState(false);
    const [selected, setSelected] = useState(false);

    return (
      <div
        className={cn("edit-wrapper", hovered && "ring-2 ring-blue-400", selected && "ring-2 ring-blue-600")}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={(e) => { e.stopPropagation(); setSelected(true); }}
      >
        <Component {...props} />

        {hovered && (
          <EditOverlay
            label={blockDef.edit.label}
            icon={blockDef.edit.icon}
            onClick={() => setSelected(true)}
          />
        )}

        {selected && (
          <PropsPanel
            path={props.editPath}
            fields={blockDef.edit.fields}
            values={props}
            onChange={(newProps) => props.onChange(props.editPath, newProps)}
            onClose={() => setSelected(false)}
          />
        )}
      </div>
    );
  };
}
```

### Props Panel Field Types

The panel generates form fields from the catalog's `edit.fields` definition:

| Field Type | UI | Example |
|---|---|---|
| `text` | Text input | `title: "Hero Title"` |
| `select` | Dropdown | `variant: ["default", "compact", "detailed"]` |
| `toggle` | Switch | `showPrice: true` |
| `number` | Number input | `columns: 3` |
| `color` | Color picker | `primaryColor: "#FF6B35"` |
| `image-picker` | Media library modal | `image: { src: "...", alt: "..." }` |
| `product-picker` | Product search + select | `productId: "prod_abc123"` |
| `rich-text` | Inline rich text editor | `description: RichTextDocument` |
| `json` | Code editor (monaco) | `tracking: { ... }` |

---

## Client Package Structure

```
packages/client/src/
├── main.tsx              ← Entry: detects ?edit=true, lazy-loads editor
├── catalog.ts            ← Component definitions + edit metadata (source of truth)
├── registry.ts           ← Maps component types → React components
├── components/           ← Commerce components (ProductCard, Hero, AddToCart, etc.)
├── editor/               ← Edit mode layer (code-split chunk, ~50KB)
│   ├── index.ts          ← createEditorMode(spec, catalog) → EditRenderer
│   ├── withEditing.tsx   ← HOC: wraps any component with click-to-edit
│   ├── overlay.tsx       ← Hover outlines, labels, click targets
│   ├── props-panel.tsx   ← Slide-out panel with form fields
│   ├── fields/           ← Form field components per type
│   │   ├── text.tsx
│   │   ├── select.tsx
│   │   ├── toggle.tsx
│   │   ├── number.tsx
│   │   ├── color.tsx
│   │   ├── image-picker.tsx
│   │   ├── product-picker.tsx
│   │   ├── rich-text.tsx
│   │   └── json.tsx
│   ├── save-bar.tsx      ← Bottom bar: [Save Draft] [Publish] [Discard]
│   └── useEditState.ts   ← Manages: dirty spec, save/publish mutations, undo stack
└── hooks/
    └── useEditMode.ts    ← Detects edit mode, checks admin JWT
```

### Entry Point — Lazy Loaded Editor

```typescript
// packages/client/src/main.tsx

import { Renderer } from "@json-render/react";
import { commerceCatalog } from "./catalog";

function App() {
  const editMode = new URLSearchParams(window.location.search).get("edit") === "true";

  if (editMode) {
    return <LazyEditor />;  // ← code-split, zero bytes in visitor bundle
  }

  return <Renderer spec={spec} catalog={commerceCatalog} />;
}

// Separate chunk loaded only when ?edit=true
function LazyEditor() {
  const [{ spec }, { save, publish }] = useEditState();

  const { EditRenderer, SaveBar } = useMemo(
    () => lazy(() => import("./editor")),
    []
  );

  if (!hasAdminRole()) return <Redirect to="/login" />;

  return (
    <Suspense fallback={<Renderer spec={spec} catalog={commerceCatalog} />}>
      <EditRenderer spec={spec} catalog={commerceCatalog} onSpecChange={handleChange} />
      <SaveBar onSaveDraft={save} onPublish={publish} />
    </Suspense>
  );
}
```

---

## Save & Publish Flow

```
1. Merchant clicks Hero title → Props Panel opens
2. Merchant edits title: "Summer Sale 2026" → onChange fires
3. EditState updated: { ...spec, children[0].props.title: "Summer Sale 2026" }
4. SaveBar shows "Unsaved changes"

Save Draft:
  → PATCH /api/documents/layout/homepage
     Body: { status: "draft", spec: <full edited JSON> }
  → Server: validates → stores as draft → does NOT invalidate live cache
  → SaveBar: "Draft saved ✓"

Publish:
  → PATCH /api/documents/layout/homepage
     Body: { status: "published", spec: <full edited JSON> }
  → Server: validates → stores + publishes → invalidates KV cache
  → SaveBar: "Published ✓"
  → Live visitors immediately see new layout

Discard:
  → Revert to last saved/published spec
```

---

## Auth: Edge Worker Validates Before Serving Editor

```
Visitor → https://store.com/products/blue-sneakers?edit=true
  │
  ▼
Cloudflare Edge Worker:
  1. Read JWT from cookie or Authorization header
  2. Validate against ZITADEL JWKS (@cfworker/jwt)
  3. Extract: role
  4. role === "admin" ?
     YES → Serve client bundle + allow editor chunk to load
     NO  → 302 redirect to ZITADEL login
          redirect_uri = https://store.com/products/blue-sneakers?edit=true
```

The edit mode chunk (`editor/`) is never served to non-admin visitors. The edge worker enforces this. The client-side `hasAdminRole()` check is a belt-and-suspenders fallback.

---

## Deployment

| Asset | Where | Cache |
|---|---|---|
| Client bundle (visitor) | Cloudflare R2 / CDN | 1 year (immutable, content-hashed) |
| Editor chunk (lazy) | Cloudflare R2 / CDN | 1 year (immutable, content-hashed) |
| Commerce catalog | Client bundle (inlined) | Same as client bundle |

Both the visitor renderer and the editor chunk ship from the same R2 bucket. The editor is a separate `.js` chunk loaded via dynamic `import()`. Normal visitors never download it.

---

## What This Is NOT

- **NOT GrapesJS** — No drag-drop canvas, no block palette, no WYSIWYG builder. The merchant edits the live rendered page by clicking components.
- **NOT a separate admin dashboard** — The editor IS the storefront. Same URL, same components, same catalog.
- **NOT a separate package** — The editor is a lazy-loaded directory inside `packages/client`.
- **NOT part of the API server** — The server never runs React. The editor is browser-only.

---

## Build Order

1. Add `edit` metadata to every component in `packages/client/src/catalog.ts`
2. Create `packages/client/src/editor/` directory
3. Build `withEditing.tsx` HOC and `overlay.tsx`
4. Build `props-panel.tsx` with field type components
5. Build `save-bar.tsx` with save/publish/discard
6. Build `useEditState.ts` for dirty tracking + API mutations
7. Wire `main.tsx` to detect `?edit=true` and lazy-load editor
8. Cloudflare Worker: add JWT admin check for `?edit=true` routes

---

## Relationship to GrapesJS

The TECH.md and BUILD_PLAN.md mention GrapesJS as a drag-drop editor. This inline visual editor **supersedes** GrapesJS for the initial release:

| Aspect | GrapesJS | Inline Visual Editor (chosen) |
|---|---|---|
| Interaction | Drag blocks from palette to canvas | Click rendered components on the live page |
| Learning curve | Builder tool (Webflow-like) | Click-to-edit (Shopify Theme Editor-like) |
| Component fidelity | GrapesJS renders its own version of components | Renders the ACTUAL components visitors see |
| Bundle size | ~300KB+ (GrapesJS + plugins) | ~50KB (thin overlay + form fields) |
| Implementation effort | Full canvas engine + plugin system | HOC wrapper + prop panels |
| Best for | Greenfield page building | Tweaking AI-generated / existing layouts |

**GrapesJS may be added later** as an alternative "page builder" mode. The inline editor is the first deliverable because it layers cleanly onto the existing json-render runtime without a separate rendering engine.

---

## Status

🟡 **Planned, not yet implemented.** Documented here for Phase 1 build. The `packages/client` catalog already exists; the `editor/` directory and auth checks are the new work.
