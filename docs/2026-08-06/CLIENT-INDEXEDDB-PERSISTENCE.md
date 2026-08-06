# Client IndexedDB persistence

> **Date:** 2026-08-06  
> **Status:** **Collab-only today** — not a general platform offline layer  
> **Related:** [`COLLAB-BLOB-STORAGE.md`](./COLLAB-BLOB-STORAGE.md) · [`E3-LIVE-CRDT-COLLAB-IMPLEMENTATION.md`](./E3-LIVE-CRDT-COLLAB-IMPLEMENTATION.md)

---

## Executive summary

IndexedDB in noname exists **only to support live CRDT editing** in the browser:

- **Layout** — Automerge binary chunks (tab refresh, brief disconnect)
- **Rich text** — Yjs document state per field room

It is **not** used for admin data, auth, catalog, storefront, agent tasks, or solo-edit autosave. **Postgres JSON spec** (and publish) remains the source of truth.

The small `platform/persistence/` factory is a **hook for future Automerge-backed features**, but **only layout collab uses it today**.

---

## What we built vs what we did not

| Built | Not built |
|-------|-----------|
| Automerge chunk cache for layout collab | Generic “offline app” mode |
| Yjs cache per rich-text field room | Admin list / form offline cache |
| Scoped store factory (`noname-automerge` DB) | Unified platform IndexedDB API for all features |
| Always on when collab is active | User-toggle or feature flag for local persist |

---

## Two IndexedDB paths (not one platform module)

### 1. Layout — Automerge (`platform/persistence`)

| Item | Value |
|------|-------|
| Library | `@automerge/automerge-repo-storage-indexeddb` |
| Factory | `packages/client/src/platform/persistence/automerge-indexeddb.ts` |
| Browser DB name | `noname-automerge` |
| Object store scope | `layout-collab` (default) |
| Wired in | `packages/client/src/editor/collab/use-layout-collab.ts` |

```typescript
import { createAutomergeIndexedDbStorage } from "../../platform/persistence";

// Layout collab Repo — always when edit mode collab runs
storage: createAutomergeIndexedDbStorage("layout-collab"),
```

**Why a platform folder?** Same Automerge DB can host **additional scoped stores** later without new browser databases:

```typescript
createAutomergeIndexedDbStorage("layout-collab");   // shipped
createAutomergeIndexedDbStorage("offline-drafts");   // not built — example only
```

No second consumer exists in code today.

### 2. Rich text — Yjs (collab hook only)

| Item | Value |
|------|-------|
| Library | `y-indexeddb` |
| Wired in | `packages/client/src/components/rich-text/use-rich-text-collab.ts` |
| DB name pattern | `noname-richtext:{contentDocumentId}:{fieldKey}:{locale}` |
| Platform factory | **None** — Yjs persistence is inline in the hook |

Rich text does **not** go through `platform/persistence/`. That is intentional for v1 (different CRDT stack).

---

## Data flow (where IndexedDB sits)

```
                    PUBLISH / STOREFRONT READS
                              │
                              ▼
                    Postgres documents.data.spec
                    (JSON — source of truth)
                              ▲
                              │ debounced snapshot (layout)
                              │
     ┌────────────────────────┴────────────────────────┐
     │              SERVER COLLAB                       │
     │   Automerge chunks: Postgres or R2               │
     │   Yjs rooms: in-memory per API process         │
     └────────────▲──────────────────────▲──────────────┘
                  │ WS                   │ WS
     ┌────────────┴──────────┐  ┌───────┴──────────────┐
     │  Human browser A      │  │  Human browser B     │
     │  IndexedDB (cache)    │  │  IndexedDB (cache)   │
     └───────────────────────┘  └──────────────────────┘
```

**IndexedDB = client-side CRDT cache**, not a sync target for agents or storefront.

---

## When IndexedDB helps

| Scenario | Layout (Automerge IDB) | Rich text (y-indexeddb) |
|----------|------------------------|-------------------------|
| Tab refresh while editing | Local chunks load before WS | Local Y.Doc loads before WS |
| Brief network blip | Resync from local + server | Same |
| Human closed tab, reopens later | Merge with server Postgres/R2 chunks | Merge with server Yjs room |
| Solo edit without collab | **Not used** | **Not used** (no WS room) |
| Agent writes via HTTP (room cold) | Human still uses IDB as today | Same |

---

## What is not IndexedDB

| Mechanism | Purpose |
|-----------|---------|
| **Postgres `documents.data.spec`** | Publish + API reads |
| **`collab_automerge_chunks` / R2** | Server-side Automerge durability |
| **In-memory editor undo** | Solo session undo stack |
| **`localStorage`** | Legacy editor prefs migration (`editor-prefs-api.ts`) — unrelated to collab |
| **Agent task drafts** | Server Postgres via HTTP tools |

---

## Rules for new features

1. **Do not** treat IndexedDB as a general platform database without a new spec.
2. **Do** use `createAutomergeIndexedDbStorage(scope)` if you add another **Automerge-repo** feature — new scope string, same `noname-automerge` DB.
3. **Do** use `y-indexeddb` (or a thin wrapper) for new **Yjs** surfaces — separate naming convention from Automerge.
4. **Never** use IndexedDB as publish truth — always validate and write JSON to Postgres on publish/snapshot.
5. **E3e (agent + human live)** — human IndexedDB unchanged; agent worker connects via WS, typically no local IDB.

---

## Future platform persistence (not scheduled)

If product needs broader offline behavior, extend deliberately:

| Idea | Approach |
|------|----------|
| Offline layout drafts (solo, no WS) | New scope `offline-drafts` + explicit UX; conflict on save with If-Match |
| Admin catalog cache | Separate module — likely **not** Automerge; consider Cache API or IDB key-value |
| Unified `platform/persistence` API | Wrap Automerge + Yjs behind one doc only if ≥2 Yjs consumers exist |

Until then, **collab-only is the correct mental model**.

---

## File map

| Path | Role |
|------|------|
| `packages/client/src/platform/persistence/automerge-indexeddb.ts` | Automerge IDB factory |
| `packages/client/src/platform/persistence/index.ts` | Public export |
| `packages/client/src/editor/collab/use-layout-collab.ts` | Layout collab consumer |
| `packages/client/src/components/rich-text/use-rich-text-collab.ts` | Rich text Yjs IDB |
| `packages/server/src/domains/collab/collab-automerge-chunk-store.ts` | Server chunks (not IDB) |

---

## Related docs

| Doc | Topic |
|-----|-------|
| [`COLLAB-BLOB-STORAGE.md`](./COLLAB-BLOB-STORAGE.md) | Full three-layer blob model |
| [`E3-AUTOMERGE-REPO.md`](./E3-AUTOMERGE-REPO.md) | automerge-repo + when IDB matters |
| [`RICH-TEXT-IMPLEMENTATION.md`](./RICH-TEXT-IMPLEMENTATION.md) | D7 Yjs collab |
| [`E3e-AGENT-FULL-COLLAB-PEER.md`](./E3e-AGENT-FULL-COLLAB-PEER.md) | Agent + human live collab |
