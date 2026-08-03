# Open Source References — Permissions & Collaborative Edit

> **Date:** 2026-07-25  
> **Purpose:** Projects that help implement [`PERMISSIONS-REBAC.md`](./PERMISSIONS-REBAC.md) + [`VISUAL-EDITOR-UX.md`](./VISUAL-EDITOR-UX.md)  
> **Stack context:** **ZITADEL** = identity + org team roles in JWT; our app = documents + visual editor

---

## Recommended stack by phase

| Phase | Need | Use | Skip for now |
|-------|------|-----|--------------|
| **0** | Team `admin` / `editor` in JWT | **ZITADEL** Role Assignments | Postgres `teamRoles` |
| **1** | Doc share + `Check()` | **Ory Keto** on same Postgres (DB `keto`) + `AuthorizationPort` | Plain in-app tuple table; SpiceDB (not planned) |
| **2** | Scale ReBAC | Tune Keto (batch checks, caching) | — |
| **1** | Draft conflict | **`If-Match` / document.version`** — no library | — |
| **2** | Edit log + dedup | Custom `document_ops` table | — |
| **3** | Live collab on **JSON spec** | **Automerge** | Yjs for whole spec tree |
| **3** | Live collab on **rich text** fields | **Yjs** + **y-prosemirror** | — |
| **3** | Presence + transport | **y-websocket** or **Hocuspocus** | — |

---

## 1. Authorization (Zanzibar / ReBAC)

These implement Google Zanzibar-style **relation tuples** and **Check(user, relation, object)**.

### OpenFGA — best fit when you add a real FGA service

- **Repo:** [openfga/openfga](https://github.com/openfga/openfga) (CNCF Sandbox, Apache 2.0)
- **Why:** OpenFGA **model DSL** matches how we document namespaces (`store`, `document`, `owner` → `editor` → `viewer`). Visual **Playground** to test policies before coding.
- **Use when:** Per-document sharing grows beyond “store editor → all docs”; you want `ListObjects` / `Expand` without maintaining Check() yourself.
- **With ZITADEL:** Common pattern — JWT proves identity; app calls OpenFGA for `document:uuid#editor@user`. [ZITADEL blog](https://zitadel.com/blog/fine-grained-authorization) explicitly points to external FGA for fine-grained cases.

### SpiceDB (Authzed) — not planned

