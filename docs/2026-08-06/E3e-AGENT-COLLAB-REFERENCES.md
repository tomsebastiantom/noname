# E3e — Agent collab references (how others do it)

> **Date:** 2026-08-06  
> **Purpose:** Reference only — patterns from OSS and products for **agent + human live editing**  
> **Our spec:** [`E3e-AGENT-FULL-COLLAB-PEER.md`](./E3e-AGENT-FULL-COLLAB-PEER.md)

---

## TL;DR — industry pattern

Almost everyone converges on the same shape:

1. **Agent is a collab peer** on the same CRDT/sync plane as humans (not a separate “save API” when live).
2. **Presence (cursor, selection, name) is ephemeral** — sent on a side channel or awareness layer, **not** persisted like the document.
3. **Agents have no mouse** — cursor coordinates are **set by the server/runtime** from what the agent is editing (Liveblocks, Electric, Figma-style apps all do this; they don’t call it weird, they just set `cursor: { x, y }` or awareness fields).
4. **Document edits** go through CRDT (Yjs / Automerge) so human + agent merge without last-writer-wins at save.

That matches E3e: our WS + Automerge/Yjs + JSON presence — no vendor.

---

## Reference projects (OSS)

### 1. Electric SQL — “AI agents as CRDT peers” (Yjs)

