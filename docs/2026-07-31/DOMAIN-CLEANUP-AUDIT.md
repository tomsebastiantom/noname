# Domain Cleanup — Open Issues

> **Updated:** 2026-07-31  
> **Fixed items:** [`docs/archive/2026-07-31/AUDIT-FIXED.md`](../archive/2026-07-31/AUDIT-FIXED.md)  
> **Documents domain:** fixed in same archive (locale, guards, `prepareContentWrite`, helpers split, client asset URLs)  
> **Shared packages rule:** [`SHARED-PACKAGES.md`](./SHARED-PACKAGES.md)

---

## Still open

| Domain | Item | Notes |
|---|---|---|
| **auth** | Migrate `api.ts` off per-route try/catch | Opportunistic — see [`ERROR-HANDLING.md`](./ERROR-HANDLING.md) |
| **tenant** | OTEL + queue enqueue helper (shared with agent) | Low priority — ~15 lines duplicated |
| **documents** | Client `entryLabel` ↔ server label parity | Defer — use `/resolve-refs` or align when drift shows |
| **cross-package** | Store-slug util shared client/workers | Stable duplication; see [`SHARED-PACKAGES.md`](./SHARED-PACKAGES.md) |
| **cross-package** | Client `account-flows.ts` → `apiFetch` | Client refactor, not server domain |

---

## No action needed

| Domain | Reason |
|---|---|
| **context** | `engine.ts` + `signal-extraction.ts` already minimal |
| **ai-pipeline** | Small; add permissions only when admin exposes `/api/ai` |

---

## Pattern (for future cleanups)

1. Split god service by **concern** (evaluation, validation, guards)
2. Entity **`fromDTO()`** for update/archive paths
3. **`require*()` guards** for mutations; **`isActive`/`isPublished`** for runtime filters
4. Remove dead API branches when service always throws `NotFoundError`
