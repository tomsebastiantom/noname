# Verification checklist — headless rich-text/Yjs rewrite + dependency cleanup

**Date:** 2026-08-07
**Status:** automated checks passing; manual checks below still to be run by a human against a real environment (browser + live server), since none of this session's automated tooling can drive a browser or a real WebSocket collab session end-to-end.

## What changed

1. `packages/server/src/domains/agent/collab/agent-richtext-yjs-editor.ts` — rewritten to drop TipTap's `Editor`/`EditorView` and the `happy-dom` DOM shim entirely. It now reads/writes the shared Y.Doc's `"default"` XML fragment directly via `@tiptap/y-tiptap`'s low-level ProseMirror<->Yjs conversion functions (`prosemirrorJSONToYXmlFragment`, `yXmlFragmentToProseMirrorRootNode`) against a `Schema` built once with `getSchema(extensions)`. Public API (`bind`, `applyDocument`, `currentDocument`, `destroy`) is unchanged.
2. `packages/server/package.json` — removed `happy-dom`, `@tiptap/extension-collaboration`, `@tiptap/extension-collaboration-cursor` (all unused after the rewrite); added `@tiptap/y-tiptap` as an explicit dependency (was previously a phantom transitive dep); bumped `hono` to `^4.13.1` and `@hono/node-server` to `^2.1.0`.
3. `packages/client/package.json` — removed a duplicate `@tiptap/y-tiptap` entry (pre-existing bug, unrelated to this rewrite but caught while touching this file).
4. Root `package.json` — added `pnpm.overrides` for `hono`, `undici`, `brace-expansion`, `js-yaml`, `fast-uri`, `adm-zip`, `esbuild`, `uuid`, `postcss`, `sharp` — all were vulnerable transitive versions pulled in by build tooling (`@module-federation/*`, `@opentelemetry/*`, `@mastra/core`'s `ajv`, `postcss-loader`'s `cosmiconfig`, `drizzle-kit`'s `@esbuild-kit/*`, `@automerge/automerge-repo`, `wrangler`'s `miniflare`). `pnpm audit` went from 26 findings (10 high, 16 moderate) to 0.
5. `packages/client/src/editor/agent/format-agent-task-error.ts` and `packages/server/src/domains/agent/agent-task-error.ts` — fixed a pre-existing bug (unrelated to the rewrite, caught by the full test run) where a bare `Assertion failed` message with no collab/automerge/layout keyword was mislabeled as a "live collaboration sync conflict" instead of a generic internal error.

## Automated checks already run (all passing)

- `pnpm -r exec tsc --noEmit` — clean across all 10 workspace packages.
- `pnpm vitest run` (full monorepo) — 459/459 passing, including `agent-richtext-yjs-editor.test.ts`'s two-editor live-merge round-trip test.
- `pnpm audit` — 0 vulnerabilities (was 26).
- `pnpm fix` (biome) — clean.

## Addendum (2026-08-07, later same day): collab horizontal-scaling relay

