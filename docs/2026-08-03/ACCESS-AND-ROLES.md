# Access, roles, folders & teams

> **Date:** 2026-08-03  
> **Status:** **Canonical — production target**  
> **Related:** [`ROLES-AND-SCOPE-v2.md`](./ROLES-AND-SCOPE-v2.md) (implementation notes) · [`FOLDERS-SCOPE-PLAN.md`](./FOLDERS-SCOPE-PLAN.md) (folder phases) · [`IDENTITY-AGENTS-MASTER-PLAN.md`](./IDENTITY-AGENTS-MASTER-PLAN.md) (agents — later)

---

## One sentence

**ZITADEL** roles define *what actions* a person may perform. **Folders** organize documents (Postgres). **Teams** group people (Keto). **Bindings** connect teams to folders (Keto). **Access manager** runs day-to-day staffing; **store admin** is rare break-glass.

---

## ZITADEL roles — what each person can do

Assign roles explicitly in **Users** admin (or ZITADEL console). **No staff role → customer** (shopper, browse storefront only).

| ZITADEL key | UI label | Draft content | Publish | Folders & teams (Keto) | Invite users | Analytics | Session replay | Flags | Store settings |
|-------------|----------|---------------|---------|------------------------|--------------|-----------|----------------|-------|----------------|
| **admin** | Store admin | ✅ all | ✅ all | ✅ | ✅ any role | ✅ | ✅ | ✅ | ✅ |
| **access_manager** | Access manager | ❌ | ❌ | ✅ | ✅ all except admin† | ❌ | ❌ | ❌ | ❌ |
| **publisher** | Publisher | ✅ scoped | ✅ scoped | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **editor** | Editor | ✅ scoped | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **analyst** | Analyst | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| **replay_viewer** | Replay viewer | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| **flags_manager** | Flags manager | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| *(none)* | Customer | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

† **Access manager invite cap:** may assign **any staff role except `admin`** — including **`access_manager`**, **`editor`**, **`publisher`**, **`analyst`**, **`replay_viewer`**, **`flags_manager`**. Only **store admin** may grant **`admin`**.

**Multiple roles per user:** allowed — permissions **union** (e.g. `editor` + `analyst`). Prefer one content role: **publisher** already includes draft.

**Code note:** role key is `access_manager` (replaces earlier name `scope_manager`). Permission key stays `scope:manage`.

---

## Permission keys (`@noname/auth`)

Roles expand to these keys at login (`session.permissions[]`).

| Permission | Meaning |
|------------|---------|
| `storefront:view` | Browse storefront (customer default) |
| `content:draft_write`, `layout:draft_write`, `page:draft_write` | Save drafts |
| `content:publish`, `layout:publish`, `page:publish` | Go live |
| `scope:manage` | Create folders/teams, Keto bindings & membership, invite (all roles except admin) |
| `auth:manage` | Full user admin, any ZITADEL role including admin |
| `analytics:view` | Events, dashboards, funnels |
| `session:replay` | Watch rrweb session replays (PII — separate from analytics) |
| `flags:write` | Create/toggle feature flags |
| `tenant:manage`, `agent:manage`, … | Store admin surfaces |

---

## Folders, teams & bindings

Three different things — **do not merge**.

| Concept | Meaning | Source of truth | Selected / edited in |
|---------|---------|-----------------|----------------------|
| **Folder** | Where content lives (“Marketing”, “Legal”) | Postgres `documents.collection_id` → `content_collections`; catalog for labels & tree | Content/layout **Folder** picker; **Settings → Folders** |
| **Team** | Group of people | Keto `Team:*`; catalog `content_teams` for labels | **Teams** admin |
| **Binding** | Team may edit/publish docs in this folder | Keto `Collection#editors@Team#editors` etc. | **Folder ↔ Team** admin |

**One folder per document.** Nested folders inherit access from ancestors via Keto parent walk (Phase F2).

### Single source of truth

| Question | SoT | Keto updated when? |
|----------|-----|-------------------|
| Which folder is **this document** in? | **Postgres** `documents.collection_id` | Never (authorize by reading Postgres, then `Check` on `Collection`) |
| Does folder **exist**? | Postgres `content_collections` | Folder **create** (team bindings on folder create/move) |
| Folder **parent** (nested tree)? | Postgres `content_collections.parent_id` | Folder **create** → `Collection:child#parents@Collection:parent` |
| Who is in a **team**? | **Keto** `Team#editors@User`, `#publishers@User` | Add/remove member |
| Which team may use a **folder**? | **Keto** binding tuples | Bind folder ↔ team |
| **Platform** role (editor vs publisher)? | **ZITADEL** | Invite / role change |

### Keto graph

```
Postgres:  Document home-layout  →  collection_id → Marketing folder

Keto:
  Collection:marketing#editors@Team:marketing-team#editors
  Collection:marketing#publishers@Team:marketing-team#publishers
  Collection:summer-campaign#parents@Collection:marketing        ← nested (F2)
  Team:marketing-team#editors@User:alice
  Team:marketing-team#publishers@User:bob
```

**Team slots (`#editors`, `#publishers`) are Keto membership — not ZITADEL roles.** ZITADEL `editor` / `publisher` should match the slot (validate in API).

