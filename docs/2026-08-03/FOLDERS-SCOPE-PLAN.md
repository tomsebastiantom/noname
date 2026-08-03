# Folders replace tags — simple 3-phase plan

> **Date:** 2026-08-03  
> **Status:** **F1 shipped · F2 + F3 shipped**  
> **Related:** [`ACCESS-AND-ROLES.md`](./ACCESS-AND-ROLES.md) · [`ROADMAP-PHASES-B-A-C.md`](./ROADMAP-PHASES-B-A-C.md)

---

## One sentence

**Tags go away for permissions.** Every content/layout doc lives in **one folder**. Teams get access on folders (like today’s tag bindings). Optional later: nested folders + CMS sidebar.

**Not the same as** Shopify **product collections** (storefront catalog). This is **CMS admin organization + who may edit**.

---

## What stays the same

| Thing | Role |
|-------|------|
| **ZITADEL roles** | editor, publisher, access manager, admin — unchanged |
| **Teams** | Groups of people — unchanged |
| **Folder ↔ team bind** | Same as today’s tag ↔ team bind |
| **Share one doc** | Direct editor/publisher on a single document — unchanged |

---

## What changes

| Today (tags) | After (folders) |
|--------------|-----------------|
| Doc has `tags: ["marketing"]` | Doc has `collection_id` → **Marketing** folder |
| Settings → Tags | Settings → **Folders** |
| Comma-separated tag field on content | **Dropdown:** pick one folder |
| Keto `Tag:marketing` | Keto `Collection:marketing` |
| `content_tags` table | `content_collections` table |

**Rule:** one scope model only — **no tags + folders together**.

---

## The three phases

### Phase 1 — Flat folders (~1 week)

**User sees:** folders instead of tags. No subfolders yet.

```
Settings → Folders:  Marketing | Legal | Homepage
Content editor:      [ Folder: Marketing ▼ ]
```

**What we build:**

| Layer | Work |
|-------|------|
| Database | `content_collections` table; `documents.collection_id`; migrate existing tags |
| API | Folder CRUD; folder ↔ team bind; check folder on save/publish |
| Keto | `Collection#editors|publishers`; doc check uses folder not tag |
| Admin | Rename Tags UI → Folders; folder picker on content/layout |
| Remove | Tag field, tag API, `Tag:*` checks |

**Same behavior as today** — just clearer UX (“Marketing folder” not “marketing tag”).

---

### Phase 2 — Folder tree (+3–5 days)

**User sees:** nested folders; access inherits from parent.

```
Marketing/
  Summer campaign/
  Black Friday/
Legal/
```

**What we add:**

| Layer | Work |
|-------|------|
| Database | `parent_id` on `content_collections` |
| Keto | Parent chain walk (already in OPL stub) |
| Admin | Create/move/rename nested folders; bind team on any folder |
| Access rule | Edit on **Marketing** → all docs in **Marketing/** subfolders too |

**Skip until Phase 1 ships.** Flat folders cover “marketing vs legal” for most stores.

---

### Phase 3 — Content browser by folder (+3–5 days, optional)

**User sees:** CMS sidebar browses by folder (polish, not required for security).

```
Content
├── All
├── Marketing
│   ├── Summer campaign
│   └── Homepage hero
└── Legal
```

**What we add:**

| Layer | Work |
|-------|------|
| Client | Sidebar tree; filter list by selected folder |
| API | List docs by `collection_id` (and descendants in Phase 2) |
| Create flow | “New page” defaults to current folder |

**Nice-to-have.** Phase 1 + 2 already enforce access; this is navigation UX.

---

## Timeline at a glance

```
Phase 1  Flat folders     ~1 week      REQUIRED — replaces tags
Phase 2  Nested tree      +3–5 days    When merchants need subfolders
Phase 3  CMS sidebar      +3–5 days    Optional polish
```

Also separate (not a folder phase):

| Item | When |
|------|------|
| **Prod Keto deploy (B4)** | Before real multi-tenant prod |
| **Agents (A′)** | After folders stable |
| **CRDT (C)** | Only if simultaneous multi-editor needed |

---

## Decisions (confirm once)

| # | Decision |
|---|----------|
| 1 | **Folders-only** for scope — remove tags from access path |
| 2 | **One folder per document** |
| 3 | **Phase 1 first** — flat list, no tree |
| 4 | **Phase 2** when nesting is needed |
| 5 | **Phase 3** optional — sidebar when content list feels cramped |

---

## Approve to start

Reply **approve Phase 1** (or change any row above). Implementation order: schema → API guards → admin UI → seed migration → delete tag code.
