# Layout Spec — Schema, Merge & Partial Storage

> **Date:** 2026-07-25  
> **Status:** Design + partial implementation  
> **Related:** [`documents-domain.md`](../2026-07-10/documents-domain.md) · [`VISUAL-EDITOR-UX.md`](./VISUAL-EDITOR-UX.md) · [`PERMISSIONS-REBAC.md`](./PERMISSIONS-REBAC.md)

---

## One-line summary

Store **full spec once** (`segment=default`), store **only changed paths** for variants and visual edits (dot-path overrides or RFC 6902 patches), **merge on read** — never duplicate the whole tree per save. Validate every write against the **merged catalog Zod schema**, not a hand-written JSON Schema file.

---

## Three storage shapes (same merge idea)

| Shape | When | Stored in Postgres | On read |
|-------|------|-------------------|---------|
| **Full spec** | `layout` + `segment=default` | Entire json-render tree in `data.spec` | Use as-is |
| **Dot-path overrides** | Layout **segment** variant (A/B, mobile layout) | `data.overrides` map only | `applyOverrides(default, overrides)` ✅ exists |
| **Op / patch** | Visual editor save, collab v2+ | `document_ops.payload` or draft patch field | Apply patch onto published or default draft |

**Rule:** default holds the **canonical tree**; everything else is **diffs**.

```
default spec (full)
    +
overrides { "elements.hero.props.title": "Sale" }   ← segment variant
    +
patch op { path: "/elements/hero/props/title", ... } ← editor save
    =
resolved spec → edge → Renderer
```

Implementation today: [`packages/server/src/domains/documents/merge.ts`](../../packages/server/src/domains/documents/merge.ts) (`applyOverrides`, dot-path).

---

## Complete schema validation (not stub)

Today `validateSpec()` only checks `typeof spec === "object"`. **Target:**

| Layer | Source of truth | Validates |
|-------|-----------------|-----------|
| **Structure** | `@json-render/core` `Spec` shape | `root`, `elements`, `type`, `props`, `children` |
| **Per component** | Merged **catalog** (`core` + extensions) | Each `elements[id].props` against component Zod |
| **Actions / $state** | Catalog + layout rules | Bindings, refs |

```typescript
// Target flow (server + save path)
import { defineCatalog } from "@json-render/core";
// merged catalog from org manifest — same as client

function validateLayoutSpec(spec: unknown, catalog: Catalog): void {
  assertSpecShape(spec);                    // root + elements
  for (const [id, el] of Object.entries(spec.elements)) {
    const def = catalog.components[el.type];
    if (!def) throw new ValidationError(`elements.${id}.type`, "unknown component");
    def.props.parse(el.props);              // Zod — complete per-component schema
  }
}
```

**Do not** maintain a separate giant JSON Schema file that drifts from catalog — **catalog Zod is the schema**. Export JSON Schema from Zod only if external tools need it (`zodToJsonSchema`).

Content entries already validate against **content_type** field schemas; layouts should mirror that pattern.

---

## Segments — store parts, merge on resolve

From [`documents-domain.md`](../2026-07-10/documents-domain.md):

| `segment` | `data` shape |
|-----------|--------------|
| `"default"` | `{ spec: { root, elements, ... } }` — **full** |
| `"mobile"`, `"vip"`, … | `{ overrides: { "elements.grid.props.columns": 1 }, baseVersion: 12 }` — **partial only** |

```typescript
// packages/server/src/domains/documents/merge.ts — already shipped
applyOverrides(defaultSpec, overrides)
// → { spec, conflicts }  // conflicts = paths missing after default restructure
```

**`baseVersion`:** variant records which default publish it was built on — if default moves, surface **conflicts** (do not silently drop overrides).

Segments here = **behavior/layout variants** (A/B, context), not locale (locale = content fields).

---

## Visual editor — store spec **parts**

When merchant edits one Hero title in [`VISUAL-EDITOR-UX.md`](./VISUAL-EDITOR-UX.md):

