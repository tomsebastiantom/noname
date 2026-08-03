# Roles and document scope (v2 — production target)

> **Date:** 2026-08-03  
> **Status:** Implementation companion — **canonical role/tag/team spec:** [`ACCESS-AND-ROLES.md`](./ACCESS-AND-ROLES.md)  
> Supersedes merged team-on-document model in [`ROLES-AND-SCOPE.md`](./ROLES-AND-SCOPE.md)  
> **Code (today):** [`packages/auth/src/permissions.ts`](../../packages/auth/src/permissions.ts) · Keto OPL [`config/keto/namespaces.ts`](../../config/keto/namespaces.ts)  
> **Agents (later):** [`IDENTITY-AGENTS-MASTER-PLAN.md`](./IDENTITY-AGENTS-MASTER-PLAN.md) — same Keto stack, separate build phase

---

## One sentence

**ZITADEL** assigns platform roles (what actions). **Keto** scopes content (which documents via tags → teams). **Default with no staff role = customer** (shopper). **Admin** is rare; day-to-day ops use **access_manager**, **editor**, **publisher**, and observability roles. See [`ACCESS-AND-ROLES.md`](./ACCESS-AND-ROLES.md).

---

## Four concepts — do not merge

| Concept | Meaning | Source of truth |
|---------|---------|-----------------|
| **Platform role** | Draft, publish, manage scope, analytics, flags, … | **ZITADEL** project roles → `@noname/auth` |
| **Team** | Group of people | **Keto** `Team:*` (+ Postgres catalog for UI) |
| **Tag** | Label on a document + access bucket | **Postgres** `documents.tags[]` + **Keto** `Tag:*` |
| **Binding** | Which teams may edit/publish docs with a tag | **Keto** `Tag#editors@Team#editors`, etc. |

**Tag ≠ team.** A doc is tagged `marketing`; people sit in `Team:marketing-team`; Keto links tag ↔ team ↔ user.

**Doc ↔ tag lives in Postgres only** (no `Document#parents@Tag` sync — avoids drift). On authorize, read `documents.tags[]`, then `Keto Check(User, edit|publish, Tag:…)`.

```
Postgres:  documents.tags = ["marketing"]

Keto (at tag create + bind + membership):
Tag:marketing#editors@Team:marketing-team#editors
Tag:marketing#publishers@Team:marketing-team#publishers
Team:marketing-team#editors@User:alice
Team:marketing-team#publishers@User:bob
```

---

## Platform roles (ZITADEL)

Assign explicitly. **No staff role in JWT → customer** (shopper, `storefront:view` only).

| Role | Draft | Publish | Manage scope (tags/teams/Keto) | Invite users | Analytics | Session replay | Flags |
|------|-------|---------|--------------------------------|--------------|-----------|----------------|-------|
| **admin** | ✅ all | ✅ all | ✅ | ✅ any role | ✅ | ✅ | ✅ |
| **access_manager** | ❌ | ❌ | ✅ | ✅ all except admin* | ❌ | ❌ | ❌ |
| **publisher** | ✅ | ✅ scoped | ❌ | ❌ | ❌ | ❌ | ❌ |
| **editor** | ✅ scoped | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **analyst** | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| **replay_viewer** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **flags_manager** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **customer** (default) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

\* **Access manager invite cap:** may assign **any staff role except `admin`** (including analyst, replay_viewer, flags_manager, and other access_managers). Only store admin may grant **admin**.

**Multiple ZITADEL roles per user:** supported — permissions **union** (e.g. `editor` + `analyst`). Prefer one content role: **publisher** already includes draft; `editor` + `publisher` is redundant.

---

## Permission keys (`@noname/auth`)

| Key | Used for |
|-----|----------|
| `content:draft_write`, `layout:draft_write`, `page:draft_write` | Save drafts |
| `content:publish`, `layout:publish`, `page:publish` | Go live |
| `scope:manage` | Access manager: tags/teams, bindings, Keto membership, capped invite |
| `auth:manage` | Full user admin, assign any role including admin |
| `analytics:view` | Events, dashboards, funnels |
| `session:replay` | Watch rrweb session replays (high PII — **not** `analytics:*`) |
| `flags:write` | Create/toggle feature flags |
| `storefront:view` | Shopper (customer default) |

---

## Who does what (merchant playbook)

### Store admin (1–2 people)

- Invite staff, assign any ZITADEL role
- Break-glass, tenant/auth settings
- Does **not** need to run daily tag/team ops

### Access manager (content ops lead)

See [`ACCESS-AND-ROLES.md`](./ACCESS-AND-ROLES.md) — two systems, **never admin**.

### Editor / publisher

- **ZITADEL role** → platform action (draft vs publish)
- **Keto team** → which tagged documents
- Tag documents on content/layout forms (`documents.tags[]`)

### Analyst / replay_viewer / flags_manager

- **Org-wide** platform permissions only — **no Keto** document scope in v1

---

