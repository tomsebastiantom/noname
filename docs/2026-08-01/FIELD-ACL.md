# Field-level CMS ACL — deferred (not building)

> **Date:** 2026-08-01 · **Updated:** 2026-08-03  
> **Status:** **Not planned for product** — use **document-level** access instead (see below). Legacy schema helpers exist in code but will not be wired in editor/admin UI.  
> **Related:** [`PERMISSIONS-MASTER-PLAN.md`](../2026-07-27/PERMISSIONS-MASTER-PLAN.md) · [`documents-domain.md`](../2026-07-10/documents-domain.md)

---

## Product decision (2026-08-03)

**We do not need field-level permissions.**

| Instead of… | Do this… |
|-------------|----------|
| One `product` doc with field ACL on `price` | Split into smaller **content entries / types** (e.g. `product_display` vs `product_pricing`) |
| PropsPanel hide/read-only per field | Control **who can draft which document** via roles + (later) content-type / tag scope |
| `fields[].permissions.read/write` in schema | **`reference`** fields — layout blocks bind to the doc the user is allowed to edit |

**Smallest unit of access control = document (content entry / content type), not field.**

Example:

```
product_display   → title, description, hero     (editors)
product_pricing   → price, SKU, cost             (admins)
```

Layout composes both via `$state` / reference bindings. Platform roles (`admin` / `editor`) + future **document/tag scope** (tuples) cover bigger teams without per-field rules.

**When field ACL might revisit:** only if an external system forces a **single** content payload and splitting documents is impossible. Until then, skip PropsPanel field ACL, client `?role=`, and `/resolve` field filtering.

---

## Legacy note (code only — do not implement UI)

The following was explored for field ACL; kept for reference if the decision ever changes.

### One-line summary (original)

**Track read/write role lists on each CMS field in the content-type schema.** Enforcement is **role key + field rule** (today `admin` / `editor`), not layout props. Server can filter/strip/reject — but the **editor must pass `role` and PropsPanel must hide/read-only** for a good UX.

---

## What to track (and what not to)

| Track | Where | Example |
|-------|--------|---------|
| **Per-field read roles** | `documentTypes.schema.fields[].permissions.read` | `["admin", "editor"]` |
| **Per-field write roles** | `documentTypes.schema.fields[].permissions.write` | `["admin"]` only |
| **Caller role** | JWT → `session.teamRole` (`admin` \| `editor`) | Passed as `?role=` on content API |
| **Which fields are CMS** | Content type schema + `$state` bindings in layout | `ProductCard.config.title` → `title` |

| Do **not** track field ACL on | Why |
|-------------------------------|-----|
| Layout / catalog props (`config`, `labels` on blocks) | Zod catalog schema has no `permissions`; whole layout gated by `layout:draft_write` |
| `editor_prefs`, internal types | Per-user UI state; org admins only |
| Visitor / customer | No draft APIs |

---

## Schema shape (source of truth)

On each field in a **content type** (`@noname/documents` / `ContentFieldSchema`):

```jsonc
{
  "key": "price",
  "type": "number",
  "required": true,
  "label": "Price",
  "isLocalizable": false,
  "permissions": {
    "read":  ["admin", "editor"],
    "write": ["admin"]
  }
}
```

| Rule | Behaviour |
|------|-----------|
| **`permissions` omitted** | Everyone with content draft access can read + write (current default) |
| **`read` non-empty** | Only listed **role keys** see the field in filtered API responses |
| **`write` non-empty** | Only listed roles may include that key in PUT body |
| **Role key strings** | Must match `session.teamRole` today (`admin`, `editor`). Future: may migrate to permission keys per [`PERMISSIONS-MASTER-PLAN.md`](../2026-07-27/PERMISSIONS-MASTER-PLAN.md) |

When adding a restricted field to a content type, update the **seed** or content-type admin so orgs get the schema.

---

## Who decides access (two layers)

```
ZITADEL role (admin | editor)
  → platform permissions (content:draft_write, layout:draft_write, …)
  → can open ?edit=true and call content/layout APIs at all

Field permissions on schema
  → within that, which CMS fields this role may see / edit
```

**Example:** `editor` can edit product **title** but not **price** if `price.permissions.write` is `["admin"]` only.

Layout props (Hero title, Button variant) are **not** field-ACL — only team role + layout permission.

---

## Server — what exists today

| Function | File | When it runs |
|----------|------|----------------|
| `filterReadFields(doc, fields, role?)` | `content-write.ts` | `GET /api/documents/:type/:id` with `?role=` |
| `validateFieldWritePermissions(fields, payload, role?)` | `content-write.ts` | `POST/PUT` content with `?role=` |
| `resolve(...)` | `content.service.ts` | **No ACL** — returns all resolved fields |

**Important:** If `role` is **missing**, write validation is a no-op and read filtering is skipped.

Content routes accept optional query param:

```http
GET  /api/documents/product/:id?role=editor
PUT  /api/documents/product/:id?locale=en-US&role=editor
```

---

## Client — what exists today