Separately from the rewrite above, `packages/server/src/domains/collab/collab-redis-relay.ts` was added and wired into both room managers (`richtext-yjs-room.ts`, `layout-room.ts`) to fix [`ACTION-PLAN.md` #7](./ACTION-PLAN.md) — collab rooms were process-local `Map`s with no cross-replica sync. Automated coverage: `collab-redis-relay.test.ts` (pub/sub + self-echo filtering, mocked `ioredis`) and `richtext-yjs-room.test.ts` (local update → relay publish, relay message → applied to local room + forwarded to local peers) — both passing. The Automerge/layout side reuses the exact `Automerge.merge()` idiom already used elsewhere in that file, but has no automated test (would need a mocked/real Postgres for `PostgresAutomergeStorageAdapter` — out of scope for this pass).

**Additional manual checks needed**, on top of the ones below:

- [ ] **Real 2-replica cross-replica collab smoke test** (the thing none of this session's tooling can actually exercise): run two API processes locally against the same Redis, open the same rich-text field's editor in two browser tabs each pointed at a different replica (e.g. via two different ports), edit in one tab, confirm the edit appears in the other tab within roughly a second. Repeat for a layout document in the visual editor.
- [ ] **Redis-down fallback for collab** (not just event-bus/SSE): stop Redis, confirm both room managers keep working *within* a single replica (local WS peers still sync with each other — this should be unaffected, since the relay is additive) and that server startup doesn't crash on `initCollabRedisRelay()` failing to connect.
- [ ] **Pre-existing gap, flagged not fixed**: rich-text Yjs rooms have no Postgres-hydration step on room creation (`getOrCreateRoom` in `richtext-yjs-room.ts` always starts from a blank `Y.Doc()`) — confirmed pre-existing, not introduced by the relay work, but worth deciding whether to fix now that rooms can legitimately be created independently on different replicas for the same document. Layout rooms don't have this gap (they already load from Postgres/Automerge chunks in `loadRoom`).

## Manual checks still needed

These exercise real network/browser paths the automated suite above doesn't cover (no live WebSocket server, no browser, no real AI agent run).

### API / server-side

- [ ] **Agent rich-text collab session, end to end**: trigger the `updateDraftField` Mastra tool (or whatever surfaces it — an agent chat run that edits a rich-text CMS field) against a content entry with an **open editor tab on that same entry**, and confirm:
  - The agent's edit lands in the open editor's rich-text field live, without a page refresh.
  - Re-opening the entry (fresh page load, no live session) shows the same persisted content — confirms `currentDocument()`'s read path (`yXmlFragmentToProseMirrorRootNode` → `tipTapJsonToRichText`) round-trips correctly through the documents domain's save path, not just in-memory.
  - Formatting survives round-trip: **bold**, *italic*, underline, a link, a heading, a table (multi-row/col), and at least one embed (`embeddedAssetBlock`/`embeddedEntryBlock`/`embeddedVideoBlock`/inline variants) — these are the node/mark types in `AGENT_RICHTEXT_EXTENSIONS` most likely to reveal a schema mismatch between the old `Editor`-based path and the new headless one.
- [ ] **Concurrent human + agent edit**: with a human actively typing in the field's rich-text editor, have the agent apply an edit via the same session. Confirm both edits merge (no data loss, no dropped keystrokes) — this is the actual scenario `prosemirrorJSONToYXmlFragment`'s incremental diff-against-live-fragment behavior is supposed to preserve.
- [ ] **Awareness/presence**: confirm the agent still shows up in the collaborators list (cursor/name badge) while an agent rich-text session is open — `bind()` still calls `collab.awareness.setLocalStateField("user", ...)`, but there's no automated test for this since it's UI presence, not persisted state.
- [ ] **Session teardown**: run an agent rich-text edit, then let the session idle past its natural disconnect (or explicitly end the agent run) and confirm `destroy()` cleanly tears down — no lingering WS connection, no server-side memory growth from repeated agent sessions (watch server logs/process for leaks across ~10 consecutive agent edits).
- [ ] **`hono`/`@hono/node-server` bump (`4.12.23` → `4.13.1`, `2.0.8` → `2.1.0`)**: smoke-test the main HTTP surface — a few `/api/edge/schema/:siteId` requests, an admin API call, and the collab WS upgrade route (`/api/collab/richtext/ws/:room`) — to confirm the routing/middleware/WS-upgrade behavior didn't shift between patch versions.
- [ ] **`pnpm.overrides` sanity** (`uuid` and `sharp` are the riskiest — both jumped a major version): confirm `@automerge/automerge-repo`-backed flows (layout collab / visual editor autosave) still generate valid document IDs, and that `packages/workers` (wrangler/miniflare dev flow, if used) still starts and serves requests locally.

### UI / client-side

- [ ] **Rich-text field editing in the CMS admin** (`RichTextFieldInput.tsx` → `RichTextTipTapEditor.tsx`): open a content entry, edit a rich-text field manually (no agent involved), save, reload — confirms the **client-side** TipTap editor (unaffected by this rewrite) still round-trips correctly against documents saved with the new agent-side path, i.e. content the agent wrote is fully readable/editable by the human-facing editor and vice versa.
- [ ] **Visual editor** (`VisualEditorShell.tsx`) — general smoke test: open the editor, make a layout change, revert, confirm no console errors — this file's only connection to this session's work is the earlier `Spec`-cast typecheck fix, not the Yjs rewrite, but worth a quick pass since it's in the same collab/editor surface area.
- [ ] **Remote cursors** (`y-tiptap-collaboration-cursor.ts`, client-only): with two browser sessions editing the same rich-text field, confirm cursors/selections still render for each other — this code path is untouched, but it shares the same Yjs `"default"` XML fragment convention the rewritten server code now writes to directly, so it's the most likely place a subtle fragment-shape mismatch would surface visually (e.g. marks in the wrong order, missing attrs).
- [ ] **Error-message copy change**: trigger a live-collaboration conflict from the UI (or just inspect the agent task error surface after a forced failure) and confirm the new copy — *"The agent hit an internal error while working on this task. Refresh the page, then try again."* for generic assertion failures vs. *"The layout could not be updated safely while live collaboration was active..."* for collab-specific ones — reads sensibly in context and isn't hardcoded/tested against elsewhere in the UI (only the two `.test.ts` files above assert on this string).

## Why this list, not a broader regression pass

Everything not listed above (auth, content types, page tree, flags, commerce, analytics, webhooks, etc.) has no code path through the files touched in this session and is already covered by the passing automated suite — this list is scoped to what the rewrite + dependency changes could plausibly have broken, not a full regression sweep.
