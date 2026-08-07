# Manual verification checklist (living doc)

A running log of manual API/UI checks needed after architecture fixes and cleanup — the things automated tests in this repo can't fully cover (real browsers, real multi-process/multi-replica behavior, real third-party registries/infra, real timing/concurrency). Add a new dated section per change instead of rewriting old ones.

**How to use this doc:**
- When you land an architecture fix/refactor/cleanup, add a section below (newest on top).
- Cover **everything the change touches, no exceptions** — including areas that already have automated unit/integration tests. Automated tests run against mocks/fakes (fake Redis, fake WebSocket, in-memory docs); manual checks are what confirm the real thing behaves the same way end to end. "It has a passing unit test" is not a reason to skip a manual entry here.
- Split each entry into **API** and **UI** subsections — even if one side is thin, keep the heading and say why (e.g. "no user-facing surface — internal relay only") rather than omitting it.
- Check items off (`[x]`) as they're verified, and note the date/result inline rather than deleting the line, so this stays a record, not just a to-do list.

---

## 2026-08-07 — Collab horizontal-scaling relay (Redis-backed shared room state)

New `packages/server/src/domains/collab/collab-redis-relay.ts`, wired into both `richtext-yjs-room.ts` (Yjs) and `layout-room.ts` (Automerge), plus `initCollabRedisRelay()` added to server boot. Automated tests exist (`collab-redis-relay.test.ts`, `richtext-yjs-room.test.ts`, full monorepo typecheck/test run) but all use fakes (in-memory pub/sub, mocked WS, mocked relay module) — none of them run two real processes against a real Redis, so every item below still needs a human.

