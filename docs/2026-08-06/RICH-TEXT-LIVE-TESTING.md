# Rich text live testing — errors and fixes (2026-08-06)

Manual browser + API smoke test notes from validating TipTap, search indexing, and Yjs collab on the yogastore demo.

## How to run the smoke test

```bash
pnpm init:zitadel          # if login fails (stale ZITADEL client id)
pnpm seed:demo:commerce    # product with richText description

# Dev: API :3000, client :5173, worker :8787
open http://yogastore.localhost:5173/admin/content/product
# Login: admin@zitadel.localhost / NonameAdmin1!
```

API calls need `Authorization: Bearer <jwt>` and `x-org-id: <ZITADEL_DEMO_ORG_ID>`.

---

## Error 1 — Admin content panel blank after “Loading content…”

**Symptom:** `/admin/content/product` showed the admin shell header (“Content entries”) but the json-render panel was an empty `Stack`. Briefly showed “Loading content…”, then nothing — no entry list, no TipTap, no error message. With json-render’s `ElementErrorBoundary`, the console showed the real stack trace.

**Root cause (phase 1):** `RichTextTipTapEditor` called `useEditor` with a dependency array that included `extensions`. When Yjs collab connected, Collaboration extensions were injected mid-flight, destroying and recreating the TipTap instance.

**Root cause (phase 2 — confirmed in browser console):** `@tiptap/extension-collaboration-cursor` uses `yCursorPlugin` from **`y-prosemirror`**, but `@tiptap/extension-collaboration` (TipTap v3) registers y-sync via **`@tiptap/y-tiptap`**. Those packages each define their own `PluginKey('y-sync')` — different object identities — so `ySyncPluginKey.getState(state)` in the cursor plugin returns `undefined` and `.doc` throws. Extension order cannot fix a key mismatch.

**Fix (applied):**

1. **Separate mounts:** `RichTextSoloEditor` and `RichTextCollabEditor` — each calls `useEditor` once with a fixed extension set.
2. **Wait for Yjs sync:** `useRichTextCollab.ready` is true only when `WebsocketProvider.synced`.
3. **Custom cursor extension:** `YTiptapCollaborationCursor` in `y-tiptap-collaboration-cursor.ts` uses `yCursorPlugin` from `@tiptap/y-tiptap` (same keys as Collaboration). Removed `@tiptap/extension-collaboration-cursor`.
4. **Extension order:** base extensions → `Collaboration` → cursor (matches server `AgentRichTextYjsEditor`).
5. **Disable duplicate StarterKit marks:** `StarterKit.configure({ link: false, underline: false })`.
6. **`immediatelyRender: false`** on all `useEditor` calls (TipTap + React 19).

**Files:** `packages/client/src/components/rich-text/RichTextTipTapEditor.tsx`, `use-rich-text-collab.ts`, `y-tiptap-collaboration-cursor.ts`, `packages/client/package.json`, `packages/server/src/domains/agent/collab/agent-richtext-yjs-editor.ts`

**Verify:** Admin → Content → product shows entry list, TipTap toolbar (Bold, List, …), rich text body, and “Live collab” after WS sync. `/admin/content/page` (no richText) should still load without regression.

---

## Error 1b — Duplicate extension names (`link`, `underline`)

**Symptom (console):**

```
[tiptap warn]: Duplicate extension names found: ['link', 'underline']. This can lead to issues.
```

**Root cause:** TipTap StarterKit v3 bundles Link and Underline; we also registered `@tiptap/extension-link` and `@tiptap/extension-underline` separately.

**Fix:** `StarterKit.configure({ link: false, underline: false })` in `buildBaseExtensions()` — same pattern as `packages/server/src/domains/agent/collab/agent-richtext-yjs-editor.ts`.

---

## Error 2 — Browser login failed while API login worked

**Symptom:** Sign-in form on `yogastore.localhost:5173` hung or failed; programmatic login threw `Failed to start OIDC auth request`.

**Root cause:** Stale `ZITADEL_CLIENT_ID` in `.env` vs running ZITADEL instance (`Errors.App.NotFound` on `/oauth/v2/authorize`).

**Fix:** Run `pnpm init:zitadel` and restart the API server so it picks up fresh `ZITADEL_CLIENT_ID` / `ZITADEL_DEMO_ORG_ID`.

**Note:** OIDC redirect URI is registered as `http://localhost:5173/auth/callback` only. Embedded login uses `oidc.redirectUri` from `public/oidc.json` (localhost), so sign-in works on `yogastore.localhost` subdomains.

---

## Error 3 — Direct API calls returned empty / “org required”

**Symptom:** `GET /api/documents/product/search?q=mesh` → `{ data: [] }`; `POST /api/collab/richtext/ticket` → `{ error: "org required" }`.

**Root cause:** Document and collab routes read org from the `x-org-id` header (edge worker normally sets this). Bare `curl` to `:3000` without that header leaves org empty.

**Fix:** Include `Authorization` + `x-org-id` on direct API tests (see original curl examples in git history).

**Verify:** Search returns the demo sneaker; resolve returns `RichTextDocument`; collab ticket returns `roomName` ending in `:description:en-US`.

---

## Error 4 — Storefront product page requires login

**Symptom:** `http://yogastore.localhost:5173/products/demo-sneakers` redirected to `/login`.

**Expected in demo:** Storefront routes may require auth depending on layout/segment. After login, product page renders rich text (bold “everyday wear”, bullet list) client-side.

**Verify:** Sign in → product page shows formatted description and Add to Cart.

---

## Error 5 — Worker SSR shell has no rich text HTML

**Symptom:** `curl http://yogastore.localhost:8787/products/demo-sneakers` returns SPA shell only (`<div id="root">`).

**Expected:** Storefront is client-rendered; rich text HTML is not in the initial worker response. Use the browser (or client `:5173`) to verify UI rendering.

---

## Error 6 — Storefront `ProductCard` crash (`price.toFixed`)

**Symptom:** Storefront (`/` or catalog shell) throws:

```
TypeError: Cannot read properties of undefined (reading 'toFixed')
    at ProductCard (components.tsx:100)
```

Admin pages unaffected — they do not render `ProductCard`.

**Root cause:** Commerce home layout binds `ProductCard` config to product CMS fields (`{ "$state": "price" }`, etc.). Edge resolves `$state` from the **routing page’s `contentRef`**, not the layout’s fallback. `pnpm seed:demo` sets `page/home → contentRef: page:<welcome-entry>` (title/body only). That overrides the layout’s `product:…` ref on `/`, so `price` resolves to `undefined` and `config.price.toFixed(2)` throws. `/products/demo-sneakers` worked because `page/product-demo` already pointed at `product:…`.

**Fix:** `scripts/seed/demo-commerce.ts` — when publishing the commerce home layout, also set `page/home` `contentRef` to `product:<id>` (same as product-demo). Seed now asserts `config.price` on both `/` and `/products/demo-sneakers`.

**Re-apply locally:** `pnpm seed:demo:commerce`

---

Use the server’s field names (not generic `documentId` / `fieldPath`):

```json
POST /api/collab/richtext/ticket
{
  "contentDocumentId": "<uuid>",
  "fieldKey": "description",
  "locale": "en-US"
}
```

---

## Status after fixes

| Area | Status |
|------|--------|
| Admin TipTap editor (product / richText) | Fixed — collab extension order + duplicate mark fix |
| Admin content without richText (e.g. page) | OK — unaffected |
| Storefront rich text UI | OK after login |
| Search API (`meta.searchText`) | OK with org header |
| Resolve API (`RichTextDocument`) | OK |
| Yjs collab ticket + live editor | OK when authenticated |
