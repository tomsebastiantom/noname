# E3e — Agent as full collab peer (product spec)

> **Date:** 2026-08-06  
> **Status:** **Canonical** — agent + human live editing  
> **Stack:** Our E3 collab only — Automerge, Yjs, existing WS, Keto, `nag.*` — **no Liveblocks / PartyKit / vendor collab**  
> **Shipped behavior:** [`COLLAB-SYNC-INCIDENT-FIXES.md`](./COLLAB-SYNC-INCIDENT-FIXES.md) is the source of truth for what landed (including **no agent virtual pointer**).  
> **Parent:** [`E3-LIVE-CRDT-COLLAB-IMPLEMENTATION.md`](./E3-LIVE-CRDT-COLLAB-IMPLEMENTATION.md) · [`AGENT-PHASE-2-MASTRA-SPEC.md`](../2026-08-03/AGENT-PHASE-2-MASTRA-SPEC.md)

---

## Product goal

When an agent works on a document **while a human has it open**, the agent is **a full collab peer** — not a background HTTP writer, not a name-only chip in the presence bar.

Humans see the same **collab surfaces** as for another human editor, except remote canvas pointer (agents use selection outline instead):

| Surface | Human peer (E3c / D7) | Agent peer (E3e) |
|---------|----------------------|------------------|
| Live bar — co-peer name | ✅ | ✅ `Agent: {slug}` |
| Remote **selection** outline on canvas | ✅ | ✅ via `selectedElementId` |
| Remote **pointer** on canvas (`CollabRemoteCursors`) | ✅ | ❌ **humans only** (no fake cursor) |
| Layout spec merges live | ✅ Automerge WS | ✅ server room `applySpec` |
| Rich text merges live | ✅ Yjs + TipTap | ✅ same room |
| TipTap **collaboration cursor** | ✅ Yjs awareness | ✅ |
| Audit `document_ops` + `taskId` | — | ✅ |

