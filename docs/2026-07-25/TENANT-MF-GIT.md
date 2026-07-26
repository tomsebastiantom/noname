# Tenant MF Catalog — Git Repo Source (Production Model)

> **Date:** 2026-07-25  
> **Status:** Planned — build pipeline exists; Git integration not implemented yet  
> **Related:** [`TENANT-MF-SECURITY.md`](./TENANT-MF-SECURITY.md) · [`TENANT-MF-CDN.md`](./TENANT-MF-CDN.md) · [`DYNAMIC_CATALOG_BUILD.md`](../2026-07-11/DYNAMIC_CATALOG_BUILD.md) · [`MODULE_FEDERATION.md`](../2026-07-11/MODULE_FEDERATION.md)

---

## One-line summary

**Tenant TSX lives in their Git repo.** Noname connects via a GitHub/GitLab app, clones on push, validates + builds the MF bundle, uploads to R2/CDN, and updates the manifest. Postgres stores **pointers** (repo, commit, manifest URL) — not the source body.

The admin textarea + `POST { source }` path is a **dev shortcut** only. Production = **their repo → your pipeline → publish**.

---

## Who owns what

| Layer | Owner | Contents |
|-------|-------|----------|
| **Git repo** | Merchant / tenant | TSX source, history, PRs |
| **R2 / CDN** | Noname | Compiled `remoteEntry.js` + hashed chunks |
| **Postgres** | Noname | Repo config, last deployed SHA, `catalogManifest` |
| **Layout JSON** | Merchant (CMS) | Which component types appear on pages |

Source of truth for **component code** = **their repo**.  
Source of truth for **page structure** = **layout documents** (existing CMS).

---

## Merchant setup (once)

In admin (future UI):

| Setting | Example |
|---------|---------|
| Provider | GitHub / GitLab |
| Repository | `acme/storefront-catalog` |
| Branch | `main` |
| Entry file | `catalog/index.tsx` |
| (optional) Root | `catalog/` |

**Connect GitHub** installs a Noname Git App with:

- **Read** access to the repo (clone at build time)
- **Webhooks** on `push` (and optionally PR events for previews)

No copy-paste. The **spec** the build consumes is whatever exists at the entry path in **their** repo at a given **commit SHA**.

---

## Repo layout (tenant contract)

Minimal structure — same exports required today:

```
tenant-storefront-catalog/
├── package.json              # optional; platform may ignore or validate
├── catalog/
│   ├── index.tsx             # entry: userCatalog, userComponents, userActions
│   └── components/
│       ├── PromoBanner.tsx
│       └── HeroWidget.tsx
```

**Required exports** (documented in platform docs):

```tsx
export const userCatalog = { /* json-render component schemas */ };
export const userComponents = { /* React components */ };
export const userActions = { /* optional action handlers */ };
```

**Allowed imports** (enforced at validate + build): `react`, `react-dom`, `zod`, `@json-render/core`, `@json-render/react`. No arbitrary npm packages until marketplace/sandbox rules exist. See [`TENANT-MF-SECURITY.md`](./TENANT-MF-SECURITY.md).

Platform ships a **starter template repo** merchants fork.

---

## Pipeline on each push

```
git push to main
    │
    ▼
Webhook → Noname API
    │
    ▼
Clone repo @ commit SHA (shallow)
    │
    ▼
Validate — exports, syntax, allowed imports (~100ms)
    │
    ├── fail → status failed, notify admin (no manifest change)
    │
    ▼
Build — Rspack + Module Federation (existing bundler.ts)
    │
    ▼
Upload — R2 tenants/{orgId}/… (+ optional staging prefix tenants/{orgId}/builds/{sha}/)
    │
    ▼
Publish — bump manifest version, set private.url, record lastPublishedCommit
    │
    ▼
Storefront — next visit loads new remote via catalog-loader.ts
```

### Pipeline stages

| Stage | Input | Output |
|-------|--------|--------|
| **Trigger** | `git push`, tag, or admin “Deploy” | `commitSha`, clone URL |
| **Fetch** | shallow clone at SHA | temp workspace |
| **Validate** | entry TSX + export checks | pass/fail + line errors |
| **Build** | validated source | `remoteEntry.js` + content-hashed chunks |
| **Stage** | (optional) upload to build-scoped R2 prefix | preview URL for PR builds |
| **Publish** | promote artifacts + update manifest | live CDN URL, `version++` |

**Prod:** BullMQ worker runs clone → validate → build → publish (async).  
**Dev today:** `pnpm seed:tenant-remote` sends inline source — bypasses Git.