- Considered and **rejected** for Noname (2026-08-03): extra service + datastore; **Keto on shared Postgres** is the only resource-scope path.
- Reference only: [authzed/spicedb](https://github.com/authzed/spicedb) — see upstream docs if comparing architectures elsewhere.

### Ory Keto — **our Phase B choice (2026-08-03)**

- **Repo:** [ory/keto](https://github.com/ory/keto)
- **Why start here:** Same Postgres **server** as CMS; separate DB `keto` (like `zitadel` / `app`); standalone — **does not require** Hydra or Kratos.
- **Final decision:** Keto is the **only** resource-scope engine — no migration path to SpiceDB.
- **With ZITADEL:** JWT proves identity; app passes `user:{sub}` or `agent:{id}` to Keto `Check()`.
- **Deploy:** Keto pods in K8s/Vela; Postgres DB `keto` on same server as `app` / `zitadel`.

### Permify

- **Repo:** [Permify/permify](https://github.com/Permify/permify)
- Lighter Zanzibar alternative; reasonable if you want managed-style FGA self-hosted with less ops than SpiceDB.

### Do **not** use for doc sharing model

| Project | Why not primary |
|---------|-----------------|
| **Casbin** | RBAC/ACL strings — not ReBAC graph, no `document#editor@user` inheritance |
| **OPA** | Policy engine (Rego) — great for K8s, awkward for Docs-style sharing |
| **Cerbos** | Resource policies — good for “action on resource type”, less natural for nested folder/doc inheritance |

**Phase B decision (2026-08-03):** **Ory Keto only** on shared Postgres + `AuthorizationPort`. Design models in [OpenFGA Playground](https://play.fga.dev) (spec DSL only); **store tuples in Keto**.

---

## 2. Identity (already chosen)

### ZITADEL

- **Site:** [zitadel.com](https://zitadel.com)
- Org-scoped **Role Assignments** → JWT project roles (`admin`, `editor`, `customer`)
- **Not** a full Zanzibar engine for your CMS documents — use with OpenFGA/Postgres tuples per [TEAM-ROLES-ZITADEL.md](./TEAM-ROLES-ZITADEL.md)
- ZITADEL “nextgen” is building internal OpenFGA-flavored FGA for **their** console — **not** a replacement for app-level document ACLs in Noname

---

## 3. Collaborative editing

### v1 — no collab library

- HTTP **`If-Match: version`** on draft PUT → **409 Conflict**
- UI: “Someone else saved — refresh” ([`VISUAL-EDITOR-UX.md`](./VISUAL-EDITOR-UX.md))

### v2 — op log (custom, Docs-inspired)

- Postgres **`document_ops`** + monotonic **`server_version`**
- Dedup: **`(client_id, client_seq)`** unique index (or Redis) — same idea as Google Docs OT server
- Optional: **[json-patch](https://github.com/Starcounter-Jack/JSON-Patch)** (`fast-json-patch` npm) for patch payloads

### v3 — live multi-user

#### JSON layout / spec tree → **Automerge**

- **Repo:** [automerge/automerge](https://github.com/automerge/automerge) (MIT)
- **Why:** JSON-like **Map / List** CRDT — fits json-render **spec trees** better than Yjs (Yjs is optimized for text/array editing, not arbitrary JSON graphs)
- **Sync:** Automerge sync protocol; persist binary updates to Postgres or S3
- **Publish:** Still snapshot Automerge doc → `layout` document **published** row (convergence point)

#### Rich text CMS fields → **Yjs**

- **Repo:** [yjs/yjs](https://github.com/yjs/yjs)
- **Why:** Mature ecosystem for **collaborative text** (`description`, rich text)
- **Editors:** [TipTap](https://tiptap.dev/) + `@tiptap/extension-collaboration` + **y-prosemirror**
- **Do not** wrap whole layout spec in Yjs — constant JSON ↔ Yjs conversion is painful ([Yjs issue #284](https://github.com/yjs/yjs/issues/284))

#### Presence (“Bob is editing”) + WebSocket

| Project | Role |
|---------|------|
| **[y-websocket](https://github.com/yjs/yjs-demos)** / **[y-redis](https://github.com/yjs/y-redis)** | Yjs update relay + scaling |
| **[Hocuspocus](https://github.com/ueberdosis/hocuspocus)** | TipTap/Yjs backend (Node), awareness built-in |
| **Automerge `@automerge/automerge-repo`** | Repo layer with network adapters if you go Automerge-first |

Awareness (cursors, user colors) ships with **Yjs**; Automerge has separate presence patterns.

### OT libraries (Google Docs classic path)

- **ShareDB** — OT over JSON; older, central server
- **ot.js** — low-level OT

**Prefer CRDT (Automerge/Yjs) for v3** — no central OT transform server; matches “edge + API” architecture better. Op log in v2 still useful as audit trail either way.

---

## 4. How pieces fit Noname

```
┌─────────────┐     JWT (admin/editor)      ┌──────────────────────────┐
│   ZITADEL   │ ──────────────────────────► │  API / Edge guards       │
└─────────────┘                             └───────────┬──────────────┘
                                                        │
                        Check(document#editor@user)     │
                        ┌───────────────────────────────▼──────────────┐
                        │  v1: Postgres relation_tuples + Check()      │
                        │  v2: OpenFGA or SpiceDB (optional upgrade)   │
                        └───────────────────────────────┬──────────────┘
                                                        │
                        Save draft / op log             │
                        ┌───────────────────────────────▼──────────────┐
                        │  documents domain (version, publish)         │
                        │  v3: Automerge (spec) + Yjs (rich text)      │
                        └───────────────────────────────┬──────────────┘
                                                        │
                        ?edit=true UI                   │
                        ┌───────────────────────────────▼──────────────┐
                        │  packages/client/editor                      │
                        └──────────────────────────────────────────────┘
```

---

## 5. Practical implementation order (canonical list)

**Full numbered checklist:** [`VISUAL-EDITOR-IMPLEMENTATION-ORDER.md`](./VISUAL-EDITOR-IMPLEMENTATION-ORDER.md)

| # | Step | When |
|---|------|------|
| 0 | **OpenFGA Playground** — prototype `store` + `document` relations | Design first (no server) |
| 1 | **ZITADEL Role Assignment API** — JWT `admin` / `editor`; remove `teamRoles` | **Phase 0 — code now** |
| 2 | Guards + edge `?edit=true` + `teamRoleFromJwt` | Phase 0 |
| 3–6 | Tuples, validateSpec, editor UI, op log | See implementation-order doc |
| 7 | **Automerge spike** — merge two layout edits offline | Before live spec collab |
| 9 | **Hocuspocus + TipTap/Yjs** | **Only when rich-text live collab required** |

Quick studies (same order):

1. [OpenFGA Playground](https://play.fga.dev) — export model → Postgres tuple schema  
2. [ZITADEL retrieve roles](https://zitadel.com/docs/guides/integrate/retrieve-user-roles) + Role Assignment API  
3. [Automerge tutorial](https://automerge.org) — offline layout spec merge  
4. [Hocuspocus](https://github.com/ueberdosis/hocuspocus) — defer until CMS rich-text collab is a product requirement  

---

## 6. License / ops summary

| Project | License | Self-host | Notes |
|---------|---------|-----------|-------|
| OpenFGA | Apache 2.0 | Yes | PostgreSQL backend |
| SpiceDB | Apache 2.0 | Yes | Authzed Cloud optional |
| ZITADEL | AGPL / commercial | Yes | Already in compose |
| Automerge | MIT | Library | No server required |
| Yjs | MIT | Library | Needs websocket provider |
| Hocuspocus | MIT | Yes | Node server |

---

## References

- [Google Zanzibar paper (USENIX 2019)](https://www.usenix.org/system/files/atc19-pang.pdf)
- [`PERMISSIONS-REBAC.md`](./PERMISSIONS-REBAC.md) — our tuple model + consistency
- [`TEAM-ROLES-ZITADEL.md`](./TEAM-ROLES-ZITADEL.md) — ZITADEL-only team RBAC
- [ZITADEL + external FGA discussion](https://zitadel.com/blog/fine-grained-authorization)

---

*Start in-app (Postgres tuples + version checks). Add OpenFGA or SpiceDB when Check() complexity grows. Add Automerge/Yjs only for Phase 3 live collab.*
