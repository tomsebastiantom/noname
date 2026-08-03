# Store Permissions — Zanzibar-style ReBAC + document consistency

> **Date:** 2026-07-25  
> **Status:** Design target — **ZITADEL for subjects**; **Postgres for relation tuples** ZITADEL cannot express  
> **Related:** [`TEAM-ROLES-ZITADEL.md`](./TEAM-ROLES-ZITADEL.md) · [`VISUAL-EDITOR-PLAN.md`](./VISUAL-EDITOR-PLAN.md) · [`VISUAL-EDITOR-UX.md`](./VISUAL-EDITOR-UX.md) · [`documents-domain.md`](../2026-07-10/documents-domain.md)

---

## One-line summary

Model store and document access like **Google Zanzibar / Google Docs sharing**: relation tuples `object#relation@user`, inherited **owner → editor → viewer**, plus a **document op log** with **eventual consistency + strong convergence at publish** (OT/collab later). **ZITADEL** proves **who** the user is and org-level team role; **Postgres** stores **which documents** they may touch and the **edit log**.

---

## Two layers (do not mix)

| Layer | System | Question it answers |
|-------|--------|---------------------|
| **Identity + org team** | **ZITADEL** | Is this `user:alice` in store yogastore? Org role `admin` / `editor` / `customer`? |
| **Resource ACL + edit log** | **Postgres** (Zanzibar-shaped) | Can Alice **edit** `document:layout-home`? What ops were applied? |

No `teamRoles` map in Postgres — see [`TEAM-ROLES-ZITADEL.md`](./TEAM-ROLES-ZITADEL.md).

ZITADEL is **not** Zanzibar. We do **not** run SpiceDB in v1. We **store tuples in Postgres** and implement **Check** in the documents/auth service using the same **relation names and inheritance** as Zanzibar/Docs.

---

## Zanzibar tuple format (our convention)

```
⟨namespace⟩:⟨object_id⟩#⟨relation⟩@⟨user_id⟩
```

Examples:

```
store:383371762538184712#owner@383371762538709000
store:383371762538184712#editor@383371762538709001
document:7c9e…#editor@383371762538709001
document:7c9e…#viewer@383371762538709002
content_type:product#editor@store:383371762538184712#editor   ← userset (all store editors)
```

| Part | Meaning |
|------|---------|
| `namespace` | Object type: `store`, `document`, `content_type`, `page` |
| `object_id` | ZITADEL org id, document UUID, type name, etc. |
| `relation` | `owner`, `admin`, `editor`, `viewer`, `commenter` (later), `parent` |
| `user_id` | JWT `sub` or userset `store:org#editor` |

**Primary key (Postgres):** `(namespace, object_id, relation, subject)` — same as Zanzibar.

---

## Namespace configs (userset rewrites — in code)

Like Zanzibar namespace configs, define **inheritance** once per type (not per object):

### `store`

```
owner   → implies admin, editor, viewer on this store
admin   → implies editor, viewer
editor  → implies viewer
viewer  → read published storefront + assigned docs
```

**Bootstrap:** first ZITADEL `admin` on org → treat as `store#owner` (or explicit tuple on seed).

### `document` (content, layout, page, asset rows)

```
owner   → implies editor, viewer on this document
editor  → can write draft, visual edit, save
viewer  → read (published + draft if shared)
parent  → tuple_to_userset: inherit viewer/editor from linked store or folder (v2)
```

**Default v1:** if user has `store#editor` from JWT, they get **implicit** `document#editor` on all documents in that org (no per-doc tuple yet). Per-doc tuples = Google Docs “Share this file only”.

### `content_type` (field capability — ZITADEL cannot model)

Schema field:

```jsonc
"permissions": { "read": ["viewer"], "write": ["editor"] }
```

**Check:** `Can(user, edit, document:product-uuid, field:price)` =

1. `Check(user, editor, document:product-uuid)` **OR** store-level editor (JWT)
2. **AND** `"editor" ∈ field.permissions.write` (capability rule in schema)

This is **not** a user assignment — it is a **capability matrix** (Zanzibar cannot store “field price on type product”).

---

## Google Docs ↔ our mapping