- **Link:** [AI agents as CRDT peers — building collaborative AI with Yjs](https://electric.ax/blog/2026/04/08/ai-agents-as-crdt-peers-with-yjs)
- **Stack:** Yjs, ProseMirror, server-side agent peer, Durable Streams transport
- **Pattern:**
  - Agent is a **server-side Yjs peer** on the same room as humans (“Electra”).
  - **Awareness:** cursor, selection, status (`thinking` / `composing` / `idle`).
  - Agent does **not** raw-edit Yjs; **tool calls** → server runtime → Yjs ops → CRDT sync to all clients.
  - Humans can edit while agent streams; **two live cursors**, Yjs merges.

**Takeaway for noname:** Same as E3e — agent joins room, edits via CRDT, presence on awareness/presence channel. We use Automerge for layout + Yjs for rich text instead of one Yjs doc for everything.

---

### 2. Motion — AI-native collab editor

- **Link:** [github.com/auditt98/motion](https://github.com/auditt98/motion)
- **Stack:** Yjs, PartyKit WS, TipTap, MCP + REST for agents
- **Pattern:**
  - “AI agents are **first-class editors**” — MCP/REST, **presence bar + live cursors**, keystrokes in real time.
  - Agents get **distinct cursor color** + status (thinking / writing / idle).
  - Document = Yjs only; Postgres for metadata, not doc body.

**Takeaway:** Agent visible like human; purple/distinct styling; same CRDT wire.

---

### 3. Muesli — markdown + AI agents (Yjs)

- **Link:** [github.com/muesli-dot-md/muesli](https://github.com/muesli-dot-md/muesli)
- **Stack:** Yjs/yrs, self-hosted, MCP (52 tools), live cursors
- **Pattern:**
  - “Your whole team — **and your AI agents** — write the same files at once.”
  - Live cursors, presence, comments; agents co-present via MCP.
  - File stays canonical markdown; CRDT is sync layer.

**Takeaway:** Agents in presence + cursors is product-default for “agent-native” editors.

---

### 4. Agent-Native framework (Yjs + TipTap)

- **Link:** [agent-native.com — Real-Time Collaboration](https://www.agent-native.com/docs/real-time-collaboration)
- **Pattern:**
  - “That peer might be a teammate. **It might be the agent.** From the framework’s perspective they are **identical**: both produce Yjs operations.”
  - `useCollaborativeDoc`, `usePresence` — cursor, selection, viewport on awareness.
  - Agent edits = same infrastructure as human edits.

**Takeaway:** Explicit design goal: **no special case** in merge path; only presence metadata differs.

---

## Reference products (commercial)

### 5. Liveblocks — AI presence (server-set cursor)

- **Links:** [AI Collaboration](https://liveblocks.io/docs/collaboration-features/ai-collaboration) · [Agentic workflows guide](https://liveblocks.io/docs/guides/enabling-agentic-workflows-with-liveblocks)
- **Pattern:**
  - `POST /rooms/{roomId}/presence` — server sets agent presence with **TTL** (auto-expire).
  - Presence `data`: `{ cursor: { x, y }, editingId, status }`.
  - Clients use same `useOthers` / `Cursors` — **agent appears next to humans**.
  - Agent moves between fields → **call presence again** with new `editingId` / cursor.

**Takeaway:** This is exactly “virtual pointer” — **no mouse**, server publishes coordinates. Same UX as human cursors, different source for x/y.

---

### 6. Figma — ephemeral presence (human + would-be bot)

- **Links:** [Figma multiplayer infrastructure](https://sujeet.pro/articles/figma-multiplayer-infrastructure) · [Figma realtime overview](https://ikshitij.com/learn/realtime-collaboration/figma/)
- **Pattern:**
  - **Document ops** (persisted, CRDT-ish tree) **≠ presence** (cursor, selection, viewport).
  - Presence: **never journaled**, broadcast ~**30 Hz**, clients **interpolate** for smooth 60fps display.
  - Each client owns its `(cursor, selection, viewport)`; server relays.

**Takeaway for agents:** A synthetic/agent cursor is just another presence stream with no physical sampling — same wire format, server or agent runtime fills coordinates. Figma plugins (e.g. Phantom Cursor, Figsor) bridge external automation into that presence layer.

---

## Pattern comparison table

| Project | Agent join | Doc sync | Cursor / presence | Agent cursor source |
|---------|------------|----------|-------------------|---------------------|
| **noname E3e** | WS peer (`nag.*`) | Automerge + Yjs | JSON presence + Yjs awareness | Runtime from element / tool step |
| Electric + Yjs | Server Yjs peer | Yjs | Yjs awareness | Tool call → position in doc |
| Motion | MCP / REST → PartyKit | Yjs | Awareness + status | Server/agent client |
| Liveblocks | REST presence + storage | Vendor room | `setPresence` TTL | Server `{ x, y, editingId }` |
| Figma | N/A (humans) | Custom ops | Ephemeral WS ~30Hz | Mouse (agent would set synthetically) |

---

## What “virtual pointer” means in these references

Nobody ships a second cursor system for agents. They:

1. Reuse the **same presence/awareness** fields humans use (`cursor`, `selection`, `user.name`).
2. **Populate them from the agent runtime** when the tool focuses an element or text range.
3. Optionally **interpolate** or **throttle** (Figma ~30Hz) so motion looks smooth.

So “virtual” = **coordinates from code, not from a mouse** — not a different feature.

---

## Recommended mapping → noname E3e

| Reference pattern | Our implementation |
|-------------------|-------------------|
| Agent as CRDT peer | Agent worker WS → `/api/collab/layout/ws` + Yjs richtext WS |
| Same merge as human | Existing Automerge repo hub + `RichTextYjsRoomManager` |
| Presence like human | Same `presence` JSON; `peerKind: "agent"`, `displayName: "Agent: {slug}"` |
| Cursor without mouse | `virtualPointerForElement(elementId)` or TipTap awareness cursor from tool range |
| Status (optional) | `thinking` / `idle` in presence — same as Motion/Electric (future polish) |
| Cold / no human | HTTP draft tools (already shipped) — same as “agent edits with no browser open” |

---

## What we intentionally skip (from references)

| Reference uses | Why we skip |
|----------------|-------------|
| Liveblocks / PartyKit rooms | Self-host + Keto + split Automerge/Yjs |
| Whole-doc Yjs for layout | json-render tree → Automerge (E3 decision) |
| Vendor presence TTL API | We own presence on same layout WS |

---

## Further reading

| Resource | Topic |
|----------|--------|
| [E3e-AGENT-FULL-COLLAB-PEER.md](./E3e-AGENT-FULL-COLLAB-PEER.md) | Our build spec |
| [E3-LIVE-CRDT-COLLAB-IMPLEMENTATION.md](./E3-LIVE-CRDT-COLLAB-IMPLEMENTATION.md) | Human collab stack |
| [Yjs awareness protocol](https://docs.yjs.dev/api/about-awareness) | Rich-text cursor fields |
| [automerge-repo](https://github.com/automerge/automerge-repo) | Layout sync |
