# Efficiency / performance

> Cost per request/render, not whether the system scales horizontally (see [`SCALABILITY.md`](./SCALABILITY.md) for that). See [`README.md`](./README.md) for scope/method.

---

## Server

### Synchronous gzip on the request path (MEDIUM)

```77:80:packages/server/src/domains/analytics/routes/ingest.ts
const eventsJson = JSON.stringify(events);
const storeBody = gzipStored
  ? gzipSync(Buffer.from(eventsJson, "utf8"))  // blocks event loop
```

`gzipSync` blocks Node's single event loop for the duration of compression. On an analytics/replay ingest endpoint that can receive large batched payloads, this directly reduces the throughput of every other in-flight request on that process. Should be `gzip` (async) or moved to a worker thread for large payloads.

### Expensive JSONB text casts (MEDIUM)

```239:246:packages/server/src/domains/documents/adapters/postgres.ts
sql`${documents.data}::text LIKE ${pattern}`  // findDocumentsWithDataMentioning
```

Casting the entire JSONB column to text per row defeats any indexing strategy — this is an O(table size) operation on every call, not just today but permanently, since no index can help a `::text LIKE` on a JSONB column.

### Per-publish/per-broadcast JSON serialization with no batching (LOW-MEDIUM)

Event bus (`shared/event-bus.ts:50`) and SSE broadcast (`shared/sse-manager.ts:31`) each call `JSON.stringify` per publish/per-client with no shared buffer or batching. Not a correctness issue, but a paper cut that compounds with the SSE fan-out under load (many clients × many events).

### Event bus swallows handler errors (MEDIUM, maintainability-adjacent)

```13:20:packages/server/src/shared/event-bus.ts
async function dispatchLocal(event: string, payload: unknown): Promise<void> {
  for (const h of handlers.get(event) || []) {
    try { await h(payload); } catch { /* fire-and-forget */ }
  }
}
```

A failing analytics or webhook listener fails silently with no log/metric — this hides real efficiency and correctness problems (e.g. a handler that started throwing due to a schema change won't show up anywhere until someone notices missing data downstream).

---

## Client

### Zero `React.memo` in the codebase (HIGH)

Confirmed via grep — 0 matches for `React.memo` or `memo(` anywhere in `packages/client/src`. Every re-render of a parent re-renders every child, unconditionally. This matters most for the heaviest leaf components, which are exactly the ones with no memoization: `LayerTreePanel` (430 lines), `EditorCanvas` (592 lines), `RichTextTipTapEditor` (717 lines), `ScopeAdminForm` (932 lines).

### Editor session context has ~24 dependencies and re-renders everything (HIGH)

```494:549:packages/client/src/editor/hooks/use-edit-page-orchestration.ts
const sessionData = useMemo((): EditorSessionData | null => {
  // ... 25 fields including previewSpec, collabPeers ...
}, [
  shellLabels, templateName, pageContentRef, registry, previewSpec, storedSpec,
  selection, pendingAdd, contentDraftEditor, agentTargetField, dirty,
  // ... collabEnabled, layoutCollab.connected, layoutCollab.peers, etc.
]);
```

Any single dependency changing (including collab peer presence, which changes frequently) recomputes the whole context value object, which re-renders **every** consumer — palette, layer tree, canvas, props panel — regardless of whether that consumer cares about the field that changed. `EditorPrefsProvider`'s value memo has a similar problem: 11 dependencies, so a panel-resize drag (which changes `layout`) re-renders every pref consumer including the layer tree.

### `JSON.stringify`-based equality checks on hot paths (HIGH)

| File | Line | What it's checking |
|---|---|---|
| `editor/hooks/use-content-draft.ts` | 68 | `dirty` flag, recomputed on every keystroke |
| `editor/hooks/use-editor-history.ts` | 49, 62 | Undo-stack dedup |
| `editor/collab/automerge-spec.ts` | 176–209 | Per-field diff during collab sync |
| `editor/collab/use-layout-collab.ts` | 239, 246 | Full spec compare on remote/local sync |
| `editor/hooks/use-editor-agent-panel.ts` | 152 | Task output signature |

```66:69:packages/client/src/editor/hooks/use-content-draft.ts
const dirty = useMemo(() => {
  if (!parsed) return false;
  return JSON.stringify(values) !== JSON.stringify(baseline);
}, [parsed, values, baseline]);
```

`JSON.stringify` on a whole content-entry object on every keystroke is O(document size) per keystroke, and its result feeds directly into the session-context recomputation above — so a slow diff check on a large document compounds into a full-editor re-render, on every keystroke.

### No list virtualization (MEDIUM — also a scalability item, see `SCALABILITY.md`)

`LayerTreePanel` recursively mounts every node (`LayerTreePanel.tsx:266`); admin data tables render full result sets with no windowing.

### Redundant O(n) work in drag interactions (MEDIUM)

```277:281:packages/client/src/editor/components/canvas/EditorCanvas.tsx
for (const id of listDropTargetIds(storedSpec)) {
  const node = root.querySelector(`[data-jr-key="${CSS.escape(id)}"]`);
  if (node instanceof HTMLElement) {
    node.setAttribute("data-editor-drop-zone", "true");
```

This iterates all drop targets and does a DOM query per target, per drag-over event. On a large layout, this runs many times per second during a drag.

### Duplicate network requests on admin navigation (MEDIUM)

Admin hover-prefetch and actual navigation independently call the same edge-schema endpoint:

```38:44:packages/client/src/platform/admin-panel-prefetch.ts
const res = await fetchWithTimeout(
  `/api/edge/schema/${storeSlug}?segment=default&template=${encodeURIComponent(template)}`,
```

```227:230:packages/client/src/main.tsx
const specPromise = fetchWithTimeout(
  `/api/edge/schema/${storeSlug}?${schemaQuery}`,
```

The catalog manifest fetch is correctly skipped on a cache hit, but the schema fetch fires again every time regardless — so navigating to a recently-prefetched panel still pays a full network round trip.

### Minimal code splitting (MEDIUM)

Only one `lazy()` import exists in the entire client (`main.tsx:63`, for `EditPageView`). Rspack's `splitChunks` config only carves out an `editor` async chunk and a generic `vendor` chunk (`rspack.config.mjs:105-120`); heavy dependencies — TipTap, Automerge, rrweb-player — are not lazy-split, so every visitor's initial bundle includes rich-text/collab/replay code even if they never open the editor or admin panels.

---

## What's efficient today (no action needed)

- `secrets/service.ts`'s `llmKeyCache` (`L27-54`) is a reasonable idea for a hot secrets-lookup path, even though it's per-process (see `SCALABILITY.md`).
- `editMetaForType` caching and the editor's 450ms history debounce are called out correctly in prior audits as good patterns — confirmed still present and reasonable.
- The editor's split data/actions context design (`editor-session.tsx`) uses a stable `useRef`-backed actions object specifically to avoid re-render fan-out on actions — it's the *data* side that's the problem (see above), not the pattern itself.