## API checks

### Save draft

```
1. requirePermission(*:draft_write)
2. load documents.tags[] from Postgres
3. for each tag: Keto Check(User, edit, Tag:tag) OR direct Document#editors
4. save tags[] to Postgres (no Keto doc-parent sync)
```

### Publish

```
1. requirePermission(*:publish)
2. load documents.tags[] from Postgres
3. for each tag: Keto Check(User, publish, Tag:tag) OR direct Document#publishers
4. publish
```

### Admin bypass

Admins pass all platform checks and **store-wide Keto** (or API skip when `admin`).

### Observability / flags

```
requirePermission(analytics:view | session:replay | flags:write) + org match
No Keto document scope.
```

---

## Keto OPL (target)

- **`Team`** — `#editors`, `#publishers` (people groups)
- **`Tag`** — `#editors`, `#publishers` via `SubjectSet<Team, …>` (access buckets)
- **`Document`** — direct `#editors` / `#publishers@User` only (per-doc share); **not** `#parents@Tag` (Postgres owns doc tags)
- **`Store`** — store-wide bypass for admins / legacy full-store editors

Direct share (one contractor, one doc): `Document:{id}#editors@User:{sub}` — access_manager or admin. Full cheat sheet: [`ACCESS-AND-ROLES.md`](./ACCESS-AND-ROLES.md).

---

## Admin UI (target)

| Screen | Permission | Purpose |
|--------|------------|---------|
| **Users** | `auth:manage` | Invite, assign any role |
| **Users** (limited) | `scope:manage` | Invite; assign **any staff role except admin** |
| **Tags** | `scope:manage` | Create tags, see team bindings |
| **Teams** | `scope:manage` | Create teams, add members to editor/publisher slots |
| **Tag ↔ Team** | `scope:manage` | Which teams edit/publish which tags |
| **Content / layout form** | draft_write + doc access | Multi-select tags |
| **Analytics** | `analytics:view` | Dashboards |
| **Session replay** | `session:replay` | rrweb viewer |
| **Flags** | `flags:write` | Feature flags |

---

## Demo example (marketing)

| User | ZITADEL | Keto |
|------|---------|------|
| `admin@…` | admin | Store-wide |
| `editor@…` | editor | Store-wide (optional full-store editor) |
| `marketing@…` | editor | `Team:marketing-team#editors` + home layout tagged `marketing` |
| `publisher@…` | publisher | `Team:marketing-team#publishers` + same tag |

Alice (editor) saves draft ✅ · publish ❌  
Bob (publisher) publish ✅ on marketing-tagged docs only

---

## Source of truth summary

| Data | SoT | Mirror |
|------|-----|--------|
| Identity + platform roles | ZITADEL | JWT → `permissions[]` |
| Permission meanings | `@noname/auth` | — |
| Tag / team catalogs | Postgres | Keto objects on create |
| Team membership, tag↔team bindings | Keto | — |
| Document tags | Postgres `documents.tags[]` | — (authorize via Tag check, no doc tuple sync) |
| Document body | Postgres | — |

---

## Build order

1. **`@noname/auth`** — new roles + `scope:manage`, `session:replay`; split replay from `analytics:view`
2. **Keto OPL** — add `Tag` namespace; Team `#editors` + `#publishers`
3. **Postgres** — `content_tags`, `content_teams`; `documents.tags[]` (not `teams[]`)
4. **Scope API** — tag/team CRUD, bindings, sync on document save
5. **Publish path** — Keto `publish` check for publisher role
6. **Admin UI** — Tags, Teams, capped Users for access_manager (all staff except admin)
7. **ZITADEL seed** — register new role keys on platform project
8. **Demo seed** — marketing scoped user via tag + team graph

---

## Out of scope for this doc (defer)

| Topic | Where |
|-------|--------|
| **AI agents** (`Agent` namespace, delegated draft, human approval) | [`IDENTITY-AGENTS-MASTER-PLAN.md`](./IDENTITY-AGENTS-MASTER-PLAN.md) |
| Collections (folder-style scope) | [`KETO-ZANZIBAR-ROADMAP.md`](./KETO-ZANZIBAR-ROADMAP.md) |
| ZITADEL groups → team sync | Later |
| Field-level ACL | Cancelled — document is smallest unit |

**Agents:** Keto OPL already has an `Agent` namespace stub. Implement **after** human tag/team/scope v2 is stable — agents reuse the same `Tag`/`Document` graph with narrower platform permissions and human-in-the-loop publish. No separate agent permission model; extend this doc’s layers with Layer 3 from the agents plan.

---

## Quick reference

```
Default     →  customer (storefront:view)
Content     →  ZITADEL role + Keto tag/team scope
Publish     →  publisher (or admin) + Keto publish on doc
Scope ops   →  access_manager (capped invite, no admin)
Observability → analyst | replay_viewer | flags_manager (org-wide, no Keto)
Admin       →  1–2 people, everything
```