| Surface | Field ACL |
|---------|-----------|
| **Visual editor PropsPanel** | Shows all CMS fields bound via `$state`; no hide/read-only |
| **Admin → Content** | Same — no field filtering |
| **`loadEntryFields`** | Uses `/resolve` — **no role param**, no server filter |
| **`saveContentEntry`** | PUT without `?role=` — server write ACL not applied |

So “server enforces” is **true only when callers pass `role`**. Editor and admin paths **do not yet**.

---

## What “done” looks like (checklist)

### 1. Schema & seed (define what to protect)

- [ ] Add `permissions` to fields that need restriction (e.g. product `price`, `cost`)
- [ ] Document restricted fields in content-type seed / admin
- [ ] Smoke: `editor` GET with `?role=editor` omits write-only fields if read list excludes them

### 2. Server (enforce on all read paths)

- [ ] Add optional `role` to **`GET .../resolve`** and filter like `findById`
- [ ] Or: stop using `/resolve` in editor when ACL matters; use `findById?role=` + locale pick client-side
- [ ] Reject writes without `role` in production (optional hardening)

### 3. Client — shared content API

- [ ] `loadEntryFields(..., { role: teamRole })`
- [ ] `saveContentEntry(..., { role: teamRole })`
- [ ] Helper: `fieldAccess(field, role) → "hidden" | "read" | "write"`

```typescript
// Sketch — packages/client/src/lib/content-field-access.ts
export function fieldAccess(
  field: { permissions?: { read?: string[]; write?: string[] } },
  role: string | null | undefined,
): "hidden" | "read" | "write" {
  if (!role) return "write"; // legacy: no role → show all (until wired)
  const read = field.permissions?.read;
  const write = field.permissions?.write;
  if (read?.length && !read.includes(role)) return "hidden";
  if (write?.length && !write.includes(role)) return "read";
  return "write";
}
```

### 4. Visual editor PropsPanel

- [ ] Pass `teamRole` from `fetchAuthSessionStatus()` into session / `contentDraft`
- [ ] In `CmsFieldInput`: `hidden` → skip; `read` → disabled control + hint; `write` → normal
- [ ] Spec-driven label optional: `propsReadOnlyFieldHint` on `visual_editor` shell

### 5. Admin content UI (same rules)

- [ ] Reuse `fieldAccess` in `/admin/content` forms so behaviour matches editor

### 6. Tests

- [ ] Unit: `fieldAccess` + `validateFieldWritePermissions` / `filterReadFields`
- [ ] Integration: editor role cannot PUT restricted field when `?role=editor`

---

## Visual editor only (UI shortcut — not enough alone)

If you **only** hide fields in PropsPanel without server + `?role=`:

- Editor UX improves
- Savvy user can still call API without role or with tampered body
- **Not acceptable** as the only control for sensitive fields (price, margin, etc.)

Minimum viable field ACL = **UI + `?role=` on load/save + resolve/filter on read**.

---

## Example: product content type (when you need it)

```jsonc
{
  "fields": [
    {
      "key": "title",
      "type": "text",
      "required": true,
      "label": "Title",
      "isLocalizable": true,
      "permissions": { "read": ["admin", "editor"], "write": ["admin", "editor"] }
    },
    {
      "key": "price",
      "type": "number",
      "required": true,
      "label": "Price",
      "isLocalizable": false,
      "permissions": { "read": ["admin", "editor"], "write": ["admin"] }
    }
  ]
}
```

| Role | Sees price | Edits price in PropsPanel |
|------|------------|---------------------------|
| `admin` | ✅ | ✅ |
| `editor` | ✅ | ❌ read-only (or hidden if `read` excludes editor) |

---

## When to implement

| Signal | Action |
|--------|--------|
| No content types use `permissions` in seed | **Skip** — use split documents instead |
| Agency hires “content editors” who must not change price/SKU | **Split content type** or separate entry; admin-only type for pricing |
| Only admins use the editor today | **Roles enough** — no field ACL |
| External API requires one doc, mixed sensitivity | Revisit field ACL (last resort) |

**Preferred model:** document / content-type as unit — not field rules. See [Product decision](#product-decision-2026-08-03) above.

---

## Doc map

| Question | Read |
|----------|------|
| **This file — what to track, wiring checklist** | **this file** |
| Content type checklist & seed | [`reference.md` § Content types](../../skills/spec-driven-ui/reference.md#content-types) · [`documents-domain.md`](../2026-07-10/documents-domain.md) |
| Platform permissions vs field ACL | [`VISUAL-EDITOR-PLAN.md`](../2026-07-25/VISUAL-EDITOR-PLAN.md) |
| Full permissions roadmap | [`PERMISSIONS-MASTER-PLAN.md`](../2026-07-27/PERMISSIONS-MASTER-PLAN.md) |
| Editor defer / skip | [`VISUAL-EDITOR-GAP-ANALYSIS.md`](./VISUAL-EDITOR-GAP-ANALYSIS.md) |

---

*Field ACL is **not planned**. Use document-level composition + roles; see [Product decision](#product-decision-2026-08-03). Legacy checklist below is archival only.*
