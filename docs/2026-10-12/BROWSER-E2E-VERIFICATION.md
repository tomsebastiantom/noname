# Browser E2E Verification — 2026-10-12

End-to-end verification of the running local stack in a **real browser**, covering the surfaces
Phase 0 touched (auth, tenant resolution, admin, editor). Complements the API-level record in
[`../2026-10-10/AUTH-ORIGIN-VERIFICATION.md`](../2026-10-10/AUTH-ORIGIN-VERIFICATION.md).

## Method

- Real Chrome (headless) driven with `playwright-core`, launched with
  `--host-resolver-rules=MAP yogastore.localhost 127.0.0.1`.
  This avoids editing `drivers\etc\hosts`, which needs administrator rights — the reason browser
  verification was previously blocked.
- Stack: API `:3000`, edge `:8787`, client `:5173`; ZITADEL app `noname-client`.
- Console errors and page errors were captured for every navigation, and every `/api/*` response was
  recorded with status and body.
- Screenshots: `.playwright-mcp/verify-*.png` and `.playwright-mcp/editor-probe-*.png` (gitignored).
- The driver scripts were temporary and have been deleted; only the evidence remains.

## Results

| # | Flow | Result | Evidence |
|---|---|---|---|
| 1 | Storefront loads and renders content | **PASS** | `HTTP 200`; body renders the commerce demo layout ("Welcome to Noname Commerce extension demo layout …") |
| 2 | Login page renders a credential form | **PASS** | 1 email input, 1 password input |
| 3 | Login completes and stores a session | **PASS** | `POST /api/auth/yogastore/login` → `200` with `accessToken`; `sessionStorage["noname:access_token"]` set (1078 chars) |
| 4 | Admin dashboard loads when signed in | **PASS** | `/admin` renders the full shell: Overview, Pages, Content, Layouts, Orders, Auth settings, Integrations, Team members, Content access, Login appearance, Agents |
| 5 | Visual editor loads at `?edit=true` | **PASS** | see correction below |

Authorization is confirmed on the wire, not inferred: `GET /api/auth/yogastore/session` returns
`roles: ["admin"]` with 19 permissions, and the admin/editor surfaces load under that session.

**Console errors: 0.** All 29 observed `/api/*` calls returned 200.

## Correction made during this verification

The first driver reported step 5 as passing, but its screenshots for the storefront, post-login and
editor were **byte-identical** (`SHA256 C745E6E0…`, 5,079 bytes each). Post-login matching the
storefront is expected (login redirects to `/`), but the editor matching it is not.

Cause: the editor assertion waited for the placeholder `"Loading layout for edit…"` to *disappear*,
and the pre-mount app shell does not contain that string — so the predicate was satisfied before the
editor mounted. That was a **false pass**, not an editor failure.

Re-probed with editor-specific assertions, which confirm the editor genuinely renders:

```text
final url   : http://yogastore.localhost:5173/?edit=true
text        : × Edit page … Unsaved changes · Live · You · Editing alone ·
              Exit edit · Discard · Save draft · Publish · Layout template: home
class hints : editor-page, editor-layout, editor-layout-rail, editor-layout-panel,
              editor-layout-canvas, editor-canvas--full, editor-collab-presence-live, …
console errors: 0
```

The probe screenshots are 84–85 KB versus the 5 KB shell, consistent with real editor chrome.

**Lesson for future assertions:** assert on the presence of surface-specific markers (editor class
names or labels), never on the absence of a loading placeholder — the placeholder is absent both
before mount and after it clears.

## Not covered

- Checkout / payment-provider flows (Phase 0 did not touch them).
- Multi-user collaboration (a second peer editing simultaneously) beyond presence rendering.
- Mobile/tablet viewports.
- Production deployment, Wrangler/Cloudflare, custom domains.

## Notes

- The hosts file was **not** modified; `yogastore.localhost` still does not resolve system-wide.
  Anything outside a browser given the same DNS remap flag will need the hosts entry.
- `packages/workers/.dev.vars` still contains the live `WORKER_SERVER_SECRET` (Phase 0 item 0.1,
  owner-deferred). Both layers of the forged-credential fix assume that secret stays private.