**Agent presence (shipped):** the agent has no mouse. On each tool step, `AgentLayoutCollabSession.focusElement()` sends `selectedElementId` on the layout WS presence channel so humans see a **remote selection outline** on the element being edited. `cursorX` / `cursorY` are always `null` for agents — see [`COLLAB-SYNC-INCIDENT-FIXES.md` §4](./COLLAB-SYNC-INCIDENT-FIXES.md#4-agent-virtual-cursor-removed).

---

## Architecture — agent joins our collab stack as WS peer

No third-party collab. No “HTTP inject only” shortcut for the happy path.

```
Human browser                    Agent task worker
     │                                  │
     │  WS (Automerge CBOR + presence)  │  WS (same protocol)
     └──────────────┬───────────────────┘
                    ▼
           API collab rooms
     LayoutCollabRoomManager  (Automerge + automerge-repo hub)
     RichTextYjsRoomManager   (Yjs + awareness)
                    │
                    ▼
           Postgres JSON + CRDT chunks (unchanged)
```

**Why WS peer (not server-only inject):**

- **Presence + awareness** are peer protocols — real WS participation matches human paths exactly.
- **TipTap `CollaborationCursor`** requires Yjs awareness; inject-only does not get this for free.
- **Canvas selection outline** uses the same `presence` JSON frames as E3c — agent session sends `selectedElementId` over its socket (no pointer coords).

**Cold path (no human connected):** unchanged — agent tools write drafts via HTTP → Postgres; human opens later.

---

## Stack map (reuse, don’t replace)

| Layer | Human (shipped) | Agent (E3e) |
|-------|-----------------|-------------|
| Layout CRDT | Automerge + `automerge-repo` | Same — Node client in worker |
| Layout transport | `LayoutCollabWsAdapter` + edge WS | **Same adapter pattern** in `packages/server` or shared package |
| Layout offline IDB | `createAutomergeIndexedDbStorage` | **Optional** in worker (usually skip — ephemeral task) |
| Rich text CRDT | Yjs | Same |
| Rich text transport | `y-websocket` | Same in Node |
| Rich text cursor | `@tiptap/extension-collaboration-cursor` / awareness | Agent updates **awareness** on shared Y.Doc |
| Presence | JSON on layout WS | Agent sends `{ type: "presence", displayName, selectedElementId }` — `cursorX`/`cursorY` always `null` |
| Auth | ZITADEL JWT → collab ticket | **`nag.*` JWT** → same ticket routes (`requireAuthenticatedActor`) |
| Authorization | Keto `edit` on Document/Collection | Same — `Agent:{slug}` |
| Audit | — | `document_ops` per logical tool step (batch sync ops under one op row) |

---

## Agent collab session lifecycle

1. Task starts with `targetLayoutDocumentId` and/or `targetContentDocumentId` + `fieldKey`.
2. Worker mints collab ticket (`POST /api/collab/layout/ticket` or richtext ticket) using **`nag.*` token**.
3. Worker opens collab session:
   - **Layout:** `Repo` + `LayoutCollabWsAdapter` (Node) — mirror `use-layout-collab.ts` without React.
   - **Rich text:** `Y.Doc` + `WebsocketProvider` — mirror `use-rich-text-collab.ts`.
4. Worker applies layout tool output via **server room** `LayoutCollabRoomManager.applySpec` (live path) — not agent ephemeral `Repo` + not raw `layout.update`. Rich text still uses Yjs transactions on the shared doc.
5. Worker drives **presence / awareness** during each step (`focusElement` → selection outline; Yjs awareness for rich text).
6. Task step completes or task ends → close WS, leave peer list.

Ticket TTL is 60s today — worker **refreshes ticket** on long orchestrate jobs (same as human would reconnect).

---

## Agent presence (shipped)

Agent runtime drives **selection outline only** on layout — not a canvas pointer.

| Signal | Source |
|--------|--------|
| `selectedElementId` | Tool op target (`setProps`, `addComponent`, etc.) or `inferFocusElementId(prev, next)` |
| `cursorX`, `cursorY` | Always `null` for agents — `CollabRemoteCursors` renders **humans only** |
| `displayName` | `Agent: {agentSlug}` |

Layout server broadcasts presence via `broadcastPresenceSync`. Agent peer is a **real** entry in `room.peerMeta`, not a synthetic one-shot. `EditorCanvas` applies remote outlines for any peer with `selectedElementId`.

For rich text, set Yjs awareness user fields (same as `richTextCollabExtensions` / `CollaborationCursor` expect).

**Removed (2026-08-06):** `virtual-pointer.ts` and fake `cursorX`/`cursorY` from element bounds — misleading UX. Details in [`COLLAB-SYNC-INCIDENT-FIXES.md` §4](./COLLAB-SYNC-INCIDENT-FIXES.md#4-agent-virtual-cursor-removed).

---

## Client UI (minimal changes)

Humans already render peers. E3e extends typing + styling:

| Change | Path |
|--------|------|
| `peerKind: "human" \| "agent"` on presence | server + client `presence.ts` |
| Agent label + distinct color in Live bar | `CollabPresenceBar.tsx` |
| Remote pointer **humans only** | `CollabRemoteCursors.tsx` — filters `peerKind === "human"` |
| Remote selection outline for agents | `EditorCanvas.tsx` — `selectedElementId` on any peer |
| Optional agent icon in peer chip | CSS only |

No second collab UI — agents use the **same** E3c / D7 components.

---

## Server / worker modules (new)

| Module | Role |
|--------|------|
| `packages/server/src/domains/agent/collab/agent-layout-collab-session.ts` | Node layout session: WS, `focusElement` presence, optional local Repo (spec reads only on live path) |
| `packages/server/src/domains/agent/collab/agent-richtext-collab-session.ts` | Node Yjs session + awareness |
| `packages/server/src/domains/agent/mastra/tools/patch-layout-draft.ts` | Uses server room `applySpec` when task has open collab context |
| Extend `update-draft-field.ts` | Uses richtext session when field is live |

Shared WS adapter: extract or duplicate `LayoutCollabWsAdapter` for Node (already uses `isomorphic-ws`).

**Collab ticket for agents:** `actorUserId(agent)` today returns `onBehalfOf` — ticket payload should include **`agentSlug`** for presence display (extend ticket payload or presence join metadata).

---

## Task binding

| Input | Required when |
|-------|----------------|
| `targetLayoutDocumentId` | Layout orchestrate / patch tools |
| `targetContentDocumentId` + `fieldKey` + `locale` | Rich text field tools |
| `registeredAgentId` / `taskId` | Always (audit + Keto) |

Entry points:

- Admin orchestrate with target IDs (v1)
- Editor **“Run agent here”** (same release — co-peer UX needs explicit target)

---

## Implementation order

| Slice | Deliverable |
|-------|-------------|
| **E3e.1** | `AgentLayoutCollabSession` — connect WS, send presence (`focusElement`), unit tests |
| **E3e.2** | ~~Virtual pointer~~ → **selection outline only** (`selectedElementId`; no `cursorX`/`cursorY`) — shipped |
| **E3e.3** | `patchLayoutDraft` via server room `applySpec` (not HTTP bypass when human may be connected) |
| **E3e.4** | Client `peerKind` + agent styling in Live bar; humans-only remote cursors |
| **E3e.5** | `AgentRichTextCollabSession` + awareness + `updateDraftField` branch |
| **E3e.6** | Ticket refresh + orchestrate target fields + manual two-tab E2E |
| **E3e.7** | Editor “Run agent on this page” |

**Estimate:** ~8–12 days (full peer parity vs ~5–8 for minimal bridge).

---

## Acceptance criteria (E3e = full peer)

- [ ] Human in `?edit=true`; agent task on same layout → **canvas updates live** without refresh.
- [ ] Human sees **`Agent: {slug}`** in Live bar for full task step duration.
- [ ] Human sees **remote selection outline** on elements the agent edits.
- [ ] Human does **not** see a fake agent pointer on canvas (`CollabRemoteCursors` — humans only).
- [ ] Rich text: human sees **collaboration cursor** for agent in TipTap.
- [ ] Concurrent human + agent edits **merge** (Automerge / Yjs) without silent overwrite.
- [ ] `document_ops` rows: `actorType=agent`, `taskId`, logical step payload.
- [ ] Keto deny → agent cannot open collab session.
- [ ] No human on document → HTTP draft path still works.
- [ ] **No vendor collab SDK** in dependency tree for this feature.

---

## Implementation pitfalls (do not repeat)

### Hybrid collab + HTTP on the live path

**Incident (2026-08-07):** An early `patchLayoutDraft` implementation called **both** `session.applySpec()` (Automerge WS) **and** `layout.update()` (HTTP) on every successful collab patch.

**Why it broke:**

1. Agent and server each hold a **separate** Automerge `Repo`. The agent applies locally; the server room handle only updates when CBOR sync merges over WS.
2. HTTP `layout.update` wrote the correct spec to Postgres and logged `document_ops`.
3. ~5s later, `LayoutCollabRoomManager.persistRoom()` ran from the **stale** server room handle (sync had not merged) and **overwrote** Postgres with the old intro text — **without** a new audit row (symptom: `updated_at` moved, spec unchanged, no `document_ops` row for the revert).

**Symptoms:** Agent chat showed Done + `patchLayoutDraft · planner`; canvas still showed seed text; DB intro never changed.

**Rule (canonical):**

| Path | When | Persist spec | Audit |
|------|------|--------------|-------|
| **Collab** | `AgentLayoutCollabSession` connected (human editor open) | **CRDT only** → server room `persistRoom` debounce → Postgres | `recordDocumentOp` + `buildSpecPatchPayload` — **not** `layout.update` |
| **HTTP** | No collab session, or `applySpec` throws | `layout.update` | via `layout.update` audit hook |
| **Never** | Collab session succeeded | Do **not** also call `layout.update` | — |

Humans already follow collab-only while editing. Agents must match.

**Code:** `packages/server/src/domains/agent/mastra/tools/patch-layout-draft.ts` — collab success path must not call `layout.update`.

**Related guard:** `layout-room.ts` tracks `baselineSpec` so debounced persist does not clobber Postgres when the room Automerge doc is behind an external writer (defense in depth for HTTP cold path only).

### Agent ephemeral Repo does not reliably sync spec to the server room

**Root cause (2026-08-07):** The agent worker opens a **second** `Repo` (no storage, WS client only) and called `handle.update` there. Presence over WS worked, but Automerge CBOR sync from that ephemeral peer to `LayoutCollabRoomManager`'s hub `Repo` often did not merge before `persistRoom` — so the human canvas and Postgres stayed on the old spec.

> Same underlying API rule as human multi-tab sync: **`DocSynchronizer` only fan-outs on `handle.change()`**, not `handle.update()`. See [`E3-AUTOMERGE-REPO.md` § Local edits must use `change`, not `update`](./E3-AUTOMERGE-REPO.md#local-edits-must-use-change-not-update).

**Fix:** On the live collab path, **`LayoutCollabRoomManager.applySpec`** mutates the **server room handle** (same object humans sync against). The agent WS session is kept for **presence + selection outline only** (`AgentLayoutCollabSession.focusElement` — no pointer coords). The hub `Repo` then fan-outs CBOR to all browser peers and debounced persist writes Postgres.

| Responsibility | Component |
|----------------|-----------|
| Spec mutation (live path) | `layout-room.ts` → `applySpec` |
| Presence + selection outline | `AgentLayoutCollabSession` WS |
| Postgres snapshot | `persistRoom` debounce on room handle |
| Audit | `recordDocumentOp` in `patch-layout-draft.ts` |

Do **not** rely on the agent-side ephemeral `Repo` to be the source of truth for layout spec edits.

**Postgres timing:** `persistRoom` debounces 5s for human typing. Agent patches call **`flushPersist`** immediately after `applySpec` so API reload right after task completion sees the new spec.

---

## Explicitly out of scope

- Liveblocks, PartyKit, Tiptap Cloud, Hocuspocus Cloud
- Agent auto-publish
- Field-level ACL
- Multi-server Yjs Redis (same defer as D7 — not blocking E3e on single API)

---

## Related docs

| Doc | Topic |
|-----|-------|
| [`COLLAB-SYNC-INCIDENT-FIXES.md`](./COLLAB-SYNC-INCIDENT-FIXES.md) | **Shipped fixes** — ghost peers, agent push, spec sync, virtual cursor removal |
| [`E3e-AGENT-COLLAB-REFERENCES.md`](./E3e-AGENT-COLLAB-REFERENCES.md) | **How others do it** — OSS + Liveblocks + Figma patterns (includes pre-ship virtual-pointer research) |
| [`E3-LIVE-CRDT-COLLAB-IMPLEMENTATION.md`](./E3-LIVE-CRDT-COLLAB-IMPLEMENTATION.md) | Human collab baseline |
| [`COLLAB-BLOB-STORAGE.md`](./COLLAB-BLOB-STORAGE.md) | Postgres/R2 + client IndexedDB |
| [`CLIENT-INDEXEDDB-PERSISTENCE.md`](./CLIENT-INDEXEDDB-PERSISTENCE.md) | Human IDB unchanged; agent worker typically no IDB |
| [`AGENT-PHASE-2-MASTRA-SPEC.md`](../2026-08-03/AGENT-PHASE-2-MASTRA-SPEC.md) | Agent tools + orchestrate |
| [`AGENT-OWNERSHIP-AND-REVIEW.md`](../2026-08-03/AGENT-OWNERSHIP-AND-REVIEW.md) | Keto + review |

## Decision record

| Question | Decision |
|----------|----------|
| Agent like another human? | **Mostly** — live bar, selection outline, CRDT merge, TipTap cursor; **no** fake canvas pointer |
| Our stack only? | **Yes** — Automerge + Yjs + our WS + Keto |
| Server inject only? | **No** — WS peer for presence/awareness parity |
| Collab + HTTP hybrid on live path? | **No** — CRDT only when session connected; see **Implementation pitfalls** |
| Vendor collab? | **No** |
