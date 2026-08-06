# Collab production smoke checklist

Manual verification for live collab behind the edge WebSocket proxy (`packages/workers/src/routes/proxy-websocket.ts`).

## Prerequisites

- Deployed worker + API with `WORKER_SERVER_SECRET` aligned (collab tickets)
- At least one org user with visual editor access and a registered agent
- Demo page with `?edit=true`, CMS content ref, and a rich-text field

## Layout collab (Automerge)

1. Open the same layout in two browser tabs with `?edit=true`.
2. Confirm **Live collab** / presence bar shows both peers.
3. Reorder blocks in tab A — tab B updates without refresh.
4. Drag-reparent a block across columns — both tabs stay in sync.
5. Save in one tab — other tab can refresh without losing collab connection.

## Rich text collab (Yjs)

1. Focus a rich-text CMS field in tab A (collab badge: **Live collab**).
2. Open the same field in tab B — content syncs; remote cursor appears when typing.
3. Edit in tab A — tab B updates live.
4. Wait ~5s after last keystroke — reload admin/content entry; Postgres draft matches Yjs (room snapshot persist).
5. Run agent on page with rich-text field focused — agent joins Yjs room; human sees agent cursor after edit.

## Agent full collab peer (E3e)

1. **Run agent** from editor chrome with a focused rich-text field.
2. Confirm task input includes `targetLayoutDocumentId`, `targetContentDocumentId`, `targetFieldKey`, `targetLocale`.
3. Agent `updateDraftField` on that field returns `via: "collab"` (no redundant HTTP write).
4. Agent `patchLayoutDraft` updates layout live for connected humans.

## Edge WS proxy

1. Browser connects to worker origin (`wss://…/api/collab/...`), not API origin directly.
2. Layout WS: `/api/collab/layout/ws/:layoutDocumentId?collab_ticket=…`
3. Rich text WS: `/api/collab/richtext/ws/:roomName?collab_ticket=…`
4. Ticket mint HTTP stays on API; only binary frames pass through the worker upgrade handler.

## Explicitly deferred (multi-API)

- Redis / Hocuspocus-style Yjs fan-out across multiple API instances
- Automerge repo cross-node sync beyond single-process Postgres chunk store

Run this checklist after each collab-affecting deploy before marking E3/E3e acceptance complete.
