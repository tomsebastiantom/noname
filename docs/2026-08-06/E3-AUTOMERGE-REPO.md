# E3 — automerge-repo integration

> **Date:** 2026-08-06  
> **Status:** **Shipped** — layout collab uses `@automerge/automerge-repo` for sync  
> **Parent:** [`E3-LIVE-CRDT-COLLAB-IMPLEMENTATION.md`](./E3-LIVE-CRDT-COLLAB-IMPLEMENTATION.md)

---

## What changed

E3a v1 originally used **manual Automerge sync** (`generateSyncMessage` / `receiveSyncMessage` relay in `layout-room.ts`). That worked for dogfood but put reconnect, doc lifecycle, and sync routing on us.

**Now:**

| Layer | Implementation |
|-------|----------------|
| **Client** | `Repo` + `LayoutCollabWsAdapter` (extends `WebSocketClientAdapter`) — built-in **reconnect** |
| **Server** | One `Repo` per layout room + `LayoutCollabNetworkAdapter` (CBOR hub, join/peer handshake) |
| **Document ID** | Layout Postgres UUID → Automerge legacy UUID (`interpretAsDocumentId`) |
| **Presence (E3c)** | JSON text frames on the **same** WS (unchanged) |
| **Publish boundary** | Debounced `validateSpec` → `documents.data.spec` JSON snapshot (unchanged) |

### Code paths

```
packages/client/src/editor/collab/
  use-layout-collab.ts          — Repo + DocHandle, change listeners
  layout-collab-ws-adapter.ts   — WS adapter + presence text frames

packages/server/src/domains/collab/
  layout-room.ts                — Repo per room, import spec, snapshot persist
  repo-network-hub.ts           — automerge-repo CBOR message routing
```

---

## Why automerge-repo (vs manual relay)

| Manual relay (old) | automerge-repo (now) |
|--------------------|----------------------|
| Custom per-peer `SyncState` | Repo + `CollectionSynchronizer` |
| No reconnect | `WebSocketClientAdapter` retries on close |
| Ad-hoc binary fan-out | Standard join/peer + CBOR `Message` protocol |
| Client calls sync APIs directly | `DocHandle.change` → network + storage; **`update` does not fan-out** (see below) |

---

## When to add more (decision guide)

### 1. Reconnect / tab refresh

**Done** — `WebSocketClientAdapter` retry + client **`IndexedDBStorageAdapter`** (`platform/persistence/`).

### 2. Cleaner client code

**Done (2026-08-06).** Local layout edits use **`applyLocalSpecToDraft` inside `handle.change()`** — see [§ Local edits must use `change`, not `update`](#local-edits-must-use-change-not-update).

Further optional cleanup:

- Use `DocHandle` refs in property panel instead of parallel `storedSpec` (larger refactor)

### 3. Durable Automerge blob storage

**Shipped** — always on for layout collab. See [`COLLAB-BLOB-STORAGE.md`](./COLLAB-BLOB-STORAGE.md).

| Adapter | Status |
|---------|--------|
| Client IndexedDB | ✅ Always when collab active |
| Server Postgres `collab_automerge_chunks` | ✅ Always |
| S3/R2 | Optional later if chunks outgrow Postgres |

JSON spec snapshot → Postgres remains the **publish** boundary. Blobs are for **live editing** only.

---

## Dogfood

Same as E3a:

```bash
pnpm dev   # API :3000, edge :8787, client :5173
```

Two tabs: `?edit=true` on the same layout. WS carries **CBOR** automerge-repo messages (binary) + **JSON** presence (text).

---

## Local edits must use `change`, not `update`

> **Incident (2026-08-06):** Layout text edited in tab 2 never appeared in tab 1. Presence worked; spec did not. Full write-up: [`COLLAB-SYNC-INCIDENT-FIXES.md` §6](./COLLAB-SYNC-INCIDENT-FIXES.md#6-cross-tab-layout-spec-sync-hero-text-stale-on-tab-2).

### What automerge-repo actually does

| API | Updates in-memory doc | Emits `change` | **`DocSynchronizer` → peers** | **`StorageSubsystem` save** |
|-----|----------------------|----------------|-------------------------------|----------------------------|
| **`handle.change(fn)`** | Yes (recorded Automerge change) | Yes | **Yes** | Yes (`heads-changed`) |
| **`handle.update(fn)`** | Yes | Sometimes | **No** | Sometimes |

`DocSynchronizer` registers **only** on `change`:

```javascript
// @automerge/automerge-repo — DocSynchronizer constructor
handle.on("change", asyncThrottle(() => this.#syncWithPeers(), syncDebounceRate));
```

Remote sync **into** a tab uses `handle.update()` inside `receiveSyncMessage` — that is correct (inbound path). **Local editor writes** that should reach other tabs **must** use `handle.change()`.

### Symptom

- Multi-tab: edit hero/promo label in tab B → tab A canvas unchanged
- WS connected, Live bar OK, no errors
- React `storedSpec` updates in the editing tab only

### Rule for this codebase

**All human/agent/server layout spec writes that should sync live:**

```typescript
handle.change((draft) => {
  applyLocalSpecToDraft(draft, prevSpec, nextSpec);
});
```

**Do not** use `handle.update()` + `Automerge.merge()` / `pushLocalSpecChange()` return value for local applies.

| Location | Helper |
|----------|--------|
| Client collab hook | `use-layout-collab.ts` → `applySpecToHandle` |
| Server layout room | `layout-room.ts` → `applySpec`, `reimportRoomSpecFromDb` |
| Agent layout session | `agent-layout-collab-session.ts` → `applySpec` (presence only on WS; spec via room `applySpec` on live path) |

Implementation: `applyLocalSpecToDraft` in `packages/client/src/editor/collab/automerge-spec.ts` (mirrored on server under `packages/server/src/domains/collab/automerge-spec.ts`).

### Related gotchas (same incident)

- `adapter.whenReady()` ≠ synced with peers — use `waitForPostConnectSync` after connect ([`use-layout-collab.ts`](../../packages/client/src/editor/collab/use-layout-collab.ts))
- Queue edits before handle exists (`pendingLocalSpecRef`)
- Track `lastSpecRef` from `handle.doc()` after apply, not React `next`
- One **`peerId` per browser tab** (`layout-client-${uuid}`)

---

## Out of scope

- **D7 rich text** — still Yjs/Hocuspocus, not automerge-repo
- **Multi-region room sharding** — one in-memory room per layout on one API process today
- **automerge-repo-bundles** — only needed if shipping doc binaries between environments

---

## Related docs

| Doc | Topic |
|-----|-------|
| [`E3-LIVE-CRDT-COLLAB-IMPLEMENTATION.md`](./E3-LIVE-CRDT-COLLAB-IMPLEMENTATION.md) | Full E3 build guide |
| [`COLLAB-SYNC-INCIDENT-FIXES.md`](./COLLAB-SYNC-INCIDENT-FIXES.md) | **2026-08-06 incident** — `change` vs `update`, multi-tab sync |
| [`E3-SPIKE-REPORT.md`](./E3-SPIKE-REPORT.md) | Automerge vs Loro spike |
| [`VISUAL-EDITOR-COLLAB-CRDT.md`](../2026-08-01/VISUAL-EDITOR-COLLAB-CRDT.md) | Product strategy |