---

## Draft vs live / rollback

| Event | Behavior |
|-------|----------|
| Push to `main` | Auto-build; auto-publish (or require admin approval — product choice) |
| Push to PR branch | Build to staging prefix; preview URL; **do not** update live manifest |
| Rollback | Point manifest at previous commit’s R2 artifacts (keep old chunks immutable) |
| Failed build | Live manifest unchanged; storefront keeps last good bundle |

Store `lastPublishedCommit` and optional `catalogBuilds[]` (buildId, sha, status, errors) in `tenant_settings.data`.

---

## Two hosting models

### A) Bring-your-own-repo (recommended at scale)

- Merchant connects existing GitHub/GitLab repo via app install
- They use normal IDE, PRs, team workflow
- Webhook triggers Noname build

### B) Platform-hosted repo (simpler early)

- Noname provisions `tenants/{slug}-catalog` repo (or branch in monorepo `tenants/yogastore/catalog/`)
- Admin shows clone URL
- Same build worker; no OAuth in v0 — CI in monorepo calls deploy API

Both converge on the same **build worker** — only the **fetch** step differs (git clone vs POST body).

---

## How this maps to existing code

| Piece | Today | With Git |
|-------|-------|----------|
| Input | `POST /components` `{ source: string }` | Webhook + clone, or `POST /components/deploy` `{ ref }` |
| Validate | Rspack error only | Dedicated validate step before Rspack |
| Build | `bundler.ts` | **Unchanged** — reads entry file from clone dir |
| Upload | `publish-catalog.ts` → R2 | **Unchanged** |
| Manifest | `postgres-manifest-store.ts` | **Unchanged** + `lastPublishedCommit` |
| Client load | `catalog-loader.ts` | **Unchanged** |
| Admin UI | Textarea paste | Connect repo + commit log + Deploy |

---

## Layout vs catalog (two “specs”)

Do not confuse:

1. **Catalog (TSX in Git)** — defines **component types** and React implementations → MF `registry`
2. **Layout (JSON in CMS)** — defines **which components** on **which pages** with props

Merchant flow:

1. Push catalog repo → build succeeds → publish
2. Edit layout in admin → `"type": "PromoBanner"` in layout spec
3. Visitor → edge returns layout + client merges registries → page renders

Build catalog **before** layout references new component names (or layout render fails for unknown types).

---

## Postgres fields (planned)

Stored in `tenant_settings.data` (or dedicated table later):

```json
{
  "catalogGit": {
    "provider": "github",
    "repo": "acme/storefront-catalog",
    "branch": "main",
    "entryPath": "catalog/index.tsx",
    "installationId": "…"
  },
  "catalogManifest": { "private": { "url": "…", "version": 12, "hash": "…" } },
  "lastPublishedCommit": "abc123def",
  "lastBuild": { "buildId": "…", "status": "completed", "commit": "abc123def" }
}
```

TSX body is **not** stored in Postgres when Git is canonical.

---

## Comparison: source strategies

| Approach | Best for | Downsides |
|----------|----------|-----------|
| **Git repo (this doc)** | Dev teams, history, PRs, rollback | Git App + webhook infra |
| **Postgres draft** | Non-dev merchants, in-browser editor | No native Git workflow |
| **Copy-paste (current dev)** | Proving MF pipeline | No persistence, no history |

**Hybrid (later):** Git for technical tenants; saved draft / visual editor for others — **same build worker**, different fetch adapter.

---

## Implementation order (suggested)

1. **Monorepo path** — `tenants/{slug}/catalog/` + script/CI that calls existing publish API on push (no OAuth)
2. **Persist repo config** — `PUT /tenants/:slug/catalog/git` + Postgres fields
3. **Validate endpoint** — `POST …/components/validate` before full Rspack
4. **Split build / publish** — build → staging; publish flips manifest only on success
5. **GitHub App** — install, webhook, clone adapter in BullMQ worker
6. **Admin UI** — Connect repo, deploy history, rollback

---

## References

- CDN delivery after build: [`TENANT-MF-CDN.md`](./TENANT-MF-CDN.md)
- Rspack + BullMQ design: [`DYNAMIC_CATALOG_BUILD.md`](../2026-07-11/DYNAMIC_CATALOG_BUILD.md)
- MF share scopes + manifest shape: [`MODULE_FEDERATION.md`](../2026-07-11/MODULE_FEDERATION.md)
- Client merge order: [`CLIENT-CATALOG-LAYERS.md`](./CLIENT-CATALOG-LAYERS.md)
