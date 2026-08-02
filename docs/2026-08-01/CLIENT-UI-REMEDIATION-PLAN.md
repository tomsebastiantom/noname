# Client UI remediation plan

> **Baseline audit:** [CLIENT-UI-ARCHITECTURE-AUDIT.md](./CLIENT-UI-ARCHITECTURE-AUDIT.md)  
> **Out of scope:** accessibility (per product decision)  
> **Agent rules:** [skills/spec-driven-ui/SKILL.md](../../skills/spec-driven-ui/SKILL.md)

Work through tasks **in order**. Mark done in this file as each lands.

---

## P0 — Architecture (spec-driven)

| # | Task | Status |
|---|------|--------|
| 1 | Shared `documents/` client API — layout + content entries out of `admin/` | ✅ |
| 2 | Editor imports `documents/` only — no `admin/*` from editor | ✅ (field widgets re-export admin UI — P2) |
| 3 | Implement editor catalog action handlers + wire `editor/registry.ts` | ✅ |
| 4 | Pass editor handlers to `JSONUIProvider` in `EditPageView` | ✅ |
| 5 | `editor-overrides` — drop `adminComponentSchemas` import | ✅ |
| 6 | `LoginForm` — `loadLoginConfig` action instead of mount `fetch` | ✅ |
| 7 | `EditPageView` — use `labelsMissingHint` from shell labels | ✅ |

---

## P1 — Performance & maintainability

| # | Task | Status |
|---|------|--------|
| 8 | Split editor session — data context + stable actions context | ✅ |
| 9 | `React.memo` on editor shell slot components | ✅ |
| 10 | Cheaper history snapshot equality (avoid full spec JSON.stringify) | ✅ |
| 11 | Extract `useEditPageOrchestration` from `EditPageView` | ✅ |

---

## P2 — Copy & admin gaps (incremental)

| # | Task | Status |
|---|------|--------|
| 12 | Move `PageEntryAdmin` / `LayoutEntryAdmin` hardcoded strings → layout labels | ✅ |
| 13 | `AccountSecurityForm` — MountAction + layout labels | ✅ |
| 14 | CMS field widgets → actions or parent preload | ✅ |
| 15 | `PageRoutingAdmin` → separate layout templates (optional) | ✅ |

---

## P3 — Defer

| Item | Notes |
|------|-------|
| Full editor via edge schema (remove `EditorHost` bypass) | Host refactor |
| OAuth callback as layout | Thin exception OK |
| Virtualize layer tree | When layouts exceed ~50 nodes |
| Field ACL in PropsPanel | [FIELD-ACL.md](./FIELD-ACL.md) |

---

## Verification

After each P0/P1 batch:

```bash
pnpm typecheck
pnpm fix
pnpm test
```

Manual: `?edit=true` on demo storefront — save, undo, publish, props panel.