**Inherited access:** edit on **Marketing** applies to docs in **Marketing** and any subfolder (Keto `Collection.parents` traverse in OPL).

---

## Admin UI — where each role works

| Screen | Who can open | What they do there |
|--------|--------------|-------------------|
| **Settings → Users** | `auth:manage` (admin) | Invite anyone; assign **any** role |
| **Settings → Users** (limited) | `scope:manage` (access manager) | Invite; assign **any staff role except admin** |
| **Settings → Folders** | `scope:manage` | Create/delete folders (optional parent); see team bindings |
| **Settings → Teams** | `scope:manage` | Create teams; add/remove members in **editor** or **publisher** slot |
| **Settings → Folder access** | `scope:manage` | Bind folder ↔ team (edit + publish) |
| **Content / layout entry** | `*:draft_write` + doc access | Edit body; **pick one folder** (dropdown) |
| **Content sidebar** | `*:draft_write` | Browse entries by folder (optional UX — F3) |
| **Publish action** | `*:publish` + doc access | Go live |
| **Analytics** | `analytics:view` | Dashboards, events |
| **Session replay** | `session:replay` | rrweb viewer |
| **Feature flags** | `flags:write` | Toggle flags |
| **Auth / tenant / MFA** | `auth:manage` | IdP, MFA policy — admin only |

Direct **share one document** with a user: `scope:manage` or admin → Keto `Document:{id}#editors@User:{sub}`.

---

## Access manager — full spec

**UI label:** Access manager · **ZITADEL key:** `access_manager` · **Permission:** `scope:manage`

### Can do

| Action | System |
|--------|--------|
| Create / delete **folders** | Postgres catalog + Keto `Collection:{slug}` tuples |
| Create / delete **teams** | Postgres catalog + Keto `Team:{slug}` |
| **Bind** folder ↔ team (edit & publish) | Keto |
| **Add / remove** user on team `#editors` or `#publishers` | Keto |
| **Invite** user | ZITADEL — any staff role **except admin** |
| **Change** user’s ZITADEL role (same cap) | ZITADEL |
| **Direct share** one document | Keto |

### Cannot do

- Assign **admin** (store admin only)
- Edit store content (no draft permission unless also given `editor` — avoid)
- Tenant settings, auth provider, MFA (`auth:manage`)
- Grant session replay or analytics (those are ZITADEL roles, admin only)

### Onboarding content staff (two steps)

```
Access manager onboards Alice (marketing editor):

  1. ZITADEL:  role = editor
  2. Keto:     Team:marketing-team#editors@User:alice

Alice assigns home layout to the Marketing folder in Postgres (content form).

Bob (publisher):

  1. ZITADEL:  role = publisher
  2. Keto:     Team:marketing-team#publishers@User:bob
```

---

## API authorization flow

### Save draft

```
1. requirePermission(*:draft_write)
2. read documents.collection_id from Postgres → resolve Collection slug
3. Keto Check(User, edit, Collection) — OR Document#editors direct share
4. save
```

### Publish

```
1. requirePermission(*:publish)
2. read documents.collection_id from Postgres → resolve Collection slug
3. Keto Check(User, publish, Collection) — OR Document#publishers direct share
4. publish
```

### Admin

Bypass Keto or store-wide tuples.

### Analytics / replay / flags

`requirePermission(...)` + org match — **no Keto**.

---

## Example store

| User | ZITADEL | Keto | Can |
|------|---------|------|-----|
| Owner | admin | store-wide | Everything |
| Carol | access_manager | — | Folders, teams, invite editors/publishers |
| Alice | editor | `Team:marketing#editors` | Draft docs in Marketing folder (and subfolders) |
| Bob | publisher | `Team:marketing#publishers` | Publish those docs |
| Eve | analyst | — | Analytics only |
| Frank | replay_viewer | — | Session replay only |
| Shopper | *(none)* | — | Storefront only |

---

## Role assignment matrix (who assigns what)

| Target role | Store admin | Access manager |
|-------------|-------------|----------------|
| admin | ✅ | ❌ |
| access_manager | ✅ | ✅ |
| editor | ✅ | ✅ |
| publisher | ✅ | ✅ |
| analyst | ✅ | ✅ |
| replay_viewer | ✅ | ✅ |
| flags_manager | ✅ | ✅ |

Enforce in **API** on invite and role-change endpoints.

---

## Deferred

| Topic | Doc |
|-------|-----|
| AI agents | [`IDENTITY-AGENTS-MASTER-PLAN.md`](./IDENTITY-AGENTS-MASTER-PLAN.md) |
| Prod Keto deploy | [`ROADMAP-PHASES-B-A-C.md`](./ROADMAP-PHASES-B-A-C.md) (B4) |

---

## Quick reference

```
customer (default)  →  storefront:view
editor              →  draft + Keto team scope (via folder)
publisher           →  draft + publish + Keto team scope (via folder)
access_manager      →  folders, teams, bindings, invite all except admin (scope:manage)
analyst             →  analytics:view (org-wide)
replay_viewer       →  session:replay (org-wide)
flags_manager       →  flags:write (org-wide)
admin               →  all + auth:manage
```
