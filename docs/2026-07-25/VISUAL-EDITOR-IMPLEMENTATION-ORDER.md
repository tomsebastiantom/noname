# Visual Editor & Permissions — Practical Implementation Order

> **Date:** 2026-07-25  
> **Status:** Active — **start here** when coding permissions + editor  
> **Related:** [`PERMISSIONS-MASTER-PLAN.md`](../2026-07-27/PERMISSIONS-MASTER-PLAN.md) · [`VISUAL-EDITOR-PLAN.md`](./VISUAL-EDITOR-PLAN.md) · [`PERMISSIONS-OSS-REFERENCES.md`](./PERMISSIONS-OSS-REFERENCES.md) · [`TEAM-ROLES-ZITADEL.md`](./TEAM-ROLES-ZITADEL.md)

---

## One-line summary

**Design in OpenFGA Playground → ship ZITADEL roles → in-app Check + visual editor → Automerge spike before live spec collab → Hocuspocus only if rich-text collab is required.**

---

## Full order (do in sequence)

| # | Step | Type | Doc / link |
|---|------|------|------------|
| **0** | **OpenFGA Playground** — prototype `store` + `document` relations (`owner` → `editor` → `viewer`) | Design (no prod service) | [play.fga.dev](https://play.fga.dev) · [`PERMISSIONS-REBAC.md`](./PERMISSIONS-REBAC.md) |
| **1** | **ZITADEL Role Assignment API** — `admin` / `editor` / `customer` in JWT; remove Postgres `teamRoles` | **Phase 0 — code** | [`TEAM-ROLES-ZITADEL.md`](./TEAM-ROLES-ZITADEL.md) |
| **2** | **`teamRoleFromJwt`** + guards on documents API, edge `?edit=true`, `GET /api/auth/:slug/session` | Phase 0 | [`VISUAL-EDITOR-PLAN.md`](./VISUAL-EDITOR-PLAN.md) § Phase 0 |
| **3** | **Postgres `relation_tuples` + `Check()`** — per-document share (from OpenFGA model) | Phase 1 ReBAC | [`PERMISSIONS-REBAC.md`](./PERMISSIONS-REBAC.md) |
| **4** | **Catalog Zod `validateSpec`** + draft save by dot-path overrides | Spec storage | [`SPEC-STORAGE-MERGE.md`](./SPEC-STORAGE-MERGE.md) |
| **5** | **Visual editor UI** — `?edit=true`, overlay, save bar, shared API paths | Phase 1 UI | [`VISUAL-EDITOR-UX.md`](./VISUAL-EDITOR-UX.md) |
| **6** | **`document_ops` op log** + `If-Match` version conflicts | Phase 2 | [`PERMISSIONS-REBAC.md`](./PERMISSIONS-REBAC.md) § consistency |
| **7** | **Automerge spike** — merge two layout spec edits offline (no WebSocket yet) | Spike | [`PERMISSIONS-OSS-REFERENCES.md`](./PERMISSIONS-OSS-REFERENCES.md) § Automerge |
| **8** | **OpenFGA or SpiceDB service** (optional) — when tuple Check() outgrows in-app | Scale | [`PERMISSIONS-OSS-REFERENCES.md`](./PERMISSIONS-OSS-REFERENCES.md) |
| **9** | **Hocuspocus + TipTap/Yjs** — **only when rich-text field live collab is required** | Phase 3 collab | [Hocuspocus](https://github.com/ueberdosis/hocuspocus) |
| **10** | **Automerge + sync** for live json-render spec collab (after spike proves merge) | Phase 3 collab | — |

---

## Steps 0–2 detail (permissions first — block editor until done)

### 0. OpenFGA Playground (1–2 hours, design only)

- Model namespaces: `store`, `document`
- Relations: `owner`, `editor`, `viewer`; `editor` inherits from `owner`, `viewer` from `editor`
- Test tuples: `document:home-layout#editor@user:bob`
- **Export model** → copy relation names into Postgres `relation_tuples` schema + `Check()` code
- **Do not** deploy OpenFGA server yet unless you want it early

### 1. ZITADEL Role Assignment API (Phase 0)

- `init:zitadel` — create project roles `admin`, `editor`, `customer`; OIDC app emits roles in token
- Invite / role change → `CreateAuthorization` / `UpdateAuthorization` only
- **`seed:demo`** — grant seed user `admin` in ZITADEL
- **Delete** `tenant_settings.auth.teamRoles` from code + schema

Docs: [Retrieve user roles](https://zitadel.com/docs/guides/integrate/retrieve-user-roles) · [Create Role Assignment](https://zitadel.com/docs/reference/api/authorization/zitadel.authorization.v2.AuthorizationService.CreateAuthorization)

### 2. Wire JWT roles everywhere

- `teamRoleFromJwt(payload)` in server + worker
- `requireTeamMember` / `requireTeamAdmin` on layout/content write + publish
- Edge: strip or reject `?edit=true` without `editor` or `admin` in JWT
- Client: edit-mode gate in `main.tsx` (same as admin MFA path)

**Validate:** editor can save draft, cannot publish; admin can publish — from both `/admin` and `?edit=true`.

---

## Steps 7 & 9 — collab spikes (later, not before editor v1)

### 7. Automerge spike (layout JSON — not Hocuspocus)

**When:** after draft save + op log design; **before** live multi-user spec editing.

**Goal:** two offline clients edit different paths of same layout spec → merge → identical result.

```
Client A: elements.hero.props.title = "Sale"
Client B: elements.grid.props.columns = 2
  → Automerge.merge → both changes present
```

**Use for:** json-render **spec tree** ([`SPEC-STORAGE-MERGE.md`](./SPEC-STORAGE-MERGE.md)).  
**Not for:** whole-document Yjs (poor fit for arbitrary JSON graphs).

Repo: [automerge/automerge](https://github.com/automerge/automerge)

### 9. Hocuspocus (rich text only — defer unless required)

**When:** product requires **two merchants editing the same CMS rich-text field** at once (description, longText).

**Do not use for:** layout spec / Hero props / grid — use Automerge (step 7) instead.

Stack: TipTap + `@tiptap/extension-collaboration` + **Hocuspocus** WebSocket server + Yjs.

Repo: [ueberdosis/hocuspocus](https://github.com/ueberdosis/hocuspocus)

---

## What not to do early

| Skip until… | Reason |
|-------------|--------|
| Hocuspocus | Layout editing is structured JSON, not ProseMirror doc |
| SpiceDB / OpenFGA server | In-app tuples + JWT enough for v1 |
| Automerge in production | Spike first; v1 uses version + dot-path overrides |
| Visual editor UI | Step 2 guards must pass first |

---

## Quick reference card

```
0  OpenFGA Playground     → design tuples
1  ZITADEL Role Assign    → JWT admin/editor
2  Guards + edge          → block ?edit=true
3  relation_tuples         → doc share
4  validateSpec + patches → SPEC-STORAGE-MERGE
5  ?edit=true UI           → PropsPanel + save bar
6  document_ops log        → audit + ordering
7  Automerge spike         → spec merge proof
8  OpenFGA service         → optional scale
9  Hocuspocus              → rich-text collab ONLY
10 Automerge sync          → live spec collab
```

---

## Doc map

| Topic | Doc |
|-------|-----|
| Phase 0 checklist | [`VISUAL-EDITOR-PLAN.md`](./VISUAL-EDITOR-PLAN.md) |
| OSS tools by phase | [`PERMISSIONS-OSS-REFERENCES.md`](./PERMISSIONS-OSS-REFERENCES.md) |
| ZITADEL-only roles | [`TEAM-ROLES-ZITADEL.md`](./TEAM-ROLES-ZITADEL.md) |
| Tuple + op log model | [`PERMISSIONS-REBAC.md`](./PERMISSIONS-REBAC.md) |
| Partial spec storage | [`SPEC-STORAGE-MERGE.md`](./SPEC-STORAGE-MERGE.md) |
| Click-to-edit UX | [`VISUAL-EDITOR-UX.md`](./VISUAL-EDITOR-UX.md) |

---

*Update step numbers when a phase ships or scope changes.*
