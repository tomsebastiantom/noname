# Visual editor & collab — feature inventory (API + UI)

> **Date:** 2026-08-06  
> **Scope:** Everything explicitly built for live editing, collab, and agent co-editing — what is **live in dev** vs **built but unverified** vs **not shipped**.  
> **Smoke results:** [`COLLAB-LOCAL-SMOKE-RESULTS.md`](./COLLAB-LOCAL-SMOKE-RESULTS.md) · **Incident fixes:** [`COLLAB-SYNC-INCIDENT-FIXES.md`](./COLLAB-SYNC-INCIDENT-FIXES.md)  
> **Platform-wide status:** [`MASTER-STATUS.md`](./MASTER-STATUS.md)

## How to read status labels

| Label | Meaning |
|-------|---------|
| **Live** | Code merged; enabled automatically in dev when conditions met (usually `?edit=true`) |
| **Live (dev only)** | Works on localhost; prod wiring (edge WS, secrets) may differ |
| **Built** | Implemented in repo; needs manual smoke or prod deploy to call “done” |
| **Partial** | Works with known gaps (documented below) |
| **Not live** | Spec’d, deferred, or blocked |

**Collab gate:** There is no `?collab=1` flag anymore. Layout collab is **always on** when the visual editor loads a layout draft (`collabEnabled` in `use-edit-page-orchestration.ts`).

---

## At a glance

| Track | API | UI | Smoke |
|-------|-----|-----|-------|
| **E3** — Layout Automerge collab | **Live** | **Live** | Steps 2–4 **PASS** |
| **E3c** — Presence / cursors | **Live** | **Live** | Step 3 **PASS**; step 7 **DEFER** |
| **D7** — Rich text Yjs collab | **Live** | **Live** | Not run this session |
| **E3e** — Agent full collab peer | **Built** | **Built** | Acceptance **open** |
| **Agent panel (chat)** | **Live** | **Live** | Mock LLM path tested |
| **Edge WS proxy** | **Live in dev** | n/a | Smoke **PASS** — 5173 → 8787 → 3000 |

---

## 1. Layout live collab (E3)

### API — live

| Feature | Endpoint / module | Status |
|---------|-------------------|--------|
| Collab ticket mint | `POST /api/collab/layout/ticket` | **Live** |
| Layout WS room | `WS /api/collab/layout/ws/:layoutDocumentId?collab_ticket=…` | **Live** — browser path `:5173 → :8787 → :3000` |
| Automerge-repo hub | `LayoutCollabRoomManager` — `packages/server/src/domains/collab/layout-room.ts` | **Live** |
| CBOR sync + JSON presence on same socket | `LayoutCollabNetworkAdapter` | **Live** |
| Keto gate before join | `canEditLayoutDocument` | **Live** |
| Incremental spec ops | `applyLocalSpecToDraft`, `pushLocalSpecChange`, list ops | **Live** |
| Debounced Postgres persist | `persistRoom` (~5s) + flush on last peer leave | **Live** |
| CRDT chunk storage | Postgres (`collab_automerge_chunks`); optional R2 adapter | **Live** (Postgres default) |
| Cross-parent reparent | Whole-spec merge | **Partial** — works; dedicated list ops optional |
| `handle.change()` fan-out | Client + server + agent session | **Live** — required for peer sync |

### UI — live

| Feature | Component / hook | Status |
|---------|------------------|--------|
| Auto-connect in edit mode | `useLayoutCollab` via `use-edit-page-orchestration` | **Live** |
| Live edits → canvas without Save | `applyLocalSpec` on every local spec change | **Live** — smoke **PASS** |
| Unique peer per tab | `layout-client-${uuid}` | **Live** |
| IndexedDB offline blobs | `createAutomergeIndexedDbStorage` | **Live** |
| Post-connect sync wait | `waitForPostConnectSync` (~400ms) | **Live** |
| Pending edit queue before connect | `pendingLocalSpecRef` | **Live** |
| WS reconnect with backoff | `use-layout-collab.ts` | **Live** |

### Not live / gaps

