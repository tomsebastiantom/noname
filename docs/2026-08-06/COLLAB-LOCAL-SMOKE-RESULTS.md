# Collab local smoke — results (7 steps)

> **Date:** 2026-08-06  
> **Environment:** local dev — API `:3000`, client `:5173`, edge `:8787` (browser WS goes **5173 → 8787 → 3000**)  
> **Page:** home layout — `http://yogastore.localhost:5173/?edit=true`  
> **Layout document ID:** `76f12abf-8bbb-4896-a99e-88ae8b466e11`  
> **Tester:** Cursor browser + manual confirmation  
> **Related:** [`COLLAB-SYNC-INCIDENT-FIXES.md`](./COLLAB-SYNC-INCIDENT-FIXES.md) · [`COLLAB-PROD-SMOKE.md`](./COLLAB-PROD-SMOKE.md) · [`E3-AUTOMERGE-REPO.md`](./E3-AUTOMERGE-REPO.md)

## Demo credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@zitadel.localhost` | `NonameAdmin1!` |
| Editor | `editor@zitadel.localhost` | `NonameEditor1!` |

## Prerequisites (verified up)

```bash
pnpm dev                          # API :3000 + client :5173
pnpm --filter @noname/workers dev # edge :8787
pnpm seed:demo                    # demo users + home layout
```

---

## Summary

| Step | Scenario | Result |
|------|----------|--------|
| 1 | Automated collab unit tests | **PASS** |
| 2 | Same-user two-tab layout text sync (no Save) | **PASS** |
| 3 | Same-user Live bar — no ghost Collaborator | **PASS** |
| 4 | Two-user cross-account sync (sequential, no Save) | **PASS** |
| 5 | RBAC — editor vs admin Publish | **PASS** |
| 6 | Presence clears after peer disconnect | **PASS** |
| 7 | Simultaneous two-user Live + cursors | **DEFER** |
| 8 | Collab WS through edge worker (`:8787`) | **PASS** |

**Overall:** Core layout collab path is **green** for same-user multi-tab and sequential two-user sync. Step 7 needs two browser profiles or a working Node WS smoke script. Step 8 confirms the **normal browser path** (5173 → edge → API) for collab WS.

---

## Step 8 — Collab WebSocket through edge worker (`:8787`)

**Why the edge worker exists:** In production the browser only talks to the **storefront origin** (Cloudflare Worker). The worker resolves tenant from `Host`, validates JWT / collab ticket, adds HMAC headers, and **proxies the WS upgrade** to the Node API. Local dev mirrors that: rspack devServer proxies `/api` (including WS) to `:8787` — see `packages/client/rspack.config.mjs`.

**Path (browser, normal dev):**

```
Browser ws://yogastore.localhost:5173/api/collab/layout/ws?collab_ticket=…
  → rspack proxy (ws: true)
  → edge worker :8787 (proxy-websocket.ts)
  → Node API :3000 (LayoutCollabRoomManager)
```

**Only bypasses edge:** server-side Node clients (e.g. agent worker, smoke scripts) use `ws://127.0.0.1:3000/...` directly.

**Steps verified (2026-08-06):**

1. `pnpm --filter @noname/workers dev` — worker listening on `:8787`
2. Login + mint ticket via `http://127.0.0.1:8787/api/...` with `Host: yogastore.localhost`
3. WS connect to `ws://127.0.0.1:8787/api/collab/layout/ws?collab_ticket=…` → **OPEN** + CBOR sync messages
4. Same via `ws://127.0.0.1:5173/api/collab/...` (rspack proxy) → **OPEN** + data
5. Browser `?edit=true` on `:5173` — Live connected, editor loads

**Result:** **PASS** — edge WS proxy is required for prod and **is** the normal local dev path; not a separate untested track.

---

## Step 1 — Automated collab unit tests

**Command:**

```bash
npm test -- packages/client/src/editor/collab packages/server/src/domains/collab
```

**Result:** **PASS** — 9 files, 32 tests (2026-08-06).

Covers: `remoteCollabPeers`, `collabPeersForRecipient`, `agent-task` message parse, peer display partition/dedupe, automerge `pushLocalSpecChange`, `applyLocalSpecToDraft`.

---

## Step 2 — Same-user two-tab layout text sync (no Save)

**Steps:**

1. Log in as `admin@zitadel.localhost`.
2. Open `http://yogastore.localhost:5173/?edit=true` in **tab A**.
3. Open the same URL in **tab B** (same browser).
4. In tab A, edit promo/header Text block content.
5. Confirm tab B updates within ~1s **without** Save draft.

**Expected:** Both tabs show the same canvas text; toolbar may show **Unsaved changes**.

**Result:** **PASS** (confirmed after `handle.change()` fix — local edits now fan-out via automerge-repo `DocSynchronizer`).

