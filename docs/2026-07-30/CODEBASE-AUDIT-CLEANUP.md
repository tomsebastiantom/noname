# Codebase Audit — Open Issues

> **Updated:** 2026-07-31  
> **Fixed items:** [`docs/archive/2026-07-30/CODEBASE-AUDIT-FIXED.md`](../archive/2026-07-30/CODEBASE-AUDIT-FIXED.md) (P1–P17) · [`docs/archive/2026-07-31/AUDIT-FIXED.md`](../archive/2026-07-31/AUDIT-FIXED.md) (2026-07-31 batch)  
> **Domain cleanup open:** [`DOMAIN-CLEANUP-AUDIT.md`](../2026-07-31/DOMAIN-CLEANUP-AUDIT.md)  
> **Architecture patterns:** [`ARCHITECTURE-PATTERNS.md`](../2026-07-31/ARCHITECTURE-PATTERNS.md)  
> **Error handling:** [`ERROR-HANDLING.md`](../2026-07-31/ERROR-HANDLING.md) · **Shared packages:** [`SHARED-PACKAGES.md`](../2026-07-31/SHARED-PACKAGES.md)

Severity: 🔴 high · 🟡 medium · 🟢 low

---

## Still open

| P | Severity | Issue | Notes |
|---|---|---|---|
| — | 🟡 | `useAsyncForm()` for 9 admin components | Deferred; large UI refactor |
| — | 🟡 | MF shared-dep versions hardcoded in `mf-init.ts` | Build-time inject from `package.json` |
| — | 🟡 | Stale doc banners (`AUTH.md`, permissions partial supersessions) | Extend `ARCHITECTURE-MAP.md` deprecated table |
| — | 🟢 | Store-slug parsing duplicated client vs worker | Shared pure util — defer per `SHARED-PACKAGES.md` |
| — | 🟢 | God-components (`ContentEntryAdmin`, `LoginForm`) | Split by view |
| — | 🟢 | `browser-sdk` positional factory args | Options objects |
| — | 🟢 | Cart read-modify-write (2 round-trips) | Incremental machine API |
| — | 🟢 | `event-bus` typed event map | Replace `unknown`/`any` subscribers |
| — | 🟢 | `auth/api.ts` repeated parse/catch per route | Opportunistic — see `ERROR-HANDLING.md` |
| — | 🟡 | Broader test coverage (5 domains + client + browser-sdk) | CI added; domain tests ongoing |

---

## Fixed (where to look)

All completed audit work is in the archive — **not** listed here:

- **P1–P17 + infra** → [`CODEBASE-AUDIT-FIXED.md`](../archive/2026-07-30/CODEBASE-AUDIT-FIXED.md)
- **Documents dedupe, domain splits, auth issuer, worker events, machines API** → [`AUDIT-FIXED.md`](../archive/2026-07-31/AUDIT-FIXED.md)