| Gap | Notes |
|-----|-------|
| Prod deploy smoke | Same code path as local edge proxy — **smoke PASS** through `:8787` (see [`COLLAB-LOCAL-SMOKE-RESULTS.md` § step 8](./COLLAB-LOCAL-SMOKE-RESULTS.md#step-8--collab-websocket-through-edge-worker-8787)) |
| Multi-API Automerge fan-out | Single-process room only — Redis cross-node **not live** |
| Save vs collab boundary | Save/Publish still HTTP; collab room can hold unsaved edits — **Save draft smoke not run** |

---

## 2. Presence & cursors (E3c)

### API — live

| Feature | Module | Status |
|---------|--------|--------|
| Presence join / update / sync | `presence.ts` — JSON messages on layout WS | **Live** |
| Per-recipient peer list | `collabPeersForRecipient()` — hides same-user other tabs | **Live** |
| `peerKind: human \| agent` | Ticket + join metadata | **Live** |
| Agent task push | `{ type: "agent-task", phase: started\|ended }` broadcast | **Live** |
| Invalid peer prune | `pruneInvalidHumanPeers`, `displayName` required on ticket | **Live** |
| Same-user multi-tab WS | Evict dead sockets only (`evictDeadPeersForUser`) | **Live** |

### UI — live

| Feature | Component | Status |
|---------|-----------|--------|
| Live presence bar | `CollabPresenceBar` in `SaveBar` | **Live** |
| You · Editing alone | When no remote peers | **Live** — smoke **PASS** |
| Human / agent grouping + counts | `CollabPresenceBar` + `collab-peer-display.ts` | **Live** |
| Remote selection outline | `EditorCanvas` — any peer with `selectedElementId` | **Live** |
| Remote canvas cursors | `CollabRemoteCursors` — **humans only** | **Live** |
| Cursor anchor on selection | `EditorCanvas` reports pointer on select | **Live** |
| No synthetic agent Live chip | Removed poll / fake peer merge | **Live** |

### Partial / not live

| Gap | Notes |
|-----|-------|
| Simultaneous two-user names in Live | **DEFER** — needs two browser profiles ([smoke step 7](./COLLAB-LOCAL-SMOKE-RESULTS.md#step-7--simultaneous-two-user-live--cursors)) |
| Stale Collaborator after quick sign-out | **Partial** — brief ghost possible when prior session WS not torn down yet |
| Reorder / reparent two-tab smoke | **Not run** this session |

---

## 3. Rich text live collab (D7)

Separate CRDT path from layout — **Yjs + TipTap**, not Automerge.

### API — live

| Feature | Module | Status |
|---------|--------|--------|
| Rich text ticket | `POST /api/collab/richtext/ticket` | **Live** |
| Yjs WS room | `WS /api/collab/richtext/ws/:roomName?collab_ticket=…` | **Live (dev direct)** |
| Room manager | `createRichTextYjsRoomManager` | **Live** |
| Debounced Postgres snapshot from Yjs | Same pattern as layout (~5s) | **Live** |
| Agent Yjs session | `AgentRichTextCollabSession` + headless TipTap | **Built** |
| Agent skip redundant HTTP | `updateDraftField` → `via: "collab"` when room active | **Built** |

### UI — live

| Feature | Component | Status |
|---------|-----------|--------|
| TipTap + Collaboration | `RichTextTipTapEditor` | **Live** |
| Collaboration cursor (remote) | `richTextCollabExtensions` / `CollaborationCursor` | **Live** |
| Collab hook | `useRichTextCollab` | **Live** |
| Client IndexedDB Yjs persist | Wired in rich-text collab hook | **Live** |
| Props panel wiring | `contentDocumentId` passed for collab room name | **Live** |

### Not live / gaps

| Gap | Notes |
|-----|-------|
| Two-tab rich text smoke | **Not run** — see [`COLLAB-PROD-SMOKE.md`](./COLLAB-PROD-SMOKE.md) |
| Multi-server Yjs (Redis) | **Not live** — in-memory per API process |
| Rich text in layout props (Hero subtitle) | Layout fields stay **text/longText** — rich text is **CMS content entries** only |

---

## 4. Agent full collab peer (E3e)

### API — built (orchestrate path)

| Feature | Module | Status |
|---------|--------|--------|
| Layout collab session | `AgentLayoutCollabSession` — WS join, presence, `focusElement` | **Built** |
| Spec writes via server room | `patchLayoutDraft` → `layoutCollabRooms.applySpec` (not agent ephemeral Repo) | **Built** |
| No HTTP double-write on live path | Collab success skips `layout.update` | **Built** |
| Rich text collab session | `AgentRichTextCollabSession` | **Built** |
| Ticket refresh (60s TTL) | `scheduleCollabTicketRefresh` | **Built** |
| Agent task lifecycle push | `executor.ts` → `agent-task` WS message | **Built** |
| LLM spec normalize | `normalizeLayoutSpec` (Text `props.labels.content`) | **Built** |
| Revert layout patch | `revert-layout-patch.ts` + collab `applySpec` | **Built** |
| Keto + `nag.*` auth | Same as human collab tickets | **Built** |
| Cold path (no human open) | HTTP `layout.update` / `content.updateById` | **Live** |

### UI — built

| Feature | Component | Status |
|---------|-----------|--------|
| Agent in Live bar (real WS peer) | `CollabPresenceBar` — `peerKind: agent` styling | **Built** |
| Agent selection outline | `EditorCanvas` remote outlines | **Built** |
| No agent virtual cursor | `CollabRemoteCursors` filters agents out | **Built** |
| Agent panel — chat thread | `AgentPanel` + `use-editor-agent-panel` | **Live** |
| Run agent from editor | `AgentPanel` — agent select + prompt | **Live** |
| Target field wiring | `targetFieldKey` + `targetLocale` from focused rich-text field | **Built** |
| Prompt prefill | Template + selection + field excerpt | **Built** |
| Agent activity (push, not poll) | `agentTaskActivity` from WS `agent-task` message | **Built** |
| Live steps / undo hints | `AgentAssistantBubble`, `AgentLiveSteps` | **Live** |
| Right rail Assistant tab | `EditorLayout` + `EditorAgentPanelSlot` | **Live** |

### E3e acceptance — not fully verified

From [`E3e-AGENT-FULL-COLLAB-PEER.md`](./E3e-AGENT-FULL-COLLAB-PEER.md) — all still **open** for manual E2E:

- [ ] Human + agent same layout → canvas updates live
- [ ] `Agent: {slug}` in Live bar for task duration
- [ ] Remote selection outline on agent-edited elements
- [ ] Rich text collaboration cursor for agent
- [ ] Concurrent human + agent merge without silent overwrite
- [ ] `document_ops` with `actorType=agent`, `taskId`
- [ ] V4 live LLM orchestrate (≥3 tools) — blocked on Vault key / `MASTRA_ORCHESTRATE_MOCK=false`

**Default dev path:** `MASTRA_ORCHESTRATE_MOCK=true` — agent tasks run without real LLM.

---

## 5. Visual editor UI (non-collab, shipped)

These ship with the editor shell and work independently of collab.

| Feature | Status | Notes |
|---------|--------|-------|
| `?edit=true` edit mode | **Live** | Scope banner, Save bar, Exit edit |
| Blocks palette | **Live** | Add components |
| Layers panel | **Live** | Reorder, select, delete |
| Props panel | **Live** | Layout + content fields |
| Desktop / tablet / mobile preview | **Live** | Canvas preview bar |
| Save draft / Publish / Discard | **Live** | If-Match 409 on conflict |
| RBAC Publish | **Live** — smoke **PASS** | Editor disabled; admin enabled |
| Duplicate block (⌘D) | **Live** | Prior smoke |
| Undo/redo | **Live** | Client history; collab merges are separate |
| Editor prefs (chrome collapse) | **Live** | IndexedDB / API |
| Shell labels from layout seed | **Live** | `visual_editor` template |

---

## 6. Agent HTTP API (non-collab)

| Feature | Endpoint | Status |
|---------|----------|--------|
| Registry CRUD | `/api/agents/registry` | **Live** |
| Mint agent token | `POST /api/agents/registry/:id/token` | **Live** |
| Create task | `POST /api/agents/tasks` | **Live** |
| Poll task status | `GET /api/agents/tasks/:id` | **Live** |
| Approve / reject | Task review endpoints | **Live** |
| BullMQ worker | In-process with API | **Live** |
| Mastra orchestrate executor | `packages/server/src/domains/agent/mastra/executor.ts` | **Built** — mock default |
| LiteLLM base URL | `OPENAI_BASE_URL` + `resolve-planner-model` | **Built** — optional local :4000 |

---

## 7. Edge & infrastructure

| Feature | Where | Status |
|---------|-------|--------|
| WS upgrade proxy | `packages/workers/src/routes/proxy-websocket.ts` | **Live in dev** — smoke PASS |
| Collab ticket HMAC | `collab-ticket.ts` | **Live** |
| Browser collab path | `:5173` rspack proxy → `:8787` edge → `:3000` API | **Live** |
| Server-side agent WS | `ws://127.0.0.1:3000/...` (Node only) | **Live** — bypasses edge by design |
| Postgres Automerge chunks | `collab_automerge_chunks` | **Live** |
| R2 Automerge chunks | `r2-automerge-chunk-store.ts` | **Built** — env-gated |
| Redis Yjs fan-out | — | **Not live** |

---

## 8. Persistence model (what “live” means vs Save)

| Layer | Live while editing | After Save draft | After Publish |
|-------|-------------------|------------------|---------------|
| **Automerge room** | In-memory + WS + debounced Postgres chunks | Room may still hold unsaved merges | Publish replaces validated spec |
| **React `storedSpec`** | Immediate UI | Synced from HTTP on save/reload | Published version |
| **Postgres `documents.data.spec`** | Updated on debounced persist + Save | Source of truth for reload | Published snapshot |
| **Yjs rich text room** | In-memory + debounced content snapshot | Save / room persist | Publish boundary unchanged |

**Important:** Collab sync ≠ Save. Toolbar **Unsaved changes** is expected while peers edit without Save.

---

## 9. Summary — what is NOT live yet

| Item | API | UI | Blocker |
|------|-----|-----|---------|
| Simultaneous two-user presence + cursors | Built | Built | Manual test (two profiles) |
| E3e agent + human E2E acceptance | Built | Built | Manual smoke + V4 LLM |
| V4 live LLM orchestrate | Built | Built | Vault LLM key, mock off |
| Collab through edge worker | **Live in dev** | n/a | Smoke **PASS** — prod deploy still needed |
| Multi-API collab (Redis) | Not built | n/a | Infra |
| Rich text two-tab + persist smoke | Built | Built | Manual |
| Layout reorder/reparent two-tab smoke | Built | Built | Manual |
| Save draft after collab session smoke | Built | Built | Manual |
| `scripts/collab-two-user-smoke.cjs` | Partial | n/a | Automerge WASM in Node |
| ZITADEL R6/R7 agent OAuth per agent | Not built | n/a | A3 decision — platform `nag.*` is v1 |

---

## 10. Key file index

| Area | Path |
|------|------|
| Client layout collab | `packages/client/src/editor/collab/use-layout-collab.ts` |
| Client orchestration | `packages/client/src/editor/hooks/use-edit-page-orchestration.ts` |
| Client presence UI | `packages/client/src/editor/components/shell/CollabPresenceBar.tsx` |
| Client agent panel | `packages/client/src/editor/hooks/use-editor-agent-panel.ts` |
| Rich text collab | `packages/client/src/components/rich-text/use-rich-text-collab.ts` |
| Server layout room | `packages/server/src/domains/collab/layout-room.ts` |
| Server presence | `packages/server/src/domains/collab/presence.ts` |
| Server collab routes | `packages/server/src/domains/collab/routes.ts` |
| Agent layout session | `packages/server/src/domains/agent/collab/agent-layout-collab-session.ts` |
| Agent patch tool | `packages/server/src/domains/agent/mastra/tools/patch-layout-draft.ts` |
| Agent executor | `packages/server/src/domains/agent/mastra/executor.ts` |

---

## 11. Verify locally

```bash
pnpm dev
# Optional: pnpm --filter @noname/workers dev

# Unit tests
npm test -- packages/client/src/editor/collab packages/server/src/domains/collab

# Manual: http://yogastore.localhost:5173/?edit=true
# admin@zitadel.localhost / NonameAdmin1!
# editor@zitadel.localhost / NonameEditor1!
```

See **[7-step smoke checklist](./COLLAB-LOCAL-SMOKE-RESULTS.md)** and **[prod smoke](./COLLAB-PROD-SMOKE.md)** for full acceptance.
