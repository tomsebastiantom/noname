# Browser flow + agent collaboration smoke results (2026-08-22)

Environment: full local stack via podman (postgres, dragonfly, clickhouse, keto, zitadel, vault, s3, jaeger) + API :3000, worker, edge :8787 (wrangler), client :5173 (rspack). Demo org seeded via `pnpm seed:demo`. Tests driven by Playwright (headless + headed Chromium).

## 1. UI flow smoke — 13/13 PASS

| Flow | URL | Result |
|---|---|---|
| Login (spec-driven form → ZITADEL) | `/login` | PASS |
| Storefront + edit bar | `/` | PASS |
| Admin dashboard | `/admin` | PASS |
| Content CRUD | `/admin/content` | PASS |
| Auth providers | `/admin/content/auth_provider` | PASS |
| Pages admin | `/admin/pages` | PASS |
| Layout templates | `/admin/layout` | PASS (all seeded layouts published) |
| Scope admin (folders/teams/bindings/membership) | `/admin/settings/scope` | PASS — split form renders with seeded data |
| Team members | `/admin/users` | PASS |
| Session replay | `/admin/settings/replay` | PASS |
| Analytics | `/admin/settings/analytics` | PASS |
| Feature flags | `/admin/settings/flags` | PASS |
| Visual editor | `/?edit=true` | PASS — rich text + layers/blocks, lazy TipTap/Automerge chunks load |

Zero console/page errors across all runs.

## 2. Live LLM agent orchestrate (V4) — PASS

Config: `MASTRA_ORCHESTRATE_MOCK=false`, `OPENAI_BASE_URL=https://openrouter.ai/api/v1`, planner `openai/stealth/ox-alpha`.

- **Run 1** (vague prompt, no folder hint): completed, 9 steps, model `openai/stealth/ox-alpha`, 21k tokens. All `listFolderDocuments`/`readDocument` calls correctly **forbidden** — agent guessed folder names (`pages`, `home`, `content`); Keto denied. Correct security behavior; agent UX gap (no "list my folders" tool).
- **Run 2** (precise prompt, folder `marketing`): **completed, 3 distinct tools in one job** — `listFolderDocuments` → `readDocument` → `patchLayoutDraft` (`{"updated":true,"via":"http",...}`). Edit persisted to the layout document (verified in Postgres: "Get started free" present). 8.2k tokens.

**V4.1** met via env-fallback credentials (OpenRouter key in `.env`), not Vault — Vault path untested.
**V4.2** met — see run 2.

## 3. Multi-human collaborative editing — PASS (1 issue)

Users: `admin@` + `marketing@` (Marketing folder editor) in the same `/?edit=true` session.

- **Live CRDT sync: PASS** — marketing user received admin's rich-text edit live, no reload (marker text visible in B's DOM within ~10s).
- **Presence: PASS after fix** — initial run showed fallback names ("Collaborator") because access-token JWTs carry no email/name claims (OIDC puts them in userinfo, not access tokens). Fixed: login + MFA-verify responses now resolve identity via OIDC `/userinfo` and return `email`/`displayName`; client stores it and `collabHumanDisplayName()` prefers it. Verified live: admin sees "Demo Marketing", marketing sees "ZITADEL Admin". (Earlier "Editing alone" report was a test-regex false positive — peer chips rendered as "Collaborator" so the name-based assertion never matched.)
- Agent folder grant via `/admin/settings/agents` → Keto tuple `Collection:marketing#editors ← Agent:layout-agent` verified.

## 4. Follow-ups found

1. ~~Presence label missing for the second editor joiner~~ — **Fixed 2026-08-22**: root cause was missing identity claims in access tokens (see §3); display names now resolve via OIDC userinfo at login.
2. Agent tooling: add a `listMyFolders` tool or include folder hints in task context — agents otherwise guess folder slugs and burn steps on denials.
3. `packages/client` `dev` script broken on Windows (`NODE_ENV=development` prefix) — needs `cross-env`.
4. LLM key currently in repo-root `key` file (gitignored) + `.env` — for prod, store per-org in Vault via Integrations → LLM.
