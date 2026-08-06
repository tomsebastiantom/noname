# Collab durable blob storage

> **Date:** 2026-08-06  
> **Status:** **Client IndexedDB + server R2 or Postgres** — always on for layout collab  
> **Parent:** [`E3-AUTOMERGE-REPO.md`](./E3-AUTOMERGE-REPO.md)

---

## Three layers

| Layer | What it stores | Purpose |
|-------|----------------|---------|
| **Publish snapshot** | JSON layout spec in Postgres `documents.data.spec` | Storefront + publish boundary — source of truth for reads |
| **Server CRDT blobs** | Automerge binary chunks in `collab_automerge_chunks` | Multi-server rooms, fast cold-start, CRDT history |
| **Client CRDT blobs** | Automerge binary chunks in IndexedDB | Tab refresh / brief offline before WS sync |

**Rule:** Postgres JSON spec remains the **publish** source of truth. CRDT blobs are for **live editing**, not storefront reads.

---

## Architecture

```
Editor A ──WS──► Server Repo + Postgres chunks ◄──WS── Editor B
       │                    │
       IndexedDB            │ debounce 5s + last peer leave
       (local)              ▼
                    Postgres JSON spec snapshot
```

---

## Client IndexedDB

Layout collab `Repo` **always** uses `IndexedDBStorageAdapter` (`noname-automerge` DB · `layout-collab` store).

**Full client IDB guide:** [`CLIENT-INDEXEDDB-PERSISTENCE.md`](./CLIENT-INDEXEDDB-PERSISTENCE.md) — collab-only today; platform factory vs Yjs inline paths.

| Piece | Path |
|-------|------|
| Client IDB guide | [`CLIENT-INDEXEDDB-PERSISTENCE.md`](./CLIENT-INDEXEDDB-PERSISTENCE.md) |
| Platform factory | `packages/client/src/platform/persistence/automerge-indexeddb.ts` |
| Layout collab wiring | `packages/client/src/editor/collab/use-layout-collab.ts` |

On tab refresh: local chunks load immediately, then WS merges with server/peers.

Other features can reuse the same DB with a different scope:

```typescript
createAutomergeIndexedDbStorage("layout-collab");
createAutomergeIndexedDbStorage("offline-drafts"); // future
```

---

## Server Postgres / R2

Layout collab `Repo` uses `PostgresAutomergeStorageAdapter` backed by **`createCollabAutomergeChunkStore`**:

- **R2 configured** (`R2_BUCKET`, … — same env as assets/replay) → chunks in object storage
- **Otherwise** → Postgres `collab_automerge_chunks`

### Schema

Table `collab_automerge_chunks` — Drizzle: `packages/server/src/domains/collab/schema.ts`

Apply: `pnpm --filter @noname/server db:push`

### Code

| Piece | Path |
|-------|------|
| Key encoding | `automerge-storage-key.ts` |
| Postgres chunk store | `collab-automerge-chunk-store.ts` |
| R2 chunk store | `r2-automerge-chunk-store.ts` |
| Store factory | `createCollabAutomergeChunkStore()` — R2 if configured, else Postgres |
| Repo adapter | `postgres-automerge-storage.ts` |
| Room wiring | `layout-room.ts` |

Cold start:

1. `find(documentId)` loads chunks from Postgres if present
2. If no chunks yet → one-time import from JSON spec
3. Live edits → chunks upserted; JSON snapshot still debounced for publish

---

## Rich text (D7)

Yjs track — separate from Automerge blobs. Client **`y-indexeddb`** persistence per field room (`noname-richtext:docId:field:locale`).

| Piece | Path |
|-------|------|
| Hook | `packages/client/src/components/rich-text/use-rich-text-collab.ts` |

---

## Related docs

| Doc | Topic |
|-----|-------|
| [`E3-AUTOMERGE-REPO.md`](./E3-AUTOMERGE-REPO.md) | Repo sync |
| [`E3-LIVE-CRDT-COLLAB-IMPLEMENTATION.md`](./E3-LIVE-CRDT-COLLAB-IMPLEMENTATION.md) | Full E3 architecture |