| Google Docs | Zanzibar relation | Noname v1 |
|-------------|-------------------|-----------|
| Owner | `document#owner@user` | Store `admin` (ZITADEL) + optional tuple |
| Editor | `document#editor@user` | Store `editor` (ZITADEL) or doc tuple |
| Commenter | `document#commenter@user` | Later |
| Viewer | `document#viewer@user` | Published storefront; no edit chrome |
| Share one doc | Per-document tuple | Postgres `relation_tuples` row |
| Share whole Drive folder | `parent` + inherit | `store#editor` → all docs (default) |

---

## What editors should have (v1)

| Capability | Relation required | Enforced where |
|------------|-----------------|--------------|
| View published storefront | `viewer` on `store` (or public) | Edge read |
| Enter `?edit=true` | `editor` on `store` (JWT) | Edge + client |
| Save **draft** on content/layout | `editor` on `document` or store | Documents API + tuple Check |
| Edit field in PropsPanel | `editor` + field `permissions.write` | Documents service |
| **Publish** | `admin` or `owner` on store (JWT `admin`) | Documents API |
| Delete document | `owner` / store `admin` | Documents API |
| Auth settings, invite | store `admin` (JWT) | Auth API |
| View audit / op log | `editor` on doc or store `admin` | Future read API |

Editors **must not** publish, delete with refs, or change team/auth — same as Docs “Editor” vs “Owner”.

---

## Postgres tables (Zanzibar-shaped — not team roles)

### `relation_tuples` (new — v1 or v2)

| Column | Type | Notes |
|--------|------|-------|
| `org_id` | text | Shard / tenant filter |
| `namespace` | text | `store`, `document`, … |
| `object_id` | text | |
| `relation` | text | `owner`, `editor`, `viewer` |
| `subject` | text | `user:{sub}` or userset string |
| `created_at` | timestamptz | |

**Not stored here:** ZITADEL org membership (JWT). **Optional:** mirror only **document-level** shares; store-level comes from JWT.

### `document_ops` (edit log — Zanzibar Read + Docs OT prep)

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | |
| `org_id` | text | |
| `document_id` | text | |
| `server_version` | bigint | Monotonic per document (total order) |
| `client_id` | text | Tab/session |
| `client_seq` | bigint | Dedup key with client_id |
| `user_id` | text | JWT sub |
| `op_type` | text | `patch_props`, `patch_field`, `publish` |
| `payload` | jsonb | JSON Patch or field delta |
| `created_at` | timestamptz | |

**Dedup (at-least-once):** unique `(client_id, client_seq)` or Redis `dedup:{client_id}:{client_seq}` → return existing `server_version`.

**Access log:** `GET /api/documents/:id/ops?from_version=` — editors+ on document.

Existing `documents.version` on publish = **snapshot** after ops applied.

---

## Check API (app-level, Zanzibar Check)

```typescript
// Pseudocode — implement in documents or auth domain
async function check(userId: string, relation: Relation, object: ObjectRef): Promise<boolean> {
  // 1. Direct tuple
  if (await hasTuple(object, relation, userId)) return true;

  // 2. Userset rewrites (owner → editor → viewer)
  if (relation === "viewer" && await check(userId, "editor", object)) return true;
  if (relation === "editor" && await check(userId, "owner", object)) return true;

  // 3. Store JWT fallback (v1)
  const jwtRole = teamRoleFromJwt(/* ... */);
  if (object.namespace === "document" && jwtRole === "editor" && relation === "editor") return true;
  if (jwtRole === "admin" && relation in ["editor", "viewer", "admin", "owner"]) return true;

  // 4. parent / store inheritance (v2)
  // tuple_to_userset: document#parent → store#editor

  return false;
}
```

Visual editor calls `Check(editor, document:layout-id)` before save; publish calls `Check(admin, store:org-id)`.

---

## 6. Consistency model (documents + visual editor)

Adapted from Google Docs / OT literature — what we **guarantee now** vs **later**.

### 6a. Two document surfaces

| Surface | Consistency | User sees |
|---------|-------------|-----------|
| **Published** | Strong — single version on edge KV | Same spec everywhere after cache TTL |
| **Draft** | Per-save optimistic concurrency | Last successful save wins if conflict |

