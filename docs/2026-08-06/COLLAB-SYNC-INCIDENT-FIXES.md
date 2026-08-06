# Collab sync incident — root-cause fixes (2026-08-06)

> **Context:** Visual editor (`?edit=true`) live layout collab — human multi-tab, agent presence, spec sync.  
> **Principle:** Fix causes on the server/collab path; no UI band-aids that hide broken join or sync.  
> **Parent:** [`E3-LIVE-CRDT-COLLAB-IMPLEMENTATION.md`](./E3-LIVE-CRDT-COLLAB-IMPLEMENTATION.md) · [`VISUAL-EDITOR-COLLAB-CRDT.md`](../2026-08-01/VISUAL-EDITOR-COLLAB-CRDT.md)

---

## Symptoms reported

| Symptom | Tab / surface |
|---------|----------------|
| Ghost **“Collaborator”** in Live bar when same user had two editor tabs | Live bar (second tab) |
| Agent missing from Live bar on tab that didn’t start the task | Live bar |
| **Layout text edits** in one tab not appearing in the other (still old hero copy) | Canvas / props |
| Synthetic / polled “agent running” chip instead of real collab signal | Live bar + agent panel |

Demo: home layout, login `admin@zitadel.localhost`, stack `:3000` / client `:5173` / edge `:8787`.

---

## Canonical live edit path (unchanged)

```
handleStoredChange (editor)
  → updateStoredSpec (React)
  → layoutCollab.applyLocalSpec (Automerge handle)
  → WS → server LayoutCollabRoomManager (automerge-repo hub)
  → other tabs: handle.on('change') → updateStoredSpec
```

Agent **spec writes** still go through the **server collab room** (`layoutCollabRooms.applySpec`), not the agent Automerge WS client. Agent WS is **presence + selection outline only**.

---

## Fixes applied (by area)

### 1. Live bar — ghost “Collaborator” (same user, two tabs)

**Root cause:** Each tab received the full peer list including **other tabs of the same account**. Client-side filtering used `sessionUserId()` captured **once** at collab hook mount; on a fresh tab JWT hydration could be late → filter skipped → own other tab shown as “Collaborator”.

**Fix:**

| Layer | Change |
|-------|--------|
| **Server** | `collabPeersForRecipient()` in `presence.ts` — `sendPresenceSync` sends a **per-recipient** peer list that excludes other **human** peers with the same `userId`. |
| **Client** | `sessionUserId()` read **on each** `presence-sync` message (not closure at connect). |
| **Client** | `collabHumanDisplayName()` refreshed on each join-presence send (not stale closure). |

**Files:** `packages/server/src/domains/collab/presence.ts`, `layout-room.ts`, `packages/client/src/editor/collab/use-layout-collab.ts`

**Still in place (not band-aids):** `broadcastPresenceSync` on every `joinPeer`, `pruneInvalidHumanPeers`, `displayName` required on tickets, `evictDeadPeersForUser` for same-user multi-tab (Automerge stays connected).

---

### 2. Defensive layers removed (intentionally)

These hid symptoms; removed after root fixes above.

| Removed | Why |
|---------|-----|
| `presenceSnapshot` filter dropping unnamed humans at broadcast | Unnamed humans should be impossible if `joinPeer` enforces `displayName`; use `pruneInvalidHumanPeers` only. |
| 12s presence heartbeat + `visibilitychange` re-send in `use-layout-collab` | Masked stale lists; not needed when join broadcast is correct. |

---

### 3. Agent visibility — server push (no poll, no synthetic Live peer)

**Root cause:** Tabs that didn’t start the agent task had no signal until WS presence landed; earlier code **polled** tasks and **fabricated** a Live peer (`mergeCollabPeersWithRunningAgent`).

**Fix:**

| Mechanism | Role |
|-----------|------|
| **`agent-task` collab WS message** | Server broadcasts `{ type: "agent-task", phase: "started" \| "ended", taskId, registeredAgentId, displayName }` when orchestrator opens/closes agent layout session. |
| **`useLayoutCollab.agentTaskActivity`** | Client state from push only. |
| **Live bar** | **Real WS peers only** (`session.collabPeers`) — agent appears when agent WS joins room. |
| **Agent panel** | `agentInPresence` / `agentTaskRunning` use `agentTaskActivity` (push) + local task state on submitting tab. |

**Removed:** `useLayoutAgentActivity` (1.5s poll), `liveBarPeersWithAgentActivity`, `mergeCollabPeersWithRunningAgent`.

**Files:** `packages/server/src/domains/agent/mastra/executor.ts`, `packages/server/src/domains/collab/layout-room.ts`, `presence.ts`, `packages/client/src/editor/collab/use-layout-collab.ts`, `VisualEditorShell.tsx`