**API (server-side):**
- [ ] Two real API processes against one real Redis (Dragonfly): edit a rich-text field via the collab WebSocket on replica A, confirm the update lands in a second connection on replica B.
- [ ] Same 2-replica setup for the layout/Automerge room: apply a spec change via replica A's `/api/collab/layout/ws`, confirm replica B's room converges to the same spec.
- [ ] Redis down at boot: stop Redis before starting the server, confirm `initCollabRedisRelay()` fails silently (no crash) and single-replica collab still works locally (matches existing `event-bus`/`sse-manager` fallback behavior).
- [ ] Redis dies mid-session (not just at boot): kill Redis while two replicas have an active shared room, confirm each replica degrades to local-only collab rather than throwing/crashing on the next publish.
- [ ] Agent-driven edit (`updateDraftField` tool) against a rich-text session hosted on replica A, with a human's browser connected to replica B — confirms the agent→editor live-push path survives the replica boundary, not just human→human.
- [ ] Confirm the existing debounced Postgres persist (`persistRoom` in both room managers) still fires correctly when peers are split across replicas — i.e. persistence isn't accidentally tied to "all peers on one process."
- [ ] Confirm presence/awareness (who's editing) is NOT expected to cross replicas for layout rooms — `broadcastAgentTask`/`peerMeta` in `layout-room.ts` are still process-local; verify this is an acceptable known limitation, not a silent bug, when peers land on different replicas.

**UI (client-side):**
- [ ] Two browser tabs, each manually pointed at a different local API port (simulating two replicas with no LB affinity): edit the same rich-text field in one tab, confirm the other tab's editor updates live (~1s).
- [ ] Same two-tab setup on the visual editor for a layout document — confirm the spec change renders live in the other tab.
- [ ] Remote cursors (`y-tiptap-collaboration-cursor.ts`) across the two tabs/replicas — confirm cursor position still renders correctly (this path is unchanged by the relay, but it's the most likely place a subtle cross-replica ordering issue would show up visually).
- [ ] Kill/restart one replica mid-session (simulating a rolling deploy) with a browser tab connected to it — confirm the client reconnects and resyncs cleanly rather than showing stale or silently diverged content.
- [ ] Confirm no new console errors/warnings in either tab during the above — the relay changes touch `doc.on("update")`/`handle.on("change")` handlers that fire on every edit, so a silent double-fire or infinite-loop bug would likely show up as WS message spam or visible input lag before anything else.

Background/decision writeup: [`2026-08-07/RICHTEXT-YJS-REWRITE-VERIFICATION.md`](./2026-08-07/RICHTEXT-YJS-REWRITE-VERIFICATION.md) § Addendum; decision record: [`2026-08-07/ACTION-PLAN.md`](./2026-08-07/ACTION-PLAN.md) #7.

---

## 2026-08-07 — Headless rich-text/Yjs editor rewrite + dependency/security cleanup

`AgentRichTextYjsEditor` rewritten to drop `happy-dom`/TipTap `Editor` (now reads/writes the Yjs `Y.XmlFragment` directly via `@tiptap/y-tiptap`'s low-level conversion functions). Alongside it: removed unused `happy-dom`/`@tiptap/extension-collaboration`/`@tiptap/extension-collaboration-cursor` from `packages/server`, fixed a duplicate `@tiptap/y-tiptap` key in `packages/client/package.json`, bumped `hono` (`4.12.23`→`4.13.1`) and `@hono/node-server` (`2.0.8`→`2.1.0`), added `pnpm.overrides` for `undici`/`brace-expansion`/`js-yaml`/`fast-uri`/`adm-zip`/`esbuild`/`uuid`/`postcss`/`sharp`/`hono` clearing all 26 `pnpm audit` findings, and fixed a pre-existing bug in `format-agent-task-error.ts`/`agent-task-error.ts` (generic assertion failures were mislabeled as collab sync conflicts).

**API (server-side):**
- [ ] Agent rich-text edit end to end (`updateDraftField` tool → `AgentRichTextCollabSession` → rewritten `AgentRichTextYjsEditor`) against a content entry with an open editor session — confirm the edit lands live, and confirm formatting survives: **bold**, *italic*, underline, a link, a heading, a multi-row/col table, and at least one embed (`embeddedAssetBlock`/`embeddedEntryBlock`/`embeddedVideoBlock`/inline variants).
- [ ] Reload the entry with no live session open and confirm the same content persisted correctly (exercises `currentDocument()`'s read path — `yXmlFragmentToProseMirrorRootNode` → `tipTapJsonToRichText` — through the real documents-domain save path, not just in-memory).
- [ ] Concurrent human + agent edit on the same field — confirm both merge without dropped keystrokes or data loss.
- [ ] Awareness/presence: confirm the agent still shows up as a collaborator (cursor/name badge) while a session is open — `bind()` still calls `setLocalStateField`, but nothing automated asserts on it.
- [ ] Session teardown: run ~10 consecutive agent edits, confirm `destroy()` cleanly tears down each time — no lingering WS connections, no server memory growth.
- [ ] Smoke-test the bumped HTTP surface: a few `/api/edge/schema/:siteId` calls, an admin API call, and the collab WS upgrade route (`/api/collab/richtext/ws/:room`) — confirm routing/middleware/WS-upgrade behavior is unchanged between the old and new `hono`/`@hono/node-server` patch versions.
- [ ] Sanity-check the riskiest `pnpm.overrides` jumps (`uuid` 9→11, `sharp` major bump): confirm `@automerge/automerge-repo`-backed flows (layout collab/autosave) still generate valid document IDs, and that `packages/workers` (wrangler/miniflare dev flow, if used) still starts and serves requests locally.

**UI (client-side):**
- [ ] Manual rich-text field editing in the CMS admin (`RichTextFieldInput.tsx` → `RichTextTipTapEditor.tsx`, no agent involved) — edit, save, reload — confirms the client-side TipTap editor still round-trips against content the new agent-side path wrote, and vice versa.
- [ ] Remote cursors (`y-tiptap-collaboration-cursor.ts`) with two browser sessions on the same rich-text field — confirm cursors/selections still render correctly for each other (untouched code, but shares the same Yjs `"default"` XML fragment the rewritten server code now writes to directly — the most likely place a subtle fragment-shape mismatch would surface visually, e.g. marks in the wrong order or missing attrs).
- [ ] Visual editor (`VisualEditorShell.tsx`) general smoke test — open, make a layout change, revert, confirm no console errors.
- [ ] Trigger a live-collaboration conflict from the UI (or force one) and confirm the new copy reads sensibly in context: *"The agent hit an internal error while working on this task..."* for generic assertion failures vs. *"The layout could not be updated safely while live collaboration was active..."* for collab-specific ones.

Full background: [`2026-08-07/RICHTEXT-YJS-REWRITE-VERIFICATION.md`](./2026-08-07/RICHTEXT-YJS-REWRITE-VERIFICATION.md).

---

<!--
Template for new entries — copy below the "How to use this doc" note (newest section on top).
Cover everything the change touches, API and UI both, regardless of existing automated coverage:

## YYYY-MM-DD — <short change description>

<1-2 sentence summary of what changed and why, plus what automated tests already exist for it.>

**API (server-side):**
- [ ] <manual check 1>

**UI (client-side):**
- [ ] <manual check 1>

(Link to a fuller writeup in a dated docs/ folder if one exists, rather than duplicating detail here.)
-->