Visitors only read **published** → linearizable enough for commerce.

### 6b. Properties (Noname targets)

| Property | Definition | v1 (draft/publish) | v2 (live collab) |
|----------|------------|--------------------|------------------|
| **Eventual consistency** | Replicas agree eventually | ✅ after publish + cache invalidation | ✅ |
| **Strong convergence** | Same ops → same final state | ✅ at publish boundary (full doc replace) | ✅ JSON Patch + OT/CRDT |
| **Linearizability** | Every op at one instant | ❌ not needed for draft | ❌ |
| **Causal consistency** | Client order preserved | ✅ `If-Match: version` on PUT | ✅ client_seq + server_version |

### 6c. v1 — save without OT (single editor / LWW)

```
Alice saves draft:
  PUT /documents/layout/:id  If-Match: version=12
  → 409 if version stale (someone else saved)
  → 200 version=13

Publish (convergence point):
  POST publish → status=published, bump version, invalidate edge KV
  → all visitors converge on version 13
```

No op log required for v1 MVP — **document row version** is enough. Add `document_ops` when visual editor + audit ship.

### 6d. v2 — op log (Docs-like)

**Out-of-order ops:** buffer by `server_version`; apply in order.

```
Client receives: [ver=44], [ver=43]
  → buffer until 43 applied → apply 43 → apply 44
```

**Duplicate ops:** `(client_id, client_seq)` dedup before append.

**Strong convergence:** same committed op set → same draft JSON (patch compose is associative for non-overlapping paths; overlapping → OT or last-writer on field).

**Not in v2 scope initially:** sub-100ms sync; **publish** remains explicit convergence to storefront.

### 6e. Visual editor + consistency

| User action | Consistency behavior |
|-------------|---------------------|
| Edit in PropsPanel | Local dirty state (immediate UI) |
| Save draft | Op or full PUT with version check |
| Another tab open | v1: refresh or 409; v2: op stream |
| Publish | Single atomic publish; edge serves new published version |

---

## Implementation phases

### Phase 0 — JWT roles only (current next step)

- ZITADEL Role Assignments; remove Postgres `teamRoles`
- Guards: store `editor` / `admin` from JWT + platform permission keys
- ~~Field ACLs~~ — **skip**; document-level split + tuples later ([`FIELD-ACL.md`](../2026-08-01/FIELD-ACL.md))

### Phase 1 — Tuple table + Check (Zanzibar-lite)

- `relation_tuples` for per-document share
- `check()` helper; default store editor → all docs in org
- Audit: append `document_ops` on save/publish

### Phase 2 — Visual editor + op log

- PropsPanel save → patch op with `client_id`, `client_seq`
- `server_version` monotonic; dedup table
- Read API for access log

### Phase 3 — Live collab (optional)

- WebSocket or SSE op stream
- OT/CRDT on spec paths (see [`VISUAL_EDITOR.md`](../2026-07-11/VISUAL_EDITOR.md))

---

## What we are **not** doing in v1

- Self-hosted SpiceDB / full Zanzibar fleet
- Storing team membership tuples when JWT already has role
- Linearizable draft editing across regions
- Commenter relation / suggest mode

---

## Doc map

| Topic | Doc |
|-------|-----|
| ZITADEL only for team RBAC | [`TEAM-ROLES-ZITADEL.md`](./TEAM-ROLES-ZITADEL.md) |
| Visual editor UX | [`VISUAL-EDITOR-UX.md`](./VISUAL-EDITOR-UX.md) |
| Permission gates before UI | [`VISUAL-EDITOR-PLAN.md`](./VISUAL-EDITOR-PLAN.md) |
| Document types + document-level access | [`documents-domain.md`](../2026-07-10/documents-domain.md) · [`FIELD-ACL.md`](../2026-08-01/FIELD-ACL.md) |
| Zanzibar paper | [USENIX ATC 2019](https://www.usenix.org/system/files/atc19-pang.pdf) |

---

*ZITADEL = subject. Postgres tuples + op log = object access and edit history. Publish = convergence point for the storefront.*