---

### 4. Agent virtual cursor removed

**Decision:** Virtual pointer was misleading; agent doesn’t have a mouse.

| Before | After |
|--------|-------|
| `virtualPointerForElement()` → fake `cursorX`/`cursorY` | Deleted |
| Agent shown in `CollabRemoteCursors` | **Humans only** in `CollabRemoteCursors` |
| Agent `selectedElementId` | Kept — remote **selection outline** on canvas still works |

**Files:** removed `virtual-pointer.ts`; `agent-layout-collab-session.ts`, `CollabRemoteCursors.tsx`

---

### 5. Human cursor while editing

When selection changes (canvas, layers, props), canvas reports a **cursor anchor** at the selected element so remote tabs see where the human is editing even without mouse movement over the canvas.

**File:** `packages/client/src/editor/components/canvas/EditorCanvas.tsx`

---

### 6. Cross-tab layout spec sync (hero text stale on tab 2)

**Root cause (multiple):**

1. On connect, client called `onRemoteSpec(handle.doc())` **before** `adapter.whenReady()` — often a **stale** IndexedDB doc, clobbering or racing with network sync.
2. Edits made **before** collab handle existed were **dropped** (`applyLocalSpec` no-op with no queue).
3. Client used full `pushLocalSpec` merge for every edit instead of incremental `pushLocalSpecChange` (server already used safe incremental path).
4. **Local applies used `handle.update()`** — automerge-repo's `DocSynchronizer` only broadcasts to peers on **`handle.change()`**, so tab-2 text edits never left the browser.

> **Canonical reference:** [`E3-AUTOMERGE-REPO.md` § Local edits must use `change`, not `update`](./E3-AUTOMERGE-REPO.md#local-edits-must-use-change-not-update) — API table, symptom, and code paths.

**Fix (`use-layout-collab.ts` + `automerge-spec.ts`):**

1. Register `handle.on('change')` **first**, then `await adapter.whenReady()` before any spec reconciliation.
2. **`pendingLocalSpecRef`** — queue edits until handle exists; flush after connect.
3. On connect: **only push** pending local edits to Automerge — **never** push stale HTTP-loaded `initialSpec` into the room (that could overwrite the other tab’s edits).
4. On connect: **pull** remote doc into React when collab doc ≠ current editor state.
5. Use **`applyLocalSpecToDraft` inside `handle.change()`** (not `handle.update()`) so peer sync runs.
6. **`waitForPostConnectSync`** (~400ms or first heads change) after `whenReady()` — repo has no `whenSynced()`.
7. **`lastSpecRef`** tracks `handle.doc()` after each local apply (not React `next`).
8. Unique **`peerId` per tab** (`layout-client-${uuid}`).

**Files:** `packages/client/src/editor/collab/use-layout-collab.ts`, `automerge-spec.ts`, `packages/server/src/domains/collab/layout-room.ts`, `agent-layout-collab-session.ts`

---

## Key files (quick index)

| Area | Path |
|------|------|
| Server room + presence | `packages/server/src/domains/collab/layout-room.ts` |
| Presence protocol + per-recipient peers | `packages/server/src/domains/collab/presence.ts` |
| Agent task push | `packages/server/src/domains/agent/mastra/executor.ts` |
| Client collab hook | `packages/client/src/editor/collab/use-layout-collab.ts` |
| Editor orchestration | `packages/client/src/editor/hooks/use-edit-page-orchestration.ts` |
| Live bar | `packages/client/src/editor/components/shell/CollabPresenceBar.tsx`, `VisualEditorShell.tsx` |
| Agent WS presence | `packages/server/src/domains/agent/collab/agent-layout-collab-session.ts` |

---

## Verify (manual)

1. **Restart API** after server changes; hard-refresh both editor tabs.
2. **Two tabs, same user:** Live shows **You · Editing alone** (no extra Collaborator). Edits in tab 1 appear in tab 2 within ~1s without Save.
3. **Agent task:** Live bar shows agent when WS joins; agent panel shows activity via `agent-task` push on all tabs; no fake cursor on canvas; selection outline OK.
4. **Save draft** still persists layout to Postgres (collab sync ≠ save).

---

## Explicit non-goals / not re-added

- Poll-based agent Live chip  
- Synthetic `agent-activity:*` peer in Live bar  
- Presence heartbeat to mask stale peer lists  
- Broadcast-time filter for unnamed humans (server evicts invalid peers instead)  
- Agent virtual pointer on canvas  

---

## Related tests

```bash
npm test -- packages/client/src/editor/collab packages/server/src/domains/collab
```

Covers: `remoteCollabPeers`, `collabPeersForRecipient`, `agent-task` message parse, peer display partition/dedupe, automerge `pushLocalSpecChange`.