**Root cause fixed:** Local applies used `handle.update()`; peers only receive sync on `handle.change()`. See [`E3-AUTOMERGE-REPO.md` § Local edits must use `change`, not `update`](./E3-AUTOMERGE-REPO.md#local-edits-must-use-change-not-update).

---

## Step 3 — Same-user Live bar (no ghost Collaborator)

**Steps:**

1. With both tabs open (step 2), check the **Live** presence bar in each tab.
2. Edit in either tab; re-check Live bar.

**Expected:** Each tab shows **`Live · You · Editing alone`**. Own other tabs must **not** appear as **Collaborator** (Google Docs style: sync yes, extra chip no).

**Result:** **PASS** after server `collabPeersForRecipient()` + client `sessionUserId()` refresh on each `presence-sync`.

**Note:** Before the fix, tab B showed **Collaborator** = own tab A with stale/missing `displayName` filter.

---

## Step 4 — Two-user cross-account sync (sequential, no Save)

**Steps:**

1. Sign out admin. Log in as **`editor@zitadel.localhost`**.
2. Open `?edit=true`. Change promo Text to a distinctive string, e.g. **`Editor user live test — two-user collab OK`**.
3. Confirm canvas updates live; **Unsaved changes** shown.
4. Sign out editor. Log in as **`admin@zitadel.localhost`**.
5. Open `?edit=true` again **without** Save from step 2.

**Expected:** Admin sees editor’s promo text from the **server collab room** (Automerge), not from Postgres draft.

**Result:** **PASS** (Cursor browser, 2026-08-06).

| Check | Observed |
|-------|----------|
| Editor edit live on canvas | Yes |
| Admin sees editor text without Save | Yes — heading showed **Editor user live test — two-user collab OK** |
| Toolbar | **Unsaved changes** (collab ≠ persisted draft) |

**Limitation:** Sequential sign-out/sign-in, not simultaneous. Proves room retention across sessions; does not prove both names in Live at once.

---

## Step 5 — RBAC (editor vs admin Publish)

**Steps:**

1. As **editor**, open `?edit=true`.
2. Check Publish control.
3. As **admin**, open `?edit=true`.
4. Check Publish control.

**Expected:** Editor cannot publish (disabled / admin-only label). Admin can publish.

**Result:** **PASS**

| User | Publish |
|------|---------|
| Editor | Disabled — **Publish (admin only)** |
| Admin | Enabled |

---

## Step 6 — Presence clears after peer disconnect

**Steps:**

1. After editor signed out (step 4), admin opens `?edit=true`.
2. Check Live bar.

**Expected:** **`Live · You · Editing alone`** — no stale **Collaborator** from disconnected editor.

**Result:** **PASS** — admin session showed **You · Editing alone** with green Live dot.

**Open issue (minor):** When editor connected **immediately after** admin sign-out, Live briefly showed **You + Collaborator** — likely stale admin WS peer before teardown. Worth re-checking with simultaneous two-user test (step 7).

---

## Step 7 — Simultaneous two-user Live + cursors

**Steps:**

1. Browser profile A: `admin@zitadel.localhost` → `?edit=true`.
2. Browser profile B: `editor@zitadel.localhost` → same layout `?edit=true`.
3. Confirm Live bar shows **both names** (not Collaborator fallback).
4. Edit in A → B updates without Save; repeat B → A.
5. Select a block in A → B sees selection outline / cursor anchor.

**Expected:** Real multi-user presence and bidirectional sync while both connected.

**Result:** **DEFER** — not completed in Cursor browser (single cookie jar; cannot hold two sessions).

**Alternatives tried:**

| Approach | Outcome |
|----------|---------|
| Cursor browser sequential login | Steps 4–6 only |
| `scripts/collab-two-user-smoke.cjs` | **Blocked** — Automerge WASM init in standalone Node (`Automerge.use()`, wasm path) |

**To finish:** Chrome normal + incognito (or two profiles), or fix Node smoke script to use `initializeBase64Wasm` / server tsx path.

---

## Deferred (not in the 7 steps)

These remain in [`COLLAB-PROD-SMOKE.md`](./COLLAB-PROD-SMOKE.md) for a full acceptance pass:

| Area | Status |
|------|--------|
| Reorder / reparent blocks (two tabs) | Not run this session |
| Save draft → Postgres → reload | Not run this session |
| Rich text Yjs two-tab + persist | Not run this session |
| Agent task → Live bar via WS (no poll chip) | Not run this session |
| Agent selection outline, no virtual cursor | Code landed; not re-smoked here |
| Edge WS proxy (`:8787`) | **PASS** — normal browser path (5173 → 8787 → 3000) |

---

## Key fixes under test

| Fix | File(s) |
|-----|---------|
| `handle.change()` not `update()` for local applies | `use-layout-collab.ts`, `automerge-spec.ts`, `layout-room.ts`, `agent-layout-collab-session.ts` |
| Per-recipient presence (hide same-user tabs) | `presence.ts`, `layout-room.ts` |
| Connect ordering + pending local queue | `use-layout-collab.ts` |
| Unique `peerId` per tab | `use-layout-collab.ts` |
| Agent task push (no poll Live chip) | `executor.ts`, `use-layout-collab.ts` |

---

## Re-run checklist

```bash
# 1 — unit tests
npm test -- packages/client/src/editor/collab packages/server/src/domains/collab

# 2–3 — same user, two tabs (admin)
# 4–6 — sequential two-user (editor → admin)
# 7 — two Chrome profiles simultaneously
```

After server collab changes: **restart API**, hard-refresh all editor tabs.
