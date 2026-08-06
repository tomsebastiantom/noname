# E3-spike handoff — Automerge vs Loro (parallel agent)

> **Date:** 2026-08-06  
> **Owner:** Spike agent (parallel track)  
> **Depends on:** **E3-pre** (this repo) — `document_ops` patch payloads + replay  
> **Does not block:** E3-pre merge; spike is read-only / isolated script until promoted  
> **Full spec:** [`E3-LIVE-CRDT-COLLAB-IMPLEMENTATION.md`](./E3-LIVE-CRDT-COLLAB-IMPLEMENTATION.md)

---

## Your mission

Run an **offline spike** comparing **Automerge** vs **Loro** for merging concurrent edits on a **json-render layout spec** (`{ root, elements }`). No WebSocket, no product UI — prove merge semantics on real seed specs.

**Deliverable:** [`E3-SPIKE-REPORT.md`](./E3-SPIKE-REPORT.md) (PASS/FAIL matrix + E3a recommendation). Spike script was temporary; removed after doc capture.

---

## Context (already shipped / in flight)

| Piece | Status | Path |
|-------|--------|------|
| Solo editor + client undo | ✅ | `packages/client/src/editor/hooks/use-editor-history.ts` |
| Layout save + `If-Match` 409 | ✅ | `layouts.service.ts`, `use-layout-draft.ts` |
| Keto document `edit` guard | ✅ | `document-write-guard.ts` |
| **`document_ops` audit + JSON Patch** | ✅ **E3-pre** | `document-op-payload.ts`, `schema.ts` `document_ops.payload` |
| Live WS / CRDT | ✅ **E3a v1** | `packages/server/src/domains/collab/`, `?collab=1` |

**E3-pre gives you:** ordered patch log + `replaySpecPatches()` — use the same seed specs to compare “replay patches” vs “CRDT merge” convergence.

---

## Spike scenarios (must run all)

Use at least **two real layouts** from seed/fixtures (e.g. `home`, `product-detail`). For each CRDT library:

1. **Concurrent prop edit** — Alice changes `elements.hero.props.title`, Bob changes `elements.hero.props.subtitle` at the same time → merged doc has both.
2. **Reorder children** — Alice reorders `elements.grid.children`, Bob adds a new sibling → no lost nodes; order stable per library rules.
3. **Add + delete element** — Alice adds `elements.banner`, Bob removes unrelated `elements.footer` → both ops preserved.
4. **Publish boundary** — Export CRDT state → run server `validateSpec()` → must pass (mirror E3 publish gate).

Record: doc size after N edits, merge time, surprises (e.g. Yjs-style JSON pain — **do not spike whole-spec Yjs**).

---

## Recommended setup

```bash
# In repo root — add spike deps only in spike package or devDependencies
pnpm add -D @automerge/automerge loro-crdt --filter @noname/server
```

**Automerge sketch:**

- One `Automerge.init()` doc per scenario
- Mirror `spec.root` + `spec.elements` as Map/List (spike doc in E3 spec § Automerge)
- Fork doc → apply concurrent changes on two replicas → `Automerge.merge`

**Loro sketch:**

- `LoroDoc` with `getMap("elements")` + `getTree("root")` or movable tree for `children`
- `doc.export()` / `import()` for snapshot analogue

---

## Success criteria

| Criterion | Automerge | Loro |
|-----------|-----------|------|
| All 4 scenarios converge without manual fix | | |
| `validateSpec` passes on merged export | | |
| Reorder feels natural for canvas DnD | | |
| Doc size acceptable after ~50 edits | | |
| Team prefers API / debug story | | |

**Recommendation format:** Pick **primary** (likely Automerge) + **fallback** (Loro if tree reorder wins). Note any schema mapping we must codify in E3a.

---

## Out of scope (do not build yet)

- WebSocket server / `automerge-repo` network adapter
- Keto on WS connect
- Client `EditPageView` wiring
- Yjs / Hocuspocus (rich text — separate **D7** track; see [`RICH-TEXT-IMPLEMENTATION.md`](./RICH-TEXT-IMPLEMENTATION.md))
- `GET /documents/:id/ops` API (E3-pre follow-up) — **shipped**

---

## Files to read first

1. [`E3-LIVE-CRDT-COLLAB-IMPLEMENTATION.md`](./E3-LIVE-CRDT-COLLAB-IMPLEMENTATION.md) — OSS cheat sheet
2. [`VISUAL-EDITOR-COLLAB-CRDT.md`](../2026-08-01/VISUAL-EDITOR-COLLAB-CRDT.md) — product gates
3. [`SPEC-STORAGE-MERGE.md`](../2026-07-25/SPEC-STORAGE-MERGE.md) — patch vs full spec
4. `packages/server/src/domains/documents/document-op-payload.ts` — replay helper
5. `packages/client/src/editor/hooks/use-edit-page-orchestration.ts` — where CRDT provider will mount

---

## After spike

**Report:** [`E3-SPIKE-REPORT.md`](./E3-SPIKE-REPORT.md) — **Automerge primary**, Loro fallback.

**E3a v1** is in dogfood — see [`E3-LIVE-CRDT-COLLAB-IMPLEMENTATION.md`](./E3-LIVE-CRDT-COLLAB-IMPLEMENTATION.md) for paths, WS routing, and remaining gaps (E3c, `automerge-repo`, D7).