| Approach | Storage | Good for |
|----------|---------|----------|
| **Dot-path override** (v1) | `{ "elements.hero.props.title": "Summer Sale" }` | Single-field edits, matches segment model |
| **RFC 6902 patch** (v2) | `@json-render/core` **`diffToPatches(old, new)`** | Multi-field save, op log, collab |
| **Full spec replace** | Whole `data.spec` | Publish snapshot only — avoid on every autosave |

**Edit selection → path** (already in UX doc):

```
Click Hero → specPath: "elements.hero"
Save title → override key "elements.hero.props.title" OR patch op on that path
```

Draft document can store:

```jsonc
{
  "spec": { /* full draft copy OR omitted if patch-only */ },
  "pendingOverrides": {
    "elements.hero.props.title": "Summer Sale"
  }
}
```

**Resolve draft for preview:** `applyOverrides(baseDraftSpec, pendingOverrides)`.

---

## Merge vs create new schema

| Anti-pattern | Preferred |
|--------------|-----------|
| Copy entire layout JSON per segment | Default + **overrides** map |
| New layout document per visual edit | Patch **same** layout draft |
| AI generates full 20KB spec every time | Generate **patches** against current (`diffToPatches`) |
| Duplicate component defs in spec | Catalog defines types; spec only **instances** |

Reuse [`diffToPatches`](https://github.com/json-render/json-render) (RFC 6902) for wire format and op log — documented in [`TECH.md`](../2026-05-23/TECH.md), not wired in layout save yet.

---

## Op log alignment ([`PERMISSIONS-REBAC.md`](./PERMISSIONS-REBAC.md))

`document_ops.payload` should prefer **patches**, not full spec:

```jsonc
{
  "op_type": "patch_props",
  "patch": [
    { "op": "replace", "path": "/elements/hero/props/title", "value": "Summer Sale" }
  ],
  "dot_paths": {
    "elements.hero.props.title": "Summer Sale"
  }
}
```

Server applies in **version order** → strong convergence at publish (full snapshot written once).

---

## API sketch

| Endpoint | Body | Behavior |
|----------|------|----------|
| `PUT layout/:name` (default) | `{ spec }` | Validate full spec → save |
| `PUT layout/:name/variants/:segment` | `{ overrides }` | Validate paths exist on current default → save partial |
| `PATCH layout/:name/draft` | `{ overrides }` or `{ patch }` | Merge onto draft; bump version |
| `GET layout/:name/resolve?segment=` | — | `applyOverrides` → full spec |

Visual editor: **`PATCH` with overrides** for v1; **`document_ops` append** for v2 audit.

---

## Implementation checklist

| Item | Status |
|------|--------|
| Dot-path merge (`applyOverrides`) | ✅ `merge.ts` |
| Layout segment = overrides only | ✅ `documents/service.ts` |
| `validateSpec` = catalog Zod | 📋 stub today |
| `diffToPatches` on save | 📋 planned |
| Draft `pendingOverrides` | 📋 planned |
| Visual editor save by path | 📋 with `useEditState` |
| JSON Schema export (optional) | 📋 from Zod if needed |

---

## Mental model

```
Catalog (Zod)     = grammar — what components & props are allowed
Default spec      = full document tree
Overrides/patches = sentences changed since last publish
Resolve           = merge → one spec for Renderer
Publish           = snapshot converged state to edge cache
```

---

## References

- [`packages/server/src/domains/documents/merge.ts`](../../packages/server/src/domains/documents/merge.ts)
- [`packages/client/src/core/catalog-schemas.ts`](../../packages/client/src/core/catalog-schemas.ts)
- [`CONTENT-RENDER-PIPELINE.md`](./CONTENT-RENDER-PIPELINE.md) — `$state` on resolved spec
- [`TECH.md`](../2026-05-23/TECH.md) § JSON Patch / `diffToPatches`

---

*Store parts, merge on read, validate against catalog — same pattern for segments, editor saves, and future collab ops.*
