# Shared packages — when, why, and why not now

> **Date:** 2026-07-31  
> **Context:** Documents-domain duplication audit; question whether every domain needs `@noname/{domain}-shared`.

---

## Summary

**We are not adding `@noname/documents-shared` (or other domain shared packages) right now.**

Server owns behavior. Client calls APIs. Pure helpers stay inside the domain folder on the server (`shared/locale.ts`, `content-write.ts`, etc.). Extract a workspace package only when a **third runtime** (workers, extensions, browser-sdk) must run the same pure logic locally and API round-trips are not enough.

The existing precedent is **`@noname/auth`** — permissions, JWT helpers, edit-mode rules shared by server and workers. That bar is intentional.

---

## Why it was suggested (documents audit)

The audit flagged possible drift between **client** and **server** for documents:

| Concern | Server | Client (`content-entries.ts`) |
|---|---|---|
| Entry labels | `labelFromContentData()` in `shared/locale.ts` | `entryLabel()` — different fallback (first field vs first text field) |
| Locale pick | `pickLocalizedValue()` + default locale | `pickLocalized()` — no default locale |
| Schema types | `ports.ts` | Duplicated interfaces |
| Ref parsing | `documentIdFromRef()` | `documentIdFromFieldValue()` |

A **`@noname/documents-shared`** package would hold wire types + pure functions so admin UI labels always match `/resolve-refs` and future edge/worker code could parse refs without copying.

That is a **valid long-term shape** — not a requirement today.

---

## Recommended pattern (all domains)

```
Default
  └── Domain lives in packages/server/src/domains/{domain}/
      api.ts, ports.ts, services/, adapters/

Cross-runtime pure contract (rare)
  └── @noname/{domain}-shared OR cross-cutting @noname/auth
      types + pure functions only — no DB, no Hono, no React

Client / workers / extensions
  └── HTTP to server OR import shared package when bar is met
```

**Do not** create one mega junk-drawer package for every domain — domain logic stays in `@noname/server`.

**Do** use **`@noname/shared`** only for tiny, pure helpers duplicated across **3+ runtimes** (see below).

**Do not** create `@noname/{domain}-shared` upfront for every domain — most never need it.

### Decision checklist

Add a shared package only when **all** are true:

1. **Two or more packages** need the same thing (not server alone).
2. **Pure** — no Postgres, Redis, env, or framework imports.
3. **Drift causes bugs** — not merely “duplicate lines.”
4. **API is insufficient** — consumer must compute locally (e.g. JWT on workers without a round-trip).

If any answer is no → keep logic in server domain or use the API.

---

## Why we are not doing it now

| Reason | Detail |
|---|---|
| **Only two consumers** | Documents logic is duplicated on client + server only. Workers and browser-sdk do not use CMS types or labels today. |
| **Small surface** | ~50 lines of pure logic; not a whole domain. |
| **Cheaper fixes exist** | Align client `entryLabel` to server rules, or use **`GET /resolve-refs`** as the label source in reference pickers — no new package. |
| **Server split already done** | God `helpers.ts` removed; concerns live in named modules (`content-write.ts`, `assets/enrich.ts`, `shared/locale.ts`, …). |
| **Package cost** | New workspace package = exports boundary, dependency graph, and ongoing “what belongs in shared vs server?” debates. YAGNI until a third runtime needs it. |
| **Precedent is high bar** | `@noname/auth` exists because server **and** workers **must** parse JWTs and permissions at the edge. Documents does not have that pressure yet. |

---

## What we did instead (2026-07-31)

Documents-domain dedupe **inside server** (no new package):

- `shared/locale.ts` — `pickLocalizedValue`, `labelFromContentData`, `resolveTenantLocales`
- `assets/url.ts`, `assets/enrich.ts` — public asset URLs
- `services/document-guards.ts`, `routing-page.ts`, `content-write.ts`, …
- Client: shared `documentIdFromFieldValue` in `content-entries.ts`
- Deleted catch-all `services/helpers.ts`

See also: [`CODEBASE-AUDIT-CLEANUP.md`](../2026-07-30/CODEBASE-AUDIT-CLEANUP.md) (recently fixed list).

---

## When to revisit

Create **`@noname/documents-shared`** (or similar) when:

- **Workers** need ref parsing, slug normalization, or label rules without calling the API on every request.
- **Extensions** or **browser-sdk** need stable schema/ref types at build time.
- **Label mismatches** show up in production between admin UI and `/resolve-refs`.
- A **third package** would copy the same pure functions again.

Until then: **API-first for labels**, server modules for pure logic, client stays a thin API client.

---

## Domain map (current)

| Domain / concern | Pattern today |
|---|---|
| Auth, permissions, JWT | `@noname/auth` — server + workers |
| Extension UI + catalog | `@noname/extensions` — client MF bundle |
| Browser telemetry | `@noname/browser-sdk` — client only |
| Documents CMS | `@noname/server` domain; client `content-entries.ts` |
| Flags, analytics, machines, tenant, agent | Server only; admin UI via HTTP |
| Cross-domain server helpers | `packages/server/src/shared/` (not an npm package) |
| Pure cross-runtime helpers (3+ packages) | `@noname/shared` — strict bar; see **AI agents** below |

---

## `@noname/shared` (cross-runtime utilities)

**Added:** 2026-07-31 — replaces triplicated `coerceScalarString` in client, server, workers.

**In-package instructions (canonical for agents):** [`packages/shared/README.md`](../../packages/shared/README.md)

| Export | Why here |
|---|---|
| `coerceScalarString` | Same pure coercion in CMS UI, ClickHouse adapter, JWKS cache |

### For AI agents — what belongs in `@noname/shared`

See **`packages/shared/README.md`** for the full add / never-add checklist. Summary:

**Add only when all are true:**

1. **3+ workspace packages** import the same logic (not 2, not server-only).
2. **Pure function** — no `process.env`, DB, Hono, React, Cloudflare bindings, Node-only APIs.
3. **Stable** — unlikely to move back into a domain within one sprint.
4. **Small** — one concern per file; re-export from `src/index.ts`.

**Never add to `@noname/shared` (keeps it from becoming a junkyard):**

| Do not add | Put it instead |
|---|---|
| Domain types, DTOs, event names | Server domain `ports.ts` or future `@noname/{domain}-shared` |
| Auth, JWT, permissions | `@noname/auth` |
| CMS labels, locale, ref parsing | Server `documents/` or `@noname/documents-shared` when bar is met |
| React components or hooks | `@noname/client` |
| HTTP clients, `fetch` wrappers | Consumer package or `@noname/auth` for auth-related fetch |
| Config, env readers, feature flags | Server domain or `@noname/server/src/shared/` |
| “Might be useful someday” helpers | Inline or wait for a third consumer |
| Re-exports of server domain code | Import the domain or use HTTP |

**Before adding a new export:** grep the monorepo for duplicates. If only two copies exist, fix drift locally or defer — do not create the package export yet.

**Review gate:** Each new file in `packages/shared/src/` needs a one-line comment at top stating which 3+ packages use it.
